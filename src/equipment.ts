import {
  EQUIPMENT_ORDER,
  EQUIPMENT_TIER_ORDER,
  META_BALANCE,
  type EquipmentKind,
  type EquipmentTier,
} from "./meta-balance";

export interface EquipmentState {
  tier: EquipmentTier | null;
  equipped: boolean;
}

export type EquipmentInventory = Record<EquipmentKind, EquipmentState>;

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
