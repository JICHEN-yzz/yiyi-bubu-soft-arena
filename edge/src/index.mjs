import { ArenaRoom } from "./arena.mjs";

export { ArenaRoom };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws" || url.pathname.startsWith("/api/")) {
      const id = env.ARENA_ROOMS.idFromName("global");
      return env.ARENA_ROOMS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  }
};
