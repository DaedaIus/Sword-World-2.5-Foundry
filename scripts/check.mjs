import { access, readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const rootPath = fileURLToPath(root);
const manifest = JSON.parse(await readFile(new URL("system.json", root), "utf8"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(manifest.id === "sword-world-25", "The system id must remain sword-world-25.");
assert(Number(manifest.compatibility.minimum) === 14, "Minimum Foundry version must be 14.");
assert(Number(manifest.compatibility.verified) === 14, "Verified Foundry version must be 14.");
assert(manifest.documentTypes?.Actor?.character, "Character Actor type is missing.");

const declaredFiles = [
  ...manifest.esmodules,
  ...manifest.styles.map(style => typeof style === "string" ? style : style.src)
];
for (const file of declaredFiles) await access(new URL(file, root));

const modules = [];
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (extname(entry.name) === ".mjs") modules.push(path);
  }
}
await collect(join(rootPath, "module"));
modules.push(join(rootPath, "sw25.mjs"));

for (const modulePath of modules) {
  const result = spawnSync(process.execPath, ["--check", modulePath], { encoding: "utf8" });
  assert(result.status === 0, result.stderr || `Syntax check failed: ${modulePath}`);
}

async function validateTemplates(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await validateTemplates(path);
    else if (extname(entry.name) === ".hbs") {
      const template = await readFile(path, "utf8");
      assert(!/{{[^}]*\.\d+[^}]*}}/.test(template),
        `Handlebars numeric property access must use lookup: ${path}`);
    }
  }
}
await validateTemplates(join(rootPath, "templates"));

console.log(`Validated ${manifest.title} ${manifest.version}: ${modules.length} modules and ${declaredFiles.length} manifest files.`);
