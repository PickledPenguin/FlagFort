import type { CampaignTierId, EnemyKind, ResourceKind, StructureKind, Tier } from "./types";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { CAMPAIGN_TIER_ARTWORK } from "./campaign-artwork";

export const svgAsset = (path: string): string => `./images/${path}.svg`;
export const cardAsset = (
  category: "unlocks" | "upgrades" | "mutations",
  name: string,
): string => svgAsset(`cards/${category}/${name}`);
export const tutorialAsset = (name: string): string => svgAsset(`tutorial/${name}`);

const image = svgAsset;

export const RESOURCE_STATE_SKINS = {
  temperate: {
    wood: { active: image("world/tree-active"), depleted: image("world/tree-depleted") },
    stone: { active: image("world/stone-active"), depleted: image("world/stone-depleted") },
    gold: { active: image("world/gold-active"), depleted: image("world/gold-depleted") },
    diamond: { active: image("world/diamond-active"), depleted: image("world/diamond-depleted") },
  },
  desert: {
    wood: { active: image("world/desert-acacia-active"), depleted: image("world/desert-acacia-depleted") },
    stone: { active: image("world/desert-sandstone-active"), depleted: image("world/desert-sandstone-depleted") },
    gold: { active: image("world/desert-gold-active"), depleted: image("world/desert-gold-depleted") },
    diamond: { active: image("world/desert-crystal-active"), depleted: image("world/desert-crystal-depleted") },
  },
  volcanic: {
    wood: { active: image("world/volcanic-charwood-active"), depleted: image("world/volcanic-charwood-depleted") },
    stone: { active: image("world/volcanic-basalt-active"), depleted: image("world/volcanic-basalt-depleted") },
    gold: { active: image("world/volcanic-sulfur-active"), depleted: image("world/volcanic-sulfur-depleted") },
    diamond: { active: image("world/volcanic-ember-crystal-active"), depleted: image("world/volcanic-ember-crystal-depleted") },
  },
  wasteland: {
    wood: { active: image("world/wasteland-deadwood-active"), depleted: image("world/wasteland-deadwood-depleted") },
    stone: { active: image("world/wasteland-concrete-active"), depleted: image("world/wasteland-concrete-depleted") },
    gold: { active: image("world/wasteland-uranium-active"), depleted: image("world/wasteland-uranium-depleted") },
    diamond: { active: image("world/wasteland-isotope-crystal-active"), depleted: image("world/wasteland-isotope-crystal-depleted") },
  },
  rift: {
    wood: { active: image("world/rift-twilight-wood-active"), depleted: image("world/rift-twilight-wood-depleted") },
    stone: { active: image("world/rift-moonstone-active"), depleted: image("world/rift-moonstone-depleted") },
    gold: { active: image("world/rift-star-metal-active"), depleted: image("world/rift-star-metal-depleted") },
    diamond: { active: image("world/rift-void-crystal-active"), depleted: image("world/rift-void-crystal-depleted") },
  },
  mire: {
    wood: { active: image("world/mire-cypress-active"), depleted: image("world/mire-cypress-depleted") },
    stone: { active: image("world/mire-peatstone-active"), depleted: image("world/mire-peatstone-depleted") },
    gold: { active: image("world/mire-bog-gold-active"), depleted: image("world/mire-bog-gold-depleted") },
    diamond: { active: image("world/mire-ghost-crystal-active"), depleted: image("world/mire-ghost-crystal-depleted") },
  },
  clockwork: {
    wood: { active: image("world/clockwork-ironwood-active"), depleted: image("world/clockwork-ironwood-depleted") },
    stone: { active: image("world/clockwork-gearstone-active"), depleted: image("world/clockwork-gearstone-depleted") },
    gold: { active: image("world/clockwork-brass-active"), depleted: image("world/clockwork-brass-depleted") },
    diamond: { active: image("world/clockwork-aether-core-active"), depleted: image("world/clockwork-aether-core-depleted") },
  },
} as const satisfies Record<
  string,
  Record<ResourceKind, Record<"active" | "depleted", string>>
>;

export type ResourceStateSkinId = keyof typeof RESOURCE_STATE_SKINS;

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
  campaignTierArtwork: CAMPAIGN_TIER_ARTWORK,
  resources: {
    wood: image("resources/wood-log"),
    stone: image("resources/stone"),
    gold: image("resources/gold"),
    diamond: image("resources/diamond"),
  } satisfies Record<ResourceKind, string>,
  resourceStateSkins: RESOURCE_STATE_SKINS,
  enemies: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.portrait)])) as Record<EnemyKind, string>,
  campaignEnemyPortraits: {
    forest: {
      basic: image("enemies/basic-zombie"),
      runner: image("enemies/runner-zombie"),
    },
    snowy: {
      basic: image("enemies/snowy-basic-zombie"),
      runner: image("enemies/snowy-runner-zombie"),
    },
    desert: {
      basic: image("enemies/desert-basic-zombie"),
      runner: image("enemies/desert-runner-zombie"),
    },
    volcanic: {
      basic: image("enemies/volcanic-basic-zombie"),
      runner: image("enemies/volcanic-runner-zombie"),
    },
    wasteland: {
      basic: image("enemies/wasteland-basic-zombie"),
      runner: image("enemies/wasteland-runner-zombie"),
    },
    rift: {
      basic: image("enemies/rift-basic-zombie"),
      runner: image("enemies/rift-runner-zombie"),
    },
    mire: {
      basic: image("enemies/mire-basic-zombie"),
      runner: image("enemies/mire-runner-zombie"),
    },
    clockwork: {
      basic: image("enemies/clockwork-basic-zombie"),
      runner: image("enemies/clockwork-runner-zombie"),
    },
  } satisfies Record<CampaignTierId, Partial<Record<EnemyKind, string>>>,
  enemyBrokenArmor: Object.fromEntries(Object.values(ENEMY_REGISTRY)
    .filter((entry) => entry.armor)
    .map((entry) => [entry.id, image(entry.armor!.brokenSprite)])) as Partial<Record<EnemyKind, string>>,
  enemyBodies: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.body)])) as Record<EnemyKind, string>,
  enemyHands: Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, image(entry.assets.hand)])) as Record<EnemyKind, string>,
  enemyDeathBursts: Object.fromEntries(Object.values(ENEMY_REGISTRY)
    .filter((entry) => entry.death.burstWaveSprite)
    .map((entry) => [entry.id, image(entry.death.burstWaveSprite!)])) as Partial<Record<EnemyKind, string>>,
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
    uraniumBloodSplatter: image("effects/uranium-blood-splatter"),
    mireParasite: image("effects/mire-parasite"),
    infestingNode: image("effects/infesting-node"),
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

export function campaignEnemyPortrait(kind: EnemyKind, tierId: CampaignTierId): string {
  const tierPortraits = ASSETS.campaignEnemyPortraits[
    tierId as keyof typeof ASSETS.campaignEnemyPortraits
  ] as Partial<Record<EnemyKind, string>> | undefined;
  return tierPortraits?.[kind] ?? ASSETS.enemies[kind];
}

export function allAssetPaths(value: unknown = ASSETS): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap((entry) => allAssetPaths(entry));
}
