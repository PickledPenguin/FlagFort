// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { applySlow, isSlowed, updateStatuses } from "./status-effects";
import { projectileVisualColor } from "./projectile-visuals";
import type { DamageSource, Difficulty, Enemy, PlayerId, Structure, StructureKind } from "./types";

function gameFixture(difficulty: Difficulty = "normal"): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun(difficulty, "snowy-enemy-tests", [], true, {
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

  it("uses each ranged enemy's configured targets when a structure blocks its advance", () => {
    const game = gameFixture();
    const internals = game as unknown as { updateEnemies(dt: number): void };
    const archer = spawn(game, "archer", game.player.x - 600, game.player.y);
    const wall = structure(
      721,
      "wall",
      archer.x + archer.radius + BALANCE.structure.radius.wall + 8,
      archer.y,
    );
    game.structures = [wall];
    archer.targetId = "player";
    archer.scanCooldown = 10;
    archer.pathCooldown = 10;
    const startX = archer.x;

    internals.updateEnemies(ENEMY_REGISTRY.archer.attack.chargeSeconds);

    expect(ENEMY_REGISTRY.archer.projectile!.targets).not.toContain("wall");
    expect(game.projectiles).toHaveLength(0);
    expect(archer.x).toBeGreaterThan(startX);
  });
});

describe("Icebound armor", () => {
  it("spawns with configured armor and routes melee damage to armor before health", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    const armor = ENEMY_REGISTRY.icebound.armor!;
    expect(icebound.armor).toBe(armor.health);
    expect(icebound.maxArmor).toBe(armor.health);
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, 20, "player-melee");
    expect(icebound.armor).toBe(armor.health - 20);
    expect(icebound.health).toBe(healthBefore);
  });

  it("reduces projectile damage only while armor remains", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    const armor = ENEMY_REGISTRY.icebound.armor!;
    damageEnemy(game, icebound, 20, "turret");
    expect(icebound.armor).toBe(
      armor.health - 20 * (1 - armor.projectileResistance),
    );
    icebound.armor = 0;
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, 20, "player-bow");
    expect(icebound.health).toBe(healthBefore - 20);
  });

  it("breaks once, removes armor, spills excess damage into health, and never regenerates", () => {
    const game = gameFixture();
    const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
    const armor = icebound.armor!;
    const healthBefore = icebound.health;
    damageEnemy(game, icebound, armor + 25, "player-melee");
    expect(icebound.armor).toBe(0);
    expect(icebound.health).toBe(healthBefore - 25);
    expect(game.particles.filter((particle) => particle.text === "Break")).toHaveLength(1);
    damageEnemy(game, icebound, 5, "player-melee");
    expect(icebound.armor).toBe(0);
    expect(game.particles.filter((particle) => particle.text === "Break")).toHaveLength(1);
  });

  it("dispatches configured break particles and status pulses without an enemy-kind branch", () => {
    const originalArmor = ENEMY_REGISTRY.icebound.armor!;
    ENEMY_REGISTRY.icebound.armor = {
      ...originalArmor,
      breakShardColors: [{ value: "#123456", weight: 1 }],
      breakStatusPulse: {
        radius: 160,
        duration: 0.4,
        statusEffect: {
          kind: "slow",
          duration: 2.25,
          targets: ["player", "turret"],
          popupTextColor: "#abcdef",
        },
        areaEffect: "frost-slam",
        particleColor: "#234567",
        particleCount: 5,
        popupText: "TEST PULSE",
        popupTextColor: "#abcdef",
        popupTextOffsetY: -70,
      },
    };
    try {
      const game = gameFixture();
      const icebound = spawn(game, "icebound", game.player.x + 100, game.player.y);
      const turret = structure(732, "turret", icebound.x + 80, icebound.y);
      game.structures = [turret];

      damageEnemy(game, icebound, icebound.armor!, "player-melee");

      expect(game.player.statuses?.slow?.remaining).toBe(2.25);
      expect(turret.statuses?.slow?.remaining).toBe(2.25);
      expect(game.areaEffects.some((effect) => effect.kind === "frost-slam")).toBe(true);
      expect(game.particles.filter((particle) => particle.shape === "shard"))
        .toHaveLength(originalArmor.breakShardCount);
      expect(game.particles.filter((particle) => particle.shape === "shard")
        .every((particle) => particle.color === "#123456")).toBe(true);
      expect(game.particles.some((particle) => particle.text === "TEST PULSE")).toBe(true);
    } finally {
      ENEMY_REGISTRY.icebound.armor = originalArmor;
    }
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

    expect(warden.health).toBeGreaterThan(firstBoss.health);
    expect(warden.maxArmor! + warden.maxHealth).toBeGreaterThan(firstBoss.maxHealth);
    const healthBefore = warden.health;
    damageEnemy(game, warden, warden.armor!, "player-melee");

    expect(warden.armor).toBe(0);
    expect(warden.health).toBe(healthBefore);
    const pulse = ENEMY_REGISTRY["frost-warden"].armor!.breakStatusPulse!;
    expect(game.player.statuses?.slow?.remaining).toBe(pulse.statusEffect.duration);
    expect(turret.statuses?.slow?.remaining).toBe(pulse.statusEffect.duration);
    expect(wall.statuses).toBeUndefined();
    expect(game.areaEffects.filter((effect) => effect.kind === "frost-slam")).toHaveLength(1);
    expect(game.shake).toBe(
      ENEMY_REGISTRY["frost-warden"].armor!.breakShake * BALANCE.boss.strongShakeMultiplier,
    );

    damageEnemy(game, warden, 5, "player-melee");
    expect(game.areaEffects.filter((effect) => effect.kind === "frost-slam")).toHaveLength(1);
  });

  it("generates the same safe, organic icicle warnings from the same run seed", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstWarden = spawn(first, "frost-warden", first.player.x + 400, first.player.y);
    const secondWarden = spawn(second, "frost-warden", second.player.x + 400, second.player.y);
    const config = ENEMY_REGISTRY["frost-warden"].areaStrike!;
    const firstInternals = first as unknown as { createAreaStrikeAttack(enemy: Enemy): void };
    const secondInternals = second as unknown as { createAreaStrikeAttack(enemy: Enemy): void };

    firstInternals.createAreaStrikeAttack(firstWarden);
    secondInternals.createAreaStrikeAttack(secondWarden);

    expect(first.areaStrikes.map(({ x, y, angle }) => ({ x, y, angle })))
      .toEqual(second.areaStrikes.map(({ x, y, angle }) => ({ x, y, angle })));
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    const targeted = first.areaStrikes.find((strike) =>
      strike.x === first.player.x && strike.y === first.player.y);
    expect(targeted).toBeDefined();
    expect(targeted?.warningRemaining).toBe(config.warningDuration);
    for (const strike of first.areaStrikes.filter((candidate) => candidate !== targeted)) {
      expect(Math.hypot(strike.x - first.player.x, strike.y - first.player.y))
        .toBeGreaterThanOrEqual(config.placementMinimumRadius);
      expect(Math.abs(strike.angle)).toBeLessThanOrEqual(config.strikeAngleJitter);
    }
  });

  it("dispatches a configured area strike without a Frost Warden kind branch", () => {
    const frostConfig = ENEMY_REGISTRY["frost-warden"].areaStrike!;
    ENEMY_REGISTRY.boss.areaStrike = {
      ...frostConfig,
      rngSeedKey: "test-boss-area-strike",
      initialCooldown: 0,
      randomStrikeCount: 0,
    };
    try {
      const game = gameFixture();
      const boss = spawn(game, "boss", game.player.x + 200, game.player.y);

      (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(boss, 0.1);

      expect(game.areaStrikes).toHaveLength(1);
      const strike = game.areaStrikes[0]!;
      expect(strike.sourceEnemyKind).toBe("boss");
      expect(strike.x).toBe(game.player.x);
      expect(boss.areaStrikeCooldown).toBe(frostConfig.cooldown);
    } finally {
      delete ENEMY_REGISTRY.boss.areaStrike;
    }
  });

  it("scales delayed boss area-strike damage with the selected difficulty", () => {
    const damageFromTargetedStrike = (difficulty: Difficulty) => {
      const game = gameFixture(difficulty);
      const warden = spawn(game, "frost-warden", game.player.x + 200, game.player.y);
      const wall = structure(744, "wall", game.player.x, game.player.y);
      game.structures = [wall];
      (game as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
        .createAreaStrikeAttack(warden);
      const strike = game.areaStrikes.find((candidate) =>
        candidate.x === game.player.x && candidate.y === game.player.y);
      if (!strike) throw new Error("Targeted Frost Warden strike was not created");
      const playerHealthBefore = game.player.health;
      const wallHealthBefore = wall.health;

      (game as unknown as { resolveAreaStrike(areaStrike: typeof strike): void })
        .resolveAreaStrike(strike);

      return {
        player: playerHealthBefore - game.player.health,
        structure: wallHealthBefore - wall.health,
      };
    };

    const easyDamage = damageFromTargetedStrike("easy");
    const extremeDamage = damageFromTargetedStrike("extreme");
    const expectedRatio = BALANCE.bossDifficulty.extreme.damage
      / BALANCE.bossDifficulty.easy.damage;

    expect(extremeDamage.player / easyDamage.player).toBeCloseTo(expectedRatio);
    expect(extremeDamage.structure / easyDamage.structure).toBeCloseTo(expectedRatio);
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
    const config = ENEMY_REGISTRY["frost-warden"].areaStrike!;
    const turret = structure(740, "turret", game.player.x + 20, game.player.y);
    const wall = structure(741, "wall", game.player.x - 20, game.player.y);
    game.structures = [turret, wall];
    game.areaStrikes = [{
      id: 9002,
      sourceEnemyKind: "frost-warden",
      playerDamageScale: 1,
      structureDamageScale: 1,
      x: game.player.x,
      y: game.player.y,
      radius: config.radius,
      angle: 0.1,
      warningRemaining: 0.01,
      warningDuration: config.warningDuration,
      eruptionRemaining: config.eruptionDuration,
      eruptionDuration: config.eruptionDuration,
    }];

    (game as unknown as { updateAreaStrikes(dt: number): void }).updateAreaStrikes(0.02);

    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.player.statuses?.slow?.remaining).toBe(config.statusEffect?.duration);
    expect(turret.health).toBeLessThan(turret.maxHealth);
    expect(turret.statuses?.slow?.remaining).toBe(config.statusEffect?.duration);
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

  it("dispatches an aimed boss projectile through registry capability instead of enemy identity", () => {
    const game = gameFixture();
    const warden = spawn(game, "frost-warden", game.player.x + 200, game.player.y);
    const inheritedVolley = ENEMY_REGISTRY.boss.aimedProjectile!;
    ENEMY_REGISTRY[warden.kind].aimedProjectile = inheritedVolley;
    try {
      warden.acidWindup = inheritedVolley.telegraphDuration - 0.01;
      (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss(warden, 0.02);

      expect(game.projectiles.at(-1)).toMatchObject({
        owner: inheritedVolley.owner,
        sourceEnemyKind: warden.kind,
        damageSource: inheritedVolley.damageSource,
        color: inheritedVolley.color,
        radius: inheritedVolley.radius,
        rangeLeft: inheritedVolley.range,
        lifetime: inheritedVolley.lifetime,
      });
      expect(Math.hypot(game.projectiles.at(-1)!.vx, game.projectiles.at(-1)!.vy))
        .toBeCloseTo(inheritedVolley.speed);
    } finally {
      delete ENEMY_REGISTRY[warden.kind].aimedProjectile;
    }
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
