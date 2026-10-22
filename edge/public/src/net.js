export class OnlineSession {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.socket = null;
    this.connected = false;
    this.connectPromise = null;
    this.transport = "websocket";
    this.room = null;
    this.role = null;
    this.token = null;
    this.cursor = 0;
    this.polling = false;
    this.shareBase = "";
    this.addresses = [];
    this.permanent = false;
  }

  openWebSocket() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${location.host}/ws`);
      this.socket = socket;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const timeout = window.setTimeout(() => {
        socket.close();
        finish(new Error("WebSocket handshake timeout"));
      }, 2600);

      socket.addEventListener("open", () => {
        this.connected = true;
      });
      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === "welcome") {
          this.shareBase = message.shareBase || location.origin;
          this.addresses = message.addresses || [];
          this.permanent = Boolean(message.permanent);
          this.transport = "websocket";
          finish();
        }
        if (message.type === "room-created" || message.type === "room-joined") {
          this.room = message.room;
          this.role = message.role;
          if (message.shareBase) this.shareBase = message.shareBase;
        }
        this.onMessage?.(message);
      });
      socket.addEventListener("close", () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.socket = null;
        if (wasConnected) this.onMessage?.({ type: "socket-closed" });
        finish(new Error("WebSocket unavailable"));
      });
      socket.addEventListener("error", () => {
        finish(new Error("WebSocket unavailable"));
      });
    });
  }

  async openPolling() {
    const response = await fetch("/api/network", { cache: "no-store" });
    if (!response.ok) throw new Error("联机服务器不可用");
    const data = await response.json();
    this.transport = "poll";
    this.connected = true;
    this.shareBase = data.shareBase || location.origin;
    this.addresses = data.addresses || [];
    this.permanent = Boolean(data.permanent);
  }

  connect() {
    if (this.connected) return Promise.resolve();
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.openWebSocket().catch(async () => {
      this.socket = null;
      await this.openPolling();
    });
    return this.connectPromise;
  }

  async request(path, payload = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(payload)) {
      params.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    const response = await fetch(`${path}?${params}`, { cache: "no-store" });
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Keep a useful transport error below.
    }
    if (!response.ok) throw new Error(data.message || "联机请求失败");
    return data;
  }

  sendSocket(message) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  sendRoomMessage(message) {
    if (this.transport === "websocket") return this.sendSocket(message);
    if (!this.room || !this.token) return false;
    this.request("/api/room/send", { room: this.room, token: this.token, message }).catch(() => {});
    return true;
  }

  applyIdentity(message) {
    this.room = message.room;
    this.role = message.role;
    this.token = message.token || this.token;
    if (message.shareBase) this.shareBase = message.shareBase;
    this.cursor = 0;
    if (message.transport === "poll") this.startPolling();
  }

  async createRoom(name, character = "yiyi") {
    await this.connect();
    if (this.transport === "poll") {
      const message = await this.request("/api/room/create", { name, character });
      this.applyIdentity(message);
      this.onMessage?.(message);
      return;
    }
    this.sendSocket({ type: "create", name, character });
  }

  async joinRoom(room, name, character = "yiyi") {
    await this.connect();
    const code = room.toUpperCase();
    if (this.transport === "poll") {
      const message = await this.request("/api/room/join", { room: code, name, character });
      this.applyIdentity(message);
      this.onMessage?.(message);
      return;
    }
    this.room = code;
    this.sendSocket({ type: "join", room: code, name, character });
  }

  async startPolling() {
    if (this.polling || !this.room || !this.token) return;
    this.polling = true;
    while (this.polling && this.room && this.connected) {
      try {
        const response = await fetch(
          `/api/room/events?room=${encodeURIComponent(this.room)}&token=${encodeURIComponent(this.token)}&cursor=${this.cursor}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error("poll failed");
        const data = await response.json();
        for (const event of data.events || []) {
          this.cursor = Math.max(this.cursor, event.id || this.cursor);
          this.onMessage?.(event);
        }
        if (!data.events?.length) await new Promise((resolve) => setTimeout(resolve, 50));
      } catch {
        if (!this.polling) break;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
    }
    this.polling = false;
  }

  start() {
    this.sendRoomMessage({ type: "start", room: this.room });
  }

  input(held, pressed) {
    if (this.role !== "p2") return;
    this.sendRoomMessage({ type: "input", held, pressed });
  }

  snapshot(payload) {
    if (this.role === "p1") this.sendRoomMessage({ type: "snapshot", ...payload });
  }

  fx(payload) {
    if (this.role === "p1") this.sendRoomMessage({ type: "fx", ...payload });
  }

  matchOver(payload) {
    if (this.role === "p1") this.sendRoomMessage({ type: "match-over", ...payload });
  }

  requestRematch() {
    this.sendRoomMessage({ type: "rematch-request", room: this.room });
  }

  pauseRequest() {
    this.sendRoomMessage({ type: "pause-request", room: this.room });
  }

  pauseResponse(accepted) {
    this.sendRoomMessage({ type: "pause-response", accepted: Boolean(accepted), room: this.room });
  }

  pauseResume() {
    this.sendRoomMessage({ type: "pause-resume", room: this.room });
  }

  close() {
    this.polling = false;
    this.socket?.close();
    this.socket = null;
    this.connected = false;
    this.connectPromise = null;
    this.room = null;
    this.role = null;
    this.token = null;
    this.cursor = 0;
  }
}
