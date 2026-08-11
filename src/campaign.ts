import type { BossEnemyKind, CampaignTierId, RosterEnemyKind } from "./types";

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
  resourceSnowChance: number;
  weather?: {
    kind: "snow";
    particleCount: number;
    fadeSeconds: number;
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
  specialEnemies: readonly RosterEnemyKind[];
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
    biome: { ground: "forest", minimapLabel: "FOREST MAP", resourceSnowChance: 0 },
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
      resourceSnowChance: 0.58,
      weather: { kind: "snow", particleCount: 120, fadeSeconds: 1.4 },
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
