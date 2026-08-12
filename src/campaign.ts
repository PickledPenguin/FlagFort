import type { BossEnemyKind, CampaignTierId, RosterEnemyKind } from "./types";
import type { PopupContrast } from "./popup-colors";
import type { ResourceStateSkinId } from "./assets";

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
  ground: "forest" | "snow";
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
  specialEnemies: readonly [] | readonly [
    RosterEnemyKind,
    RosterEnemyKind,
    RosterEnemyKind,
  ];
  unlock: CampaignUnlockRequirement;
  milestones: readonly CampaignMilestone[];
  biome: CampaignBiomeDefinition;
}

export const CAMPAIGN_TIERS: readonly CampaignTierDefinition[] = [
  {
    id: "forest",
    order: 0,
    name: "Forest Frontier",
    subtitle: "The first standard",
    description: "Build beneath the old canopy and hold the fort through ten nights.",
    accent: "#8eef9f",
    icon: "./images/campaign/forest-tier.svg",
    backdrop: "./images/campaign/forest-backdrop.svg",
    boss: "boss",
    specialEnemies: [],
    unlock: { level: 1 },
    milestones: [
      { id: "forest-level-2-coins", level: 2, reward: { kind: "coins", amount: 25 } },
      { id: "forest-level-3-coins", level: 3, reward: { kind: "coins", amount: 35 } },
    ],
    biome: {
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
  },
  {
    id: "snowy",
    order: 1,
    name: "Snowbound Keep",
    subtitle: "Whiteout siege",
    description: "A frozen forest where snow falls at night and cold-born zombies join every roster.",
    accent: "#8fe8ff",
    icon: "./images/campaign/snowy-tier.svg",
    backdrop: "./images/campaign/snowy-backdrop.svg",
    boss: "frost-warden",
    specialEnemies: ["frostbite", "snowballer", "icebound"],
    unlock: { level: 4, previousTierId: "forest" },
    milestones: [
      { id: "snowy-level-5-coins", level: 5, reward: { kind: "coins", amount: 50 } },
      { id: "snowy-level-6-coins", level: 6, reward: { kind: "coins", amount: 65 } },
    ],
    biome: {
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
  level: number,
  claimedRewardIds: readonly string[],
): CampaignMilestone[] {
  const claimed = new Set(claimedRewardIds);
  return CAMPAIGN_TIERS.flatMap((tier) => tier.milestones)
    .filter((milestone) => milestone.level <= level && !claimed.has(milestone.id));
}
