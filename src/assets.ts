import type { EnemyKind, ResourceKind, StructureKind, Tier } from "./types";
import { ENEMY_REGISTRY } from "./enemy-registry";

export const svgAsset = (path: string): string => `./images/${path}.svg`;
export const cardAsset = (
  category: "unlocks" | "upgrades" | "mutations",
  name: string,
): string => svgAsset(`cards/${category}/${name}`);
export const tutorialAsset = (name: string): string => svgAsset(`tutorial/${name}`);

const image = svgAsset;

export const EQUIPMENT_ASSETS = {
  helmet: {
    wood: image("equipment/helmet-wood"),
    stone: image("equipment/helmet-stone"),
    gold: image("equipment/helmet-gold"),
    diamond: image("equipment/helmet-diamond"),
  },
  wrench: {
    wood: image("equipment/wrench-wood"),
    stone: image("equipment/wrench-stone"),
    gold: image("equipment/wrench-gold"),
    diamond: image("equipment/wrench-diamond"),
  },
  sword: {
    wood: image("equipment/sword-wood"),
    stone: image("equipment/sword-stone"),
    gold: image("equipment/sword-gold"),
    diamond: image("equipment/sword-diamond"),
  },
  mallet: {
    wood: image("equipment/mallet-wood"),
    stone: image("equipment/mallet-stone"),
    gold: image("equipment/mallet-gold"),
    diamond: image("equipment/mallet-diamond"),
  },
} as const;

export const ASSETS = {
  resources: {
    wood: image("resources/wood-log"),
    stone: image("resources/stone"),
    gold: image("resources/gold"),
    diamond: image("resources/diamond"),
  } satisfies Record<ResourceKind, string>,
  resourceStates: {
    wood: { active: image("world/tree-active"), depleted: image("world/tree-depleted") },
    stone: { active: image("world/stone-active"), depleted: image("world/stone-depleted") },
    gold: { active: image("world/gold-active"), depleted: image("world/gold-depleted") },
    diamond: { active: image("world/diamond-active"), depleted: image("world/diamond-depleted") },
  } satisfies Record<ResourceKind, Record<"active" | "depleted", string>>,
  enemies: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.portrait)])) as Record<EnemyKind, string>,
  enemyBodies: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.body)])) as Record<EnemyKind, string>,
  enemyHands: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.hand)])) as Record<EnemyKind, string>,
  player: {
    body: image("gameplay/player/body-base"),
    bodyDetails: image("gameplay/player/body-details"),
    eyes: {
      round: image("gameplay/player/eyes-round"),
      focused: image("gameplay/player/eyes-focused"),
      sleepy: image("gameplay/player/eyes-sleepy"),
      sparkle: image("gameplay/player/eyes-sparkle"),
      mischief: image("gameplay/player/eyes-mischief"),
    },
    hands: {
      wood: image("gameplay/player/hands/wood"),
      stone: image("gameplay/player/hands/stone"),
      gold: image("gameplay/player/hands/gold"),
      diamond: image("gameplay/player/hands/diamond"),
    } satisfies Record<Tier, string>,
    tools: {
      repair: image("gameplay/player/tools/repair-wrench"),
      recycle: image("gameplay/player/tools/recycle-mallet"),
      bow: image("gameplay/player/tools/bow"),
      blueprint: image("gameplay/player/tools/blueprint"),
    },
    swordSweep: image("gameplay/player/sword-sweep"),
  },
  equipment: EQUIPMENT_ASSETS,
  flag: {
    base: image("gameplay/flag/base"),
    cloth: image("gameplay/flag/cloth"),
    healingAura: image("gameplay/flag/healing-aura"),
    protectionBoundary: image("gameplay/flag/protection-boundary"),
  },
  portal: {
    outer: image("gameplay/portal/outer-ring"),
    inner: image("gameplay/portal/inner-arc"),
    noBuildZone: image("gameplay/portal/no-build-zone"),
  },
  tutorial: {
    arenaBoundary: image("gameplay/tutorial/arena-boundary"),
    arenaFade: image("gameplay/tutorial/arena-fade"),
  },
  projectiles: {
    arrow: image("gameplay/projectiles/arrow"),
    acid: image("gameplay/projectiles/acid"),
  },
  effects: {
    bossSlamWave: image("effects/boss-slam-wave"),
    popperAcidBurst: image("effects/popper-acid-burst"),
  },
  cursors: {
    ringAllowed: image("gameplay/cursors/ring-allowed"),
    ringBlocked: image("gameplay/cursors/ring-blocked"),
    ringContext: image("gameplay/cursors/ring-context"),
  },
  previews: {
    placement: {
      allowed: image("gameplay/previews/placement-allowed"),
      blocked: image("gameplay/previews/placement-blocked"),
    },
    turretRange: {
      current: image("gameplay/previews/turret-range-current"),
      upgraded: image("gameplay/previews/turret-range-upgraded"),
    },
    harvesterRange: {
      allowed: image("gameplay/previews/harvester-range-allowed"),
      blocked: image("gameplay/previews/harvester-range-blocked"),
    },
    resourceTarget: {
      supported: image("gameplay/previews/resource-supported"),
      unsupported: image("gameplay/previews/resource-unsupported"),
    },
  },
  challenges: {
    timer: image("challenges/timer"),
    sprout: image("challenges/sprout"),
    hammer: image("challenges/hammer"),
    "wrench-off": image("challenges/wrench-off"),
    "shield-half": image("challenges/shield-half"),
    flag: image("challenges/flag"),
    "heart-off": image("challenges/heart-off"),
    orbit: image("challenges/orbit"),
    users: image("challenges/users"),
    skull: image("challenges/skull"),
    gauge: image("challenges/gauge"),
    dumbbell: image("challenges/dumbbell"),
  },
  cracks: [
    image("structures/crack-small"),
    image("structures/crack-25"),
    image("structures/crack-50"),
    image("structures/crack-75"),
  ],
  ui: Object.fromEntries([
    "heart", "timer", "settings", "play", "book", "maximize",
    "shuffle", "restart", "close", "arrow-left", "arrow-right", "skip", "sun", "copy", "pause",
    "info", "mouse", "upgrade-node", "gamepad-2", "trophy", "sliders-horizontal",
    "calendar", "daily-claimed", "pressure-low", "pressure-normal", "pressure-high",
  ].map((name) => [name, image(`ui/${name}`)])) as Record<string, string>,
  structures: Object.fromEntries(
    (["wall", "door", "spikes", "harvester", "turret"] as StructureKind[]).map((kind) => [
      kind,
      Object.fromEntries((["wood", "stone", "gold", "diamond"] as Tier[]).map((tier) => [
        tier,
        image(`structures/${kind}/${tier}`),
      ])),
    ]),
  ) as Record<StructureKind, Record<Tier, string>>,
  structureParts: {
    turretBarrels: Object.fromEntries((["wood", "stone", "gold", "diamond"] as Tier[]).map((tier) => [
      tier,
      image(`structures/turret/barrel-${tier}`),
    ])) as Record<Tier, string>,
    harvesterArms: Object.fromEntries((["wood", "stone", "gold", "diamond"] as Tier[]).map((tier) => [
      tier,
      image(`structures/harvester/arm-${tier}`),
    ])) as Record<Tier, string>,
  },
} as const;

export function allAssetPaths(value: unknown = ASSETS): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) => allAssetPaths(entry));
}
