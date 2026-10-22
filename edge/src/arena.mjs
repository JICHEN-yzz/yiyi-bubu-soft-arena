const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
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

function makeToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function requestData(request, url) {
  if (request.method === "GET") return Object.fromEntries(url.searchParams);
  return request.json().catch(() => ({}));
}

export class ArenaRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.wsRooms = new Map();
    this.httpRooms = new Map();
    this.httpLoaded = false;
  }

  async ensureHttpRooms() {
    if (this.httpLoaded) return;
    const saved = (await this.state.storage.get("httpRooms")) || {};
    this.httpRooms = new Map(Object.entries(saved));
    this.httpLoaded = true;
  }

  async saveHttpRooms() {
    const serializable = {};
    for (const [code, room] of this.httpRooms) {
      const active = [room.p1, room.p2].filter(Boolean).some((client) => client.lastSeen > Date.now() - 120000);
      if (active) serializable[code] = room;
    }
    this.httpRooms = new Map(Object.entries(serializable));
    await this.state.storage.put("httpRooms", serializable);
  }

  send(socket, message) {
    try {
      socket?.send(JSON.stringify(message));
    } catch {
      // A closed peer is removed by the socket close handler.
    }
  }

  notify(room, message, except = null) {
    for (const socket of [room.host, room.guest]) {
      if (socket && socket !== except) this.send(socket, message);
    }
  }

  makeCode() {
    do {
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
      if (!this.wsRooms.has(code) && !this.httpRooms.has(code)) return code;
    } while (true);
  }

  queue(client, message) {
    if (!client) return;
    client.sequence += 1;
    client.events.push({ ...message, id: client.sequence });
    if (client.events.length > 240) client.events.splice(0, client.events.length - 240);
    client.lastSeen = Date.now();
  }

  async fetch(request) {
    await this.ensureHttpRooms();
    const url = new URL(request.url);
    if (url.pathname === "/ws") return this.openWebSocket(request, url);
    if (url.pathname === "/api/network") {
      return json({
        shareBase: url.origin,
        permanent: false,
        addresses: [],
        rooms: this.wsRooms.size + this.httpRooms.size,
        transports: ["websocket", "http-poll"]
      });
    }
    if (url.pathname === "/api/health") {
      return json({ ok: true, rooms: this.wsRooms.size + this.httpRooms.size });
    }
    if (url.pathname.startsWith("/api/room/")) return this.handleHttpRoom(request, url);
    return json({ message: "Not found" }, 404);
  }

  openWebSocket(request, url) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ message: "WebSocket upgrade required" }, 426);
    }
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    server.roomCode = null;
    this.send(server, {
      type: "welcome",
      shareBase: url.origin,
      permanent: false,
      addresses: []
    });
    server.addEventListener("message", (event) => {
      this.state.waitUntil(this.handleSocketMessage(server, event.data, url.origin));
    });
    server.addEventListener("close", () => this.leaveSocket(server));
    server.addEventListener("error", () => this.leaveSocket(server));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  leaveSocket(socket) {
    const room = this.wsRooms.get(socket.roomCode);
    if (!room) return;
    if (room.host === socket) {
      this.notify(room, { type: "peer-left", role: "p1", reason: "房主已离开" }, socket);
      this.wsRooms.delete(room.code);
      if (room.guest) room.guest.roomCode = null;
    } else if (room.guest === socket) {
      room.guest = null;
      room.guestCharacter = null;
      this.notify(room, { type: "peer-left", role: "p2", reason: "对方暂时离开了房间" }, socket);
    }
    socket.roomCode = null;
  }

  async handleSocketMessage(socket, raw, origin) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return this.send(socket, { type: "error", message: "无法读取联机数据" });
    }

    if (message.type === "create") {
      this.leaveSocket(socket);
      const code = this.makeCode();
      const room = {
        code,
        host: socket,
        guest: null,
        hostName: sanitizeName(message.name),
        hostCharacter: sanitizeCharacter(message.character),
        guestCharacter: null
      };
      this.wsRooms.set(code, room);
      socket.roomCode = code;
      return this.send(socket, {
        type: "room-created",
        room: code,
        role: "p1",
        shareBase: origin,
        characters: { p1: room.hostCharacter, p2: null }
      });
    }

    if (message.type === "join") {
      const code = String(message.room || "").trim().toUpperCase();
      const room = this.wsRooms.get(code);
      if (!room) return this.send(socket, { type: "error", message: "房间不存在或已经结束" });
      if (room.guest) return this.send(socket, { type: "error", message: "这个房间已经有两位玩家" });
      this.leaveSocket(socket);
      room.guest = socket;
      socket.roomCode = code;
      let guestCharacter = sanitizeCharacter(message.character);
      if (guestCharacter === room.hostCharacter) guestCharacter = otherCharacter(guestCharacter);
      room.guestCharacter = guestCharacter;
      const players = { p1: room.hostName, p2: sanitizeName(message.name) };
      const characters = { p1: room.hostCharacter, p2: room.guestCharacter };
      this.send(socket, { type: "room-joined", room: code, role: "p2", players, characters, shareBase: origin });
      this.send(room.host, { type: "peer-joined", room: code, players, characters });
      return;
    }

    const room = this.wsRooms.get(socket.roomCode);
    if (!room) return this.send(socket, { type: "error", message: "请先创建或加入房间" });
    if (message.type === "start" && socket === room.host) {
      this.notify(room, { type: "start", room: room.code });
    } else if (message.type === "input" && socket === room.guest) {
      this.send(room.host, { type: "remote-input", held: message.held, pressed: message.pressed });
    } else if (message.type === "snapshot" && socket === room.host) {
      this.send(room.guest, message);
    } else if (message.type === "fx" && socket === room.host) {
      this.send(room.guest, message);
    } else if (message.type === "match-over" && socket === room.host) {
      this.send(room.guest, message);
    } else if (message.type === "rematch-request") {
      this.notify(room, { type: "rematch-request", from: socket === room.host ? "p1" : "p2" }, socket);
    } else if (message.type === "pause-request") {
      this.notify(room, { type: "pause-request", from: socket === room.host ? "p1" : "p2" }, socket);
    } else if (message.type === "pause-response") {
      this.notify(room, {
        type: "pause-response",
        accepted: Boolean(message.accepted),
        from: socket === room.host ? "p1" : "p2"
      }, socket);
    } else if (message.type === "pause-resume") {
      this.notify(room, { type: "pause-resume" }, socket);
    }
  }

  async handleHttpRoom(request, url) {
    try {
      if (url.pathname === "/api/room/create" && ["GET", "POST"].includes(request.method)) {
        const body = await requestData(request, url);
        const code = this.makeCode();
        const room = {
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
        this.httpRooms.set(code, room);
        await this.saveHttpRooms();
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
        const room = this.httpRooms.get(String(body.room || "").toUpperCase());
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
        this.queue(room.p1, { type: "peer-joined", room: room.code, players, characters });
        await this.saveHttpRooms();
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
        const room = this.httpRooms.get(String(url.searchParams.get("room") || "").toUpperCase());
        const token = url.searchParams.get("token") || "";
        const cursor = Number(url.searchParams.get("cursor") || 0);
        if (!room) return json({ type: "error", message: "房间已经结束" }, 404);
        const client = room.p1?.token === token ? room.p1 : room.p2?.token === token ? room.p2 : null;
        if (!client) return json({ type: "error", message: "房间身份已失效" }, 403);
        client.lastSeen = Date.now();
        const events = client.events.filter((event) => event.id > cursor);
        client.events = client.events.filter((event) => event.id > cursor);
        await this.saveHttpRooms();
        return json({ events });
      }

      if (url.pathname === "/api/room/send" && ["GET", "POST"].includes(request.method)) {
        const body = await requestData(request, url);
        const room = this.httpRooms.get(String(body.room || "").toUpperCase());
        if (!room) return json({ type: "error", message: "房间已经结束" }, 404);
        const sender = room.p1?.token === body.token ? room.p1 : room.p2?.token === body.token ? room.p2 : null;
        if (!sender) return json({ type: "error", message: "房间身份已失效" }, 403);
        const message = typeof body.message === "string" ? JSON.parse(body.message) : body.message || {};
        sender.lastSeen = Date.now();
        const other = sender === room.p1 ? room.p2 : room.p1;
        if (message.type === "start") {
          if (sender !== room.p1) return json({ type: "error", message: "只有房主可以开始" }, 403);
          this.queue(room.p1, { ...message, room: room.code });
          this.queue(other, { ...message, room: room.code });
        } else if (message.type === "input") {
          if (sender !== room.p2) return json({ type: "error", message: "输入身份无效" }, 403);
          this.queue(room.p1, { type: "remote-input", held: message.held, pressed: message.pressed });
        } else if (["snapshot", "fx", "match-over"].includes(message.type)) {
          if (sender !== room.p1) return json({ type: "error", message: "房主身份已失效" }, 403);
          this.queue(other, message);
        } else if (message.type === "rematch-request") {
          this.queue(other, { type: "rematch-request", from: sender === room.p1 ? "p1" : "p2" });
        } else if (message.type === "pause-request") {
          this.queue(other, { type: "pause-request", from: sender === room.p1 ? "p1" : "p2" });
        } else if (message.type === "pause-response") {
          this.queue(other, {
            type: "pause-response",
            accepted: Boolean(message.accepted),
            from: sender === room.p1 ? "p1" : "p2"
          });
        } else if (message.type === "pause-resume") {
          this.queue(other, { type: "pause-resume" });
        }
        await this.saveHttpRooms();
        return json({ ok: true });
      }
      return json({ message: "Not found" }, 404);
    } catch (error) {
      return json({ type: "error", message: error.message || "联机请求失败" }, 400);
    }
  }
}
