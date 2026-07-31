import { describe, expect, it } from "vitest";
import {
  calculateDifficultyXp,
  calculateNightXp,
  calculatePersonalKillXp,
  calculateXpRewards,
  investmentReturnPercent,
  settleCoinInvestment,
} from "./rewards";

describe("end-of-run XP balance", () => {
  it("weights bosses and special zombies above basic zombies", () => {
    const base = { basic: 1, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 };
    const specials = { basic: 0, runner: 1, breaker: 1, jumper: 1, summoner: 1, boss: 1 };
    expect(calculatePersonalKillXp(specials)).toBeGreaterThan(calculatePersonalKillXp(base));
    expect(calculatePersonalKillXp({ ...base, basic: 0, boss: 1 }))
      .toBeGreaterThan(calculatePersonalKillXp({ ...base, basic: 20 }));
  });

  it("uses the configured cumulative quadratic campaign curve", () => {
    expect(Array.from({ length: 11 }, (_, night) => calculateNightXp(night))).toEqual([
      0, 7, 28, 63, 112, 175, 252, 343, 448, 567, 700,
    ]);
    expect(calculateNightXp(-1)).toBe(0);
  });

  it("awards at least 1000 XP for Night 10 victory before engagement bonuses", () => {
    const input = {
      directPlayerKills: { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      nightsSurvived: 10,
      victory: false,
    };
    const defeat = calculateXpRewards(input);
    const victory = calculateXpRewards({ ...input, victory: true });
    expect(defeat.total).toBe(700);
    expect(victory.victory).toBe(300);
    expect(victory.total).toBe(1000);
    expect(victory.total).toBe(defeat.total + victory.victory);
  });

  it("derives the 150 XP difficulty cap from the victory bonus", () => {
    expect(calculateDifficultyXp(Infinity)).toBe(0);
    expect(calculateDifficultyXp(10)).toBe(150);
  });

  it("adds selected challenge percentages once to normal victory XP with nearest rounding", () => {
    const base = {
      directPlayerKills: { basic: 1, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      nightsSurvived: 10,
      victory: true,
      effectiveDifficultyMultiplier: 10,
    };
    const reward = calculateXpRewards({
      ...base,
      challengeIds: ["resource-drought", "accelerated-horde"],
    });
    expect(reward.personalKills + reward.nights + reward.victory + reward.difficulty).toBe(1151);
    expect(reward.challenge).toBe(345);
    expect(reward.total).toBe(1496);
    expect(calculateXpRewards({ ...base, victory: false, challengeIds: ["heavy-horde"] }).challenge).toBe(0);
    expect(calculateXpRewards({ ...base, nightsSurvived: 9, challengeIds: ["heavy-horde"] }).challenge).toBe(0);
  });
});

describe("coin investment return table", () => {
  it("defines every campaign night monotonically", () => {
    const values = Array.from({ length: 11 }, (_, night) => investmentReturnPercent(night));
    expect(values).toEqual([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200]);
    expect(values.every((value, index) => index === 0 || value >= values[index - 1]!)).toBe(true);
  });

  it("rounds positive returns to the nearest integer consistently", () => {
    expect(settleCoinInvestment(99, 1)).toEqual({
      investment: 99,
      returnedPrincipal: 20,
      profitOrLoss: -79,
      totalReturn: 20,
      finalCoinChange: -79,
      returnPercent: 20,
    });
    expect(settleCoinInvestment(99, 6).totalReturn).toBe(119);
    expect(settleCoinInvestment(1000, 10).investment).toBe(100);
  });

  it("caps Endless Mode through its explicit table", () => {
    expect(investmentReturnPercent(11)).toBe(205);
    expect(investmentReturnPercent(15)).toBe(225);
    expect(investmentReturnPercent(1000)).toBe(225);
  });
});
