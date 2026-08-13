// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { generateChoiceOfferings } from "./choices";
import { ENEMY_REGISTRY, introducedRosterEnemies, mutationWeightKey, selectEnemyRoster } from "./enemy-registry";
import { Game, LOCAL_PLAYER_ID } from "./game";
import { Input } from "./input";
import { META_BALANCE } from "./meta-balance";
import type { KeyValueStore } from "./platform";
import { ProfileManager, migrateProfile } from "./profile";
import { calculateXpRewards } from "./rewards";
import { createMutations, createUnlocks, createUpgrades } from "./rules";
import type { Enemy, Structure } from "./types";
import { Ui } from "./ui";

class TestStore implements KeyValueStore {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function createGame(): Game {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "playtest-fixes", [], true, { settle: false });
  game.phase = "night";
  return game;
}

function harvester(id: number, x: number, y: number): Structure {
  return {
    id, ownerId: LOCAL_PLAYER_ID, kind: "harvester", tier: "wood", x, y,
    radius: BALANCE.structure.radius.harvester, health: 100, maxHealth: 100,
    cooldown: 0, angle: 0, lastArmAngle: 0, harvesterHitResourceIds: new Set(), flash: 0,
  };
}

function spawn(game: Game, kind: Enemy["kind"], x: number, y: number): Enemy {
  (game as unknown as { spawnEnemy(point: { x: number; y: number }, kind: Enemy["kind"]): void })
    .spawnEnemy({ x, y }, kind);
  const enemy = game.enemies.at(-1)!;
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

describe("Gremlin target recovery", () => {
  it("clears destroyed and recycled harvester routes immediately", () => {
    const game = createGame();
    const target = harvester(40, game.flag.x + 260, game.flag.y);
    game.structures = [target];
    const gremlin = spawn(game, "gremlin", target.x - 100, target.y);
    gremlin.targetId = target.id;
    gremlin.path = [{ x: target.x, y: target.y }];
    target.health = 0;
    (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(BALANCE.fixedStep);
    expect(gremlin.targetId).toBe("flag");
    expect(gremlin.path).not.toContainEqual({ x: target.x, y: target.y });

    const replacement = harvester(41, gremlin.x + 100, gremlin.y);
    game.structures = [replacement];
    gremlin.targetId = replacement.id;
    gremlin.path = [{ x: replacement.x, y: replacement.y }];
    game.structures = [];
    (game as unknown as { invalidateStructureTargets(id: number): void })
      .invalidateStructureTargets(replacement.id);
    expect(gremlin.targetId).toBe("flag");
    expect(gremlin.path).toEqual([]);
  });

  it("resolves exact overlap gradually and attacks an adjacent harvester without reversing", () => {
    const game = createGame();
    const target = harvester(50, game.flag.x + 300, game.flag.y);
    game.structures = [target];
    const gremlin = spawn(game, "gremlin", target.x, target.y);
    gremlin.targetId = target.id;
    (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(BALANCE.fixedStep);
    const firstDistance = Math.hypot(gremlin.x - target.x, gremlin.y - target.y);
    expect(firstDistance).toBeGreaterThan(0);
    expect(firstDistance).toBeLessThanOrEqual(BALANCE.navigation.overlapResolveSpeed * BALANCE.fixedStep * 2 + 0.01);

    gremlin.x = target.x - gremlin.radius - target.radius;
    gremlin.y = target.y;
    gremlin.targetId = target.id;
    const beforeX = gremlin.x;
    for (let index = 0; index < 40; index += 1) {
      (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(BALANCE.fixedStep);
    }
    expect(gremlin.x).toBeLessThanOrEqual(beforeX + 0.01);
    expect(target.health).toBeLessThan(target.maxHealth);
  });

  it("abandons an out-of-range harvester and preserves blocker attacks", () => {
    const game = createGame();
    const distant = harvester(60, game.flag.x + 900, game.flag.y);
    game.structures = [distant];
    const gremlin = spawn(game, "gremlin", game.flag.x, game.flag.y + 300);
    gremlin.targetId = distant.id;
    (game as unknown as { selectEnemyTarget(enemy: Enemy): void }).selectEnemyTarget(gremlin);
    expect(gremlin.targetId).toBe("flag");

    const blocker = { ...harvester(61, gremlin.x, gremlin.y - 61), kind: "wall" as const };
    game.structures = [blocker];
    gremlin.targetId = "flag";
    for (let index = 0; index < 100; index += 1) {
      (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(BALANCE.fixedStep);
    }
    expect(blocker.health).toBeLessThan(blocker.maxHealth);
  });

  it("attacks a blocker on its fallback route when no structure-safe path exists", () => {
    const game = createGame();
    const target = harvester(62, game.flag.x + 320, game.flag.y + 180);
    const blocker = {
      ...harvester(63, game.flag.x, game.flag.y + 110),
      kind: "wall" as const,
      radius: BALANCE.structure.radius.wall,
    };
    game.structures = [target, blocker];
    const gremlin = spawn(
      game,
      "gremlin",
      blocker.x,
      blocker.y + blocker.radius + ENEMY_REGISTRY.gremlin.base.radius + 2,
    );
    gremlin.targetId = target.id;
    gremlin.scanCooldown = 10;
    gremlin.pathCooldown = 10;
    gremlin.routeCommitment = 10;
    gremlin.routeIncludesStructures = false;
    gremlin.path = [{ x: blocker.x, y: blocker.y - 140 }];
    gremlin.pathIndex = 0;
    const healthBefore = blocker.health;

    for (let index = 0; index < 90; index += 1) {
      (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(BALANCE.fixedStep);
    }

    expect(blocker.health).toBeLessThan(healthBefore);
    expect(gremlin.targetId).toBe(target.id);
  });

  it("forces a completely stuck zombie to destroy the adjacent blocking structure", () => {
    const game = createGame();
    const target = harvester(64, game.flag.x + 420, game.flag.y);
    const blocker = {
      ...harvester(65, game.flag.x + 160, game.flag.y),
      kind: "spikes" as const,
      radius: BALANCE.structure.radius.spikes,
    };
    game.structures = [target, blocker];
    const zombie = spawn(
      game,
      "gremlin",
      blocker.x - blocker.radius - ENEMY_REGISTRY.gremlin.base.radius - 1,
      blocker.y,
    );
    zombie.targetId = target.id;
    zombie.speed = 0;
    const move = game as unknown as {
      moveEnemyToward(enemy: Enemy, target: { x: number; y: number }, dt: number): void;
      updateEnemies(dt: number): void;
    };
    const frames = Math.ceil(BALANCE.navigation.fullyStuckAttackDelay / BALANCE.fixedStep) + 2;
    for (let index = 0; index < frames; index += 1) {
      move.moveEnemyToward(zombie, target, BALANCE.fixedStep);
    }
    expect(zombie.forcedBlockerId).toBe(blocker.id);
    expect(zombie.targetId).toBe(blocker.id);
    const healthBefore = blocker.health;
    for (let index = 0; index < 120; index += 1) move.updateEnemies(BALANCE.fixedStep);
    expect(blocker.health).toBeLessThan(healthBefore);
  });

  it("never treats a slowly moving zombie as completely stuck", () => {
    const game = createGame();
    const blocker = {
      ...harvester(66, game.flag.x + 160, game.flag.y + 80),
      kind: "spikes" as const,
      radius: BALANCE.structure.radius.spikes,
    };
    game.structures = [blocker];
    const zombie = spawn(game, "basic", blocker.x - 120, blocker.y);
    zombie.speed = 1;
    const target = { x: blocker.x + 500, y: blocker.y };
    const move = game as unknown as {
      moveEnemyToward(enemy: Enemy, target: { x: number; y: number }, dt: number): void;
    };
    const startX = zombie.x;
    const frames = Math.ceil((BALANCE.navigation.fullyStuckAttackDelay + 0.5) / BALANCE.fixedStep);
    for (let index = 0; index < frames; index += 1) {
      move.moveEnemyToward(zombie, target, BALANCE.fixedStep);
    }
    expect(zombie.x).toBeGreaterThan(startX);
    expect(zombie.forcedBlockerId).toBeFalsy();
  });
});

describe("melee windup movement", () => {
  it("keeps moving toward an in-range player while charging, then cancels after escape", () => {
    const game = createGame();
    game.player.x = game.flag.x + 700;
    game.player.y = game.flag.y;
    const zombie = spawn(game, "basic", game.player.x - 50, game.player.y);
    zombie.targetId = "player";
    zombie.scanCooldown = 10;
    const beforeX = zombie.x;
    (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(0.1);
    expect(zombie.attackWindup).toBeGreaterThan(0);
    expect(zombie.x).toBeGreaterThan(beforeX);

    const charged = zombie.attackWindup;
    game.player.x += 300;
    (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(0.1);
    expect(zombie.attackWindup).toBeLessThan(charged);
  });
});

describe("combat and roster playtest fixes", () => {
  it("skips the unlock slide after all unlocks and offers the capped-run decision", () => {
    const game = createGame();
    game.unlocks.gloves.push("stone", "gold", "diamond");
    for (const tiers of Object.values(game.unlocks.structures)) tiers.push("gold", "diamond");
    game.night = 8;
    (game as unknown as { beginDawn(): void }).beginDawn();
    expect(game.dawnScreen).toBe(1);
    expect(game.choices.every((choice) => choice.kind === "upgrade")).toBe(true);

    for (const key of Object.keys(BALANCE.upgradeCaps) as Array<keyof typeof game.upgrades>) {
      game.upgrades[key] = BALANCE.upgradeCaps[key];
    }
    (game as unknown as { beginDawn(): void }).beginDawn();
    expect(game.isUpgradeSelectionExhausted()).toBe(true);
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    ui.render(true);
    expect(document.querySelector("#overlay")!.textContent).toContain("Every available upgrade is maximized");
    expect(document.querySelector("#overlay")!.textContent).toContain("End run and collect rewards");
    expect(document.querySelector("#overlay")!.textContent).toContain("Continue without upgrades");
    game.continueWithoutUpgrade();
    expect(game.phase).toBe("day");
    expect(game.night).toBe(9);
  });

  it("lets a fully capped endless run end as a completed run without losing its night count", () => {
    const game = createGame();
    game.runMode = "endless";
    game.night = 32;
    game.unlocks.gloves.push("stone", "gold", "diamond");
    for (const tiers of Object.values(game.unlocks.structures)) tiers.push("gold", "diamond");
    for (const key of Object.keys(BALANCE.upgradeCaps) as Array<keyof typeof game.upgrades>) {
      game.upgrades[key] = BALANCE.upgradeCaps[key];
    }
    (game as unknown as { beginDawn(): void }).beginDawn();
    game.endRunAtUpgradeCap();
    expect(game.phase).toBe("victory");
    expect(game.stats.nightsSurvived).toBe(32);
  });

  it("spawns the entire exponential endless schedule by the 15-second cutoff", () => {
    const game = createGame();
    game.runMode = "endless";
    game.phase = "day";
    game.night = 47;
    (game as unknown as { beginNight(): void }).beginNight();
    expect(game.waveSchedule.length).toBeGreaterThan(BALANCE.waveSafety.maximumActiveEnemies);
    game.phaseElapsed = BALANCE.nightSpawnCutoff;
    (game as unknown as { updatePortals(dt: number): void }).updatePortals(BALANCE.fixedStep);
    expect(game.portals.every((portal) => portal.spawned === portal.assignedSpawns)).toBe(true);
    expect(game.enemies).toHaveLength(game.waveSchedule.length);
    const totalThreat = game.waveSchedule.reduce((sum, kind) => sum + ENEMY_REGISTRY[kind].threat, 0);
    const specialThreat = game.waveSchedule.reduce(
      (sum, kind) => sum + (kind === "basic" ? 0 : ENEMY_REGISTRY[kind].threat),
      0,
    );
    expect(specialThreat / totalThreat).toBeGreaterThanOrEqual(BALANCE.endless.minimumSpecialThreatShare - 0.01);
  });

  it("spends scarce resources on one player-positioned Fort Pulse per endless night", () => {
    const game = createGame();
    game.runMode = "endless";
    game.phase = "night";
    game.night = 18;
    game.resources = { wood: 0, stone: 0, gold: 48, diamond: 16 };
    const runner = spawn(game, "runner", game.player.x + 100, game.player.y);
    const basic = spawn(game, "basic", game.player.x + 100, game.player.y + 50);
    const runnerHealth = runner.health;
    const basicHealth = basic.health;
    game.useFortPulse();
    expect(runner.health).toBeLessThan(runnerHealth);
    expect(basic.health).toBe(basicHealth);
    expect(game.resources).toMatchObject({ gold: 24, diamond: 8 });
    game.useFortPulse();
    expect(game.resources).toMatchObject({ gold: 24, diamond: 8 });
  });

  it("preserves the manually tuned special-zombie render sizes", () => {
    expect(ENEMY_REGISTRY.gremlin.render).toMatchObject({ width: 60, height: 39 });
    expect(ENEMY_REGISTRY.splitter.render).toMatchObject({ width: 70, height: 50 });
    expect(ENEMY_REGISTRY.archer.render).toMatchObject({ width: 70, height: 70 });
    expect(ENEMY_REGISTRY.popper.render).toMatchObject({ width: 80, height: 60 });
    expect(ENEMY_REGISTRY.acidslinger.render).toMatchObject({ width: 98, height: 56 });
    expect(ENEMY_REGISTRY["splitter-child"].render)
      .toMatchObject({ width: 56, height: 46 });
    expect(ENEMY_REGISTRY.splitter.death.childSize).toBe(0.75);
    expect(ENEMY_REGISTRY.rammer.render).toMatchObject({ width: 88, height: 61.6 });
  });

  it("generates mutation targets only from the seeded introduced roster", () => {
    const seed = "roster-aware-cards";
    const roster = selectEnemyRoster(seed);
    const introduced = new Set(introducedRosterEnemies(roster, 7));
    for (let reroll = 0; reroll < 12; reroll += 1) {
      const choices = generateChoiceOfferings(
        seed, 7, 1, createUnlocks(), createUpgrades(), createMutations(),
        new Set(), reroll, new Set(), roster,
      );
      for (const choice of choices) {
        expect(choice.mutationTargetKinds?.length).toBeGreaterThan(0);
        expect(choice.mutationTargetKinds?.every((kind) => introduced.has(kind))).toBe(true);
        if (choice.mutationId.endsWith("Weight")) {
          expect(choice.mutationTargetKinds).toHaveLength(1);
          expect(mutationWeightKey(choice.mutationTargetKinds![0]!)).toBe(choice.mutationId);
          expect(choice.mutationDescription).toContain(ENEMY_REGISTRY[choice.mutationTargetKinds![0]!].displayName);
        }
      }
    }
  });

  it("spawns the complete Night 10 schedule in addition to the boss", () => {
    const game = createGame();
    game.phase = "day";
    game.night = 10;
    (game as unknown as { beginNight(): void }).beginNight();
    expect(game.waveSchedule.length).toBeGreaterThan(0);
    expect(game.enemies.filter((enemy) => enemy.kind === "boss")).toHaveLength(0);
    game.phaseElapsed = BALANCE.endless.bossSpawnDelay;
    game.update(BALANCE.fixedStep);
    expect(game.enemies.filter((enemy) => enemy.kind === "boss")).toHaveLength(1);
    expect(game.portals.reduce((sum, portal) => sum + portal.assignedSpawns, 0))
      .toBe(game.waveSchedule.length);
  });

  it("does not let flag healing revive a defeated player", () => {
    const game = createGame();
    game.player.x = game.flag.x;
    game.player.y = game.flag.y;
    game.player.health = 0;
    game.update(BALANCE.fixedStep);
    expect(game.phase).toBe("defeat");
  });

  it("applies one configured slam hit at the completed charge radius", () => {
    const game = createGame();
    const boss = spawn(game, "boss", game.flag.x + 180, game.flag.y);
    const wall = { ...harvester(70, boss.x + 100, boss.y), kind: "wall" as const, radius: 34, health: 500, maxHealth: 500 };
    game.structures = [wall];
    game.player.x = boss.x + 120;
    game.player.y = boss.y;
    const playerBefore = game.player.health;
    boss.summonCooldown = 0;
    const slam = ENEMY_REGISTRY.boss.phaseSlam!;
    boss.bossSmashWindup = slam.chargeDuration - 0.01;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(boss, 0.02);
    expect(wall.health).toBeCloseTo(500 - slam.structureDamage
      * boss.structureDamage / ENEMY_REGISTRY.boss.base.structureDamage);
    expect(game.player.health).toBeCloseTo(playerBefore - slam.playerDamage
      * boss.damage / ENEMY_REGISTRY.boss.base.damage);
    expect(boss.bossSlamWave).toBe(slam.waveDuration);
    const after = wall.health;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(boss, 0.1);
    expect(wall.health).toBe(after);
  });

  it("hits every zombie in the sword sector exactly once", () => {
    const game = createGame();
    game.player.angle = 0;
    const sword = META_BALANCE.equipment.sword.diamond;
    game.enemies = [];
    const targets = Array.from({ length: 9 }, (_, index) => {
      const angle = -sword.arc + sword.arc * 2 * index / 8;
      return spawn(game, "basic", game.player.x + Math.cos(angle) * 80, game.player.y + Math.sin(angle) * 80);
    });
    (game as unknown as { rebuildSpatial(): void }).rebuildSpatial();
    const before = targets.map((target) => target.health);
    (game as unknown as { resolveMeleeImpact(value: (typeof META_BALANCE.equipment.sword)["diamond"]): void })
      .resolveMeleeImpact(sword);
    for (let index = 0; index < targets.length; index += 1) {
      expect(targets[index]!.health).toBeLessThan(before[index]!);
    }
  });
});

describe("progression safety and presentation", () => {
  beforeEach(() => {
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
  });

  it("preserves upgrade and shop scroll while replaying the card purchase feedback", () => {
    const manager = new ProfileManager(new TestStore());
    manager.profile.lifetimeXp = 20_000;
    manager.profile.spendableXp = 20_000;
    manager.profile.coins = 1_000;
    const game = new Game(new Input(document.querySelector("canvas")!), manager);
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    game.returnToMenu();
    ui.render(true);

    document.querySelector<HTMLElement>('[data-action="upgrades"]')!.click();
    const upgradeModal = document.querySelector<HTMLElement>(".progression-modal")!;
    upgradeModal.scrollTop = 333;
    document.querySelector<HTMLElement>('[data-action="buy-upgrade"][data-upgrade="bowDamage"]')!.click();
    expect(document.querySelector<HTMLElement>(".progression-modal")!.scrollTop).toBe(333);
    expect(document.querySelector('[data-upgrade="bowDamage"].upgrade-feedback')).not.toBeNull();
    expect(document.querySelectorAll('[data-upgrade="bowDamage"].upgrade-feedback .choice-spark'))
      .toHaveLength(12);

    document.querySelector<HTMLElement>('[data-action="close-panel"]')!.click();
    document.querySelector<HTMLElement>('[data-action="shop"]')!.click();
    const shopModal = document.querySelector<HTMLElement>(".shop-modal")!;
    shopModal.scrollTop = 245;
    document.querySelector<HTMLElement>('[data-action="buy-equipment"][data-equipment="helmet"]')!.click();
    expect(document.querySelector<HTMLElement>(".shop-modal")!.scrollTop).toBe(245);
    expect(document.querySelector('[data-equipment-item="helmet"].upgrade-feedback')).not.toBeNull();
  });

  it("opens Campaign on the highest unlocked tier with level-positioned rewards", () => {
    const manager = new ProfileManager(new TestStore());
    manager.profile.playerLevel = 7;
    manager.profile.campaign.defeatedTierIds = ["forest"];
    const game = new Game(new Input(document.querySelector("canvas")!), manager);
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    game.returnToMenu();
    ui.render(true);
    document.querySelector<HTMLElement>('[data-action="open-campaign"]')!.click();
    const snowy = document.querySelector<HTMLElement>('[data-campaign-tier="snowy"]')!
      .closest(".campaign-tier-node");
    expect(snowy?.classList.contains("selected")).toBe(true);
    expect(snowy?.classList.contains("current")).toBe(true);
    expect(snowy?.querySelector(".campaign-track-marker")?.textContent).toContain("7");
    expect(document.querySelectorAll(".campaign-reward-node")).toHaveLength(16);
    expect(document.querySelector(".campaign-footer-requirements")?.textContent)
      .toContain("Reach Level 7");
  });

  it("keeps the coin floor for migration, settlement, and shop purchases", () => {
    expect(migrateProfile({ coins: 0 }).coins).toBe(META_BALANCE.coinSafetyMinimum);
    const manager = new ProfileManager(new TestStore());
    manager.profile.coins = 100;
    expect(manager.buyEquipment("helmet")).toBe(false);
    manager.profile.coins = 110;
    expect(manager.buyEquipment("helmet")).toBe(true);
    expect(manager.profile.coins).toBe(META_BALANCE.coinSafetyMinimum);
    expect(manager.beginRunSettlement("floor-run", 10)).toBe(true);
    expect(manager.profile.coins).toBe(0);
    const xp = calculateXpRewards({ directPlayerKills: {}, nightsSurvived: 0, victory: false });
    const settled = manager.settleRun("floor-run", xp, {
      investment: 10, returnedPrincipal: 0, profitOrLoss: -10, totalReturn: 0,
      finalCoinChange: -10, returnPercent: 0,
    }, { nightsSurvived: 0, victory: false, structureScore: 0 });
    expect(settled?.newCoins).toBe(META_BALANCE.coinSafetyMinimum);
    expect(manager.settleRun("floor-run", xp, settled!.coins, { nightsSurvived: 0, victory: false, structureScore: 0 })).toBeNull();
  });

  it("claims all seven rewards, repeats Day 7, and resets after a missed day", () => {
    const manager = new ProfileManager(new TestStore());
    const amounts: number[] = [];
    for (let day = 1; day <= 8; day += 1) {
      const result = manager.claimDailyReward(new Date(`2026-08-${String(day).padStart(2, "0")}T12:00:00Z`));
      amounts.push(result.amount);
      expect(manager.claimDailyReward(new Date(`2026-08-${String(day).padStart(2, "0")}T23:00:00Z`)).granted).toBe(false);
    }
    expect(amounts).toEqual([10, 15, 20, 25, 30, 35, 40, 40]);
    expect(manager.getDailyRewardStatus(new Date("2026-08-10T12:00:00Z"))).toMatchObject({ available: true, day: 1, amount: 10, reset: true });
  });

  it("allows dismissal and reopening without consuming the daily reward", () => {
    const manager = new ProfileManager(new TestStore());
    const game = new Game(new Input(document.querySelector("canvas")!), manager);
    const ui = new Ui(game, document.querySelector("#hud")!, document.querySelector("#overlay")!, document.querySelector("#toast")!, manager.getDailyRewardStatus());
    game.returnToMenu();
    ui.render(true);
    document.querySelector<HTMLElement>('[data-action="dismiss-daily"]')!.click();
    expect(manager.getDailyRewardStatus().available).toBe(true);
    document.querySelector<HTMLElement>('[data-action="open-daily"]')!.click();
    expect(document.querySelector('[data-action="claim-daily"]')).not.toBeNull();
    document.querySelector<HTMLElement>('[data-action="claim-daily"]')!.click();
    expect(manager.getDailyRewardStatus().available).toBe(false);
  });

  it("migrates Impossible records and applies difficulty XP once after the subtotal", () => {
    const migrated = migrateProfile({ recentRuns: [{ seed: "old", date: "2026-01-01", difficulty: "impossible", challengeIds: [], victory: true, nightsSurvived: 10 }] });
    expect(migrated.recentRuns[0]?.difficulty).toBe("extreme");
    const normal = calculateXpRewards({ directPlayerKills: { basic: 2 }, nightsSurvived: 10, victory: true, selectedDifficulty: "normal" });
    const extreme = calculateXpRewards({ directPlayerKills: { basic: 2 }, nightsSurvived: 10, victory: true, selectedDifficulty: "extreme" });
    expect(extreme.subtotal).toBe(normal.total);
    expect(extreme.total).toBe(Math.round(normal.total * BALANCE.difficulty.extreme.xpMultiplier));
    expect(extreme.difficultyAdjustment).toBe(extreme.total - normal.total);
  });

  it("removes Night Forecast while rendering the adaptive pressure state", () => {
    const manager = new ProfileManager(new TestStore());
    const game = new Game(new Input(document.querySelector("canvas")!), manager);
    game.startRun("normal", "pressure-indicator", [], true, { settle: false });
    const ui = new Ui(game, document.querySelector("#hud")!, document.querySelector("#overlay")!, document.querySelector("#toast")!);
    ui.render(true);
    expect(document.body.textContent).not.toContain("Night Forecast");
    expect(document.querySelector("[data-adaptive-pressure]")).not.toBeNull();
    (game as unknown as { structureScore: number }).structureScore = 100_000;
    ui.render(true);
    expect(document.querySelector("[data-adaptive-pressure]")?.classList.contains("above")).toBe(true);
  });
});
