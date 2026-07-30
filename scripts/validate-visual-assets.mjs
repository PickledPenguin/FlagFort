import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const publicRoot = resolve(root, "public");

const buildBarAssets = {
  actions: ["fists", "repair-wrench", "nighttime-bow", "recycle-mallet"],
  structures: ["wall", "spikes", "door", "harvester", "turret"],
  indicators: ["locked", "selected-tier", "upgrade-arrow", "material-tier-badge"],
};

const tiers = ["wood", "stone", "gold", "diamond"];
const structureKinds = ["wall", "spikes", "door", "harvester", "turret"];
const enemyKinds = ["basic", "runner", "breaker", "jumper", "summoner"];
const gameplayAssets = [
  ...enemyKinds.flatMap((kind) => [
    `images/gameplay/enemies/${kind}/body.svg`,
    `images/gameplay/enemies/${kind}/hand.svg`,
    `images/enemies/${kind}-zombie.svg`,
  ]),
  "images/gameplay/player/body.svg",
  ...tiers.map((tier) => `images/gameplay/player/hands/${tier}.svg`),
  ...["repair-wrench", "recycle-mallet", "bow", "blueprint"]
    .map((name) => `images/gameplay/player/tools/${name}.svg`),
  "images/gameplay/flag/base.svg",
  "images/gameplay/flag/cloth.svg",
  "images/gameplay/flag/healing-aura.svg",
  "images/gameplay/flag/protection-boundary.svg",
  "images/gameplay/portal/outer-ring.svg",
  "images/gameplay/portal/inner-arc.svg",
  "images/gameplay/portal/no-build-zone.svg",
  "images/gameplay/tutorial/arena-boundary.svg",
  "images/gameplay/tutorial/arena-fade.svg",
  "images/gameplay/projectiles/arrow.svg",
  "images/gameplay/projectiles/acid.svg",
  "images/gameplay/cursors/ring-allowed.svg",
  "images/gameplay/cursors/ring-blocked.svg",
  "images/gameplay/cursors/ring-context.svg",
  ...[
    "placement-allowed",
    "placement-blocked",
    "turret-range-current",
    "turret-range-upgraded",
    "harvester-range-allowed",
    "harvester-range-blocked",
    "resource-supported",
    "resource-unsupported",
  ].map((name) => `images/gameplay/previews/${name}.svg`),
  ...structureKinds.flatMap((kind) =>
    tiers.map((tier) => `images/structures/${kind}/${tier}.svg`)),
  ...tiers.map((tier) => `images/structures/turret/barrel-${tier}.svg`),
  ...tiers.map((tier) => `images/structures/harvester/arm-${tier}.svg`),
];

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

async function findSvgFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findSvgFiles(path);
    return entry.name.endsWith(".svg") ? [path] : [];
  }));
  return nested.flat();
}

const allSvgFiles = await findSvgFiles(resolve(publicRoot, "images"));
for (const absolutePath of allSvgFiles) {
  await validateSvg(relative(publicRoot, absolutePath));
}

const expectedCards = {
  unlocks: [
    ...["stone", "gold", "diamond"].map((tier) => `gloves-${tier}`),
    ...["wall", "spikes", "door", "harvester", "turret"]
      .flatMap((kind) => ["gold", "diamond"].map((tier) => `${kind}-${tier}`)),
  ],
  upgrades: [
    "move-speed", "max-health", "punch-rate", "punch-damage", "bow-rate", "bow-damage",
    "harvest-rate", "repair-efficiency", "structure-durability", "cost-reduction",
    "turret-damage", "turret-rate", "turret-range", "harvester-speed", "flag-health",
    "turret-capacity", "harvester-capacity",
  ],
  mutations: [
    "basic-weight", "runner-weight", "breaker-weight", "jumper-weight", "summoner-weight",
    "health", "damage", "speed", "attack-speed", "structure-damage", "wave-size",
  ],
};

for (const [category, names] of Object.entries(expectedCards)) {
  for (const name of names) {
    const cardPath = `images/cards/${category}/${name}.svg`;
    assert(allSvgFiles.includes(resolve(publicRoot, cardPath)), `Missing card artwork: ${cardPath}`);
  }
}

for (const asset of gameplayAssets) {
  assert(allSvgFiles.includes(resolve(publicRoot, asset)), `Missing gameplay artwork: ${asset}`);
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
const challengeIcons = await read("src/challenge-icons.ts");
const content = await read("src/content.ts");

for (const sourceFragment of [
  'tierColors: { wood: "#b77a45", stone: "#aeb7bc", gold: "#f6c945", diamond: "#57e5ef" }',
  "radius: { wall: 33, door: 34, spikes: 34, harvester: 39, turret: 36 }",
  "harvesterArm: [98, 108, 120, 134]",
  "doorFadedOpacity: 0.38",
]) {
  assert(config.includes(sourceFragment), `config drifted from structure reference: ${sourceFragment}`);
}

for (const obsoleteFragment of [
  "drawZombieBody(ctx",
  "ctx.moveTo(-17, -17)",
  "ctx.fillRect(0, -8, 44, 16)",
  "ctx.moveTo(-15, 15)",
  "ctx.fillRect(-8, -19, 30, 15)",
]) {
  assert(!renderer.includes(obsoleteFragment), `Obsolete Canvas artwork remains: ${obsoleteFragment}`);
}
assert(renderer.includes("ASSETS.structures[structure.kind][structure.tier]"),
  "Gameplay structures do not use the SVG registry");
assert(renderer.includes("ASSETS.previews.placement"),
  "Structure placement previews do not use the SVG registry");
assert(renderer.includes("ASSETS.previews.turretRange"),
  "Turret range previews do not use the SVG registry");
assert(renderer.includes("ASSETS.previews.harvesterRange"),
  "Harvester range previews do not use the SVG registry");
assert(renderer.includes("ASSETS.previews.resourceTarget"),
  "Harvester resource targeting does not use the SVG registry");
assert(renderer.includes('BUILD_BAR_ICON_PATHS["repair-wrench"]'),
  "Repair cursor does not reuse the build-bar wrench");
assert(renderer.includes('BUILD_BAR_ICON_PATHS["recycle-mallet"]'),
  "Recycle cursor does not reuse the build-bar recycle icon");

assert(!iconRenderer.includes("<i></i><i></i>"), "Fists are still manually drawn in markup");
assert(!iconRenderer.includes("<i></i><b></b>"), "Structure icons are still manually drawn in markup");
assert(!/icon\("(?:wrench|recycle|lock|check)"\)/.test(ui),
  "Build-bar artwork bypasses the typed build-bar icon registry");
assert(!styles.includes(".bow-symbol"), "Nighttime bow is still manually drawn in CSS");
for (const obsoleteSelector of [
  ".menu-scene", ".menu-flag", ".menu-player", ".flag-art", ".zombie-art", ".boss-pips",
]) {
  assert(!styles.includes(obsoleteSelector), `Obsolete CSS illustration remains: ${obsoleteSelector}`);
}
assert(!/\.game-symbol\.(?:wall|spikes|door|harvester|turret)\s+[ib](?::|[\s,{])/.test(styles),
  "A structure icon is still manually drawn in CSS");
assert(!ui.includes("☠"), "Mutation cards still have a text-symbol fallback");
assert(!ui.includes('return buildBarIcon("upgrade-arrow"'),
  "Benefit cards still have a generic artwork fallback");
assert(!styles.includes(".upgrade-arrow") && !styles.includes(".card-art > .icon"),
  "Obsolete card fallback styling remains");
assert(!challengeIcons.includes("<path"), "Challenge icons are still generated as inline paths");
assert(content.includes('cardAsset("unlocks"')
  && content.includes('cardAsset("upgrades"')
  && content.includes('cardAsset("mutations"')
  && content.includes("tutorialAsset(id)"),
  "Card or tutorial artwork bypasses the centralized asset helpers");

for (const names of Object.values(buildBarAssets)) {
  for (const name of names) {
    assert(registry.includes(`${name}:`) || registry.includes(`"${name}":`) || registry.includes(`"${name}"`),
      `typed build-bar registry is missing ${name}`);
  }
}

console.log(`Validated ${allSvgFiles.length} editable SVGs, ${Object.values(expectedCards).flat().length} card illustrations, ${gameplayAssets.length} gameplay assets, and 20 structure reference groups.`);
