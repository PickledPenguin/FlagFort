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
  investedResources: ResourceWallet,
  refundFraction: number,
  health = 1,
  maxHealth = 1,
): ResourceWallet {
  const safeFraction = Math.max(0, Math.min(1, refundFraction));
  const healthFraction = maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, health / maxHealth));
  const refund = (value: number): number => {
    const spent = Math.max(0, Math.floor(value));
    const raw = spent * safeFraction * healthFraction;
    const rounded = BALANCE.recycling.rounding === "floor" ? Math.floor(raw) : Math.round(raw);
    return Math.min(spent, Math.max(0, rounded));
  };
  return {
    wood: refund(investedResources.wood),
    stone: refund(investedResources.stone),
    gold: refund(investedResources.gold),
    diamond: refund(investedResources.diamond),
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
  return BALANCE.structureValues[kind][tier];
}

export function baseWaveThreatBudget(night: number): number {
  const nightIndex = Math.max(0, Math.floor(night) - 1);
  return Math.round(
    BALANCE.waveBase
    + BALANCE.waveGrowth * Math.pow(nightIndex, BALANCE.waveGrowthExponent),
  );
}

export function endlessWaveThreatBudget(night: number): number {
  const firstEndlessNight = BALANCE.endless.firstNight;
  const campaignFinalBudget = baseWaveThreatBudget(firstEndlessNight - 1);
  const endlessIndex = Math.max(1, Math.floor(night) - firstEndlessNight + 1);
  return Math.round(
    campaignFinalBudget * Math.pow(BALANCE.endless.waveGrowthPerNight, endlessIndex),
  );
}

export function expectedStructurePoints(night: number): number {
  const nightIndex = Math.max(0, Math.floor(night) - 1);
  const curve = BALANCE.adaptive.expectedFortification;
  return Math.round(
    curve.startingPoints
    + curve.growthPerNight * Math.pow(nightIndex, curve.growthExponent),
  );
}

export interface AdaptiveDifficulty {
  actual: number;
  expected: number;
  difference: number;
  relativeDifference: number;
  baseMultiplier: number;
  structureRawMultiplier: number;
  structureMultiplier: number;
  structureDelta: number;
  playerLevel: number;
  levelRawMultiplier: number;
  levelMultiplier: number;
  levelDelta: number;
  turretDps: number;
  expectedTurretDps: number;
  turretCoverageRatio: number;
  playerUpgradeFraction: number;
  equipmentStrength: number;
  equipmentDelta: number;
  powerDelta: number;
  otherDelta: number;
  rawMultiplier: number;
  multiplier: number;
  indicator: "Low fortification" | "Expected fortification" | "Advanced fortification" | "Horde adapting";
}

export interface AdaptivePowerInput {
  turretDps: number;
  turretCoverageRatio: number;
  upgrades: Upgrades;
  equipmentStrength?: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function adaptiveDifficulty(
  actual: number,
  night: number,
  playerLevel = 1,
  otherAdditiveDeltas: readonly number[] = [],
  power?: AdaptivePowerInput,
): AdaptiveDifficulty {
  const expected = expectedStructurePoints(night);
  const difference = actual - expected;
  const relativeDifference = difference / Math.max(expected, BALANCE.adaptive.safeExpectedMinimum);
  const outsideDeadZone = Math.max(
    0,
    Math.abs(relativeDifference) - BALANCE.adaptive.structure.deadZone,
  );
  const signed = Math.sign(relativeDifference) * outsideDeadZone;
  const structureRawMultiplier = 1 + signed * BALANCE.adaptive.structure.sensitivity;
  const structureMultiplier = clamp(
    structureRawMultiplier,
    BALANCE.adaptive.structure.minimumMultiplier,
    BALANCE.adaptive.structure.maximumMultiplier,
  );
  const safePlayerLevel = Math.max(1, Math.floor(playerLevel));
  const levelRawMultiplier = 1
    + Math.max(0, safePlayerLevel - BALANCE.adaptive.level.baselineLevel)
      * BALANCE.adaptive.level.deltaPerLevel;
  const levelMultiplier = clamp(
    levelRawMultiplier,
    BALANCE.adaptive.level.minimumMultiplier,
    BALANCE.adaptive.level.maximumMultiplier,
  );
  const powerConfig = BALANCE.adaptive.powerAwareness;
  const nightIndex = Math.max(0, Math.floor(night) - 1);
  const expectedTurretDps = powerConfig.turretDps.expectedStartingDps
    + powerConfig.turretDps.expectedGrowthPerNight
      * Math.pow(nightIndex, powerConfig.turretDps.expectedGrowthExponent);
  const turretDps = Math.max(0, power?.turretDps ?? 0);
  const turretDpsDifference = turretDps / Math.max(1, expectedTurretDps) - 1;
  const turretDpsDelta = clamp(
    Math.max(0, turretDpsDifference - powerConfig.turretDps.deadZone)
      * powerConfig.turretDps.sensitivity,
    0,
    powerConfig.turretDps.maximumDelta,
  );
  const turretCoverageRatio = Math.max(0, power?.turretCoverageRatio ?? 0);
  const coverageDelta = powerConfig.turretCoverageThresholds.reduce(
    (delta, threshold) => turretCoverageRatio >= threshold.ratio
      ? Math.max(delta, threshold.delta)
      : delta,
    0,
  );
  const upgradeWeights = powerConfig.playerUpgrades.weights;
  const totalUpgradeWeight = (Object.keys(upgradeWeights) as Array<keyof Upgrades>)
    .reduce((sum, key) => sum + upgradeWeights[key], 0);
  const weightedUpgradeProgress = (Object.keys(upgradeWeights) as Array<keyof Upgrades>)
    .reduce((sum, key) => {
      const fraction = clamp((power?.upgrades[key] ?? 0) / Math.max(1e-9, BALANCE.upgradeCaps[key]), 0, 1);
      return sum + fraction * upgradeWeights[key];
    }, 0);
  const playerUpgradeFraction = totalUpgradeWeight > 0
    ? weightedUpgradeProgress / totalUpgradeWeight
    : 0;
  const playerUpgradeDelta = playerUpgradeFraction * powerConfig.playerUpgrades.maximumDelta;
  const equipmentStrength = Math.max(0, power?.equipmentStrength ?? 0);
  const equipmentDelta = clamp(
    equipmentStrength / Math.max(1e-9, powerConfig.equipment.referenceStrength)
      * powerConfig.equipment.maximumDelta,
    0,
    powerConfig.equipment.maximumDelta,
  );
  const powerDelta = turretDpsDelta + coverageDelta + playerUpgradeDelta + equipmentDelta;
  const baseMultiplier = BALANCE.adaptive.effective.baseMultiplier;
  const structureDelta = structureMultiplier - baseMultiplier;
  const levelDelta = levelMultiplier - baseMultiplier;
  const otherDelta = otherAdditiveDeltas
    .filter((value) => Number.isFinite(value))
    .reduce((total, value) => total + value, 0);
  const rawMultiplier = baseMultiplier + structureDelta + levelDelta + powerDelta + otherDelta;
  const multiplier = clamp(
    rawMultiplier,
    BALANCE.adaptive.effective.minimumMultiplier,
    BALANCE.adaptive.effective.maximumMultiplier,
  );
  const indicator = multiplier < 0.88
    ? "Low fortification"
    : multiplier > 1.35
      ? "Horde adapting"
      : multiplier > 1.08
        ? "Advanced fortification"
        : "Expected fortification";
  return {
    actual,
    expected,
    difference,
    relativeDifference,
    baseMultiplier,
    structureRawMultiplier,
    structureMultiplier,
    structureDelta,
    playerLevel: safePlayerLevel,
    levelRawMultiplier,
    levelMultiplier,
    levelDelta,
    turretDps,
    expectedTurretDps,
    turretCoverageRatio,
    playerUpgradeFraction,
    equipmentStrength,
    equipmentDelta,
    powerDelta,
    otherDelta,
    rawMultiplier,
    multiplier,
    indicator,
  };
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
  upgrades[key] = Math.min(
    BALANCE.upgradeCaps[key],
    upgrades[key] + BALANCE.upgrades[key].amount,
  );
}

export function applyMutation(mutations: Mutations, key: keyof Mutations): void {
  mutations[key] += BALANCE.mutations[key].amount;
}

export function formatCost(cost: ResourceWallet): string {
  return RESOURCE_ORDER.filter((kind) => cost[kind] > 0)
    .map((kind) => `${cost[kind]} ${kind}`)
    .join("  ");
}
