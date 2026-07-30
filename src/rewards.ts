import { META_BALANCE } from "./meta-balance";
import type { EnemyKind, ResourceKind } from "./types";

export interface RunRewardInput {
  survivingStructurePoints: number;
  directPlayerKills: Record<EnemyKind, number>;
  remainingResources: Record<ResourceKind, number>;
  nightsSurvived: number;
  victory: boolean;
}

export interface XpRewardBreakdown {
  structures: number;
  personalKills: number;
  resources: number;
  nights: number;
  victory: number;
  total: number;
}

export interface CoinSettlement {
  investment: number;
  returnedPrincipal: number;
  profitOrLoss: number;
  totalReturn: number;
  finalCoinChange: number;
  returnPercent: number;
}

export function calculateStructureXp(points: number): number {
  return Math.max(0, Math.round(points * META_BALANCE.rewards.structurePointXp));
}

export function calculatePersonalKillXp(kills: Record<EnemyKind, number>): number {
  return (Object.keys(META_BALANCE.rewards.enemyKillXp) as EnemyKind[])
    .reduce((total, kind) => total
      + Math.max(0, Math.floor(kills[kind] ?? 0)) * META_BALANCE.rewards.enemyKillXp[kind], 0);
}

export function calculateResourceXp(resources: Record<ResourceKind, number>): number {
  const weighted = (Object.keys(META_BALANCE.rewards.resourceWeights) as ResourceKind[])
    .reduce((total, kind) => total
      + Math.max(0, Math.floor(resources[kind] ?? 0)) * META_BALANCE.rewards.resourceWeights[kind], 0);
  return Math.floor(META_BALANCE.rewards.resourceLogScale * Math.log1p(weighted));
}

export function calculateNightXp(nightsSurvived: number): number {
  const complete = Math.max(0, Math.floor(nightsSurvived));
  let total = 0;
  for (let night = 1; night <= Math.min(10, complete); night += 1) {
    total += META_BALANCE.rewards.nightXp[night] ?? 0;
  }
  if (complete > 10) total += (complete - 10) * (META_BALANCE.rewards.nightXp[10] ?? 60);
  return total;
}

export function calculateXpRewards(input: RunRewardInput): XpRewardBreakdown {
  const structures = calculateStructureXp(input.survivingStructurePoints);
  const personalKills = calculatePersonalKillXp(input.directPlayerKills);
  const resources = calculateResourceXp(input.remainingResources);
  const nights = calculateNightXp(input.nightsSurvived);
  const victory = input.victory ? META_BALANCE.rewards.campaignVictoryBonus : 0;
  return {
    structures,
    personalKills,
    resources,
    nights,
    victory,
    total: structures + personalKills + resources + nights + victory,
  };
}

export function investmentReturnPercent(nightsSurvived: number): number {
  const nights = Math.max(0, Math.floor(nightsSurvived));
  if (nights <= 10) return META_BALANCE.investment.returnPercentByNightsSurvived[nights] ?? 0;
  const endlessIndex = Math.min(
    META_BALANCE.investment.endlessReturnPercentByNightsSurvived.length - 1,
    nights - 10,
  );
  return Math.min(
    META_BALANCE.investment.endlessCapPercent,
    META_BALANCE.investment.endlessReturnPercentByNightsSurvived[endlessIndex]
      ?? META_BALANCE.investment.endlessCapPercent,
  );
}

export function settleCoinInvestment(investment: number, nightsSurvived: number): CoinSettlement {
  const principal = Math.max(0, Math.min(META_BALANCE.investment.maximum, Math.floor(investment)));
  const returnPercent = investmentReturnPercent(nightsSurvived);
  const totalReturn = Math.round(principal * returnPercent / 100);
  const returnedPrincipal = Math.min(principal, totalReturn);
  const profitOrLoss = totalReturn - principal;
  return {
    investment: principal,
    returnedPrincipal,
    profitOrLoss,
    totalReturn,
    finalCoinChange: totalReturn - principal,
    returnPercent,
  };
}
