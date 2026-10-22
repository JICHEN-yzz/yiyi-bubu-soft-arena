const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const wsRooms = new Map<string, WebSocketRoom>();
const httpRooms = new Map<string, HttpRoom>();

type Client = {
  name: string;
  token: string;
  sequence: number;
  events: Array<Record<string, unknown> & { id: number }>;
  lastSeen: number;
};

type HttpRoom = {
  code: string;
  p1Character: string;
  p2Character: string | null;
  createdAt: number;
  p1: Client;
  p2: Client | null;
};

type WebSocketRoom = {
  code: string;
  host: WebSocket;
  guest: WebSocket | null;
  hostName: string;
  hostCharacter: string;
  guestCharacter: string | null;
};

const json = (payload: unknown, status = 200) =>
  Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });

const sanitizeName = (value: unknown) =>
  String(value || "").replace(/[<>&\r\n]/g, "").trim().slice(0, 12) || "神秘玩家";

const sanitizeCharacter = (value: unknown) => (value === "bubu" ? "bubu" : "yiyi");
const otherCharacter = (value: string) => (value === "bubu" ? "yiyi" : "bubu");
const makeToken = () => crypto.randomUUID().replaceAll("-", "");

function makeCode(): string {
  while (true) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
    if (!wsRooms.has(code)) return code;
  }
}

async function requestData(request: Request, url: URL): Promise<Record<string, string>> {
  if (request.method === "GET") return Object.fromEntries(url.searchParams);
  return await request.json().catch(() => ({}));
}

function send(socket: WebSocket | null, message: unknown) {
  try {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  } catch {
    // Closed peers are handled by their close event.
  }
}

function notify(room: WebSocketRoom, message: unknown, except: WebSocket | null = null) {
  for (const socket of [room.host, room.guest]) {
    if (socket && socket !== except) send(socket, message);
  }
}

function leaveSocket(socket: WebSocket & { roomCode?: string | null }) {
  const room = wsRooms.get(socket.roomCode || "");
  if (!room) return;
  if (room.host === socket) {
    notify(room, { type: "peer-left", role: "p1", reason: "房主已离开" }, socket);
    wsRooms.delete(room.code);
  } else if (room.guest === socket) {
    room.guest = null;
    room.guestCharacter = null;
    notify(room, { type: "peer-left", role: "p2", reason: "对方暂时离开了房间" }, socket);
  }
  socket.roomCode = null;
}

async function handleSocketMessage(socket: WebSocket & { roomCode?: string | null }, raw: string, origin: string) {
  let message: Record<string, any>;
  try {
    message = JSON.parse(raw);
  } catch {
    return send(socket, { type: "error", message: "无法读取联机数据" });
  }

  if (message.type === "create") {
    leaveSocket(socket);
    const code = makeCode();
    const room: WebSocketRoom = {
      code,
      host: socket,
      guest: null,
      hostName: sanitizeName(message.name),
      hostCharacter: sanitizeCharacter(message.character),
      guestCharacter: null
    };
    wsRooms.set(code, room);
    socket.roomCode = code;
    return send(socket, {
      type: "room-created",
      room: code,
      role: "p1",
      shareBase: origin,
      characters: { p1: room.hostCharacter, p2: null }
    });
  }

  if (message.type === "join") {
    const code = String(message.room || "").trim().toUpperCase();
    const room = wsRooms.get(code);
    if (!room) return send(socket, { type: "error", message: "房间不存在或已经结束" });
    if (room.guest) return send(socket, { type: "error", message: "这个房间已经有两位玩家" });
    leaveSocket(socket);
    room.guest = socket;
    socket.roomCode = code;
    let guestCharacter = sanitizeCharacter(message.character);
    if (guestCharacter === room.hostCharacter) guestCharacter = otherCharacter(guestCharacter);
    room.guestCharacter = guestCharacter;
    const players = { p1: room.hostName, p2: sanitizeName(message.name) };
    const characters = { p1: room.hostCharacter, p2: room.guestCharacter };
    send(socket, { type: "room-joined", room: code, role: "p2", players, characters, shareBase: origin });
    send(room.host, { type: "peer-joined", room: code, players, characters });
    return;
  }

  const room = wsRooms.get(socket.roomCode || "");
  if (!room) return send(socket, { type: "error", message: "请先创建或加入房间" });
  if (message.type === "start" && socket === room.host) {
    notify(room, { type: "start", room: room.code });
  } else if (message.type === "input" && socket === room.guest) {
    send(room.host, { type: "remote-input", held: message.held, pressed: message.pressed });
  } else if (message.type === "snapshot" && socket === room.host) {
    send(room.guest, message);
  } else if (message.type === "fx" && socket === room.host) {
    send(room.guest, message);
  } else if (message.type === "match-over" && socket === room.host) {
    send(room.guest, message);
  } else if (message.type === "rematch-request") {
    notify(room, { type: "rematch-request", from: socket === room.host ? "p1" : "p2" }, socket);
  }
}

async function getHttpRoom(code: string): Promise<HttpRoom | null> {
  return httpRooms.get(code.toUpperCase()) || null;
}

async function saveHttpRoom(room: HttpRoom) {
  httpRooms.set(room.code, room);
  if (httpRooms.size > 500) {
    const cutoff = Date.now() - 8 * 60 * 60 * 1000;
    for (const [code, candidate] of httpRooms) {
      if (candidate.createdAt < cutoff) httpRooms.delete(code);
    }
  }
}

function queue(client: Client | null, message: Record<string, unknown>) {
  if (!client) return;
  client.sequence += 1;
  client.events.push({ ...message, id: client.sequence });
  if (client.events.length > 240) client.events.splice(0, client.events.length - 240);
  client.lastSeen = Date.now();
}

async function handleHttpRoom(request: Request, url: URL) {
  try {
    if (url.pathname === "/api/room/create" && ["GET", "POST"].includes(request.method)) {
      const body = await requestData(request, url);
      const code = makeCode();
      const room: HttpRoom = {
        code,
        p1Character: sanitizeCharacter(body.character),
        p2Character: null,
        createdAt: Date.now(),
        p1: {
          name: sanitizeName(body.name),
          token: makeToken(),
          sequence: 0,
          events: [],
          lastSeen: Date.now()
        },
        p2: null
      };
      await saveHttpRoom(room);
      return json({
        type: "room-created",
        room: code,
        role: "p1",
        token: room.p1.token,
        characters: { p1: room.p1Character, p2: null },
        shareBase: url.origin,
        transport: "poll"
      });
    }

    if (url.pathname === "/api/room/join" && ["GET", "POST"].includes(request.method)) {
      const body = await requestData(request, url);
      const room = await getHttpRoom(String(body.room || ""));
      if (!room) return json({ type: "error", message: "房间不存在或已经结束" }, 404);
      if (room.p2) return json({ type: "error", message: "这个房间已经有两位玩家" }, 409);
      room.p2Character = sanitizeCharacter(body.character);
      if (room.p2Character === room.p1Character) room.p2Character = otherCharacter(room.p2Character);
      room.p2 = {
        name: sanitizeName(body.name),
        token: makeToken(),
        sequence: 0,
        events: [],
        lastSeen: Date.now()
      };
      const players = { p1: room.p1.name, p2: room.p2.name };
      const characters = { p1: room.p1Character, p2: room.p2Character };
      queue(room.p1, { type: "peer-joined", room: room.code, players, characters });
      await saveHttpRoom(room);
      return json({
        type: "room-joined",
        room: room.code,
        role: "p2",
        token: room.p2.token,
        players,
        characters,
        shareBase: url.origin,
        transport: "poll"
      });
    }

    if (url.pathname === "/api/room/events") {
      const room = await getHttpRoom(url.searchParams.get("room") || "");
      const token = url.searchParams.get("token") || "";
      const cursor = Number(url.searchParams.get("cursor") || 0);
      if (!room) return json({ type: "error", message: "房间已经结束" }, 404);
      const client = room.p1?.token === token ? room.p1 : room.p2?.token === token ? room.p2 : null;
      if (!client) return json({ type: "error", message: "房间身份已失效" }, 403);
      client.lastSeen = Date.now();
      const events = client.events.filter((event) => event.id > cursor);
      client.events = client.events.filter((event) => event.id > cursor);
      await saveHttpRoom(room);
      return json({ events });
    }

    if (url.pathname === "/api/room/send" && ["GET", "POST"].includes(request.method)) {
      const body = await requestData(request, url);
      const room = await getHttpRoom(String(body.room || ""));
      if (!room) return json({ type: "error", message: "房间已经结束" }, 404);
      const sender = room.p1?.token === body.token ? room.p1 : room.p2?.token === body.token ? room.p2 : null;
      if (!sender) return json({ type: "error", message: "房间身份已失效" }, 403);
      const message = typeof body.message === "string" ? JSON.parse(body.message) : body.message || {};
      const other = sender === room.p1 ? room.p2 : room.p1;
      if (message.type === "start") {
        if (sender !== room.p1) return json({ type: "error", message: "只有房主可以开始" }, 403);
        queue(room.p1, { ...message, room: room.code });
        queue(other, { ...message, room: room.code });
      } else if (message.type === "input") {
        if (sender !== room.p2) return json({ type: "error", message: "输入身份无效" }, 403);
        queue(room.p1, { type: "remote-input", held: message.held, pressed: message.pressed });
      } else if (["snapshot", "fx", "match-over"].includes(message.type)) {
        if (sender !== room.p1) return json({ type: "error", message: "房主身份已失效" }, 403);
        queue(other, message);
      } else if (message.type === "rematch-request") {
        queue(other, { type: "rematch-request", from: sender === room.p1 ? "p1" : "p2" });
      }
      await saveHttpRoom(room);
      return json({ ok: true });
    }
    return json({ message: "Not found" }, 404);
  } catch (error) {
    return json({ type: "error", message: error instanceof Error ? error.message : "联机请求失败" }, 400);
  }
}

const MIME: Record<string, string> = {
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
  ".svg": "image/svg+xml"
};

async function serveAsset(url: URL): Promise<Response> {
  let path = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  if (path.includes("..")) return new Response("Bad request", { status: 400 });
  try {
    const file = await Deno.readFile(new URL(`./public/${path}`, import.meta.url));
    const extension = path.match(/\.[^.]+$/)?.[0]?.toLowerCase() || "";
    return new Response(file, {
      headers: {
        "Content-Type": MIME[extension] || "application/octet-stream",
        "Cache-Control": extension === ".html" ? "no-cache" : "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

Deno.serve({ port: Number(Deno.env.get("PORT") || 8000) }, async (request) => {
  const url = new URL(request.url);
  if (url.pathname === "/api/network") {
    return json({
      shareBase: url.origin,
      permanent: true,
      addresses: [],
      transports: ["websocket", "http-poll"]
    });
  }
  if (url.pathname === "/api/health") return json({ ok: true });
  if (url.pathname.startsWith("/api/room/")) return await handleHttpRoom(request, url);
  if (url.pathname === "/ws") {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ message: "WebSocket upgrade required" }, 426);
    }
    const { socket, response } = Deno.upgradeWebSocket(request);
    const tagged = socket as WebSocket & { roomCode?: string | null };
    tagged.roomCode = null;
    socket.onopen = () => send(socket, { type: "welcome", shareBase: url.origin, permanent: true, addresses: [] });
    socket.onmessage = (event) => void handleSocketMessage(tagged, String(event.data), url.origin);
    socket.onclose = () => leaveSocket(tagged);
    socket.onerror = () => leaveSocket(tagged);
    return response;
  }
  return await serveAsset(url);
});
