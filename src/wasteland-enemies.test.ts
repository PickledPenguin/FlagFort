// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, isBossEnemyKind, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, EnemyStatusEffect, ResourceNode, Structure } from "./types";

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
      kind: "poison",
      duration: 0,
      durationBalance: "wastelandPoison",
      targets: ["player"],
      popupTextColor: "#cfff71",
      particleColor: "#79d63c",
      popupText: "Poisoned",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic"] as const) {
      expect(Object.values(selectEnemyRoster("staged-radstalker", tier)))
        .not.toContain("radstalker");
    }
  });

  it("pursues and poisons the player without slowing them", () => {
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
    expect(game.player.statuses?.slow).toBeUndefined();
    expect(game.player.statuses?.poison?.remaining).toBe(BALANCE.tierMechanics.wasteland.poisonDuration);
    expect(game.particles.some((particle) => particle.color === "#79d63c")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Poisoned" && particle.color === "#cfff71"))
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
        visual: "slime",
        targets: ["player", "turret"],
        popupTextColor: "#cfff71",
        particleColor: "#79d63c",
        popupText: "Slowed",
      },
      secondaryStatusEffect: { kind: "poison", duration: 0, durationBalance: "wastelandPoison", targets: ["player", "turret"] },
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
    expect(target.statuses?.slow?.visual).toBe("slime");
    expect(target.statuses?.poison?.remaining).toBe(BALANCE.tierMechanics.wasteland.poisonDuration);
    expect(game.particles.some((particle) => particle.color === "#79d63c")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Poisoned" && particle.color === "#cfff71"))
      .toBe(true);
  });

  it("registers the staged Ruin Siren with a capped reinforcement-caller role", () => {
    const definition = ENEMY_REGISTRY["ruin-siren"];

    expect(definition.assets.portrait).toBe("enemies/ruin-siren-zombie");
    expect(definition.render).toEqual({ aspectRatio: 120 / 108, width: 94, height: 85 });
    expect(definition.capabilities.radiationAura).toBe(true);
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
      rngSeedKey: "reactor-revenant:nuclear-zone",
      damageSource: "reactor-revenant",
      randomStrikeCount: 0,
      includesTargetedStrike: true,
      warningDuration: 2.8,
      radius: 245,
      screenShake: 30,
      cooldownBalance: "wastelandLargeAreaAttack",
      appearance: { shape: "nuclear-cloud" },
    });
    expect(definition.phaseSlam).toMatchObject({
      reinforcementKind: "ruin-siren",
      reinforcementCount: 3,
    });
  });

  it("creates one deterministic nuclear warning centered on the defender", () => {
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

  it("delays Radstalker radiation, floors awards, and depletes fractional remnants", () => {
    const game = gameFixture();
    const node = game.world.resources[0]!;
    const radstalker = spawn(game, "radstalker", node.x, node.y);
    radstalker.health = 0;
    radstalker.deathReason = "combat";
    (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(radstalker);
    const updateResources = (dt: number) => (game as unknown as {
      updateResourceMechanics(dt: number): void;
    }).updateResourceMechanics(dt);

    updateResources(BALANCE.tierMechanics.wasteland.radiationActivationDuration);
    expect(node.radiationDamage ?? 0).toBe(0);
    updateResources(0.5);
    expect(node.radiationDamage).toBeCloseTo(BALANCE.tierMechanics.wasteland.radiationDamagePerSecond * 0.5);
    expect(node.radiationAffected).toBe(true);
    expect(game.particles.some((particle) => particle.text === "Radiation")).toBe(true);

    node.health = 2.045;
    const resourcesBefore = game.resources[node.kind];
    (game as unknown as {
      harvestNode(node: ResourceNode, tier: "diamond", damageScale: number): void;
    }).harvestNode(node, "diamond", 1);
    expect(game.resources[node.kind] - resourcesBefore).toBe(2);
    expect(Number.isInteger(game.resources[node.kind])).toBe(true);
    expect(node.health).toBe(0);
    expect(game.particles.some((particle) => particle.text === "DEPLETED")).toBe(true);
  });

  it("refreshes one poison status from active death zones during day and night", () => {
    const game = gameFixture();
    game.radiationHazards = [{
      x: game.player.x,
      y: game.player.y,
      radius: BALANCE.tierMechanics.wasteland.radiationRadius,
      createdNight: game.night,
      activationRemaining: 0,
    }];
    const updateResources = () => (game as unknown as {
      updateResourceMechanics(dt: number): void;
    }).updateResourceMechanics(0.25);

    game.phase = "day";
    updateResources();
    expect(game.player.statuses?.poison?.remaining)
      .toBe(BALANCE.tierMechanics.wasteland.poisonDuration);
    game.player.statuses!.poison!.remaining = 0.5;
    game.phase = "night";
    updateResources();
    expect(game.player.statuses?.poison?.remaining)
      .toBe(BALANCE.tierMechanics.wasteland.poisonDuration);
    expect(Object.keys(game.player.statuses ?? {}).filter((kind) => kind === "poison"))
      .toHaveLength(1);
  });

  it("moves the shared radiation effect with the living Ruin Siren", () => {
    const game = gameFixture();
    const first = game.world.resources[0]!;
    const second = game.world.resources.find((node) => node.id !== first.id)!;
    const siren = spawn(game, "ruin-siren", first.x, first.y);
    const updateResources = () => (game as unknown as {
      updateResourceMechanics(dt: number): void;
    }).updateResourceMechanics(1);
    updateResources();
    expect(first.radiationDamage).toBeCloseTo(BALANCE.tierMechanics.wasteland.radiationDamagePerSecond);
    siren.x = second.x;
    siren.y = second.y;
    game.player.x = siren.x;
    game.player.y = siren.y;
    game.player.statuses = { poison: { remaining: 0 } };
    updateResources();
    expect(second.radiationDamage).toBeCloseTo(BALANCE.tierMechanics.wasteland.radiationDamagePerSecond);
    expect(game.player.statuses?.poison?.remaining)
      .toBe(BALANCE.tierMechanics.wasteland.poisonDuration);
  });

  it("keeps poison damage equal to the equivalent full fire effect", () => {
    const game = gameFixture();
    game.flagPresent = false;
    const effect = ENEMY_REGISTRY.radstalker.attack.statusEffect!;
    const healthBefore = game.player.health;
    (game as unknown as {
      applyEnemyStatusEffect(effect: EnemyStatusEffect, target: typeof game.player): void;
    }).applyEnemyStatusEffect(effect, game.player);
    game.update(1);
    expect(healthBefore - game.player.health).toBeCloseTo(BALANCE.tierMechanics.wasteland.poisonDamagePerSecond);
    expect(BALANCE.tierMechanics.wasteland.poisonDamagePerSecond * BALANCE.tierMechanics.wasteland.poisonDuration)
      .toBe(BALANCE.tierMechanics.volcanic.burnDamagePerSecond * BALANCE.tierMechanics.volcanic.burnDuration);
  });

  it("runs the large nuclear area attack at half the standard cadence", () => {
    const game = gameFixture();
    const boss = spawn(game, "reactor-revenant", game.player.x + 300, game.player.y);
    boss.areaStrikeCooldown = 0;
    (game as unknown as { updateAreaStrikeEnemy(enemy: Enemy, dt: number): void })
      .updateAreaStrikeEnemy(boss, BALANCE.fixedStep);
    expect(boss.areaStrikeCooldown).toBe(
      BALANCE.tierMechanics.wasteland.standardAreaAttackCooldown
        / BALANCE.tierMechanics.wasteland.largeAreaAttackFrequencyMultiplier,
    );
  });
});
