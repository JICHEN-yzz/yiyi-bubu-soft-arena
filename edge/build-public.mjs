import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve("..");
const output = resolve("public");
if (!output.startsWith(resolve(".") + "\\") || !output.endsWith("public")) {
  throw new Error(`Refusing to clear unexpected path: ${output}`);
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const item of ["index.html", "styles.css", "sw.js", "manifest.webmanifest", "assets", "src", "vendor"]) {
  cpSync(resolve(root, item), resolve(output, item), { recursive: true });
}
cpSync(resolve("vercel.json"), resolve(output, "vercel.json"));

const compressExtensions = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".glb", ".wasm"]);
function filesIn(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}
for (const file of filesIn(output)) {
  const extension = file.match(/\.[^.]+$/)?.[0]?.toLowerCase();
  if (!extension || !compressExtensions.has(extension)) continue;
  const source = readFileSync(file);
  const compressed = gzipSync(source, { level: 9 });
  if (compressed.length < source.length * 0.94) writeFileSync(`${file}.gz`, compressed);
}
console.log(`Asset bundle ready: ${output}`);
