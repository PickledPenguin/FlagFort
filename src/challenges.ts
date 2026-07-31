import { BALANCE } from "./config";

export type ChallengeIcon =
  | "timer"
  | "sprout"
  | "hammer"
  | "wrench-off"
  | "shield-half"
  | "flag"
  | "heart-off"
  | "orbit"
  | "users"
  | "skull"
  | "gauge"
  | "dumbbell";

export interface ChallengeModifiers {
  dayDurationMultiplier: number;
  resourceNodeMultiplier: number;
  constructionCostMultiplier: number;
  structureHealthMultiplier: number;
  flagHealthMultiplier: number;
  portalCountMultiplier: number;
  ordinaryZombieCountMultiplier: number;
  specialZombieWeightMultiplier: number;
  enemySpeedMultiplier: number;
  enemyAttackSpeedMultiplier: number;
  enemyHealthMultiplier: number;
  enemyDamageMultiplier: number;
  disablesStructureRepair: boolean;
  disablesFlagHealthUpgrades: boolean;
  disablesPlayerHealing: boolean;
  disablesDawnPlayerHealing: boolean;
}

export interface ChallengeDefinition {
  id: string;
  title: string;
  description: string;
  icon: ChallengeIcon;
  nightDuration: number;
  xpBonusPercent: number;
  modifiers: Partial<ChallengeModifiers>;
}

export const DEFAULT_CHALLENGE_MODIFIERS: Readonly<ChallengeModifiers> = {
  dayDurationMultiplier: 1,
  resourceNodeMultiplier: 1,
  constructionCostMultiplier: 1,
  structureHealthMultiplier: 1,
  flagHealthMultiplier: 1,
  portalCountMultiplier: 1,
  ordinaryZombieCountMultiplier: 1,
  specialZombieWeightMultiplier: 1,
  enemySpeedMultiplier: 1,
  enemyAttackSpeedMultiplier: 1,
  enemyHealthMultiplier: 1,
  enemyDamageMultiplier: 1,
  disablesStructureRepair: false,
  disablesFlagHealthUpgrades: false,
  disablesPlayerHealing: false,
  disablesDawnPlayerHealing: false,
};

export const CHALLENGES = ([
  {
    id: "expensive-construction",
    title: "Expensive Construction",
    description: "Building and structure upgrades cost 50% more.",
    icon: "hammer",
    xpBonusPercent: 5,
    modifiers: { constructionCostMultiplier: 1.5 },
  },
  {
    id: "resource-drought",
    title: "Resource Drought",
    description: "The world generates 50% fewer resource nodes.",
    icon: "sprout",
    xpBonusPercent: 10,
    modifiers: { resourceNodeMultiplier: 0.5 },
  },
  {
    id: "short-days",
    title: "Short Days",
    description: "Daytime is reduced from 60 to 30 seconds.",
    icon: "timer",
    xpBonusPercent: 10,
    modifiers: { dayDurationMultiplier: 0.5 },
  },
  {
    id: "horde-night",
    title: "Horde Night",
    description: "Each night sends 50% more ordinary zombies.",
    icon: "users",
    xpBonusPercent: 10,
    modifiers: { ordinaryZombieCountMultiplier: 1.5 },
  },
  {
    id: "elite-invasion",
    title: "Elite Invasion",
    description: "Special zombies are twice as likely after introduction.",
    icon: "skull",
    xpBonusPercent: 10,
    modifiers: { specialZombieWeightMultiplier: 2 },
  },
  {
    id: "mortal-defender",
    title: "Mortal Defender",
    description: "Flag healing and automatic dawn healing are disabled.",
    icon: "heart-off",
    xpBonusPercent: 15,
    modifiers: { disablesPlayerHealing: true, disablesDawnPlayerHealing: true },
  },
  {
    id: "portal-swarm",
    title: "Portal Swarm",
    description: "Twice as many portals open at each valid stage.",
    icon: "orbit",
    xpBonusPercent: 15,
    modifiers: { portalCountMultiplier: 2 },
  },
  {
    id: "glass-defenses",
    title: "Glass Defenses",
    description: "Player-built structures have 50% maximum health.",
    icon: "shield-half",
    xpBonusPercent: 15,
    modifiers: { structureHealthMultiplier: 0.5 },
  },
  {
    id: "accelerated-horde",
    title: "Accelerated Horde",
    description: "Zombies move and attack 25% faster.",
    icon: "gauge",
    xpBonusPercent: 20,
    modifiers: { enemySpeedMultiplier: 1.25, enemyAttackSpeedMultiplier: 1.25 },
  },
  {
    id: "fragile-flag",
    title: "Fragile Flag",
    description: "The flag has 50% health and cannot gain maximum health.",
    icon: "flag",
    xpBonusPercent: 20,
    modifiers: { flagHealthMultiplier: 0.5, disablesFlagHealthUpgrades: true },
  },
  {
    id: "no-repairs",
    title: "No Repairs",
    description: "Player-built structures cannot be repaired.",
    icon: "wrench-off",
    xpBonusPercent: 20,
    modifiers: { disablesStructureRepair: true },
  },
  {
    id: "heavy-horde",
    title: "Heavy Horde",
    description: "Zombies have 50% more health and deal 25% more damage.",
    icon: "dumbbell",
    xpBonusPercent: 25,
    modifiers: { enemyHealthMultiplier: 1.5, enemyDamageMultiplier: 1.25 },
  },
] as const).map((challenge) => ({
  ...challenge,
  nightDuration: BALANCE.nightDuration,
})) satisfies readonly ChallengeDefinition[];

const MULTIPLIER_KEYS: readonly (keyof ChallengeModifiers)[] = [
  "dayDurationMultiplier",
  "resourceNodeMultiplier",
  "constructionCostMultiplier",
  "structureHealthMultiplier",
  "flagHealthMultiplier",
  "portalCountMultiplier",
  "ordinaryZombieCountMultiplier",
  "specialZombieWeightMultiplier",
  "enemySpeedMultiplier",
  "enemyAttackSpeedMultiplier",
  "enemyHealthMultiplier",
  "enemyDamageMultiplier",
];

const BOOLEAN_KEYS: readonly (keyof ChallengeModifiers)[] = [
  "disablesStructureRepair",
  "disablesFlagHealthUpgrades",
  "disablesPlayerHealing",
  "disablesDawnPlayerHealing",
];

export function resolveChallengeModifiers(
  challengeIds: Iterable<string>,
): ChallengeModifiers {
  const selected = new Set(challengeIds);
  const resolved: ChallengeModifiers = { ...DEFAULT_CHALLENGE_MODIFIERS };
  for (const challenge of CHALLENGES) {
    if (!selected.has(challenge.id)) continue;
    const modifiers: Partial<ChallengeModifiers> = challenge.modifiers;
    for (const key of MULTIPLIER_KEYS) {
      const modifier = modifiers[key];
      if (typeof modifier === "number") {
        Object.assign(resolved, { [key]: Number(resolved[key]) * modifier });
      }
    }
    for (const key of BOOLEAN_KEYS) {
      if (modifiers[key] === true) Object.assign(resolved, { [key]: true });
    }
  }
  return resolved;
}

export function challengeDayDuration(challengeIds: Iterable<string>): number {
  return Math.round(
    BALANCE.dayDuration * resolveChallengeModifiers(challengeIds).dayDurationMultiplier,
  );
}

export function challengeXpBonusPercent(challengeIds: Iterable<string>): number {
  const selected = new Set(challengeIds);
  return CHALLENGES.reduce(
    (total, challenge) => total + (selected.has(challenge.id) ? challenge.xpBonusPercent : 0),
    0,
  );
}

export interface NightTimelineMilestone {
  second: number;
  label: string;
  boss?: boolean;
}

export function nightTimeline(bossNight: boolean): NightTimelineMilestone[] {
  return [
    { second: 0, label: "Night begins" },
    { second: 5, label: "Pressure rises" },
    { second: 10, label: "Final scheduled wave" },
    { second: BALANCE.nightSpawnCutoff, label: "Reinforcements end" },
    { second: 23, label: "Survive and clear" },
    {
      second: BALANCE.nightDuration,
      label: bossNight ? "Boss overtime if alive" : "Dawn",
      boss: bossNight,
    },
  ];
}
