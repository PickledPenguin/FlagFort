// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { CAMPAIGN_TIER_IDS } from "./types";
import { ENEMY_REGISTRY, isBossEnemyKind, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Structure, StructureKind } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "mire-enemy-tests", [], true, { settle: false });
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

function structure(id: number, kind: StructureKind, x: number, y: number): Structure {
  return {
    id, kind, tier: "wood", x, y,
    radius: BALANCE.structure.radius[kind], health: 600, maxHealth: 600,
    cooldown: 0, angle: 0, lastArmAngle: 0, harvesterHitResourceIds: new Set(), flash: 0,
  };
}

describe("mire enemies", () => {
  it("registers Mire Lurker as a Drowned Mire defender-hunting leech", () => {
    const definition = ENEMY_REGISTRY["mire-lurker"];

    expect(definition.assets.portrait).toBe("enemies/mire-lurker-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 84, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "player", detectionRadius: 760 });
    expect(definition.attack.lifeSteal).toEqual({
      healingRatio: 0.75,
      fullHealOnSuccess: true,
      targets: ["player"],
      particleColor: "#6fc9a8",
      particleCount: 12,
      popupText: "LEECH",
    });
    expect(definition).toMatchObject({ rosterEligible: true, campaignTierIds: ["mire"] });
    for (const tier of CAMPAIGN_TIER_IDS.filter((id) => id !== "mire")) {
      expect(Object.values(selectEnemyRoster("isolated-mire-lurker", tier)))
        .not.toContain("mire-lurker");
    }
  });

  it("hunts an exposed defender and fully heals on a successful leech", () => {
    const game = gameFixture();
    const lurker = spawn(game, "mire-lurker", game.player.x + 100, game.player.y);
    game.flag.x = lurker.x + 30;
    game.flag.y = lurker.y;
    lurker.health = lurker.maxHealth / 2;

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(lurker);
    expect(lurker.targetId).toBe("player");

    lurker.x = game.player.x + lurker.radius + game.player.radius - 1;
    lurker.y = game.player.y;
    const playerHealthBefore = game.player.health;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyAttack(lurker, game.player, 1);

    const damageDealt = playerHealthBefore - game.player.health;
    expect(damageDealt).toBeGreaterThan(0);
    expect(lurker.health).toBe(lurker.maxHealth);
    expect(game.particles.some((particle) => particle.color === "#6fc9a8")).toBe(true);
    expect(game.particles.some((particle) => particle.text === "LEECH")).toBe(true);
  });

  it("falls back to the flag when the defender is outside its hunting radius", () => {
    const game = gameFixture();
    const lurker = spawn(game, "mire-lurker", game.player.x + 900, game.player.y);

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(lurker);

    expect(lurker.targetId).toBe("flag");
  });

  it("shakes an infected resource once on every proximity re-entry", () => {
    const game = gameFixture();
    const node = game.world.resources[0]!;
    node.infected = true;
    const updateResources = (dt: number) => (game as unknown as {
      updateResourceMechanics(value: number): void;
    }).updateResourceMechanics(dt);
    game.player.x = node.x + BALANCE.tierMechanics.mire.hintRadius + 20;
    game.player.y = node.y;
    updateResources(0.1);
    expect(node.infectionHintTime ?? 0).toBe(0);

    game.player.x = node.x;
    updateResources(0.1);
    expect(node.infectionHintTime).toBe(0.42);
    updateResources(0.1);
    expect(node.infectionHintTime).toBeCloseTo(0.32);

    game.player.x = node.x + BALANCE.tierMechanics.mire.hintRadius + 20;
    updateResources(0.5);
    expect(node.infectionHintTime).toBe(0);
    game.player.x = node.x;
    updateResources(0.1);
    expect(node.infectionHintTime).toBe(0.42);
  });

  it("registers Sporecaster as a Drowned Mire seeding suppression enemy", () => {
    const definition = ENEMY_REGISTRY.sporecaster;

    expect(definition.assets.portrait).toBe("enemies/sporecaster-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 84, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "archer", attackRange: 450, innerRadius: 200 });
    expect(definition.projectile).toMatchObject({
      appearance: "spore",
      damageSource: "sporecaster",
      pierces: false,
      targets: ["turret", "player"],
      statusEffect: {
        kind: "slow",
        duration: 3,
        targets: ["player", "turret"],
        popupTextColor: "#c9ffe8",
        particleColor: "#68cda6",
        popupText: "Spored",
        visual: "spore",
      },
    });
    expect(definition).toMatchObject({ rosterEligible: true, campaignTierIds: ["mire"] });
    for (const tier of CAMPAIGN_TIER_IDS.filter((id) => id !== "mire")) {
      expect(Object.values(selectEnemyRoster("isolated-sporecaster", tier)))
        .not.toContain("sporecaster");
    }
  });

  it("passes over structures, hits a turret, and seeds one basic zombie", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.sporecaster;
    const caster = spawn(game, "sporecaster", game.flag.x - 360, game.flag.y);
    const target = turret(1700, game.flag.x - 150, game.flag.y);
    const wall = structure(1701, "wall", caster.x + 100, caster.y);
    game.player.x = game.flag.x + 25;
    game.player.y = game.flag.y;
    game.structures = [wall, target];

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void }).selectEnemyTarget(caster);
    expect(caster.targetId).toBe(target.id);

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyRangedAttack(caster, target, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "sporecaster",
      damageSource: "sporecaster",
      intendedTargetId: target.id,
      appearance: "spore",
      pierces: false,
      damage: caster.damage,
      structureDamage: caster.structureDamage,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.9);

    expect(target.health).toBe(target.maxHealth - caster.structureDamage);
    expect(wall.health).toBe(wall.maxHealth);
    expect(target.statuses?.slow?.remaining).toBe(3);
    expect(target.statuses?.slow?.visual).toBe("spore");
    expect(game.player.health).toBe(game.player.maxHealth);
    expect(game.player.statuses?.slow).toBeUndefined();
    expect(game.projectiles).toHaveLength(0);
    expect(game.enemies.filter((enemy) => enemy.kind === "basic" && enemy.child)).toHaveLength(1);
    expect(game.particles.some((particle) => particle.color === "#68cda6")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Spored" && particle.color === "#c9ffe8"))
      .toBe(true);
  });

  it("registers Drowned Bulwark as a Drowned Mire armored breacher", () => {
    const definition = ENEMY_REGISTRY["drowned-bulwark"];

    expect(definition.assets.portrait).toBe("enemies/drowned-bulwark-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 109, height: 98 });
    expect(definition.armor).toMatchObject({
      health: 150,
      projectileResistance: 0.72,
      brokenSprite: "enemies/drowned-bulwark-zombie-broken",
    });
    expect(definition.ram).toMatchObject({
      damage: 440,
      distance: 460,
      targetKinds: ["wall", "door", "spikes"],
    });
    expect(definition).toMatchObject({ rosterEligible: true, campaignTierIds: ["mire"] });
    for (const tier of CAMPAIGN_TIER_IDS.filter((id) => id !== "mire")) {
      expect(Object.values(selectEnemyRoster("isolated-drowned-bulwark", tier)))
        .not.toContain("drowned-bulwark");
    }
  });

  it("resists arrows, loses its shield, then breaches an aligned wall", () => {
    const game = gameFixture();
    game.phase = "night";
    const definition = ENEMY_REGISTRY["drowned-bulwark"];
    const wall = structure(1800, "wall", game.flag.x + 120, game.flag.y);
    wall.health = 400;
    wall.maxHealth = 400;
    const bulwark = spawn(game, "drowned-bulwark", wall.x + 190, wall.y);
    game.structures = [wall];
    for (const resource of game.world.resources) resource.destroyed = true;
    const damageEnemy = (damage: number, source: "player-bow" | "player-melee") => {
      (game as unknown as {
        damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: typeof source, ownerPlayerId: string): void;
      }).damageEnemy(bulwark, damage, "#ffffff", source, game.player.id);
    };

    damageEnemy(50, "player-bow");
    expect(bulwark.armor).toBe(definition.armor!.health - 14);
    damageEnemy(definition.armor!.health - 14, "player-melee");
    expect(bulwark.armor).toBe(0);
    expect(bulwark.health).toBe(bulwark.maxHealth);
    expect(game.particles.some((particle) => particle.text === "SHIELD SUNK")).toBe(true);

    const updateRam = (dt: number) => (game as unknown as {
      updateEnemyRam(enemy: Enemy, dt: number): boolean;
    }).updateEnemyRam(bulwark, dt);
    expect(updateRam(0.1)).toBe(true);
    expect(bulwark.chargeTargetId).toBe(wall.id);
    updateRam(definition.ram!.loadSeconds);
    expect(bulwark.charging).toBe(true);
    updateRam(0.6);

    expect(wall.health).toBe(0);
    expect(bulwark.chargeHitIds).toContain(wall.id);
    expect(game.particles.some((particle) => particle.text === "DROWNED BREACH")).toBe(true);
  });

  it("registers the Mireheart Titan as a complete staged boss", () => {
    const definition = ENEMY_REGISTRY["mireheart-titan"];

    expect(isBossEnemyKind("mireheart-titan")).toBe(true);
    expect(definition.rosterEligible).toBe(false);
    expect(definition.assets.portrait).toBe("enemies/mireheart-titan");
    expect(definition.armor).toMatchObject({
      scalesWithHealth: true,
      brokenSprite: "enemies/mireheart-titan-broken",
      breakStatusPulse: {
        statusEffect: {
          kind: "slow",
          duration: 4.8,
          targets: ["player", "turret"],
        },
      },
    });
    expect(definition.attack.lifeSteal).toMatchObject({
      healingRatio: 0.6,
      popupText: "HEART DRAINS",
    });
    expect(definition.areaStrike).toMatchObject({
      rngSeedKey: "mireheart-titan:root-ruptures",
      damageSource: "mireheart-titan",
      randomStrikeCount: 7,
      statusEffect: {
        kind: "slow",
        duration: 3.4,
        targets: ["player", "turret"],
      },
    });
    expect(definition.summon).toMatchObject({
      kinds: ["mire-lurker"],
      maximumLiving: 2,
      popupText: "LURKERS RISE",
    });
  });

  it("creates deterministic root ruptures around the defender", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstBoss = spawn(first, "mireheart-titan", first.player.x + 500, first.player.y);
    const secondBoss = spawn(second, "mireheart-titan", second.player.x + 500, second.player.y);
    const config = ENEMY_REGISTRY["mireheart-titan"].areaStrike!;

    (first as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(firstBoss);
    (second as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(secondBoss);

    expect(first.areaStrikes).toEqual(second.areaStrikes);
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    expect(first.areaStrikes.every((strike) =>
      strike.sourceEnemyKind === "mireheart-titan")).toBe(true);
    expect(first.areaStrikes.some((strike) =>
      strike.x === first.player.x && strike.y === first.player.y)).toBe(true);
  });

  it("breaks its shell, bog-binds defenders, summons capped Lurkers, and drains life", () => {
    const game = gameFixture();
    const boss = spawn(game, "mireheart-titan", game.flag.x + 780, game.flag.y);
    const definition = ENEMY_REGISTRY["mireheart-titan"];
    const nearbyTurret = turret(1900, boss.x + 55, boss.y);
    game.structures = [nearbyTurret];
    game.player.x = boss.x - 55;
    game.player.y = boss.y;

    (game as unknown as {
      damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: "player-melee", ownerPlayerId: string): void;
    }).damageEnemy(boss, boss.armor!, "#ffffff", "player-melee", game.player.id);

    expect(boss.health).toBe(boss.maxHealth);
    expect(boss.armor).toBe(0);
    expect(game.player.statuses?.slow?.remaining).toBe(4.8);
    expect(nearbyTurret.statuses?.slow?.remaining).toBe(4.8);
    expect(game.particles.some((particle) => particle.text === "MIREHEART AWAKENS"))
      .toBe(true);

    boss.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(boss, BALANCE.fixedStep);
    expect(game.enemies.find((enemy) => enemy.summonedBy === boss.id))
      .toMatchObject({ kind: "mire-lurker", countsTowardWave: false });
    expect(boss.summonCooldown).toBe(definition.summon!.cooldown);

    boss.health = boss.maxHealth - 100;
    boss.cooldown = 0;
    boss.attackWindup = 0;
    const playerHealthBefore = game.player.health;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyAttack(boss, game.player, 1);

    const damageDealt = playerHealthBefore - game.player.health;
    expect(boss.health).toBeCloseTo(boss.maxHealth - 100 + damageDealt * 0.6);
    expect(game.particles.some((particle) => particle.text === "HEART DRAINS")).toBe(true);
  });
});
