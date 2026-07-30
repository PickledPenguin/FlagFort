import { describe, expect, it } from "vitest";
import {
  calculateNightXp,
  calculatePersonalKillXp,
  calculateResourceXp,
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

  it("uses a logarithmic remaining-resource reward with diminishing returns", () => {
    const empty = { wood: 0, stone: 0, gold: 0, diamond: 0 };
    const firstHundred = calculateResourceXp({ ...empty, wood: 100 });
    const secondHundredGain = calculateResourceXp({ ...empty, wood: 200 }) - firstHundred;
    expect(calculateResourceXp(empty)).toBe(0);
    expect(firstHundred).toBeGreaterThan(0);
    expect(secondHundredGain).toBeLessThan(firstHundred);
    expect(calculateResourceXp({ ...empty, diamond: 10 }))
      .toBeGreaterThan(calculateResourceXp({ ...empty, wood: 10 }));
  });

  it("increases night value and makes Night 10 worth three times Night 1", () => {
    const nightOne = calculateNightXp(1);
    const nightNine = calculateNightXp(9);
    const nightTenIncrement = calculateNightXp(10) - nightNine;
    expect(nightTenIncrement).toBe(nightOne * 3);
    expect(calculateNightXp(10)).toBeGreaterThan(calculateNightXp(9));
  });

  it("adds the campaign bonus only for victory", () => {
    const input = {
      survivingStructurePoints: 50,
      directPlayerKills: { basic: 5, runner: 1, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      remainingResources: { wood: 10, stone: 2, gold: 0, diamond: 0 },
      nightsSurvived: 5,
      victory: false,
    };
    const defeat = calculateXpRewards(input);
    const victory = calculateXpRewards({ ...input, victory: true });
    expect(defeat.total).toBe(defeat.structures + defeat.personalKills + defeat.resources + defeat.nights);
    expect(victory.victory).toBeGreaterThan(0);
    expect(victory.total).toBe(defeat.total + victory.victory);
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
