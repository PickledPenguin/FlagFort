// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { resolveActionCooldown } from "./modifiers";
import { performanceDifficultyDelta, type NightPerformanceSnapshot } from "./performance-difficulty";
import type { KeyValueStore } from "./platform";
import { crazyGamesCalendarDate, ProfileManager } from "./profile";
import type { Enemy, Structure, StructureKind } from "./types";
import { Ui } from "./ui";

class TestStore implements KeyValueStore {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function gameFixture(): Game {
  document.body.innerHTML = '<canvas></canvas><div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "improvement-regression", [], true, { settle: false });
  return game;
}

function structure(id: number, kind: StructureKind, x: number, y: number): Structure {
  return {
    id, kind, tier: "wood", x, y,
    radius: BALANCE.structure.radius[kind], health: 600, maxHealth: 600,
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

function snapshot(overrides: Partial<NightPerformanceSnapshot> = {}): NightPerformanceSnapshot {
  return {
    night: 1,
    totalIncomingDamage: 0,
    damagedStructureCount: 0,
    damagedStructureValue: 0,
    destroyedStructureCount: 0,
    destroyedStructureValue: 0,
    flagDamage: 0,
    flagMaximumHealth: 150,
    zombiesEnteringFlagRadius: 0,
    personalZombieKills: 12,
    playerDamageTaken: 0,
    playerMaximumHealth: 100,
    totalZombieKills: 20,
    totalZombiesSpawned: 20,
    survivingZombiesAtDawn: 0,
    ...overrides,
  };
}

describe("auto-corrective difficulty", () => {
  it("increases only after an easy preceding night and clamps its own additive delta", () => {
    const easy = performanceDifficultyDelta(snapshot());
    const pressured = performanceDifficultyDelta(snapshot({
      totalIncomingDamage: 300,
      destroyedStructureCount: 2,
      destroyedStructureValue: 220,
      flagDamage: 45,
      playerDamageTaken: 55,
      zombiesEnteringFlagRadius: 12,
    }));
    expect(easy.delta).toBeGreaterThan(0);
    expect(easy.delta).toBeLessThanOrEqual(BALANCE.adaptive.autoCorrective.maximumDelta);
    expect(pressured.delta).toBe(0);
    expect(performanceDifficultyDelta(null).delta).toBe(0);
  });

  it("can use the raised corrective ceiling after a completely dominant late night", () => {
    const dominant = performanceDifficultyDelta(snapshot({
      night: 4,
      personalZombieKills: 20,
    }));
    expect(dominant.easyPerformance).toBe(1);
    expect(dominant.pressurePenalty).toBe(0);
    expect(dominant.delta).toBe(BALANCE.adaptive.autoCorrective.maximumDelta);
    expect(dominant.delta).toBe(0.55);
  });

  it("adds the finalized prior-night delta to Night 2 but never to Night 1", () => {
    const game = gameFixture();
    game.autoCorrectiveDelta = 0.2;
    game.night = 1;
    (game as unknown as { beginNight(): void }).beginNight();
    expect(game.adaptiveState.otherDelta).toBe(0);
    game.phase = "day";
    game.night = 2;
    (game as unknown as { beginNight(): void }).beginNight();
    expect(game.adaptiveState.otherDelta).toBeCloseTo(0.2);
  });

  it("finalizes exact damage, structure-value, radius-entry, and kill metrics at dawn", () => {
    const game = gameFixture();
    const wall = structure(450, "wall", game.flag.x + 100, game.flag.y);
    wall.health = 20;
    wall.maxHealth = 20;
    game.structures = [wall];
    (game as unknown as { beginNight(): void }).beginNight();
    const zombie = spawn(game, "basic", game.flag.x + BALANCE.flagProtectedRadius - 1, game.flag.y);
    (game as unknown as { trackFlagRadiusEntries(): void }).trackFlagRadiusEntries();
    (game as unknown as { applyIncomingDamage(target: typeof game.player, damage: number): number })
      .applyIncomingDamage(game.player, 12);
    (game as unknown as { applyIncomingDamage(target: typeof game.flag, damage: number): number })
      .applyIncomingDamage(game.flag, 8);
    (game as unknown as { applyIncomingDamage(target: Structure, damage: number): number })
      .applyIncomingDamage(wall, 30);
    (game as unknown as { damageEnemy(enemy: Enemy, damage: number, color: string, source: "player-melee", owner: string): void })
      .damageEnemy(zombie, zombie.health, "#fff", "player-melee", game.player.id);
    (game as unknown as { beginDawn(): void }).beginDawn();
    expect(game.lastNightPerformance).toMatchObject({
      playerDamageTaken: 12,
      flagDamage: 8,
      damagedStructureCount: 1,
      destroyedStructureCount: 1,
      zombiesEnteringFlagRadius: 1,
      personalZombieKills: 1,
      totalZombieKills: 1,
    });
    expect(game.lastNightPerformance!.destroyedStructureValue).toBe(BALANCE.structureValues.wall.wood);
  });
});

describe("playtest telemetry attribution", () => {
  it("records cycle activity, population categories, damage attribution, and boss time", () => {
    const game = gameFixture();
    game.phase = "dawn";
    game.choices = [{
      id: "moveSpeed",
      name: "Fleet Feet",
      description: "Move faster",
      mutationId: "waveSize",
      mutationName: "Rising Dead",
      mutationDescription: "More enemies",
      kind: "upgrade",
    }];
    game.chooseDawn(0);
    game.phase = "day";
    game.selectedSlot = 4;
    game.input.mouseDown = true;
    const telemetry = game as unknown as {
      trackPlaytestTime(dt: number): void;
      recordStructureActivity(action: "built" | "upgraded" | "repaired" | "destroyed", kind: StructureKind, tier: "wood" | "stone" | "gold" | "diamond"): void;
      recordResources(action: "gathered" | "spent" | "refunded", wallet: { wood: number; stone: number; gold: number; diamond: number }): void;
      beginNight(): void;
      spawnEnemy(point: { x: number; y: number }, kind: Enemy["kind"], summonedBy?: number, child?: boolean, countsTowardWave?: boolean): void;
      damageEnemy(enemy: Enemy, amount: number, color: string, source: "player-melee" | "turret", ownerId: string | null): void;
      applyIncomingDamage(target: Structure, amount: number, kind: Enemy["kind"], source: "enemy-arrow"): number;
      finalizeNightPerformance(): void;
    };
    telemetry.trackPlaytestTime(2);
    telemetry.recordStructureActivity("built", "turret", "diamond");
    telemetry.recordStructureActivity("upgraded", "turret", "diamond");
    telemetry.recordStructureActivity("repaired", "wall", "stone");
    telemetry.recordResources("gathered", { wood: 12, stone: 3, gold: 0, diamond: 0 });
    telemetry.recordResources("spent", { wood: 10, stone: 0, gold: 0, diamond: 0 });

    const wall = structure(901, "wall", game.flag.x + 150, game.flag.y);
    wall.tier = "stone";
    wall.health = 10;
    wall.maxHealth = 100;
    game.structures = [wall];
    telemetry.beginNight();
    game.phaseElapsed = 7.25;
    telemetry.trackPlaytestTime(3);
    const point = { x: game.flag.x + 260, y: game.flag.y };
    telemetry.spawnEnemy(point, "basic");
    telemetry.spawnEnemy(point, "boss");
    telemetry.spawnEnemy(point, "runner", 500, false, false);
    telemetry.spawnEnemy(point, "splitter-child", 501, true);
    const [scheduled, boss, summon, child] = game.enemies.slice(-4);
    telemetry.damageEnemy(scheduled!, scheduled!.health, "#fff", "player-melee", game.player.id);
    telemetry.damageEnemy(boss!, boss!.health, "#fff", "turret", game.player.id);
    telemetry.damageEnemy(summon!, summon!.health, "#fff", "turret", game.player.id);
    telemetry.damageEnemy(child!, child!.health, "#fff", "turret", game.player.id);
    telemetry.applyIncomingDamage(wall, 20, "archer", "enemy-arrow");
    telemetry.finalizeNightPerformance();

    const analysis = game.devDifficultyLogs.at(-1)!.analysis;
    expect(analysis.activity.cardsChosen).toMatchObject([{ id: "moveSpeed", afterNight: 1 }]);
    expect(analysis.activity.structures.built).toEqual({ turret: { diamond: 1 } });
    expect(analysis.activity.structures.destroyed).toEqual({ wall: { stone: 1 } });
    expect(analysis.activity.resources.gathered).toEqual({ wood: 12, stone: 3, gold: 0, diamond: 0 });
    expect(analysis.activity.timeSeconds).toMatchObject({ building: 2, fighting: 3 });
    expect(analysis.population.spawned).toMatchObject({
      scheduled: { basic: 1 }, boss: { boss: 1 }, summons: { runner: 1 },
      children: { "splitter-child": 1 },
    });
    expect(analysis.population.killed).toEqual({
      scheduled: { basic: 1 }, boss: { boss: 1 }, summons: {},
      children: { "splitter-child": 1 },
    });
    expect(analysis.activity.outgoingDamageBySource).toMatchObject({
      "player-melee": scheduled!.maxHealth,
      turret: expect.any(Number),
    });
    expect(analysis.activity.incomingDamageBySource).toEqual({ "enemy-arrow": 10 });
    expect(analysis.activity.enemyDamageByKindAndTarget)
      .toEqual({ archer: { structures: { wall: 10 } } });
    expect(analysis.bossKillTimeSeconds).toBe(7.25);
    expect(analysis.structureInventory.start).toEqual({ wall: { stone: 1 } });
    expect(analysis.structureInventory.end).toEqual({});
  });
});

describe("true player-side area attacks", () => {
  it("boss slam damages the player, flag, and every damageable structure once", () => {
    const game = gameFixture();
    game.phase = "night";
    const boss = spawn(game, "boss", game.flag.x + 80, game.flag.y);
    game.player.x = boss.x + 80;
    game.player.y = boss.y;
    game.structures = (["wall", "door", "spikes", "harvester", "turret"] as StructureKind[])
      .map((kind, index) => structure(500 + index, kind, boss.x + 90 + index * 3, boss.y));
    const flagBefore = game.flag.health;
    boss.summonCooldown = 0;
    boss.bossSmashWindup = BALANCE.boss.slam.chargeDuration - 0.01;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(boss, 0.02);
    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.flag.health).toBeCloseTo(flagBefore - BALANCE.boss.slam.flagDamage
      * boss.damage / ENEMY_REGISTRY.boss.base.damage);
    expect(game.structures.every((item) => item.health < item.maxHealth)).toBe(true);
    expect(game.areaEffects.at(-1)).toMatchObject({ kind: "boss-slam", radius: BALANCE.boss.slam.radius });
  });

  it("Popper combat death bursts across all targets, while forced cleanup stays inert", () => {
    const game = gameFixture();
    game.phase = "night";
    const popper = spawn(game, "popper", game.flag.x, game.flag.y);
    game.player.x = popper.x + 40;
    game.player.y = popper.y;
    game.structures = (["wall", "door", "spikes", "harvester", "turret"] as StructureKind[])
      .map((kind, index) => structure(600 + index, kind, popper.x + 55 + index * 5, popper.y));
    const flagBefore = game.flag.health;
    popper.deathReason = "combat";
    (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(popper);
    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.flag.health).toBeLessThan(flagBefore);
    expect(game.structures.every((item) => item.health < item.maxHealth)).toBe(true);
    expect(game.areaEffects.at(-1)).toMatchObject({
      kind: "popper-acid",
      radius: ENEMY_REGISTRY.popper.death.burstOuterRadius,
    });

    const forced = spawn(game, "popper", popper.x, popper.y);
    forced.deathReason = "forced";
    forced.deathResolved = false;
    const effectCount = game.areaEffects.length;
    const healthBefore = game.player.health;
    (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(forced);
    expect(game.areaEffects).toHaveLength(effectCount);
    expect(game.player.health).toBe(healthBefore);
  });

  it("dispatches configured death effects without relying on Splitter or Popper identity", () => {
    const game = gameFixture();
    game.phase = "night";
    const splitterDeath = ENEMY_REGISTRY.splitter.death;
    const popperDeath = ENEMY_REGISTRY.popper.death;
    const previousBreakerDeath = ENEMY_REGISTRY.breaker.death;
    const previousRunnerDeath = ENEMY_REGISTRY.runner.death;
    ENEMY_REGISTRY.breaker.death = splitterDeath;
    ENEMY_REGISTRY.runner.death = popperDeath;

    try {
      const breaker = spawn(game, "breaker", game.flag.x + 300, game.flag.y);
      breaker.deathReason = "combat";
      (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(breaker);
      const children = game.enemies.filter((enemy) => enemy.summonedBy === breaker.id);
      expect(children).toHaveLength(splitterDeath.splitCount ?? 0);
      expect(children.every((enemy) => enemy.kind === splitterDeath.childKind)).toBe(true);
      expect(children[0]?.health).toBeCloseTo(breaker.maxHealth * (splitterDeath.childHealth ?? 0));

      const runner = spawn(game, "runner", game.player.x + 40, game.player.y);
      runner.deathReason = "combat";
      const healthBefore = game.player.health;
      (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(runner);
      expect(game.player.health).toBeLessThan(healthBefore);
      expect(game.areaEffects.at(-1)).toMatchObject({
        kind: "popper-acid",
        radius: popperDeath.burstOuterRadius,
      });
    } finally {
      ENEMY_REGISTRY.breaker.death = previousBreakerDeath;
      ENEMY_REGISTRY.runner.death = previousRunnerDeath;
    }
  });
});

describe("single-pass action speed and HUD placement", () => {
  it("treats 10 and 20 percent as current totals instead of compounding them", () => {
    const base = 1;
    expect(resolveActionCooldown(base, { temporary: 0.1 })).toBeCloseTo(base / 1.1);
    expect(resolveActionCooldown(base, { temporary: 0.2 })).toBeCloseTo(base / 1.2);
    expect(resolveActionCooldown(base, { permanent: 0.1, temporary: 0.2 })).toBeCloseTo(base / 1.3);
  });

  it("keeps seed then Adaptive Threat in the health HUD group", () => {
    const game = gameFixture();
    const ui = new Ui(game, document.querySelector("#hud")!, document.querySelector("#overlay")!, document.querySelector("#toast")!);
    ui.render(true);
    const group = document.querySelector(".player-hud-group")!;
    expect(group.children[0]?.classList.contains("player-status")).toBe(true);
    expect(group.children[1]?.classList.contains("seed-chip")).toBe(true);
    expect(group.children[2]?.classList.contains("adaptive-pressure")).toBe(true);
    expect(document.querySelector(".countdown-stack .adaptive-pressure")).toBeNull();
  });
});

describe("Daily reward presentation", () => {
  it("shows all seven exact rewards and never exposes time-zone wording", () => {
    document.body.innerHTML = '<canvas></canvas><div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
    const manager = new ProfileManager(new TestStore());
    manager.profile.lastDailyRewardDate = crazyGamesCalendarDate(new Date());
    manager.profile.dailyRewardStreak = 2;
    const game = new Game(new Input(document.querySelector("canvas")!), manager);
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
      manager.getDailyRewardStatus(),
    );
    game.returnToMenu();
    ui.render(true);
    expect(document.querySelectorAll(".daily-summary-sequence > i")).toHaveLength(7);
    expect(document.querySelectorAll(".daily-summary-sequence > .claimed")).toHaveLength(2);
    expect(document.querySelectorAll(".daily-summary-sequence > .current")).toHaveLength(1);
    expect(document.querySelectorAll(".daily-summary-sequence > .upcoming")).toHaveLength(5);
    expect(document.body.textContent).not.toMatch(/UTC|Eastern|time zone/i);
  });
});
