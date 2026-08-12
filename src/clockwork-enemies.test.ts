// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, isBossEnemyKind, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Structure } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "clockwork-enemy-tests", [], true, { settle: false });
  return game;
}

function spawn(game: Game, kind: Enemy["kind"], x: number, y: number): Enemy {
  (game as unknown as {
    spawnEnemy(point: { x: number; y: number }, enemyKind: Enemy["kind"]): void;
  }).spawnEnemy({ x, y }, kind);
  const enemy = game.enemies.at(-1)!;
  enemy.x = x;
  enemy.y = y;
  return enemy;
}

function turret(id: number, x: number, y: number): Structure {
  return {
    id, kind: "turret", tier: "wood", x, y,
    radius: BALANCE.structure.radius.turret, health: 500, maxHealth: 500,
    cooldown: 0, angle: 0, lastArmAngle: 0, harvesterHitResourceIds: new Set(), flash: 0,
  };
}

describe("clockwork enemies", () => {
  it("registers Springjack as a complete but staged spring-powered skirmisher", () => {
    const definition = ENEMY_REGISTRY.springjack;

    expect(definition.assets.portrait).toBe("enemies/springjack-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 86, height: 77 });
    expect(definition.tier).toBe(3);
    expect(definition.introductionNight).toBe(3);
    expect(definition.leap).toMatchObject({
      range: 280,
      cooldown: 2.2,
      duration: 0.7,
      arcHeight: 58,
      particleColor: "#e2b85d",
      launchPopupText: "SPRING LOADED",
      landingPopupText: "CLANG",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland", "rift", "mire"] as const) {
      expect(Object.values(selectEnemyRoster("staged-springjack", tier)))
        .not.toContain("springjack");
    }
  });

  it("vaults a defensive wall without damaging it and lands beyond the line", () => {
    const game = gameFixture();
    game.world.resources = [];
    const startX = game.flag.x - 420;
    const springjack = spawn(game, "springjack", startX, game.flag.y);
    const wall: Structure = {
      id: 2100,
      kind: "wall",
      tier: "wood",
      x: startX + 70,
      y: game.flag.y,
      radius: BALANCE.structure.radius.wall,
      health: 600,
      maxHealth: 600,
      cooldown: 0,
      angle: 0,
      lastArmAngle: 0,
      harvesterHitResourceIds: new Set(),
      flash: 0,
    };
    game.structures = [wall];

    const vaulted = (game as unknown as {
      tryEnemyLeap(enemy: Enemy, blocker: Structure, target: typeof game.flag): boolean;
    }).tryEnemyLeap(springjack, wall, game.flag);

    expect(vaulted).toBe(true);
    expect(springjack.jumpEndX).toBeGreaterThan(wall.x + wall.radius + springjack.radius);
    expect(game.particles.some((particle) =>
      particle.text === "SPRING LOADED" && particle.color === "#e2b85d")).toBe(true);

    (game as unknown as { updateEnemyAirborne(enemy: Enemy, dt: number): void })
      .updateEnemyAirborne(springjack, ENEMY_REGISTRY.springjack.leap!.duration);

    expect(springjack.jumpTime).toBe(0);
    expect(springjack.x).toBeCloseTo(springjack.jumpEndX);
    expect(game.particles.some((particle) => particle.text === "CLANG")).toBe(true);
    expect(wall.health).toBe(wall.maxHealth);
  });

  it("registers Aether Gunner as a complete but staged turret suppressor", () => {
    const definition = ENEMY_REGISTRY["aether-gunner"];

    expect(definition.assets.portrait).toBe("enemies/aether-gunner-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 86, height: 77 });
    expect(definition.targeting).toMatchObject({ mode: "archer", attackRange: 490, innerRadius: 220 });
    expect(definition.projectile).toMatchObject({
      appearance: "aether",
      damageSource: "aether-gunner",
      speed: 820,
      pierces: false,
      targets: ["turret", "player", "flag"],
      statusEffect: {
        kind: "slow",
        duration: 2.6,
        targets: ["turret"],
        popupTextColor: "#d9fffb",
        particleColor: "#79e7df",
        popupText: "Aether Locked",
      },
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland", "rift", "mire"] as const) {
      expect(Object.values(selectEnemyRoster("staged-aether-gunner", tier)))
        .not.toContain("aether-gunner");
    }
  });

  it("prioritizes a turret and stalls it with a high-velocity aether bolt", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["aether-gunner"];
    const gunner = spawn(game, "aether-gunner", game.flag.x - 390, game.flag.y);
    const target = turret(2200, game.flag.x - 130, game.flag.y);
    game.player.x = game.flag.x + 30;
    game.player.y = game.flag.y;
    game.structures = [target];

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void }).selectEnemyTarget(gunner);
    expect(gunner.targetId).toBe(target.id);

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyRangedAttack(gunner, target, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "aether-gunner",
      damageSource: "aether-gunner",
      intendedTargetId: target.id,
      appearance: "aether",
      pierces: false,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.5);

    expect(target.health).toBe(target.maxHealth - gunner.structureDamage);
    expect(target.statuses?.slow?.remaining).toBe(2.6);
    expect(game.projectiles).toHaveLength(0);
    expect(game.particles.some((particle) => particle.color === "#79e7df")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Aether Locked" && particle.color === "#d9fffb"))
      .toBe(true);
  });

  it("registers Gearwright as a complete but staged reinforcement engineer", () => {
    const definition = ENEMY_REGISTRY.gearwright;

    expect(definition.assets.portrait).toBe("enemies/gearwright-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 92, height: 83 });
    expect(definition.tier).toBe(7);
    expect(definition.introductionNight).toBe(7);
    expect(definition.summon).toMatchObject({
      cooldown: 6.4,
      cappedRetryCooldown: 2,
      maximumLiving: 3,
      kinds: ["springjack"],
      particleColor: "#e2b85d",
      popupText: "ASSEMBLY LINE",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland", "rift", "mire"] as const) {
      expect(Object.values(selectEnemyRoster("staged-gearwright", tier)))
        .not.toContain("gearwright");
    }
  });

  it("assembles a capped Springjack squad outside scheduled wave accounting", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.gearwright;
    const gearwright = spawn(game, "gearwright", game.flag.x + 320, game.flag.y);
    gearwright.summonCooldown = 0;

    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(gearwright, BALANCE.fixedStep);

    const assembled = game.enemies.find((enemy) => enemy.summonedBy === gearwright.id);
    expect(assembled).toMatchObject({ kind: "springjack", countsTowardWave: false });
    expect(gearwright.summonCooldown).toBe(definition.summon!.cooldown);
    expect(game.particles.some((particle) => particle.color === "#e2b85d")).toBe(true);
    expect(game.particles.some((particle) => particle.text === "ASSEMBLY LINE")).toBe(true);

    game.enemies = [
      gearwright,
      ...Array.from({ length: definition.summon!.maximumLiving }, (_, index) => ({
        ...assembled!,
        id: 2300 + index,
        summonedBy: gearwright.id,
        health: 1,
      })),
    ];
    gearwright.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(gearwright, BALANCE.fixedStep);

    expect(game.enemies).toHaveLength(definition.summon!.maximumLiving + 1);
    expect(gearwright.summonCooldown).toBe(definition.summon!.cappedRetryCooldown);
  });

  it("registers the Chronoforge Colossus as a complete staged boss", () => {
    const definition = ENEMY_REGISTRY["chronoforge-colossus"];

    expect(isBossEnemyKind("chronoforge-colossus")).toBe(true);
    expect(definition.rosterEligible).toBe(false);
    expect(definition.assets.portrait).toBe("enemies/chronoforge-colossus");
    expect(definition.armor).toMatchObject({
      scalesWithHealth: true,
      brokenSprite: "enemies/chronoforge-colossus-broken",
      breakStatusPulse: {
        statusEffect: { kind: "slow", duration: 5.2, targets: ["player", "turret"] },
      },
    });
    expect(definition.areaStrike).toMatchObject({
      rngSeedKey: "chronoforge-colossus:gearfall",
      damageSource: "chronoforge-colossus",
      randomStrikeCount: 7,
      statusEffect: { kind: "slow", duration: 3.8, targets: ["player", "turret"] },
    });
    expect(definition.summon).toMatchObject({
      kinds: ["gearwright"],
      maximumLiving: 2,
      popupText: "FOUNDRY ONLINE",
    });
  });

  it("creates deterministic time-locking gearfalls around the defender", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstBoss = spawn(first, "chronoforge-colossus", first.player.x + 520, first.player.y);
    const secondBoss = spawn(second, "chronoforge-colossus", second.player.x + 520, second.player.y);
    const config = ENEMY_REGISTRY["chronoforge-colossus"].areaStrike!;

    (first as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(firstBoss);
    (second as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(secondBoss);

    expect(first.areaStrikes).toEqual(second.areaStrikes);
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    expect(first.areaStrikes.every((strike) =>
      strike.sourceEnemyKind === "chronoforge-colossus")).toBe(true);
    expect(first.areaStrikes.some((strike) =>
      strike.x === first.player.x && strike.y === first.player.y)).toBe(true);
  });

  it("breaks its shell, time-locks defenders, and opens a capped foundry", () => {
    const game = gameFixture();
    const boss = spawn(game, "chronoforge-colossus", game.flag.x + 780, game.flag.y);
    const definition = ENEMY_REGISTRY["chronoforge-colossus"];
    const nearbyTurret = turret(2400, boss.x + 55, boss.y);
    game.structures = [nearbyTurret];
    game.player.x = boss.x - 55;
    game.player.y = boss.y;

    (game as unknown as {
      damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: "player-melee", ownerPlayerId: string): void;
    }).damageEnemy(boss, boss.armor!, "#ffffff", "player-melee", game.player.id);

    expect(boss.health).toBe(boss.maxHealth);
    expect(boss.armor).toBe(0);
    expect(game.player.statuses?.slow?.remaining).toBe(5.2);
    expect(nearbyTurret.statuses?.slow?.remaining).toBe(5.2);
    expect(game.particles.some((particle) => particle.text === "TIMELOCK SURGE"))
      .toBe(true);

    boss.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(boss, BALANCE.fixedStep);
    expect(game.enemies.find((enemy) => enemy.summonedBy === boss.id))
      .toMatchObject({ kind: "gearwright", countsTowardWave: false });
    expect(boss.summonCooldown).toBe(definition.summon!.cooldown);
  });
});
