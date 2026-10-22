import { SoftCandyArena } from "./game.js";

const game = new SoftCandyArena();
window.softCandyArena = game;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
