import type { BossEnemyKind, CampaignTierId, RosterEnemyKind } from "./types";
import type { PopupContrast } from "./popup-colors";
import type { ResourceStateSkinId } from "./assets";
import { CAMPAIGN_TIER_ARTWORK } from "./campaign-artwork";

export type CampaignReward =
  | { kind: "coins"; amount: number }
  | { kind: "cosmetic"; cosmeticId: string; label: string }
  | { kind: "benefit"; benefitId: string; label: string; amount: number };

export interface CampaignMilestone {
  id: string;
  level: number;
  reward: CampaignReward;
}

export interface CampaignUnlockRequirement {
  level: number;
  previousTierId?: CampaignTierId;
  additional?: readonly { id: string; label: string }[];
}

export interface CampaignBiomeDefinition {
  ground: "forest" | "snow" | "desert" | "volcanic" | "wasteland" | "rift" | "mire" | "clockwork";
  minimapLabel: string;
  resourceStateSkin: ResourceStateSkinId;
  resourceOverlay?: {
    kind: "cap";
    chance: number;
    seedKey: string;
    fillColor: string;
    strokeColor: string;
    opacity: number;
    hitOpacity: number;
    widthRatio: number;
    heightRatio: number;
    verticalOffsetRatio: number;
    rotation: number;
    lineWidth: number;
  };
  friendlyProjectileColor?: string;
  popupContrast?: PopupContrast & {
    protectedColors: readonly string[];
  };
  palette: {
    viewport: string;
    ground: string;
    clearingCenter: string;
    clearingEdge: string;
    foliage: readonly [string, string, string, string];
  };
  weather?: {
    kind: "falling-particles";
    activeDuring: "night" | "always";
    color: string;
    seedKey: string;
    particleCount: number;
    fadeSeconds: number;
    fallSpeed: readonly [number, number];
    radius: readonly [number, number];
    driftAmplitude: readonly [number, number];
    driftSpeed: readonly [number, number];
    spawnGapRatio: readonly [number, number];
  };
}

export const CAMPAIGN_BIOMES = {
  forest: {
    ground: "forest",
    minimapLabel: "FOREST MAP",
    resourceStateSkin: "temperate",
    palette: {
      viewport: "#173f2a",
      ground: "#1a4b30",
      clearingCenter: "#315c36",
      clearingEdge: "#1c4930",
      foliage: ["#113b26", "#17452a", "#214f2c", "#285932"],
    },
  },
  snow: {
    ground: "snow",
    minimapLabel: "SNOWBOUND MAP",
    resourceStateSkin: "temperate",
    resourceOverlay: {
      kind: "cap",
      chance: 0.58,
      seedKey: "resource-snow",
      fillColor: "#f7ffff",
      strokeColor: "#b7d7df",
      opacity: 0.94,
      hitOpacity: 0.45,
      widthRatio: 0.72,
      heightRatio: 0.25,
      verticalOffsetRatio: -0.7,
      rotation: -0.08,
      lineWidth: 2,
    },
    friendlyProjectileColor: "#704321",
    popupContrast: {
      protectedColors: ["#63c6e8"],
      perceivedBrightnessThreshold: 150,
      darkenMultiplier: 0.42,
    },
    palette: {
      viewport: "#b9d6db",
      ground: "#d7e7e8",
      clearingCenter: "#f1f6f4",
      clearingEdge: "#c7dcdd",
      foliage: ["#acc7c9", "#b9d0d0", "#c5d9d8", "#d0e2e0"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "night",
      color: "#f7ffff",
      seedKey: "snow-weather",
      particleCount: 120,
      fadeSeconds: 1.4,
      fallSpeed: [38, 112],
      radius: [1.1, 3.4],
      driftAmplitude: [5, 34],
      driftSpeed: [0.35, 1.35],
      spawnGapRatio: [0, 0.18],
    },
  },
  desert: {
    ground: "desert",
    minimapLabel: "SUNSCORCHED MAP",
    resourceStateSkin: "desert",
    friendlyProjectileColor: "#4f2f1c",
    popupContrast: {
      protectedColors: ["#9a3f25", "#1f6d70"],
      perceivedBrightnessThreshold: 160,
      darkenMultiplier: 0.45,
    },
    palette: {
      viewport: "#9f6034",
      ground: "#c98243",
      clearingCenter: "#e4ad65",
      clearingEdge: "#b96f38",
      foliage: ["#744126", "#89502b", "#9c5e31", "#ad6d38"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#f2c77d",
      seedKey: "desert-dust-weather",
      particleCount: 54,
      fadeSeconds: 1.8,
      fallSpeed: [8, 24],
      radius: [0.7, 2.1],
      driftAmplitude: [22, 72],
      driftSpeed: [0.18, 0.62],
      spawnGapRatio: [0, 0.12],
    },
  },
  volcanic: {
    ground: "volcanic",
    minimapLabel: "VOLCANIC MAP",
    resourceStateSkin: "volcanic",
    friendlyProjectileColor: "#ffd27d",
    palette: {
      viewport: "#160f14",
      ground: "#2c1b1d",
      clearingCenter: "#4a2922",
      clearingEdge: "#24171a",
      foliage: ["#171116", "#21171a", "#2d1c1d", "#3a2220"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#ff8a3d",
      seedKey: "volcanic-ember-weather",
      particleCount: 72,
      fadeSeconds: 1.5,
      fallSpeed: [14, 46],
      radius: [0.8, 2.6],
      driftAmplitude: [8, 38],
      driftSpeed: [0.28, 0.92],
      spawnGapRatio: [0, 0.14],
    },
  },
  wasteland: {
    ground: "wasteland",
    minimapLabel: "FALLOUT MAP",
    resourceStateSkin: "wasteland",
    friendlyProjectileColor: "#d9f27c",
    popupContrast: {
      protectedColors: ["#8fe65c", "#67d8e8"],
      perceivedBrightnessThreshold: 138,
      darkenMultiplier: 0.46,
    },
    palette: {
      viewport: "#172019",
      ground: "#31382a",
      clearingCenter: "#4b5137",
      clearingEdge: "#282f25",
      foliage: ["#19231d", "#242d23", "#303728", "#3c422e"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#b7dd63",
      seedKey: "wasteland-fallout-weather",
      particleCount: 64,
      fadeSeconds: 2.2,
      fallSpeed: [5, 19],
      radius: [0.6, 1.9],
      driftAmplitude: [18, 58],
      driftSpeed: [0.12, 0.48],
      spawnGapRatio: [0, 0.16],
    },
  },
  rift: {
    ground: "rift",
    minimapLabel: "ASTRAL RIFT MAP",
    resourceStateSkin: "rift",
    friendlyProjectileColor: "#ffd98a",
    popupContrast: {
      protectedColors: ["#7cecff", "#d99cff"],
      perceivedBrightnessThreshold: 132,
      darkenMultiplier: 0.44,
    },
    palette: {
      viewport: "#090d24",
      ground: "#20234d",
      clearingCenter: "#393765",
      clearingEdge: "#181b40",
      foliage: ["#111630", "#181d3c", "#22264a", "#2d3058"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#8eeaff",
      seedKey: "astral-rift-stardust-weather",
      particleCount: 76,
      fadeSeconds: 2.4,
      fallSpeed: [3, 14],
      radius: [0.7, 2.3],
      driftAmplitude: [20, 68],
      driftSpeed: [0.1, 0.42],
      spawnGapRatio: [0, 0.18],
    },
  },
  mire: {
    ground: "mire",
    minimapLabel: "DROWNED MIRE MAP",
    resourceStateSkin: "mire",
    friendlyProjectileColor: "#d8efaa",
    popupContrast: {
      protectedColors: ["#79e6c1", "#e8c86a"],
      perceivedBrightnessThreshold: 128,
      darkenMultiplier: 0.43,
    },
    palette: {
      viewport: "#071713",
      ground: "#16332b",
      clearingCenter: "#2b4b3b",
      clearingEdge: "#102b25",
      foliage: ["#091d19", "#102820", "#183329", "#224033"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#79e6c1",
      seedKey: "drowned-mire-wisp-weather",
      particleCount: 58,
      fadeSeconds: 2.8,
      fallSpeed: [1, 7],
      radius: [0.8, 2.5],
      driftAmplitude: [24, 76],
      driftSpeed: [0.08, 0.36],
      spawnGapRatio: [0, 0.2],
    },
  },
  clockwork: {
    ground: "clockwork",
    minimapLabel: "CLOCKWORK CITADEL MAP",
    resourceStateSkin: "clockwork",
    friendlyProjectileColor: "#f1cf77",
    popupContrast: {
      protectedColors: ["#79e7df", "#e2b85d"],
      perceivedBrightnessThreshold: 130,
      darkenMultiplier: 0.44,
    },
    palette: {
      viewport: "#151b23",
      ground: "#292e33",
      clearingCenter: "#4b4a45",
      clearingEdge: "#23292f",
      foliage: ["#1d252b", "#293138", "#3a4143", "#4d514b"],
    },
    weather: {
      kind: "falling-particles",
      activeDuring: "always",
      color: "#d9a64f",
      seedKey: "clockwork-citadel-spark-weather",
      particleCount: 66,
      fadeSeconds: 1.7,
      fallSpeed: [4, 18],
      radius: [0.6, 1.8],
      driftAmplitude: [12, 46],
      driftSpeed: [0.16, 0.56],
      spawnGapRatio: [0, 0.15],
    },
  },
} as const satisfies Record<string, CampaignBiomeDefinition>;

export interface CampaignTierDefinition {
  id: CampaignTierId;
  order: number;
  name: string;
  subtitle: string;
  description: string;
  accent: string;
  icon: string;
  backdrop: string;
  boss: BossEnemyKind;
  specialEnemies: readonly [
    RosterEnemyKind,
    RosterEnemyKind,
    RosterEnemyKind,
  ];
  unlock: CampaignUnlockRequirement;
  milestones: readonly CampaignMilestone[];
  biome: CampaignBiomeDefinition;
  music: {
    day: string;
    upgrade: string;
    night: string;
  };
}

const DEFAULT_TIER_MUSIC = {
  day: "./music/day.ogg",
  upgrade: "./music/upgrade.ogg",
  night: "./music/night.ogg",
} as const;

export const CAMPAIGN_TIERS: readonly CampaignTierDefinition[] = [
  {
    id: "forest",
    order: 0,
    name: "Forest Frontier",
    subtitle: "The first standard",
    description: "Build beneath the old canopy and hold the fort through ten nights.",
    accent: "#8eef9f",
    ...CAMPAIGN_TIER_ARTWORK.forest,
    boss: "boss",
    specialEnemies: ["breaker", "jumper", "summoner"],
    unlock: { level: 1 },
    milestones: [
      { id: "forest-level-2-coins", level: 3, reward: { kind: "coins", amount: 25 } },
      { id: "forest-level-3-coins", level: 5, reward: { kind: "coins", amount: 35 } },
    ],
    biome: CAMPAIGN_BIOMES.forest,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "snowy",
    order: 1,
    name: "Snowbound Keep",
    subtitle: "Whiteout siege",
    description: "A frozen forest where snow falls at night and cold-born zombies join every roster.",
    accent: "#8fe8ff",
    ...CAMPAIGN_TIER_ARTWORK.snowy,
    boss: "frost-warden",
    specialEnemies: ["frostbite", "snowballer", "icebound"],
    unlock: { level: 7, previousTierId: "forest" },
    milestones: [
      { id: "snowy-level-5-coins", level: 9, reward: { kind: "coins", amount: 50 } },
      { id: "snowy-level-6-coins", level: 11, reward: { kind: "coins", amount: 65 } },
    ],
    biome: CAMPAIGN_BIOMES.snow,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "desert",
    order: 2,
    name: "Sunscorched Dominion",
    subtitle: "Siege beneath the dunes",
    description: "Cross the burning sands where leapers breach lines, sandblasts pierce defenses, and ancient armor endures.",
    accent: "#f1ca75",
    ...CAMPAIGN_TIER_ARTWORK.desert,
    boss: "dune-colossus",
    specialEnemies: ["dune-burrower", "sandstormer", "tombguard"],
    unlock: { level: 13, previousTierId: "snowy" },
    milestones: [
      { id: "desert-level-8-coins", level: 15, reward: { kind: "coins", amount: 85 } },
      { id: "desert-level-9-coins", level: 17, reward: { kind: "coins", amount: 105 } },
    ],
    biome: CAMPAIGN_BIOMES.desert,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "volcanic",
    order: 3,
    name: "Caldera Crucible",
    subtitle: "Fortress at the fireline",
    description: "Hold the blackened slopes where volatile dead erupt, magma hunts industry, and obsidian charges break the line.",
    accent: "#ff8a3d",
    ...CAMPAIGN_TIER_ARTWORK.volcanic,
    boss: "caldera-sovereign",
    specialEnemies: ["cinderburst", "magma-spitter", "obsidian-charger"],
    unlock: { level: 19, previousTierId: "desert" },
    milestones: [
      { id: "volcanic-level-11-coins", level: 21, reward: { kind: "coins", amount: 130 } },
      { id: "volcanic-level-12-coins", level: 23, reward: { kind: "coins", amount: 155 } },
    ],
    biome: CAMPAIGN_BIOMES.volcanic,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "wasteland",
    order: 4,
    name: "Fallout Exclusion",
    subtitle: "Last stand in the dead zone",
    description: "Defend the irradiated ruins where hunters breach gaps, toxic volleys suppress defenders, and sirens rally the dead.",
    accent: "#b7dd63",
    ...CAMPAIGN_TIER_ARTWORK.wasteland,
    boss: "reactor-revenant",
    specialEnemies: ["radstalker", "sludge-lobber", "ruin-siren"],
    unlock: { level: 25, previousTierId: "volcanic" },
    milestones: [
      { id: "wasteland-level-14-coins", level: 27, reward: { kind: "coins", amount: 185 } },
      { id: "wasteland-level-15-coins", level: 29, reward: { kind: "coins", amount: 220 } },
    ],
    biome: CAMPAIGN_BIOMES.wasteland,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "rift",
    order: 5,
    name: "Astral Rift",
    subtitle: "Hold fast beyond the veil",
    description: "Anchor the fort among shattered stars where striders cross defenses, comets pierce the line, and heralds open gates to the void.",
    accent: "#8eeaff",
    ...CAMPAIGN_TIER_ARTWORK.rift,
    boss: "eclipse-regent",
    specialEnemies: ["rift-strider", "comet-slinger", "void-herald"],
    unlock: { level: 31, previousTierId: "wasteland" },
    milestones: [
      { id: "rift-level-17-coins", level: 33, reward: { kind: "coins", amount: 260 } },
      { id: "rift-level-18-coins", level: 35, reward: { kind: "coins", amount: 305 } },
    ],
    biome: CAMPAIGN_BIOMES.rift,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "mire",
    order: 6,
    name: "Drowned Mire",
    subtitle: "Stand where the dead waters rise",
    description: "Guard the sinking ruins where lurkers drain defenders, spores suppress the line, and drowned shields crush fortifications.",
    accent: "#79e6c1",
    ...CAMPAIGN_TIER_ARTWORK.mire,
    boss: "mireheart-titan",
    specialEnemies: ["mire-lurker", "sporecaster", "drowned-bulwark"],
    unlock: { level: 37, previousTierId: "rift" },
    milestones: [
      { id: "mire-level-20-coins", level: 39, reward: { kind: "coins", amount: 355 } },
      { id: "mire-level-21-coins", level: 41, reward: { kind: "coins", amount: 410 } },
    ],
    biome: CAMPAIGN_BIOMES.mire,
    music: DEFAULT_TIER_MUSIC,
  },
  {
    id: "clockwork",
    order: 7,
    name: "Clockwork Citadel",
    subtitle: "Outlast the iron hour",
    description: "Storm the foundry where spring-driven dead vault defenses, aether fire stalls turrets, and gearwrights assemble reinforcements.",
    accent: "#e2b85d",
    ...CAMPAIGN_TIER_ARTWORK.clockwork,
    boss: "chronoforge-colossus",
    specialEnemies: ["springjack", "aether-gunner", "gearwright"],
    unlock: { level: 43, previousTierId: "mire" },
    milestones: [
      { id: "clockwork-level-23-coins", level: 45, reward: { kind: "coins", amount: 470 } },
      { id: "clockwork-level-24-coins", level: 47, reward: { kind: "coins", amount: 535 } },
    ],
    biome: CAMPAIGN_BIOMES.clockwork,
    music: DEFAULT_TIER_MUSIC,
  },
] as const;

export function campaignTier(id: CampaignTierId): CampaignTierDefinition {
  return CAMPAIGN_TIERS.find((tier) => tier.id === id) ?? CAMPAIGN_TIERS[0]!;
}

export interface CampaignProgressView {
  level: number;
  defeatedTierIds: readonly CampaignTierId[];
}

export function isCampaignTierUnlocked(
  tier: CampaignTierDefinition,
  progress: CampaignProgressView,
): boolean {
  if (progress.level < tier.unlock.level) return false;
  if (tier.unlock.previousTierId && !progress.defeatedTierIds.includes(tier.unlock.previousTierId)) {
    return false;
  }
  return !(tier.unlock.additional?.length);
}

export function highestUnlockedCampaignTierId(
  progress: CampaignProgressView,
): CampaignTierId {
  return [...CAMPAIGN_TIERS]
    .reverse()
    .find((tier) => isCampaignTierUnlocked(tier, progress))?.id ?? CAMPAIGN_TIERS[0]!.id;
}

export function campaignUnlockRequirementText(
  tier: CampaignTierDefinition,
  progress: CampaignProgressView,
): string[] {
  const requirements = [`Reach Level ${tier.unlock.level}`];
  if (tier.unlock.previousTierId) {
    const previous = campaignTier(tier.unlock.previousTierId);
    requirements.push(`Defeat ${previous.name}`);
  }
  requirements.push(...(tier.unlock.additional?.map((condition) => condition.label) ?? []));
  return requirements.map((label, index) => {
    const met = index === 0
      ? progress.level >= tier.unlock.level
      : index === 1 && tier.unlock.previousTierId
        ? progress.defeatedTierIds.includes(tier.unlock.previousTierId)
        : false;
    return `${met ? "Complete" : "Required"}: ${label}`;
  });
}

export function earnedCampaignMilestones(
  progress: CampaignProgressView,
  claimedRewardIds: readonly string[],
): CampaignMilestone[] {
  const claimed = new Set(claimedRewardIds);
  return CAMPAIGN_TIERS.flatMap((tier) => (
    isCampaignTierUnlocked(tier, progress)
      ? tier.milestones.filter((milestone) => (
          milestone.level <= progress.level && !claimed.has(milestone.id)
        ))
      : []
  ));
}

export function isCampaignMilestoneAvailable(
  tier: CampaignTierDefinition,
  milestone: CampaignMilestone,
  progress: CampaignProgressView,
): boolean {
  return milestone.level <= progress.level && isCampaignTierUnlocked(tier, progress);
}
