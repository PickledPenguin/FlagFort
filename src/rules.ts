import { BALANCE, RESOURCE_ORDER, TIER_ORDER } from "./config";
import type { Mutations, ResourceKind, StructureKind, Tier, UnlockState, Upgrades } from "./types";

export type ResourceWallet = Record<ResourceKind, number>;

export function emptyWallet(): ResourceWallet {
  return { wood: 0, stone: 0, gold: 0, diamond: 0 };
}

export function cumulativeCost(kind: StructureKind, tier: Tier, reduction = 0): ResourceWallet {
  const result = emptyWallet();
  const cappedReduction = Math.min(0.6, Math.max(0, reduction));
  const target = BALANCE.tierIndex[tier];
  for (let i = 0; i <= target; i += 1) {
    const stageTier = TIER_ORDER[i];
    if (!stageTier) continue;
    const stage = BALANCE.stageCosts[kind][stageTier];
    for (const resource of RESOURCE_ORDER) result[resource] += stage[resource];
  }
  for (const resource of RESOURCE_ORDER) {
    result[resource] = Math.max(0, Math.ceil(result[resource] * (1 - cappedReduction)));
  }
  return result;
}

export function upgradeCost(kind: StructureKind, from: Tier, to: Tier, reduction = 0): ResourceWallet {
  const current = cumulativeCost(kind, from, reduction);
  const target = cumulativeCost(kind, to, reduction);
  return {
    wood: Math.max(0, target.wood - current.wood),
    stone: Math.max(0, target.stone - current.stone),
    gold: Math.max(0, target.gold - current.gold),
    diamond: Math.max(0, target.diamond - current.diamond),
  };
}

export function dismantleRefund(
  kind: StructureKind,
  tier: Tier,
  reduction = 0,
  health = 1,
  maxHealth = 1,
  constructionCostMultiplier = 1,
): ResourceWallet {
  const baseCost = cumulativeCost(kind, tier, reduction);
  const cost: ResourceWallet = {
    wood: Math.ceil(baseCost.wood * constructionCostMultiplier),
    stone: Math.ceil(baseCost.stone * constructionCostMultiplier),
    gold: Math.ceil(baseCost.gold * constructionCostMultiplier),
    diamond: Math.ceil(baseCost.diamond * constructionCostMultiplier),
  };
  const healthFraction = maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, health / maxHealth));
  const refund = (value: number): number => {
    const raw = value * BALANCE.recycling.refundFraction * healthFraction;
    return BALANCE.recycling.rounding === "floor" ? Math.floor(raw) : Math.round(raw);
  };
  return {
    wood: refund(cost.wood),
    stone: refund(cost.stone),
    gold: refund(cost.gold),
    diamond: refund(cost.diamond),
  };
}

export function proportionalRepairCost(
  kind: StructureKind,
  tier: Tier,
  health: number,
  maxHealth: number,
  repairEfficiency = 0,
): ResourceWallet {
  if (maxHealth <= 0 || health >= maxHealth) return emptyWallet();
  const missingFraction = Math.max(0, Math.min(1, (maxHealth - Math.max(0, health)) / maxHealth));
  const effectiveFraction = missingFraction / Math.max(1, 1 + repairEfficiency);
  const fullCost = cumulativeCost(kind, tier);
  const result = emptyWallet();
  for (const resource of RESOURCE_ORDER) {
    if (fullCost[resource] > 0 && effectiveFraction > 0) {
      result[resource] = Math.ceil(fullCost[resource] * effectiveFraction);
    }
  }
  return result;
}

export function canAfford(wallet: ResourceWallet, cost: ResourceWallet): boolean {
  return RESOURCE_ORDER.every((resource) => wallet[resource] >= cost[resource]);
}

export function spend(wallet: ResourceWallet, cost: ResourceWallet): void {
  for (const resource of RESOURCE_ORDER) wallet[resource] -= cost[resource];
}

export function addWallet(wallet: ResourceWallet, amount: ResourceWallet): void {
  for (const resource of RESOURCE_ORDER) wallet[resource] += amount[resource];
}

export interface AffordabilityRequirement {
  resource: ResourceKind;
  required: number;
  owned: number;
  affordable: boolean;
  missing: number;
}

export function affordability(wallet: ResourceWallet, cost: ResourceWallet): AffordabilityRequirement[] {
  return RESOURCE_ORDER.filter((resource) => cost[resource] > 0).map((resource) => ({
    resource,
    required: cost[resource],
    owned: wallet[resource],
    affordable: wallet[resource] >= cost[resource],
    missing: Math.max(0, cost[resource] - wallet[resource]),
  }));
}

export function rerollCost(wallet: ResourceWallet): ResourceWallet {
  return {
    wood: Math.floor(wallet.wood * BALANCE.reroll.costFraction),
    stone: Math.floor(wallet.stone * BALANCE.reroll.costFraction),
    gold: Math.floor(wallet.gold * BALANCE.reroll.costFraction),
    diamond: Math.floor(wallet.diamond * BALANCE.reroll.costFraction),
  };
}

export function structurePointValue(kind: StructureKind, tier: Tier): number {
  return BALANCE.structurePoints[kind][tier];
}

export function expectedStructurePoints(night: number): number {
  const configured = BALANCE.adaptive.expectedByNight[night - 1];
  if (configured !== undefined) return configured;
  const endlessNight = Math.max(1, night - BALANCE.adaptive.expectedByNight.length);
  const last = BALANCE.adaptive.expectedByNight.at(-1) ?? BALANCE.adaptive.safeExpectedMinimum;
  return Math.round(
    last
    + BALANCE.adaptive.endlessGrowthPerNight
      * Math.pow(endlessNight, BALANCE.adaptive.endlessGrowthExponent),
  );
}

export interface AdaptiveDifficulty {
  actual: number;
  expected: number;
  difference: number;
  relativeDifference: number;
  rawMultiplier: number;
  multiplier: number;
  indicator: "Low fortification" | "Expected fortification" | "Advanced fortification" | "Horde adapting";
}

export function adaptiveDifficulty(actual: number, night: number): AdaptiveDifficulty {
  const expected = expectedStructurePoints(night);
  const difference = actual - expected;
  const relativeDifference = difference / Math.max(expected, BALANCE.adaptive.safeExpectedMinimum);
  const outsideDeadZone = Math.max(0, Math.abs(relativeDifference) - BALANCE.adaptive.deadZone);
  const signed = Math.sign(relativeDifference) * outsideDeadZone;
  const rawMultiplier = 1 + signed * BALANCE.adaptive.sensitivity;
  const multiplier = Math.max(
    BALANCE.adaptive.minimumMultiplier,
    Math.min(BALANCE.adaptive.maximumMultiplier, rawMultiplier),
  );
  const indicator = multiplier < 0.88
    ? "Low fortification"
    : multiplier > 1.35
      ? "Horde adapting"
      : multiplier > 1.08
        ? "Advanced fortification"
        : "Expected fortification";
  return { actual, expected, difference, relativeDifference, rawMultiplier, multiplier, indicator };
}

/** Legacy economy helper retained for saved-test compatibility. The flag is never a valid repair target. */
export function flagRepairPayment(wallet: ResourceWallet): Partial<ResourceWallet> | null {
  if (wallet.diamond >= 1) return { diamond: 1 };
  if (wallet.gold >= 2) return { gold: 2 };
  if (wallet.stone >= 4) return { stone: 4 };
  if (wallet.wood >= 8) return { wood: 8 };
  return null;
}

export function createUnlocks(): UnlockState {
  return {
    gloves: ["wood"],
    structures: {
      wall: ["wood", "stone"],
      door: ["wood", "stone"],
      spikes: ["wood", "stone"],
      harvester: ["wood", "stone"],
      turret: ["wood", "stone"],
    },
  };
}

export function canUnlock(id: string, unlocks: UnlockState): boolean {
  const [category, rawTier] = id.split(":");
  const tier = rawTier as Tier;
  const prior = TIER_ORDER[BALANCE.tierIndex[tier] - 1];
  if (category === "gloves") {
    return !unlocks.gloves.includes(tier) && (!prior || unlocks.gloves.includes(prior));
  }
  const structure = category as StructureKind;
  const unlocked = unlocks.structures[structure];
  return Boolean(unlocked && !unlocked.includes(tier) && (!prior || unlocked.includes(prior)));
}

export function createUpgrades(): Upgrades {
  return {
    moveSpeed: 0,
    maxHealth: 0,
    punchRate: 0,
    punchDamage: 0,
    bowRate: 0,
    bowDamage: 0,
    harvestRate: 0,
    repairEfficiency: 0,
    structureDurability: 0,
    costReduction: 0,
    turretDamage: 0,
    turretRate: 0,
    turretRange: 0,
    harvesterSpeed: 0,
    flagHealth: 0,
    turretCapacity: 0,
    harvesterCapacity: 0,
  };
}

export function createMutations(): Mutations {
  return {
    basicWeight: 0,
    runnerWeight: 0,
    breakerWeight: 0,
    jumperWeight: 0,
    summonerWeight: 0,
    health: 0,
    damage: 0,
    speed: 0,
    attackSpeed: 0,
    structureDamage: 0,
    waveSize: 0,
  };
}

export function applyUpgrade(upgrades: Upgrades, key: keyof Upgrades): void {
  upgrades[key] += BALANCE.upgrades[key].amount;
  if (key === "costReduction") upgrades[key] = Math.min(0.6, upgrades[key]);
}

export function applyMutation(mutations: Mutations, key: keyof Mutations): void {
  mutations[key] += BALANCE.mutations[key].amount;
}

export function formatCost(cost: ResourceWallet): string {
  return RESOURCE_ORDER.filter((kind) => cost[kind] > 0)
    .map((kind) => `${cost[kind]} ${kind}`)
    .join("  ");
}
