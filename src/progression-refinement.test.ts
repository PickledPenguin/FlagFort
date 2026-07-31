// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BALANCE, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { recyclingRate } from "./equipment";
import { Game, LOCAL_PLAYER_ID } from "./game";
import { Input } from "./input";
import {
  EQUIPMENT_ORDER,
  EQUIPMENT_TIER_ORDER,
  META_BALANCE,
} from "./meta-balance";
import { ProfileManager, migrateProfile } from "./profile";
import {
  calculateDifficultyXp,
  calculateResourceXp,
  calculateStructureXp,
  calculateXpRewards,
  settleCoinInvestment,
} from "./rewards";
import {
  adaptiveDifficulty,
  dismantleRefund,
  expectedStructurePoints,
  structurePointValue,
} from "./rules";
import type { Structure, StructureKind, Tier } from "./types";
import { Ui } from "./ui";

class TestStore {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function structure(kind: StructureKind, tier: Tier, id = 1): Structure {
  return {
    id,
    ownerId: LOCAL_PLAYER_ID,
    investedResources: { wood: 10, stone: 0, gold: 0, diamond: 0 },
    kind,
    tier,
    x: 1800,
    y: 1800,
    radius: BALANCE.structure.radius[kind],
    health: 100,
    maxHealth: 100,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
  };
}

function gameWithProfile(): { game: Game; manager: ProfileManager } {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
  const manager = new ProfileManager(new TestStore());
  const game = new Game(new Input(document.querySelector("canvas")!), manager);
  game.startRun("normal", "progression-refinement", [], true, { settle: false });
  return { game, manager };
}

describe("canonical structure value", () => {
  it("defines every structure and material with monotonic, value-based ordering", () => {
    const expectedValues = {
      wall: { wood: 10, stone: 20, gold: 34, diamond: 51 },
      door: { wood: 10, stone: 20, gold: 35, diamond: 52 },
      spikes: { wood: 13, stone: 26, gold: 45, diamond: 68 },
      harvester: { wood: 26, stone: 51, gold: 84, diamond: 123 },
      turret: { wood: 36, stone: 79, gold: 149, diamond: 262 },
    } satisfies Record<StructureKind, Record<Tier, number>>;
    for (const kind of STRUCTURE_ORDER) {
      const values = TIER_ORDER.map((tier) => structurePointValue(kind, tier));
      expect(values.every((value, index) => index === 0 || value > values[index - 1]!)).toBe(true);
      for (const tier of TIER_ORDER) {
        expect(structurePointValue(kind, tier)).toBe(expectedValues[kind][tier]);
      }
    }
    expect(structurePointValue("wall", "wood")).toBe(10);
    expect(structurePointValue("door", "wood")).toBe(10);
    expect(structurePointValue("spikes", "wood")).toBeGreaterThan(structurePointValue("wall", "wood"));
    expect(structurePointValue("turret", "wood")).toBeGreaterThan(structurePointValue("harvester", "wood"));
    expect(structurePointValue("turret", "diamond")).toBe(262);
    expect(structurePointValue("turret", "diamond"))
      .toBeGreaterThan(structurePointValue("turret", "wood") * 7);
  });

  it("replaces tier value and excludes destroyed, recycled, and remote structures", () => {
    const { game } = gameWithProfile();
    const wall = structure("wall", "wood");
    game.structures = [wall];
    const recalculate = (game as unknown as { recalculateStructureScore(): void })
      .recalculateStructureScore.bind(game);
    recalculate();
    expect(game.structureScore).toBe(10);
    wall.tier = "diamond";
    recalculate();
    expect(game.structureScore).toBe(51);
    wall.health = 0;
    recalculate();
    expect(game.structureScore).toBe(0);
    wall.health = 100;
    wall.ownerId = "future-player";
    recalculate();
    expect(game.structureScore).toBe(0);
    wall.ownerId = LOCAL_PLAYER_ID;
    game.toolPreview = {
      x: wall.x,
      y: wall.y,
      action: "recycle",
      valid: true,
      affordable: true,
      target: wall,
      cost: { wood: 0, stone: 0, gold: 0, diamond: 0 },
      refund: { wood: 2, stone: 0, gold: 0, diamond: 0 },
      restoreAmount: 0,
      reason: "",
    };
    (game as unknown as { recycle(): void }).recycle();
    expect(game.structures).toHaveLength(0);
    expect(game.structureScore).toBe(0);
  });

  it("keeps raw-resource XP below equivalent useful surviving structures", () => {
    expect(calculateResourceXp({ wood: 10, stone: 0, gold: 0, diamond: 0 }))
      .toBeLessThan(calculateStructureXp(structurePointValue("wall", "wood")));
    expect(calculateResourceXp({ wood: 32, stone: 0, gold: 0, diamond: 0 }))
      .toBeLessThan(calculateStructureXp(structurePointValue("turret", "wood")));
  });
});

describe("additive adaptive difficulty and rewards", () => {
  it("adds structure, level, and other deltas without multiplying them", () => {
    const structureOnly = adaptiveDifficulty(expectedStructurePoints(5) * 2, 5, 1);
    const combined = adaptiveDifficulty(expectedStructurePoints(5) * 2, 5, 11, [0.05]);
    expect(combined.multiplier).toBeCloseTo(
      combined.baseMultiplier
      + combined.structureDelta
      + combined.levelDelta
      + combined.otherDelta,
    );
    expect(combined.multiplier).not.toBeCloseTo(structureOnly.multiplier * combined.levelMultiplier);
    expect(combined.levelDelta).toBeCloseTo(0.15);
  });

  it("clamps structure, level, and final effective values independently", () => {
    const low = adaptiveDifficulty(0, 1, 1, [-10]);
    const high = adaptiveDifficulty(1_000_000, 1, 999, [10]);
    expect(low.structureMultiplier).toBe(BALANCE.adaptive.structure.minimumMultiplier);
    expect(low.multiplier).toBe(BALANCE.adaptive.effective.minimumMultiplier);
    expect(high.structureMultiplier).toBe(BALANCE.adaptive.structure.maximumMultiplier);
    expect(high.levelMultiplier).toBe(BALANCE.adaptive.level.maximumMultiplier);
    expect(high.multiplier).toBe(BALANCE.adaptive.effective.maximumMultiplier);
  });

  it("awards difficulty XP at reduced, base, intermediate, and maximum boundaries", () => {
    expect(calculateDifficultyXp(0.5)).toBe(0);
    expect(calculateDifficultyXp(1)).toBe(0);
    expect(calculateDifficultyXp(1.375)).toBe(125);
    expect(calculateDifficultyXp(BALANCE.adaptive.effective.maximumMultiplier)).toBe(
      META_BALANCE.rewards.campaignVictoryBonus / 2,
    );
    const breakdown = calculateXpRewards({
      survivingStructurePoints: 0,
      directPlayerKills: { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      remainingResources: { wood: 0, stone: 0, gold: 0, diamond: 0 },
      nightsSurvived: 0,
      victory: false,
      effectiveDifficultyMultiplier: 1.375,
    });
    expect(breakdown.total).toBe(breakdown.difficulty);
  });
});

describe("profile migration and settlement safety", () => {
  it("merges legacy Wall Health into Structure Health without stacking", () => {
    const migrated = migrateProfile({
      permanentUpgrades: { wallHealth: 4, structureHealth: 2 },
    });
    expect(migrated.permanentUpgrades.structureHealth).toBe(4);
    expect(Object.hasOwn(migrated.permanentUpgrades, "wallHealth")).toBe(false);
  });

  it("increments total nights once for a settled run and rejects duplicates", () => {
    const store = new TestStore();
    const manager = new ProfileManager(store);
    manager.profile.coins = 10;
    expect(manager.beginRunSettlement("night-total", 0)).toBe(true);
    const xp = calculateXpRewards({
      survivingStructurePoints: 0,
      directPlayerKills: { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      remainingResources: { wood: 0, stone: 0, gold: 0, diamond: 0 },
      nightsSurvived: 12,
      victory: false,
    });
    const coins = settleCoinInvestment(0, 12);
    expect(manager.settleRun("night-total", xp, coins, {
      nightsSurvived: 12,
      victory: false,
      structureScore: 0,
    })).not.toBeNull();
    expect(manager.profile.progress.totalNightsSurvived).toBe(12);
    expect(manager.settleRun("night-total", xp, coins, {
      nightsSurvived: 12,
      victory: false,
      structureScore: 0,
    })).toBeNull();
    expect(manager.profile.progress.totalNightsSurvived).toBe(12);
  });
});

describe("campaign and Endless transition", () => {
  it("settles the campaign, then continues the surviving fort into independently counted Endless nights", () => {
    const { game } = gameWithProfile();
    game.phase = "victory";
    game.night = 10;
    game.stats.nightsSurvived = 10;
    game.structures = [structure("turret", "diamond")];
    expect(game.continueIntoEndless()).toBe(true);
    expect(game.runMode).toBe("endless");
    expect(game.phase).toBe("dawn");
    expect(game.structures).toHaveLength(1);
    for (let screen = 0; screen < 3; screen += 1) game.chooseDawn(0);
    expect(game.phase).toBe("day");
    expect(game.night).toBe(11);

    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("night");
    game.enemies = [];
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("dawn");
    expect(game.stats.nightsSurvived).toBe(1);

    game.phase = "night";
    game.night = 15;
    (game as unknown as { completeBossNight(): void }).completeBossNight();
    expect(game.phase).toBe("dawn");
    expect(game.stats.nightsSurvived).toBe(5);
  });
});

describe("Mallet recycling and editable assets", () => {
  it("uses every configured mallet rate with floor rounding and never over-refunds", () => {
    const invested = { wood: 11, stone: 7, gold: 5, diamond: 3 };
    expect(recyclingRate(null)).toBe(0.25);
    expect(recyclingRate("wood")).toBe(0.35);
    expect(recyclingRate("stone")).toBe(0.45);
    expect(recyclingRate("gold")).toBe(0.6);
    expect(recyclingRate("diamond")).toBe(0.75);
    for (const tier of EQUIPMENT_TIER_ORDER) {
      const rate = recyclingRate(tier);
      const refund = dismantleRefund(invested, rate);
      for (const resource of ["wood", "stone", "gold", "diamond"] as const) {
        expect(refund[resource]).toBe(Math.floor(invested[resource] * rate));
        expect(refund[resource]).toBeLessThanOrEqual(invested[resource]);
      }
    }
    expect(dismantleRefund(invested, 5)).toEqual(invested);
  });

  it("provides an independent editable SVG for every equipment tier", () => {
    expect(EQUIPMENT_ORDER).toContain("mallet");
    for (const kind of EQUIPMENT_ORDER) {
      for (const tier of EQUIPMENT_TIER_ORDER) {
        const asset = META_BALANCE.assets.equipment[kind][tier];
        const source = readFileSync(asset.replace("./", "public/"), "utf8");
        expect(source).toContain("viewBox=");
        expect(source).toContain(`id="${kind}-${tier}"`);
        expect(source).not.toContain("<image");
      }
    }
  });

  it("keeps every eye option selectable and backed by editable SVG", () => {
    expect(META_BALANCE.customization.eyeStyles).toHaveLength(5);
    for (const eye of META_BALANCE.customization.eyeStyles) {
      const source = readFileSync(
        META_BALANCE.assets.player.eyes[eye].replace("./", "public/"),
        "utf8",
      );
      expect(source).toContain("<svg");
      expect(source).toContain(`eyes-${eye}`);
    }
  });
});

describe("currency and reward presentation", () => {
  it("renders visible cent symbols with descriptive accessible labels", () => {
    const { game } = gameWithProfile();
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    game.returnToMenu();
    ui.render(true);
    const profileBalance = document.querySelector(".profile-chip .coin-amount");
    expect(profileBalance?.textContent).toContain("¢");
    expect(profileBalance?.getAttribute("aria-label")).toContain("Coins");
    expect(document.querySelector(".meta-actions")).not.toBeNull();
    expect(document.querySelector('[data-action="controls"] img')?.getAttribute("src"))
      .toContain("gamepad-2.svg");
    expect(document.querySelector('[data-action="challenges"] img')?.getAttribute("src"))
      .toContain("trophy.svg");
    expect(document.querySelector('[data-action="settings"] img')?.getAttribute("src"))
      .toContain("sliders-horizontal.svg");
  });

  it("distinguishes loss, break-even, and profit without color alone", () => {
    expect(settleCoinInvestment(100, 0).profitOrLoss).toBeLessThan(0);
    expect(settleCoinInvestment(100, 5).profitOrLoss).toBe(0);
    expect(settleCoinInvestment(100, 10).profitOrLoss).toBeGreaterThan(0);
    for (const [nights, label] of [[0, "LOSS"], [5, "BREAK EVEN"], [10, "PROFIT"]] as const) {
      const { game } = gameWithProfile();
      const ui = new Ui(
        game,
        document.querySelector("#hud")!,
        document.querySelector("#overlay")!,
        document.querySelector("#toast")!,
      );
      const coins = settleCoinInvestment(100, nights);
      game.phase = nights === 0 ? "defeat" : "victory";
      game.lastSettlement = {
        id: `outcome-${nights}`,
        xp: {
          structures: 0,
          personalKills: 0,
          resources: 0,
          nights: 0,
          victory: 0,
          difficulty: 0,
          total: 0,
        },
        coins,
        previousLifetimeXp: 0,
        newLifetimeXp: 0,
        previousSpendableXp: 0,
        newSpendableXp: 0,
        previousCoins: 0,
        newCoins: coins.totalReturn,
        previousLevel: 1,
        newLevel: 1,
      };
      const markup = (ui as unknown as { resultMarkup(): string }).resultMarkup();
      expect(markup).toContain(label);
      expect(markup).toContain('aria-label="Investment outcome"');
      expect(markup).toContain("coin-amount");
    }
  });
});
