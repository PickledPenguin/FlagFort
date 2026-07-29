import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "public");

const buildBarAssets = {
  actions: ["fists", "repair-wrench", "nighttime-bow", "recycle-mallet"],
  structures: ["wall", "spikes", "door", "harvester", "turret"],
  indicators: ["locked", "selected-tier", "upgrade-arrow", "material-tier-badge"],
};

const requiredStructureGroups = ["wall", "spikes", "door", "harvester", "turret"]
  .flatMap((kind) => ["wood", "stone", "gold", "diamond"].map((tier) => `${kind}-${tier}`));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function validateSvg(relativePath) {
  const absolutePath = resolve(publicRoot, relativePath);
  await stat(absolutePath);
  const svg = await readFile(absolutePath, "utf8");
  assert(/<svg\b/.test(svg), `${relativePath}: missing svg root`);
  assert(/\bviewBox="[^"]+"/.test(svg), `${relativePath}: missing viewBox`);
  assert(/id="[^"]+"/.test(svg), `${relativePath}: missing editable element or group id`);
  assert(!/<image\b/i.test(svg), `${relativePath}: embedded or linked raster image is not allowed`);
  assert(!/\b(?:href|src)="data:/i.test(svg), `${relativePath}: data URL is not allowed`);
  assert(!/base64/i.test(svg), `${relativePath}: base64 content is not allowed`);
  assert(!/(sodipodi:|inkscape:|<metadata\b)/i.test(svg), `${relativePath}: unnecessary editor metadata`);
  assert((svg.match(/<svg\b/g) ?? []).length === (svg.match(/<\/svg>/g) ?? []).length,
    `${relativePath}: unbalanced svg root`);
}

for (const [category, names] of Object.entries(buildBarAssets)) {
  for (const name of names) {
    await validateSvg(`images/ui/build-bar/${category}/${name}.svg`);
  }
}

const referencePath = "images/reference/structure-reference-sheet.svg";
await validateSvg(referencePath);
const referenceSheet = await readFile(resolve(publicRoot, referencePath), "utf8");
for (const group of requiredStructureGroups) {
  assert(referenceSheet.includes(`id="${group}"`), `${referencePath}: missing ${group}`);
  assert(referenceSheet.includes(`id="${group}-artwork"`), `${referencePath}: missing editable ${group} artwork group`);
}
assert(referenceSheet.includes('id="door-proximity-transparency-example"'),
  `${referencePath}: missing door proximity transparency example`);

const config = await read("src/config.ts");
const renderer = await read("src/renderer.ts");
const iconRenderer = await read("src/ui-icons.ts");
const ui = await read("src/ui.ts");
const styles = await read("src/styles.css");
const registry = await read("src/build-bar-icons.ts");

for (const sourceFragment of [
  'tierColors: { wood: "#b77a45", stone: "#aeb7bc", gold: "#f6c945", diamond: "#57e5ef" }',
  "radius: { wall: 33, door: 34, spikes: 34, harvester: 39, turret: 36 }",
  "harvesterArm: [98, 108, 120, 134]",
  "doorFadedOpacity: 0.38",
]) {
  assert(config.includes(sourceFragment), `config drifted from structure reference: ${sourceFragment}`);
}

for (const sourceFragment of [
  'ctx.strokeStyle = "#2b241d"',
  "ctx.lineWidth = 4",
  "ctx.moveTo(-17, -17)",
  "for (let i = 0; i < 12; i += 1)",
  "ctx.fillRect(0, -8, 44, 16)",
  "ctx.lineWidth = 9",
  'ctx.fillStyle = "#eff7e9"',
]) {
  assert(renderer.includes(sourceFragment), `Canvas structure renderer drifted: ${sourceFragment}`);
}

assert(!iconRenderer.includes("<i></i><i></i>"), "Fists are still manually drawn in markup");
assert(!iconRenderer.includes("<i></i><b></b>"), "Structure icons are still manually drawn in markup");
assert(!/icon\("(?:wrench|recycle|lock|check)"\)/.test(ui),
  "Build-bar artwork bypasses the typed build-bar icon registry");
assert(!styles.includes(".bow-symbol"), "Nighttime bow is still manually drawn in CSS");
assert(!/\.game-symbol\.(?:wall|spikes|door|harvester|turret)\s+[ib](?::|[\s,{])/.test(styles),
  "A structure icon is still manually drawn in CSS");

for (const names of Object.values(buildBarAssets)) {
  for (const name of names) {
    assert(registry.includes(`${name}:`) || registry.includes(`"${name}":`) || registry.includes(`"${name}"`),
      `typed build-bar registry is missing ${name}`);
  }
}

console.log(`Validated ${Object.values(buildBarAssets).flat().length} build-bar SVGs and 20 structure reference groups.`);
