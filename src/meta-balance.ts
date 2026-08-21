import { cardAsset, EQUIPMENT_ASSETS, svgAsset } from "./assets";
import type { EnemyKind, StructureKind, Tier } from "./types";

export type PermanentUpgradeId =
  | "bowDamage"
  | "bowRate"
  | "punchDamage"
  | "moveSpeed"
  | "turretDamage"
  | "turretRate"
  | "turretRange"
  | "harvesterSpeed"
  | "harvestRate"
  | "structureHealth";

export type EquipmentKind = "helmet" | "wrench" | "sword" | "mallet";
export type EquipmentTier = Tier;
export type EyeStyle = "round" | "focused" | "sleepy" | "sparkle" | "mischief";

export interface PermanentUpgradeDefinition {
  id: PermanentUpgradeId;
  title: string;
  theme: string;
  description: string;
  icon: string;
}

export const PERMANENT_UPGRADES: readonly PermanentUpgradeDefinition[] = [
  { id: "bowDamage", title: "Bow Damage", theme: "Ranged", description: "Increase starting bow damage.", icon: cardAsset("upgrades", "bow-damage") },
  { id: "bowRate", title: "Bow Speed", theme: "Ranged", description: "Increase starting bow fire rate.", icon: cardAsset("upgrades", "bow-rate") },
  { id: "punchDamage", title: "Melee Damage", theme: "Player", description: "Increase starting fist and sword damage.", icon: cardAsset("upgrades", "punch-damage") },
  { id: "moveSpeed", title: "Movement", theme: "Player", description: "Increase starting movement speed.", icon: cardAsset("upgrades", "move-speed") },
  { id: "harvestRate", title: "Gathering", theme: "Player", description: "Increase starting gathering speed.", icon: cardAsset("upgrades", "harvest-rate") },
  { id: "turretDamage", title: "Turret Damage", theme: "Structures", description: "Increase owned turret damage.", icon: cardAsset("upgrades", "turret-damage") },
  { id: "turretRate", title: "Turret Fire Rate", theme: "Structures", description: "Increase owned turret fire rate.", icon: cardAsset("upgrades", "turret-rate") },
  { id: "turretRange", title: "Turret Range", theme: "Structures", description: "Increase owned turret range.", icon: cardAsset("upgrades", "turret-range") },
  { id: "harvesterSpeed", title: "Harvester Speed", theme: "Structures", description: "Increase owned harvester rotation speed.", icon: cardAsset("upgrades", "harvester-speed") },
  { id: "structureHealth", title: "Structure Health", theme: "Durability", description: "Increase every owned player-built structure's durability.", icon: cardAsset("upgrades", "structure-durability") },
] as const;

export const META_BALANCE = {
  profileSchemaVersion: 5,
  profileStorageKey: "flagfort-profile-v2",
  legacyRecordsKey: "countdown-forest-records",
  coinSafetyMinimum: 10,
  dailyRewards: {
    coinsByDay: [10, 15, 20, 25, 30, 35, 40],
    repeatingDay: 7,
  },
  permanentUpgrade: {
    maximumLevel: 5,
    percentPerLevel: 0.1,
    typicalCampaignVictoryXp: 1000,
    costMultipliers: [1, 2, 3, 4, 5],
  },
  levels: {
    baseXp: 300,
    growthXp: 125,
  },
  investment: {
    maximum: 100,
    returnPercentByNightsSurvived: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200],
    endlessReturnPercentByNightsSurvived: [200, 205, 210, 215, 220, 225],
    endlessCapPercent: 225,
    rounding: "nearest" as const,
  },
  rewards: {
    enemyKillXp: {
      basic: 1,
      runner: 2,
      breaker: 4,
      gremlin: 3,
      splitter: 3,
      "splitter-child": 0,
      jumper: 5,
      "dune-burrower": 4,
      sandstormer: 8,
      tombguard: 14,
      cinderburst: 8,
      "magma-spitter": 10,
      "obsidian-charger": 16,
      radstalker: 9,
      "sludge-lobber": 12,
      "ruin-siren": 15,
      "rift-strider": 11,
      "comet-slinger": 13,
      "void-herald": 17,
      "mire-lurker": 13,
      sporecaster: 15,
      "drowned-bulwark": 19,
      springjack: 15,
      "aether-gunner": 17,
      gearwright: 21,
      popper: 6,
      archer: 6,
      summoner: 8,
      acidslinger: 10,
      rammer: 12,
      frostbite: 3,
      snowballer: 6,
      icebound: 12,
      boss: 80,
      "frost-warden": 90,
      "dune-colossus": 105,
      "caldera-sovereign": 120,
      "reactor-revenant": 135,
      "eclipse-regent": 150,
      "mireheart-titan": 165,
      "chronoforge-colossus": 180,
    } satisfies Record<EnemyKind, number>,
    cumulativeNightXp: [0, 7, 28, 63, 112, 175, 252, 343, 448, 567, 700],
    campaignVictoryBonus: 300,
    difficultyBonus: {
      curve: "linear" as const,
      normalBaseMultiplier: 1,
      maximumVictoryFraction: 0.5,
    },
    challengeBonus: {
      rounding: "nearest" as const,
    },
  },
  equipment: {
    adaptiveStrength: {
      helmet: { wood: 0.03, stone: 0.07, gold: 0.13, diamond: 0.2 },
      wrench: { wood: 0.03, stone: 0.07, gold: 0.13, diamond: 0.2 },
      sword: { wood: 0.08, stone: 0.18, gold: 0.32, diamond: 0.5 },
      mallet: { wood: 0.02, stone: 0.05, gold: 0.1, diamond: 0.16 },
    } satisfies Record<EquipmentKind, Record<Tier, number>>,
    tierPrices: { wood: 100, stone: 250, gold: 500, diamond: 900 } satisfies Record<Tier, number>,
    helmetMitigation: { wood: 0.1, stone: 0.22, gold: 0.35, diamond: 0.5 } satisfies Record<Tier, number>,
    wrenchFreeRepairChance: { wood: 0.1, stone: 0.22, gold: 0.35, diamond: 0.5 } satisfies Record<Tier, number>,
    recyclingRate: {
      unequipped: 0.25,
      wood: 0.35,
      stone: 0.45,
      gold: 0.6,
      diamond: 0.75,
    } satisfies Record<Tier | "unequipped", number>,
    sword: {
      wood: { damageMultiplier: 1.1, cooldownMultiplier: 2, range: 92, arc: 1.28, knockback: 14 },
      stone: { damageMultiplier: 1.35, cooldownMultiplier: 1.6, range: 100, arc: 1.42, knockback: 18 },
      gold: { damageMultiplier: 1.65, cooldownMultiplier: 1.25, range: 108, arc: 1.56, knockback: 23 },
      diamond: { damageMultiplier: 2, cooldownMultiplier: 1, range: 116, arc: 1.7, knockback: 30 },
    } satisfies Record<Tier, {
      damageMultiplier: number;
      cooldownMultiplier: number;
      range: number;
        arc: number;
      knockback: number;
      }>,
    swordAnimation: {
      damageProgress: 0.32,
      sweepStartRadiusRatio: 0.28,
      sweepInnerRadius: 16,
      sweepOpacity: 0.34,
      gripX: 35,
      gripY: -10,
      bladeRotationOffset: 0.885,
    },
  },
  customization: {
    colors: ["#d9b783", "#f1c7a5", "#a96f4d", "#6f4938", "#d7a6c8", "#8fc7ba"],
    eyeStyles: ["round", "focused", "sleepy", "sparkle", "mischief"] as readonly EyeStyle[],
  },
  assets: {
    equipment: EQUIPMENT_ASSETS satisfies Record<EquipmentKind, Record<Tier, string>>,
    player: {
      body: svgAsset("gameplay/player/body-base"),
      bodyDetails: svgAsset("gameplay/player/body-details"),
      eyes: {
        round: svgAsset("gameplay/player/eyes-round"),
        focused: svgAsset("gameplay/player/eyes-focused"),
        sleepy: svgAsset("gameplay/player/eyes-sleepy"),
        sparkle: svgAsset("gameplay/player/eyes-sparkle"),
        mischief: svgAsset("gameplay/player/eyes-mischief"),
      } satisfies Record<EyeStyle, string>,
    },
  },
} as const;

export const EQUIPMENT_ORDER: readonly EquipmentKind[] = ["sword", "wrench", "helmet", "mallet"];
export const EQUIPMENT_TIER_ORDER: readonly EquipmentTier[] = ["wood", "stone", "gold", "diamond"];

export function permanentUpgradeCost(levelToBuy: number): number {
  const multiplier = META_BALANCE.permanentUpgrade.costMultipliers[levelToBuy - 1];
  return Math.round(META_BALANCE.permanentUpgrade.typicalCampaignVictoryXp * (multiplier ?? levelToBuy));
}

export function permanentUpgradePercent(level: number): number {
  return Math.max(0, Math.min(META_BALANCE.permanentUpgrade.maximumLevel, Math.floor(level)))
    * META_BALANCE.permanentUpgrade.percentPerLevel;
}

export function structureRewardPoints(kind: StructureKind, tier: Tier, points: Record<StructureKind, Record<Tier, number>>): number {
  return points[kind][tier];
}
