import { META_BALANCE } from "./meta-balance";
import { BALANCE } from "./config";
import type { Difficulty, EnemyKind } from "./types";
import { challengeXpBonusPercent } from "./challenges";

export interface RunRewardInput {
  directPlayerKills: Partial<Record<EnemyKind, number>>;
  nightsSurvived: number;
  victory: boolean;
  effectiveDifficultyMultiplier?: number;
  challengeIds?: readonly string[];
  selectedDifficulty?: Difficulty;
}

export interface XpRewardBreakdown {
  personalKills: number;
  nights: number;
  victory: number;
  difficulty: number;
  adaptiveDifficulty?: number;
  challenge: number;
  subtotal?: number;
  difficultyPercent?: number;
  difficultyAdjustment?: number;
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

export function calculatePersonalKillXp(kills: Partial<Record<EnemyKind, number>>): number {
  return (Object.keys(META_BALANCE.rewards.enemyKillXp) as EnemyKind[])
    .reduce((total, kind) => total
      + Math.max(0, Math.floor(kills[kind] ?? 0)) * META_BALANCE.rewards.enemyKillXp[kind], 0);
}

export function calculateNightXp(nightsSurvived: number): number {
  const complete = Math.max(0, Math.floor(nightsSurvived));
  const campaignMaximum = META_BALANCE.rewards.cumulativeNightXp.length - 1;
  if (complete <= campaignMaximum) {
    return META_BALANCE.rewards.cumulativeNightXp[complete] ?? 0;
  }
  const campaignTotal = META_BALANCE.rewards.cumulativeNightXp[campaignMaximum] ?? 0;
  const finalIncrement = campaignTotal
    - (META_BALANCE.rewards.cumulativeNightXp[campaignMaximum - 1] ?? 0);
  return campaignTotal + (complete - campaignMaximum) * finalIncrement;
}

/**
 * Linear reward from the normal adaptive baseline to the centralized safe cap.
 * Reduced and baseline multipliers grant zero; the safe cap grants half of the
 * configured campaign victory bonus.
 */
export function calculateDifficultyXp(effectiveMultiplier: number): number {
  const base = META_BALANCE.rewards.difficultyBonus.normalBaseMultiplier;
  const maximum = BALANCE.adaptive.effective.maximumMultiplier;
  if (!Number.isFinite(effectiveMultiplier) || effectiveMultiplier <= base || maximum <= base) {
    return 0;
  }
  const progress = Math.max(0, Math.min(1, (effectiveMultiplier - base) / (maximum - base)));
  const maximumBonus = META_BALANCE.rewards.campaignVictoryBonus
    * META_BALANCE.rewards.difficultyBonus.maximumVictoryFraction;
  return Math.round(maximumBonus * progress);
}

export function calculateXpRewards(input: RunRewardInput): XpRewardBreakdown {
  const personalKills = calculatePersonalKillXp(input.directPlayerKills);
  const nights = calculateNightXp(input.nightsSurvived);
  const victory = input.victory ? META_BALANCE.rewards.campaignVictoryBonus : 0;
  const adaptiveDifficulty = calculateDifficultyXp(input.effectiveDifficultyMultiplier ?? 1);
  const normalEarnedXp = personalKills + nights + victory + adaptiveDifficulty;
  // Challenge XP uses nearest-integer rounding after one combined-percentage calculation.
  const challenge = input.victory && Math.floor(input.nightsSurvived) === 10
    ? Math.round(normalEarnedXp * challengeXpBonusPercent(input.challengeIds ?? []) / 100)
    : 0;
  const subtotal = normalEarnedXp + challenge;
  const selectedDifficulty = input.selectedDifficulty ?? "normal";
  const difficultyMultiplier = BALANCE.difficulty[selectedDifficulty].xpMultiplier;
  const total = Math.round(subtotal * difficultyMultiplier);
  return {
    personalKills,
    nights,
    victory,
    difficulty: adaptiveDifficulty,
    adaptiveDifficulty,
    challenge,
    subtotal,
    difficultyPercent: Math.round(difficultyMultiplier * 100),
    difficultyAdjustment: total - subtotal,
    total,
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
