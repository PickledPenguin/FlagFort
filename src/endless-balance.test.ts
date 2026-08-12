import { describe, expect, it } from "vitest";
import { availableUpgradeKeys } from "./choices";
import { BALANCE } from "./config";
import {
  activeRosterEnemies,
  endlessRosterAdditions,
  endlessRosterMilestones,
  endlessRosterOrder,
  selectEnemyRoster,
} from "./enemy-registry";
import {
  adaptiveDifficulty,
  applyUpgrade,
  createUpgrades,
  endlessWaveThreatBudget,
} from "./rules";

describe("endless balance package", () => {
  it("caps every run upgrade and removes every capped card from the pool", () => {
    const upgrades = createUpgrades();
    for (const key of Object.keys(BALANCE.upgradeCaps) as Array<keyof typeof upgrades>) {
      for (let index = 0; index < 100; index += 1) applyUpgrade(upgrades, key);
      expect(upgrades[key]).toBe(BALANCE.upgradeCaps[key]);
    }
    expect(availableUpgradeKeys(upgrades)).toEqual([]);
  });

  it("adds one deterministic unused enemy every five endless nights regardless of tier", () => {
    const seed = "endless-roster-regression";
    const roster = selectEnemyRoster(seed);
    const order = endlessRosterOrder(seed, roster);
    expect(endlessRosterOrder(seed, roster)).toEqual(order);
    expect(endlessRosterAdditions(seed, roster, 14)).toEqual([]);
    expect(endlessRosterAdditions(seed, roster, 15)).toEqual(order.slice(0, 1));
    expect(endlessRosterAdditions(seed, roster, 20)).toEqual(order.slice(0, 2));
    expect(endlessRosterMilestones(seed, roster).slice(0, 2).map((item) => item.night))
      .toEqual([15, 20]);
    expect(activeRosterEnemies(seed, roster, 20, true)).toEqual(expect.arrayContaining(order.slice(0, 2)));
  });

  it("grows endless threat and enemy stats with explicit exponential factors", () => {
    const at15 = endlessWaveThreatBudget(15);
    const at25 = endlessWaveThreatBudget(25);
    const at35 = endlessWaveThreatBudget(35);
    expect(at25 / at15).toBeCloseTo(Math.pow(BALANCE.endless.waveGrowthPerNight, 10), 1);
    expect(at35 - at25).toBeGreaterThan(at25 - at15);
    expect(Math.pow(BALANCE.endless.healthGrowthPerNight, 30)).toBeGreaterThan(3);
    expect(Math.pow(BALANCE.endless.bossHealthGrowthPerCycle, 6)).toBeGreaterThan(10);
  });

  it("raises adaptive pressure for turret DPS, coverage, and player upgrade progress", () => {
    const upgrades = createUpgrades();
    const baseline = adaptiveDifficulty(1000, 25, 1, [], {
      turretDps: 0,
      turretCoverageRatio: 0,
      upgrades,
    });
    const capped = createUpgrades();
    for (const key of Object.keys(BALANCE.upgradeCaps) as Array<keyof typeof capped>) {
      capped[key] = BALANCE.upgradeCaps[key];
    }
    const powered = adaptiveDifficulty(1000, 25, 1, [], {
      turretDps: 4000,
      turretCoverageRatio: 1.1,
      upgrades: capped,
    });
    expect(powered.turretDps).toBe(4000);
    expect(powered.turretCoverageRatio).toBe(1.1);
    expect(powered.playerUpgradeFraction).toBe(1);
    expect(powered.powerDelta).toBeGreaterThan(baseline.powerDelta);
    expect(powered.multiplier).toBeGreaterThan(baseline.multiplier);
  });

  it("moderately includes configurable equipped-material strength", () => {
    const upgrades = createUpgrades();
    const wood = adaptiveDifficulty(300, 4, 1, [], {
      turretDps: 0, turretCoverageRatio: 0, upgrades, equipmentStrength: 0.08,
    });
    const diamond = adaptiveDifficulty(300, 4, 1, [], {
      turretDps: 0, turretCoverageRatio: 0, upgrades, equipmentStrength: 0.9,
    });
    expect(diamond.equipmentDelta).toBeGreaterThan(wood.equipmentDelta);
    expect(diamond.equipmentDelta).toBeLessThanOrEqual(
      BALANCE.adaptive.powerAwareness.equipment.maximumDelta,
    );
    expect(diamond.multiplier).toBeGreaterThan(wood.multiplier);
  });

  it("makes high-tier nodes both rarer and lower-yield than low-tier nodes", () => {
    expect(BALANCE.resource.counts.gold).toBeLessThan(BALANCE.resource.counts.stone / 2);
    expect(BALANCE.resource.counts.diamond).toBeLessThan(BALANCE.resource.counts.gold / 2);
    expect(BALANCE.resource.health.gold * BALANCE.harvest.gold.gold).toBeLessThan(40);
    expect(BALANCE.resource.health.diamond * BALANCE.harvest.diamond.diamond).toBeLessThan(40);
  });
});
