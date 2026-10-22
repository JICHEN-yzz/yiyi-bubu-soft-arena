import http from "node:http";
import os from "node:os";
import { randomBytes } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import { createGzip } from "node:zlib";
import { extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "./vendor/node_modules/ws/wrapper.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2"
};

function localAddresses() {
  const found = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        found.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return [...new Set(found)];
}

function normalizeBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const publicBase =
  normalizeBase(process.env.PUBLIC_URL) ||
  normalizeBase(process.env.RENDER_EXTERNAL_URL) ||
  normalizeBase(process.env.RAILWAY_PUBLIC_DOMAIN) ||
  normalizeBase(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
  normalizeBase(process.env.VERCEL_URL) ||
  normalizeBase(process.env.FLY_APP_NAME ? `${process.env.FLY_APP_NAME}.fly.dev` : "");
const fallbackShareBase = publicBase || localAddresses()[0] || `http://localhost:${port}`;
const rooms = new Map();
const httpRooms = new Map();

function requestShareBase(request) {
  if (publicBase) return publicBase;
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const hostHeader = forwardedHost || String(request.headers.host || "").trim();
  if (!hostHeader) return fallbackShareBase;
  try {
    const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
    const origin = new URL(`${protocol}://${hostHeader}`);
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(origin.hostname)) return fallbackShareBase;
    return origin.origin;
  } catch {
    return fallbackShareBase;
  }
}

function jsonResponse(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function requestData(request, url) {
  if (request.method === "GET") return Object.fromEntries(url.searchParams);
  return readJson(request);
}

function makeToken() {
  return randomBytes(18).toString("hex");
}

function queueHttpEvent(client, message) {
  if (!client) return;
  client.events.push({ ...message, id: ++client.sequence });
  if (client.events.length > 240) client.events.splice(0, client.events.length - 240);
  for (const resolve of client.waiters.splice(0)) resolve();
  client.lastSeen = Date.now();
}

function httpRoomPlayers(room) {
  return { p1: room.p1?.name || "一二", p2: room.p2?.name || "布布" };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, "http://localhost");
  if (requestUrl.pathname === "/api/network") {
    const shareBase = requestShareBase(request);
    jsonResponse(response, 200, {
      shareBase,
      permanent: Boolean(publicBase),
      addresses: localAddresses(),
      rooms: rooms.size + httpRooms.size,
      transports: ["websocket", "http-poll"]
    });
    return;
  }
  if (requestUrl.pathname === "/api/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size + httpRooms.size }));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/room/")) {
    try {
      if (requestUrl.pathname === "/api/room/create" && ["POST", "GET"].includes(request.method)) {
        const body = await requestData(request, requestUrl);
        const code = makeRoomCode();
        const shareBase = requestShareBase(request);
        const p1Character = sanitizeCharacter(body.character);
        const client = {
          role: "p1",
          name: sanitizeName(body.name),
          token: makeToken(),
          sequence: 0,
          events: [],
          waiters: [],
          lastSeen: Date.now()
        };
        httpRooms.set(code, { code, p1: client, p2: null, p1Character, p2Character: null, createdAt: Date.now() });
        jsonResponse(response, 200, {
          type: "room-created",
          room: code,
          role: "p1",
          token: client.token,
          shareBase,
          characters: { p1: p1Character, p2: null },
          transport: "poll"
        });
        return;
      }

      if (requestUrl.pathname === "/api/room/join" && ["POST", "GET"].includes(request.method)) {
        const body = await requestData(request, requestUrl);
        const code = String(body.room || "").trim().toUpperCase();
        const shareBase = requestShareBase(request);
        const room = httpRooms.get(code);
        if (!room) return jsonResponse(response, 404, { type: "error", message: "房间不存在或已经结束" });
        if (room.p2) return jsonResponse(response, 409, { type: "error", message: "这个房间已经有两位玩家" });
        const client = {
          role: "p2",
          name: sanitizeName(body.name),
          token: makeToken(),
          sequence: 0,
          events: [],
          waiters: [],
          lastSeen: Date.now()
        };
        room.p2 = client;
        room.p2Character = sanitizeCharacter(body.character);
        if (room.p2Character === room.p1Character) room.p2Character = otherCharacter(room.p2Character);
        const players = httpRoomPlayers(room);
        const characters = { p1: room.p1Character, p2: room.p2Character };
        queueHttpEvent(room.p1, { type: "peer-joined", room: code, players, characters });
        jsonResponse(response, 200, {
          type: "room-joined",
          room: code,
          role: "p2",
          token: client.token,
          players,
          characters,
          shareBase,
          transport: "poll"
        });
        return;
      }

      if (requestUrl.pathname === "/api/room/send" && ["POST", "GET"].includes(request.method)) {
        const body = await requestData(request, requestUrl);
        const room = httpRooms.get(body.room);
        if (!room) return jsonResponse(response, 404, { type: "error", message: "房间已经结束" });
        const sender = room.p1?.token === body.token ? room.p1 : room.p2?.token === body.token ? room.p2 : null;
        if (!sender) return jsonResponse(response, 403, { type: "error", message: "房间身份已失效" });
        const message = typeof body.message === "string" ? JSON.parse(body.message) : body.message || {};
        if (message.type === "start") {
          if (sender !== room.p1) return jsonResponse(response, 403, { type: "error", message: "只有房主可以开始" });
          queueHttpEvent(room.p1, { type: "start", room: room.code, seed: Date.now() });
          queueHttpEvent(room.p2, { type: "start", room: room.code, seed: Date.now() });
        } else if (message.type === "input" && sender === room.p2) {
          queueHttpEvent(room.p1, { type: "remote-input", held: message.held, pressed: message.pressed });
        } else if (["snapshot", "fx", "match-over"].includes(message.type) && sender === room.p1) {
          queueHttpEvent(room.p2, { ...message, room: room.code });
        } else if (message.type === "rematch-request") {
          queueHttpEvent(sender === room.p1 ? room.p2 : room.p1, { type: "rematch-request", room: room.code });
        }
        jsonResponse(response, 200, { ok: true });
        return;
      }

      if (requestUrl.pathname === "/api/room/events" && request.method === "GET") {
        const room = httpRooms.get(requestUrl.searchParams.get("room"));
        if (!room) return jsonResponse(response, 404, { events: [], closed: true });
        const token = requestUrl.searchParams.get("token");
        const client = room.p1?.token === token ? room.p1 : room.p2?.token === token ? room.p2 : null;
        if (!client) return jsonResponse(response, 403, { events: [], closed: true });
        const cursor = Number(requestUrl.searchParams.get("cursor") || 0);
        const now = Date.now();
        const available = () => client.events.filter((event) => event.id > cursor);
        if (!available().length) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, 1500);
            client.waiters.push(() => {
              clearTimeout(timer);
              resolve();
            });
          });
        }
        const events = available();
        const next = events.length ? events[events.length - 1].id : cursor;
        jsonResponse(response, 200, { events, cursor: next, now });
        client.lastSeen = Date.now();
        return;
      }
    } catch (error) {
      jsonResponse(response, 400, { type: "error", message: error.message || "联机请求失败" });
      return;
    }
  }

  const pathname = decodeURIComponent(requestUrl.pathname);
  const relative = normalize(pathname === "/" ? "index.html" : pathname.slice(1));
  const file = resolve(root, relative);

  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    if (!statSync(file).isFile()) throw new Error("Not a file");
    const extension = extname(file).toLowerCase();
    const canCompress = [
      ".html", ".js", ".mjs", ".css", ".json", ".glb", ".wasm", ".svg"
    ].includes(extension);
    const gzip = canCompress && /\bgzip\b/.test(request.headers["accept-encoding"] || "");
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
      Vary: "Accept-Encoding",
      ...(gzip ? { "Content-Encoding": "gzip" } : {})
    });
    const source = createReadStream(file);
    if (gzip) source.pipe(createGzip({ level: 6 })).pipe(response);
    else source.pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeRoomCode() {
  let code = "";
  do {
    const bytes = randomBytes(6);
    code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(code) || httpRooms.has(code));
  return code;
}

function send(socket, message) {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify(message));
}

function notifyRoom(room, message, except = null) {
  for (const socket of [room.host, room.guest]) {
    if (socket && socket !== except) send(socket, message);
  }
}

function leaveRoom(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return;
  if (room.host === socket) {
    notifyRoom(room, { type: "peer-left", role: "p1", reason: "房主已离开" }, socket);
    rooms.delete(room.code);
    if (room.guest) room.guest.roomCode = null;
  } else if (room.guest === socket) {
    room.guest = null;
    notifyRoom(room, { type: "peer-left", role: "p2", reason: "对方暂时离开了房间" }, socket);
  }
  socket.roomCode = null;
}

function sanitizeName(value) {
  return String(value || "").replace(/[<>&\r\n]/g, "").trim().slice(0, 12) || "神秘玩家";
}

function sanitizeCharacter(value) {
  return value === "bubu" ? "bubu" : "yiyi";
}

function otherCharacter(value) {
  return value === "bubu" ? "yiyi" : "bubu";
}

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (websocket) => wss.emit("connection", websocket, request));
});

wss.on("connection", (socket, request) => {
  socket.isAlive = true;
  socket.roomCode = null;
  socket.shareBase = requestShareBase(request);
  send(socket, {
    type: "welcome",
    shareBase: socket.shareBase,
    permanent: Boolean(publicBase),
    addresses: localAddresses()
  });

  socket.on("pong", () => {
    socket.isAlive = true;
  });

  socket.on("message", (buffer) => {
    if (buffer.length > 64 * 1024) return;
    let message;
    try {
      message = JSON.parse(buffer.toString());
    } catch {
      return send(socket, { type: "error", message: "无法读取联机数据" });
    }

    if (message.type === "create") {
      leaveRoom(socket);
      const code = makeRoomCode();
      const room = {
        code,
        host: socket,
        guest: null,
        hostName: sanitizeName(message.name),
        hostCharacter: sanitizeCharacter(message.character),
        guestCharacter: null,
        createdAt: Date.now()
      };
      rooms.set(code, room);
      socket.roomCode = code;
      send(socket, {
        type: "room-created",
        room: code,
        role: "p1",
        shareBase: socket.shareBase || fallbackShareBase,
        characters: { p1: room.hostCharacter, p2: null },
        addresses: localAddresses()
      });
      return;
    }

    if (message.type === "join") {
      const code = String(message.room || "").trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(socket, { type: "error", message: "房间不存在或已经结束" });
      if (room.guest) return send(socket, { type: "error", message: "这个房间已经有两位玩家" });
      leaveRoom(socket);
      room.guest = socket;
      socket.roomCode = code;
      const guestName = sanitizeName(message.name);
      let guestCharacter = sanitizeCharacter(message.character);
      if (guestCharacter === room.hostCharacter) guestCharacter = otherCharacter(guestCharacter);
      room.guestCharacter = guestCharacter;
      const players = { p1: room.hostName, p2: guestName };
      const characters = { p1: room.hostCharacter, p2: room.guestCharacter };
      send(socket, {
        type: "room-joined",
        room: code,
        role: "p2",
        players,
        characters,
        shareBase: socket.shareBase || fallbackShareBase
      });
      send(room.host, { type: "peer-joined", room: code, players, characters });
      return;
    }

    const room = rooms.get(socket.roomCode);
    if (!room) return send(socket, { type: "error", message: "请先创建或加入房间" });

    if (message.type === "start") {
      if (socket !== room.host) return;
      notifyRoom(room, { type: "start", room: room.code, seed: Date.now() });
      return;
    }
    if (message.type === "input" && socket === room.guest) {
      send(room.host, { type: "remote-input", held: message.held, pressed: message.pressed });
      return;
    }
    if (message.type === "snapshot" && socket === room.host) {
      send(room.guest, message);
      return;
    }
    if (message.type === "fx" && socket === room.host) {
      send(room.guest, message);
      return;
    }
    if (message.type === "match-over" && socket === room.host) {
      send(room.guest, message);
      return;
    }
    if (message.type === "rematch-request") {
      notifyRoom(room, { type: "rematch-request", from: socket === room.host ? "p1" : "p2" }, socket);
    }
  });

  socket.on("close", () => leaveRoom(socket));
  socket.on("error", () => leaveRoom(socket));
});

setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
  const cutoff = Date.now() - 1000 * 60 * 60 * 8;
  for (const [code, room] of rooms) {
    if (!room.guest && room.createdAt < cutoff) rooms.delete(code);
  }
  const pollCutoff = Date.now() - 1000 * 60 * 2;
  for (const [code, room] of httpRooms) {
    const active = [room.p1, room.p2].filter(Boolean).some((client) => client.lastSeen > pollCutoff);
    if (!active) {
      for (const client of [room.p1, room.p2]) {
        for (const resolve of client?.waiters?.splice(0) || []) resolve();
      }
      httpRooms.delete(code);
    }
  }
}, 30000).unref();

server.listen(port, host, () => {
  console.log(`Soft Candy Arena: http://localhost:${port}`);
  for (const address of localAddresses()) console.log(`Cross-device room: ${address}`);
  if (publicBase) console.log(`Public room: ${publicBase}`);
});
