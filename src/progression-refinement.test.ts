// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BALANCE, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { effectiveEquipmentStats, equipmentStatDefinitions, recyclingRate } from "./equipment";
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
    expect(calculateDifficultyXp(1.375)).toBe(75);
    expect(calculateDifficultyXp(BALANCE.adaptive.effective.maximumMultiplier)).toBe(
      META_BALANCE.rewards.campaignVictoryBonus / 2,
    );
    const breakdown = calculateXpRewards({
      directPlayerKills: { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
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
      directPlayerKills: { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
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
  it("derives every shop stat tier from gameplay balance", () => {
    const helmet = equipmentStatDefinitions("helmet")[0]!;
    expect(helmet.unequipped).toBe(0);
    expect(helmet.tiers).toEqual(META_BALANCE.equipment.helmetMitigation);
    const wrench = equipmentStatDefinitions("wrench")[0]!;
    expect(wrench.tiers).toEqual(META_BALANCE.equipment.wrenchFreeRepairChance);
    const mallet = equipmentStatDefinitions("mallet")[0]!;
    expect(mallet.unequipped).toBe(META_BALANCE.equipment.recyclingRate.unequipped);
    expect(mallet.tiers.diamond).toBe(META_BALANCE.equipment.recyclingRate.diamond);
    const sword = equipmentStatDefinitions("sword");
    expect(sword.map((stat) => stat.id)).toEqual([
      "damage", "attack-interval", "sweep-range", "sweep-arc", "target-limit", "knockback",
    ]);
    expect(effectiveEquipmentStats("sword", "wood", true, 0.2).damage).toBe(
      BALANCE.player.punchDamage * 1.3,
    );
  });

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
  it("announces affordable valid purchases on both main-menu actions", () => {
    const { game, manager } = gameWithProfile();
    manager.profile.spendableXp = 1000;
    manager.profile.coins = 100;
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    game.returnToMenu();
    ui.render(true);
    expect(document.querySelectorAll(".purchase-badge")).toHaveLength(2);
    expect(document.querySelector('[data-action="upgrades"]')?.getAttribute("aria-label"))
      .toContain("Upgrade available");
    expect(document.querySelector('[data-action="shop"]')?.getAttribute("aria-label"))
      .toContain("Purchase available");

    for (const id of Object.keys(manager.profile.permanentUpgrades) as Array<keyof typeof manager.profile.permanentUpgrades>) {
      manager.profile.permanentUpgrades[id] = META_BALANCE.permanentUpgrade.maximumLevel;
    }
    for (const item of Object.values(manager.profile.equipment)) item.tier = "diamond";
    ui.render(true);
    expect(document.querySelectorAll(".purchase-badge")).toHaveLength(0);
  });

  it("shows shared exact configured and effective stats for every equipment type", () => {
    const { game, manager } = gameWithProfile();
    manager.profile.equipment.sword = { tier: "wood", equipped: true };
    manager.profile.permanentUpgrades.punchDamage = 2;
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    const ui = new Ui(game, document.querySelector("#hud")!, overlay, document.querySelector("#toast")!);
    game.returnToMenu();
    ui.render(true);
    overlay.querySelector<HTMLElement>('[data-action="shop"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(overlay.querySelectorAll(".equipment-effect")).toHaveLength(EQUIPMENT_ORDER.length);
    const text = overlay.querySelector(".shop-modal")?.textContent ?? "";
    expect(text).toContain("Damage reduction");
    expect(text).toContain("Free-repair chance");
    expect(text).toContain("Recycling return");
    expect(text).toContain("Attack interval");
    expect(text).toContain("Sweep range");
    expect(text).toContain("CURRENT · EQUIPPED");
    expect(text).toContain("NEXT");
    expect(text).toContain("Current damage includes the owned +20% permanent melee bonus.");
  });

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

  it("treats run investment as a keyboard-contained dismissible dialog", () => {
    const { game } = gameWithProfile();
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      overlay,
      document.querySelector("#toast")!,
    );
    game.returnToMenu();
    ui.render(true);

    const start = overlay.querySelector<HTMLElement>('[data-action="start"]')!;
    start.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector<HTMLElement>('[data-action="cancel-investment"]')!;
    const confirm = dialog.querySelector<HTMLElement>('[data-action="confirm-investment"]')!;

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("investment-title");
    expect(document.activeElement).toBe(close);

    confirm.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(close);

    close.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(confirm);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(overlay.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(overlay.querySelector('[data-action="start"]'));
  });

  it("updates the native whole-coin investment range continuously and accessibly", () => {
    const { game, manager } = gameWithProfile();
    manager.profile.coins = 80;
    const overlay = document.querySelector<HTMLElement>("#overlay")!;
    const ui = new Ui(game, document.querySelector("#hud")!, overlay, document.querySelector("#toast")!);
    game.returnToMenu();
    ui.render(true);
    overlay.querySelector<HTMLElement>('[data-action="start"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const range = overlay.querySelector<HTMLInputElement>("[data-investment]")!;
    expect(range.type).toBe("range");
    expect(range.getAttribute("aria-label")).toBe("Run investment in whole coins");
    expect(range.max).toBe("80");
    range.value = "47";
    range.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(range.getAttribute("aria-valuenow")).toBe("47");
    expect(overlay.querySelector(".investment-control output")?.textContent).toContain("47¢");
    expect(overlay.querySelector('[data-action="confirm-investment"]')?.textContent).toContain("47¢");
  });

  it("omits obsolete structure and resource XP rows from reward summaries", () => {
    const { game } = gameWithProfile();
    game.phase = "victory";
    game.lastSettlement = {
      id: "valid-reward-categories",
      xp: { personalKills: 12, nights: 700, victory: 300, difficulty: 150, total: 1162 },
      coins: settleCoinInvestment(0, 10),
      previousLifetimeXp: 0,
      newLifetimeXp: 1162,
      previousSpendableXp: 0,
      newSpendableXp: 1162,
      previousCoins: 0,
      newCoins: 0,
      previousLevel: 1,
      newLevel: 3,
    };
    const ui = new Ui(game, document.querySelector("#hud")!, document.querySelector("#overlay")!, document.querySelector("#toast")!);
    const markup = (ui as unknown as { resultMarkup(): string }).resultMarkup();
    expect(markup).toContain("Nights Survived");
    expect(markup).toContain("Personal Kills");
    expect(markup).toContain("Difficulty Bonus");
    expect(markup).toContain("Victory Bonus");
    expect(markup).not.toContain("Surviving structures");
    expect(markup).not.toContain("Remaining resources");
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
          personalKills: 0,
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
