import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("..");
const output = resolve("public");
if (!output.startsWith(resolve(".") + "\\") || !output.endsWith("public")) {
  throw new Error(`Refusing to clear unexpected path: ${output}`);
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const item of ["index.html", "styles.css", "manifest.webmanifest", "assets", "src", "vendor"]) {
  cpSync(resolve(root, item), resolve(output, item), { recursive: true });
}
cpSync(resolve("vercel.json"), resolve(output, "vercel.json"));
console.log(`Asset bundle ready: ${output}`);
