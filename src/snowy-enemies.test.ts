// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { applySlow, isSlowed, updateStatuses } from "./status-effects";
import { projectileVisualColor } from "./projectile-visuals";
import type { DamageSource, Enemy, PlayerId, Structure, StructureKind } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "snowy-enemy-tests", [], true, {
    settle: false,
    campaignTierId: "snowy",
  });
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

function structure(id: number, kind: StructureKind, x: number, y: number): Structure {
  return {
    id,
    kind,
    tier: "wood",
    x,
    y,
    radius: BALANCE.structure.radius[kind],
    health: 200,
    maxHealth: 200,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
  };
}

function damageEnemy(
  game: Game,
  enemy: Enemy,
  amount: number,
  source: DamageSource,
  owner: PlayerId | null = game.player.id,
): void {
  (game as unknown as {
    damageEnemy(target: Enemy, damage: number, color: string, damageSource: DamageSource, ownerId: PlayerId | null): void;
  }).damageEnemy(enemy, amount, "#fff", source, owner);
}

describe("shared snowy slow status", () => {
  it("refreshes one slow timer without stacking and expires cleanly", () => {
    const target: { statuses?: Structure["statuses"] } = {};
    applySlow(target, 2);
    updateStatuses(target, 0.75);
    applySlow(target, 2);
    expect(target.statuses?.slow?.remaining).toBe(2);
    updateStatuses(target, 1.99);
    expect(isSlowed(target)).toBe(true);
    updateStatuses(target, 0.02);
    expect(target.statuses).toBeUndefined();
  });

  it("slows player movement and active player and turret cooldown clocks", () => {
    const game = gameFixture();
    const internals = game as unknown as {
      updatePlayer(dt: number): void;
      updateStructures(dt: number): void;
    };
    applySlow(game.player, 3);
    game.input.keys.add("KeyD");
    const xBefore = game.player.x;
    internals.updatePlayer(0.1);
    expect(game.player.x - xBefore).toBeCloseTo(
      BALANCE.player.speed * BALANCE.snowyEnemies.slow.movementMultiplier * 0.1,
    );

    const turret = structure(700, "turret", game.player.x + 300, game.player.y);
    turret.cooldown = 1;
    applySlow(turret, 3);
    game.structures = [turret];
    game.phase = "day";
    internals.updateStructures(1);
    expect(turret.cooldown).toBeCloseTo(1 - BALANCE.snowyEnemies.slow.attackSpeedMultiplier);

    game.player.cooldown = 1;
    game.player.toolCooldown = 1;
    game.input.keys.clear();
    game.update(1);
    expect(game.player.cooldown).toBeCloseTo(1 - BALANCE.snowyEnemies.slow.attackSpeedMultiplier);
    expect(game.player.toolCooldown).toBeCloseTo(1 - BALANCE.snowyEnemies.slow.attackSpeedMultiplier);
  });

  it("applies Frostbiter's registry-defined melee slow only to eligible targets", () => {
    const game = gameFixture();
    const effect = ENEMY_REGISTRY.frostbite.attack.statusEffect!;
    const frostbiter = spawn(game, "frostbite", game.player.x - 50, game.player.y);
    frostbiter.attackWindup = 0.99;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyAttack(frostbiter, game.player, 0.1);
    expect(game.player.statuses?.slow?.remaining).toBe(effect.duration);
    expect(game.particles.some((particle) => particle.text === "Slowed"
      && particle.color === effect.popupTextColor)).toBe(true);

    const wall = structure(710, "wall", frostbiter.x, frostbiter.y);
    frostbiter.cooldown = 0;
    frostbiter.attackWindup = 0.99;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyAttack(frostbiter, wall, 0.1);
    expect(wall.statuses).toBeUndefined();

    const turret = structure(711, "turret", frostbiter.x, frostbiter.y);
    frostbiter.cooldown = 0;
    frostbiter.attackWindup = 0.99;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyAttack(frostbiter, turret, 0.1);
    expect(turret.statuses?.slow?.remaining).toBe(effect.duration);
  });

  it("builds Snowballer range and projectile effects entirely from its registry definition", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.snowballer;
    const snowballer = spawn(
      game,
      "snowballer",
      game.player.x - definition.targeting.attackRange,
      game.player.y,
    );
    expect((game as unknown as { enemyAttackRange(enemy: Enemy): number })
      .enemyAttackRange(snowballer)).toBe(definition.targeting.attackRange);

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyRangedAttack(snowballer, game.player, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "snowballer",
      appearance: definition.projectile!.appearance,
      statusEffect: definition.projectile!.statusEffect,
      impactBurst: definition.projectile!.impactBurst,
    });
  });

  it("lets a Snowballer shot pass resources and walls, then slows its player target", () => {
    const game = gameFixture();
    const startX = game.player.x - 160;
    const node = game.world.resources[0]!;
    node.x = startX + 45;
    node.y = game.player.y;
    const wall = structure(720, "wall", startX + 90, game.player.y);
    game.structures = [wall];
    game.projectiles = [{
      id: 9001,
      owner: "enemy-arrow",
      sourceEnemyKind: "snowballer",
      appearance: "snowball",
      statusEffect: ENEMY_REGISTRY.snowballer.projectile!.statusEffect,
      impactBurst: ENEMY_REGISTRY.snowballer.projectile!.impactBurst,
      intendedTargetId: "player",
      x: startX,
      y: game.player.y,
      previousX: startX,
      previousY: game.player.y,
      vx: 1000,
      vy: 0,
      radius: 7,
      damage: 9,
      rangeLeft: 620,
      lifetime: 1,
      hitIds: new Set(),
      color: "#dff8ff",
    }];
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.2);
    expect(game.player.health).toBe(game.player.maxHealth - 9);
    expect(wall.health).toBe(wall.maxHealth);
    expect(node.health).toBe(node.maxHealth);
    expect(game.player.statuses?.slow?.remaining)
      .toBe(ENEMY_REGISTRY.snowballer.projectile!.statusEffect!.duration);
    expect(game.player.statuses!.slow!.remaining)
      .toBeLessThan(ENEMY_REGISTRY.frostbite.attack.statusEffect!.duration);
    expect(game.projectiles).toHaveLength(0);
    expect(game.particles.filter((particle) => particle.color === BALANCE.snowyEnemies.slow.tint).length)
      .toBeGreaterThan(8);
  });
});

describe("Icebound armor", () => {
  it("spawns with configured armor and routes melee damage to armor before health", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    expect(icebound.iceArmor).toBe(BALANCE.snowyEnemies.icebound.armorHealth);
    expect(icebound.maxIceArmor).toBe(BALANCE.snowyEnemies.icebound.armorHealth);
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, 20, "player-melee");
    expect(icebound.iceArmor).toBe(BALANCE.snowyEnemies.icebound.armorHealth - 20);
    expect(icebound.health).toBe(healthBefore);
  });

  it("reduces projectile damage only while armor remains", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    damageEnemy(game, icebound, 20, "turret");
    expect(icebound.iceArmor).toBe(
      BALANCE.snowyEnemies.icebound.armorHealth
        - 20 * (1 - BALANCE.snowyEnemies.icebound.projectileResistance),
    );
    icebound.iceArmor = 0;
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, 20, "player-bow");
    expect(icebound.health).toBe(healthBefore - 20);
  });

  it("breaks once, removes armor, spills excess damage into health, and never regenerates", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    const armor = icebound.iceArmor!;
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, armor + 25, "player-melee");
    expect(icebound.iceArmor).toBe(0);
    expect(icebound.health).toBe(healthBefore - 25);
    expect(game.particles.filter((particle) => particle.text === "Break")).toHaveLength(1);
    damageEnemy(game, icebound, 5, "player-melee");
    expect(icebound.iceArmor).toBe(0);
    expect(game.particles.filter((particle) => particle.text === "Break")).toHaveLength(1);
  });
});

describe("Frost Warden", () => {
  it("shows armor as its first durability layer, then triggers Frost Slam exactly once", () => {
    const game = gameFixture();
    const warden = spawn(game, "frost-warden", game.player.x + 120, game.player.y);
    const firstBoss = spawn(game, "boss", game.player.x + 600, game.player.y);
    const turret = structure(730, "turret", warden.x + 80, warden.y);
    const wall = structure(731, "wall", warden.x + 80, warden.y + 40);
    game.structures = [turret, wall];

    expect(warden.health).toBeLessThan(firstBoss.health);
    expect(warden.maxIceArmor! + warden.maxHealth).toBeGreaterThan(firstBoss.maxHealth);
    const healthBefore = warden.health;
    damageEnemy(game, warden, warden.iceArmor!, "player-melee");

    expect(warden.iceArmor).toBe(0);
    expect(warden.health).toBe(healthBefore);
    expect(game.player.statuses?.slow?.remaining).toBe(BALANCE.snowyEnemies.frostWarden.slam.slowDuration);
    expect(turret.statuses?.slow?.remaining).toBe(BALANCE.snowyEnemies.frostWarden.slam.slowDuration);
    expect(wall.statuses).toBeUndefined();
    expect(game.areaEffects.filter((effect) => effect.kind === "frost-slam")).toHaveLength(1);
    expect(game.shake).toBe(BALANCE.snowyEnemies.frostWarden.armorBreakShake);

    damageEnemy(game, warden, 5, "player-melee");
    expect(game.areaEffects.filter((effect) => effect.kind === "frost-slam")).toHaveLength(1);
  });

  it("generates the same safe, organic icicle warnings from the same run seed", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstWarden = spawn(first, "frost-warden", first.player.x + 400, first.player.y);
    const secondWarden = spawn(second, "frost-warden", second.player.x + 400, second.player.y);
    const firstInternals = first as unknown as { createIcicleAttack(enemy: Enemy): void };
    const secondInternals = second as unknown as { createIcicleAttack(enemy: Enemy): void };

    firstInternals.createIcicleAttack(firstWarden);
    secondInternals.createIcicleAttack(secondWarden);

    expect(first.icicleStrikes.map(({ x, y, angle }) => ({ x, y, angle })))
      .toEqual(second.icicleStrikes.map(({ x, y, angle }) => ({ x, y, angle })));
    expect(first.icicleStrikes).toHaveLength(BALANCE.snowyEnemies.frostWarden.icicle.count + 1);
    const targeted = first.icicleStrikes.find((strike) =>
      strike.x === first.player.x && strike.y === first.player.y);
    expect(targeted).toBeDefined();
    expect(targeted?.warningRemaining).toBe(
      BALANCE.snowyEnemies.frostWarden.icicle.warningDuration,
    );
    for (const strike of first.icicleStrikes.filter((candidate) => candidate !== targeted)) {
      expect(Math.hypot(strike.x - first.player.x, strike.y - first.player.y))
        .toBeGreaterThanOrEqual(BALANCE.snowyEnemies.frostWarden.icicle.placementMinimumRadius);
      expect(Math.abs(strike.angle)).toBeLessThanOrEqual(0.22);
    }
  });

  it("uses the frosty blue popup color for slows and armor breaks", () => {
    const game = gameFixture();
    (game as unknown as { applySlowStatus(target: typeof game.player, duration: number): void })
      .applySlowStatus(game.player, 1);
    expect(game.particles.find((particle) => particle.text === "Slowed")?.color)
      .toBe(BALANCE.snowyEnemies.slow.popupTextColor);
  });

  it("damages and slows caught defenders when an icicle erupts", () => {
    const game = gameFixture();
    const config = BALANCE.snowyEnemies.frostWarden.icicle;
    const turret = structure(740, "turret", game.player.x + 20, game.player.y);
    const wall = structure(741, "wall", game.player.x - 20, game.player.y);
    game.structures = [turret, wall];
    game.icicleStrikes = [{
      id: 9002,
      x: game.player.x,
      y: game.player.y,
      radius: config.radius,
      angle: 0.1,
      warningRemaining: 0.01,
      warningDuration: config.warningDuration,
      eruptionRemaining: config.eruptionDuration,
      eruptionDuration: config.eruptionDuration,
    }];

    (game as unknown as { updateIcicleStrikes(dt: number): void }).updateIcicleStrikes(0.02);

    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.player.statuses?.slow?.remaining).toBe(config.slowDuration);
    expect(turret.health).toBeLessThan(turret.maxHealth);
    expect(turret.statuses?.slow?.remaining).toBe(config.slowDuration);
    expect(wall.health).toBeLessThan(wall.maxHealth);
    expect(wall.statuses).toBeUndefined();
    expect(game.particles.some((particle) => particle.shape === "shard")).toBe(true);
  });

  it("never uses the first boss acid or charged ground slam attacks", () => {
    const game = gameFixture();
    const warden = spawn(game, "frost-warden", game.player.x + 200, game.player.y);
    warden.acidCooldown = 0;
    warden.summonCooldown = 0;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(warden, 2);
    expect(game.projectiles.some((projectile) => projectile.owner === "boss-acid")).toBe(false);
    expect(warden.acidWindup).toBe(0);
    expect(warden.bossSmashWindup).toBe(0);
  });
});

describe("snow projectile visuals", () => {
  const projectile = { owner: "player" as const, color: "#f6e2a8" };

  it("uses the biome's configured override for friendly projectiles only", () => {
    expect(projectileVisualColor(projectile, "snowy")).toBe("#704321");
    expect(projectileVisualColor({ owner: "turret", color: "#42c9d4" }, "snowy"))
      .toBe("#704321");
    expect(projectileVisualColor(projectile, "forest")).toBe(projectile.color);
    expect(projectileVisualColor({ owner: "enemy-arrow", color: "#111" }, "snowy"))
      .toBe("#111");
  });
});
