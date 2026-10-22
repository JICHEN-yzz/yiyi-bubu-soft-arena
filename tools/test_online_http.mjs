const base = (process.argv[2] || "http://127.0.0.1:4173").replace(/\/+$/, "");

async function post(path, body) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const response = await fetch(`${base}${path}?${params}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `${response.status} ${path}`);
  return data;
}

async function poll(room, token, cursor = 0) {
  const response = await fetch(
    `${base}/api/room/events?room=${encodeURIComponent(room)}&token=${encodeURIComponent(token)}&cursor=${cursor}`,
    { cache: "no-store" }
  );
  return response.json();
}

const host = await post("/api/room/create", { name: "公网测试", character: "bubu" });
const guest = await post("/api/room/join", { room: host.room, name: "女友测试", character: "bubu" });
await post("/api/room/send", {
  room: host.room,
  token: host.token,
  message: { type: "start", room: host.room }
});
await post("/api/room/send", {
  room: host.room,
  token: host.token,
  message: {
    type: "snapshot",
    phase: "fight",
    fighters: [{ x: -2.55 }, { x: 2.55 }]
  }
});
const [hostEvents, guestEvents] = await Promise.all([
  poll(host.room, host.token),
  poll(host.room, guest.token)
]);
console.log(
  JSON.stringify({
    base,
    room: host.room,
    characters: guest.characters,
    host: hostEvents.events.map((event) => event.type),
    guest: guestEvents.events.map((event) => event.type)
  })
);
