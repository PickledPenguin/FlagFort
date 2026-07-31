import {
  EQUIPMENT_ORDER,
  EQUIPMENT_TIER_ORDER,
  META_BALANCE,
  type EquipmentKind,
  type EquipmentTier,
} from "./meta-balance";
import { BALANCE } from "./config";

export interface EquipmentState {
  tier: EquipmentTier | null;
  equipped: boolean;
}

export type EquipmentInventory = Record<EquipmentKind, EquipmentState>;

export type EquipmentStatUnit = "percent" | "damage" | "seconds" | "pixels" | "radians" | "count";

export interface EquipmentStatDefinition {
  id: string;
  label: string;
  unit: EquipmentStatUnit;
  unequipped: number;
  tiers: Record<EquipmentTier, number>;
}

export function createEquipmentInventory(): EquipmentInventory {
  return Object.fromEntries(EQUIPMENT_ORDER.map((kind) => [
    kind,
    { tier: null, equipped: false },
  ])) as EquipmentInventory;
}

export function nextEquipmentTier(current: EquipmentTier | null): EquipmentTier | null {
  if (current === null) return "wood";
  return EQUIPMENT_TIER_ORDER[EQUIPMENT_TIER_ORDER.indexOf(current) + 1] ?? null;
}

export function equipmentUpgradePrice(current: EquipmentTier | null): number | null {
  const next = nextEquipmentTier(current);
  return next ? META_BALANCE.equipment.tierPrices[next] : null;
}

export function helmetMitigation(tier: EquipmentTier | null, equipped = true): number {
  if (!tier || !equipped) return 0;
  return Math.max(0, Math.min(0.5, META_BALANCE.equipment.helmetMitigation[tier]));
}

export function mitigatePlayerDamage(
  incomingDamage: number,
  tier: EquipmentTier | null,
  equipped = true,
): number {
  const damage = Math.max(0, incomingDamage);
  return damage * (1 - helmetMitigation(tier, equipped));
}

export function freeRepairChance(tier: EquipmentTier | null, equipped = true): number {
  if (!tier || !equipped) return 0;
  return Math.max(0, Math.min(0.5, META_BALANCE.equipment.wrenchFreeRepairChance[tier]));
}

export function isRepairFree(
  tier: EquipmentTier | null,
  equipped: boolean,
  deterministicRoll: number,
): boolean {
  return deterministicRoll >= 0 && deterministicRoll < freeRepairChance(tier, equipped);
}

export function swordStats(tier: EquipmentTier | null, equipped = true) {
  return tier && equipped ? META_BALANCE.equipment.sword[tier] : null;
}

export function recyclingRate(tier: EquipmentTier | null, equipped = true): number {
  if (!tier || !equipped) return META_BALANCE.equipment.recyclingRate.unequipped;
  return META_BALANCE.equipment.recyclingRate[tier];
}

export function equipmentStatDefinitions(kind: EquipmentKind): readonly EquipmentStatDefinition[] {
  if (kind === "helmet") {
    return [{
      id: "damage-reduction",
      label: "Damage reduction",
      unit: "percent",
      unequipped: 0,
      tiers: META_BALANCE.equipment.helmetMitigation,
    }];
  }
  if (kind === "wrench") {
    return [{
      id: "free-repair",
      label: "Free-repair chance",
      unit: "percent",
      unequipped: 0,
      tiers: META_BALANCE.equipment.wrenchFreeRepairChance,
    }];
  }
  if (kind === "mallet") {
    const { unequipped, ...tiers } = META_BALANCE.equipment.recyclingRate;
    return [{
      id: "recycling-return",
      label: "Recycling return",
      unit: "percent",
      unequipped,
      tiers,
    }];
  }
  const tierValues = <K extends keyof typeof META_BALANCE.equipment.sword.wood>(
    key: K,
    map: (value: (typeof META_BALANCE.equipment.sword)[EquipmentTier][K]) => number = Number,
  ): Record<EquipmentTier, number> => Object.fromEntries(
    EQUIPMENT_TIER_ORDER.map((tier) => [tier, map(META_BALANCE.equipment.sword[tier][key])]),
  ) as Record<EquipmentTier, number>;
  return [
    {
      id: "damage",
      label: "Damage",
      unit: "damage",
      unequipped: BALANCE.player.punchDamage,
      tiers: tierValues("damageMultiplier", (value) => BALANCE.player.punchDamage * value),
    },
    {
      id: "attack-interval",
      label: "Attack interval",
      unit: "seconds",
      unequipped: BALANCE.player.punchRate,
      tiers: tierValues("cooldownMultiplier", (value) => BALANCE.player.punchRate * value),
    },
    {
      id: "sweep-range",
      label: "Sweep range",
      unit: "pixels",
      unequipped: BALANCE.player.punchRange,
      tiers: tierValues("range"),
    },
    {
      id: "sweep-arc",
      label: "Sweep arc",
      unit: "radians",
      unequipped: BALANCE.player.punchArc,
      tiers: tierValues("arc"),
    },
    {
      id: "target-limit",
      label: "Targets",
      unit: "count",
      unequipped: 1,
      tiers: tierValues("targetLimit"),
    },
    {
      id: "knockback",
      label: "Knockback",
      unit: "pixels",
      unequipped: 0,
      tiers: tierValues("knockback"),
    },
  ];
}

export function effectiveEquipmentStats(
  kind: EquipmentKind,
  tier: EquipmentTier | null,
  equipped: boolean,
  permanentMeleeBonus = 0,
): Readonly<Record<string, number>> {
  return Object.fromEntries(equipmentStatDefinitions(kind).map((stat) => {
    let value = tier && equipped ? stat.tiers[tier] : stat.unequipped;
    if (kind === "sword" && stat.id === "damage") {
      const equipmentBonus = tier && equipped
        ? META_BALANCE.equipment.sword[tier].damageMultiplier - 1
        : 0;
      value = BALANCE.player.punchDamage * (1 + Math.max(0, permanentMeleeBonus) + equipmentBonus);
    }
    return [stat.id, value];
  }));
}
