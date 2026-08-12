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
  game.startRun("normal", "wasteland-enemy-tests", [], true, { settle: false });
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

describe("wasteland enemies", () => {
  it("registers the staged Radstalker with a complete defender-hunting role", () => {
    const definition = ENEMY_REGISTRY.radstalker;

    expect(definition.assets.portrait).toBe("enemies/radstalker-zombie");
    expect(definition.render).toEqual({ aspectRatio: 110 / 100, width: 83, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "player", detectionRadius: 720 });
    expect(definition.attack.statusEffect).toEqual({
      kind: "slow",
      duration: 2.6,
      targets: ["player"],
      popupTextColor: "#cfff71",
      particleColor: "#79d63c",
      popupText: "Irradiated",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic"] as const) {
      expect(Object.values(selectEnemyRoster("staged-radstalker", tier)))
        .not.toContain("radstalker");
    }
  });

  it("pursues and irradiates the player instead of nearby fortifications", () => {
    const game = gameFixture();
    const radstalker = spawn(game, "radstalker", game.player.x + 100, game.player.y);
    game.flag.x = radstalker.x + 30;
    game.flag.y = radstalker.y;

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(radstalker);
    expect(radstalker.targetId).toBe("player");

    radstalker.x = game.player.x + radstalker.radius + game.player.radius - 1;
    radstalker.y = game.player.y;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyAttack(radstalker, game.player, 1);

    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.player.statuses?.slow?.remaining).toBe(2.6);
    expect(game.particles.some((particle) => particle.color === "#79d63c")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Irradiated" && particle.color === "#cfff71"))
      .toBe(true);
  });

  it("falls back to the flag when the defender is outside its pursuit radius", () => {
    const game = gameFixture();
    const radstalker = spawn(game, "radstalker", game.player.x + 900, game.player.y);

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(radstalker);

    expect(radstalker.targetId).toBe("flag");
  });

  it("registers the staged Sludge Lobber with a complete ranged suppression role", () => {
    const definition = ENEMY_REGISTRY["sludge-lobber"];

    expect(definition.assets.portrait).toBe("enemies/sludge-lobber-zombie");
    expect(definition.render).toEqual({ aspectRatio: 118 / 104, width: 85, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "archer", attackRange: 440, innerRadius: 190 });
    expect(definition.projectile).toMatchObject({
      appearance: "sludge",
      damageSource: "sludge-lobber",
      pierces: false,
      targets: ["turret", "player", "flag"],
      statusEffect: {
        kind: "slow",
        duration: 3.4,
        targets: ["player", "turret"],
        popupTextColor: "#dfff86",
        particleColor: "#75c83b",
        popupText: "Sludged",
      },
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic"] as const) {
      expect(Object.values(selectEnemyRoster("staged-sludge-lobber", tier)))
        .not.toContain("sludge-lobber");
    }
  });

  it("suppresses a priority turret with a damaging non-piercing sludge bomb", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["sludge-lobber"];
    const target = turret(980, game.player.x, game.player.y);
    game.structures = [target];
    const lobber = spawn(game, "sludge-lobber", target.x - 300, target.y);

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(lobber);
    expect(lobber.targetId).toBe(target.id);

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyRangedAttack(lobber, target, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "sludge-lobber",
      damageSource: "sludge-lobber",
      intendedTargetId: target.id,
      appearance: "sludge",
      pierces: false,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.8);

    expect(target.health).toBe(target.maxHealth - lobber.structureDamage);
    expect(target.statuses?.slow?.remaining).toBe(3.4);
    expect(game.particles.some((particle) => particle.color === "#75c83b")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Sludged" && particle.color === "#dfff86"))
      .toBe(true);
  });

  it("registers the staged Ruin Siren with a capped reinforcement-caller role", () => {
    const definition = ENEMY_REGISTRY["ruin-siren"];

    expect(definition.assets.portrait).toBe("enemies/ruin-siren-zombie");
    expect(definition.render).toEqual({ aspectRatio: 120 / 108, width: 94, height: 85 });
    expect(definition.summon).toMatchObject({
      cooldown: 5.2,
      cappedRetryCooldown: 1.8,
      maximumLiving: 4,
      kinds: ["radstalker"],
      particleColor: "#e65340",
      popupText: "RALLY SIGNAL",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic"] as const) {
      expect(Object.values(selectEnemyRoster("staged-ruin-siren", tier)))
        .not.toContain("ruin-siren");
    }
  });

  it("rallies capped Radstalker reinforcements without adding them to wave accounting", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["ruin-siren"];
    const siren = spawn(game, "ruin-siren", game.flag.x + 300, game.flag.y);
    siren.summonCooldown = 0;

    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(siren, BALANCE.fixedStep);

    const summoned = game.enemies.find((enemy) => enemy.summonedBy === siren.id);
    expect(summoned).toMatchObject({ kind: "radstalker", countsTowardWave: false });
    expect(siren.summonCooldown).toBe(definition.summon!.cooldown);
    expect(game.particles.some((particle) => particle.color === "#e65340")).toBe(true);
    expect(game.particles.some((particle) => particle.text === "RALLY SIGNAL")).toBe(true);

    game.enemies = [
      siren,
      ...Array.from({ length: definition.summon!.maximumLiving }, (_, index) => ({
        ...summoned!,
        id: 900 + index,
        summonedBy: siren.id,
        health: 1,
      })),
    ];
    siren.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(siren, BALANCE.fixedStep);

    expect(game.enemies).toHaveLength(definition.summon!.maximumLiving + 1);
    expect(siren.summonCooldown).toBe(definition.summon!.cappedRetryCooldown);
  });

  it("registers the Reactor Revenant as the complete armored wasteland boss", () => {
    const definition = ENEMY_REGISTRY["reactor-revenant"];

    expect(isBossEnemyKind("reactor-revenant")).toBe(true);
    expect(definition.rosterEligible).toBe(false);
    expect(definition.assets.portrait).toBe("enemies/reactor-revenant");
    expect(definition.armor).toMatchObject({
      scalesWithHealth: true,
      brokenSprite: "enemies/reactor-revenant-broken",
    });
    expect(definition.areaStrike).toMatchObject({
      rngSeedKey: "reactor-revenant:toxic-ruptures",
      damageSource: "reactor-revenant",
      statusEffect: {
        kind: "slow",
        duration: 3.8,
        targets: ["player", "turret"],
      },
    });
    expect(definition.phaseSlam).toMatchObject({
      reinforcementKind: "ruin-siren",
      reinforcementCount: 3,
    });
  });

  it("creates deterministic toxic-rupture warnings around the defender", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstBoss = spawn(first, "reactor-revenant", first.player.x + 460, first.player.y);
    const secondBoss = spawn(second, "reactor-revenant", second.player.x + 460, second.player.y);
    const config = ENEMY_REGISTRY["reactor-revenant"].areaStrike!;

    (first as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(firstBoss);
    (second as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(secondBoss);

    expect(first.areaStrikes).toEqual(second.areaStrikes);
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    expect(first.areaStrikes.every((strike) =>
      strike.sourceEnemyKind === "reactor-revenant")).toBe(true);
    expect(first.areaStrikes.some((strike) =>
      strike.x === first.player.x && strike.y === first.player.y)).toBe(true);
  });

  it("breaks containment before health and releases one Ruin Siren group", () => {
    const game = gameFixture();
    const boss = spawn(game, "reactor-revenant", game.flag.x + 740, game.flag.y);
    const definition = ENEMY_REGISTRY["reactor-revenant"];
    const damageEnemy = (damage: number) => {
      (game as unknown as {
        damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: "player-melee", ownerPlayerId: string): void;
      }).damageEnemy(boss, damage, "#ffffff", "player-melee", game.player.id);
    };

    expect(boss.armor).toBeCloseTo(
      definition.armor!.health * boss.maxHealth / definition.base.health,
    );
    damageEnemy(boss.armor!);
    expect(boss.health).toBe(boss.maxHealth);
    expect(boss.armor).toBe(0);

    damageEnemy(boss.maxHealth * 0.55);
    expect(boss.bossHalfSummoned).toBe(true);
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void })
      .updateBoss(boss, definition.phaseSlam!.chargeDuration + 0.01);

    expect(game.enemies.filter((enemy) =>
      enemy.summonedBy === boss.id && enemy.kind === "ruin-siren"))
      .toHaveLength(definition.phaseSlam!.reinforcementCount);

    boss.health = boss.maxHealth * 0.1;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void })
      .updateBoss(boss, definition.phaseSlam!.chargeDuration * 2);
    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id))
      .toHaveLength(definition.phaseSlam!.reinforcementCount);
  });
});
