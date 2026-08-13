// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, isBossEnemyKind, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { isBurning } from "./status-effects";
import type { Enemy, Structure, StructureKind } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "volcanic-enemy-tests", [], true, { settle: false });
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
    id, kind, tier: "wood", x, y,
    radius: BALANCE.structure.radius[kind], health: 600, maxHealth: 600,
    cooldown: 0, angle: 0, lastArmAngle: 0, harvesterHitResourceIds: new Set(), flash: 0,
  };
}

describe("volcanic enemies", () => {
  it("registers Cinderburst for the volcanic roster with complete production behavior", () => {
    const definition = ENEMY_REGISTRY.cinderburst;
    expect(definition.assets.portrait).toBe("enemies/cinderburst-zombie");
    expect(definition.render).toMatchObject({ aspectRatio: 108 / 100, width: 81, height: 75 });
    expect(definition.death).toMatchObject({
      mode: "burst",
      burstDamageSource: "cinderburst-burst",
      burstWaveSprite: "effects/cinderburst-wave",
      popupText: "CINDER BLAST",
    });
    expect(definition.rosterEligible).toBe(true);
    expect(definition.campaignTierIds).toEqual(["volcanic"]);
    for (const tier of ["forest", "snowy", "desert"] as const) {
      expect(Object.values(selectEnemyRoster("staged-cinderburst", tier))).not.toContain("cinderburst");
    }
  });

  it("erupts on combat death with volcanic attribution and extra structure pressure", () => {
    const game = gameFixture();
    game.phase = "night";
    const cinderburst = spawn(game, "cinderburst", game.flag.x, game.flag.y);
    game.player.x = cinderburst.x + 35;
    game.player.y = cinderburst.y;
    game.structures = (["wall", "door", "spikes", "harvester", "turret"] as StructureKind[])
      .map((kind, index) => structure(900 + index, kind, cinderburst.x + 45 + index * 4, cinderburst.y));
    const playerBefore = game.player.health;
    const flagBefore = game.flag.health;
    cinderburst.deathReason = "combat";

    (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(cinderburst);

    expect(game.player.health).toBeLessThan(playerBefore);
    expect(game.flag.health).toBeLessThan(flagBefore);
    expect(game.structures.every((item) => item.health < item.maxHealth)).toBe(true);
    expect(game.areaEffects.at(-1)).toMatchObject({
      kind: "death-burst",
      sourceEnemyKind: "cinderburst",
      radius: ENEMY_REGISTRY.cinderburst.death.burstOuterRadius,
    });
  });

  it("does not erupt when sunlight cleanup removes it", () => {
    const game = gameFixture();
    const cinderburst = spawn(game, "cinderburst", game.player.x + 30, game.player.y);
    cinderburst.deathReason = "sunlight";
    const healthBefore = game.player.health;

    (game as unknown as { resolveEnemyDeath(enemy: Enemy): void }).resolveEnemyDeath(cinderburst);

    expect(game.player.health).toBe(healthBefore);
    expect(game.areaEffects).toHaveLength(0);
  });

  it("registers Magma Spitter for the volcanic roster with a complete ranged siege role", () => {
    const definition = ENEMY_REGISTRY["magma-spitter"];
    expect(definition.assets.portrait).toBe("enemies/magma-spitter-zombie");
    expect(definition.render).toEqual({ aspectRatio: 112 / 104, width: 82, height: 76 });
    expect(definition.targeting).toMatchObject({
      mode: "priority",
      priorities: ["turret", "player", "harvester", "flag"],
      attackRange: 430,
      innerRadius: 190,
    });
    expect(definition.projectile).toMatchObject({
      appearance: "magma",
      damageSource: "magma-spitter",
      pierces: false,
    });
    expect(definition.rosterEligible).toBe(true);
    expect(definition.campaignTierIds).toEqual(["volcanic"]);
    for (const tier of ["forest", "snowy", "desert"] as const) {
      expect(Object.values(selectEnemyRoster("staged-magma-spitter", tier)))
        .not.toContain("magma-spitter");
    }
  });

  it("bombards a harvester from range with extra structure damage", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["magma-spitter"];
    const magmaSpitter = spawn(game, "magma-spitter", 500, 500);
    const harvester = structure(950, "harvester", 800, 500);
    game.player.x = 1500;
    game.player.y = 1500;
    game.structures = [harvester];

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(magmaSpitter);
    expect(magmaSpitter.targetId).toBe(harvester.id);

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyRangedAttack(magmaSpitter, harvester, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "magma-spitter",
      damageSource: "magma-spitter",
      intendedTargetId: harvester.id,
      damage: magmaSpitter.damage,
      structureDamage: magmaSpitter.structureDamage,
      appearance: "magma",
      pierces: false,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.8);
    expect(harvester.health).toBe(harvester.maxHealth - magmaSpitter.structureDamage);
    expect(game.projectiles).toHaveLength(0);
  });

  it("prioritizes turrets, then the player, then harvesters", () => {
    const game = gameFixture();
    const magmaSpitter = spawn(game, "magma-spitter", 500, 500);
    const turret = structure(951, "turret", 780, 500);
    const harvester = structure(952, "harvester", 740, 500);
    game.player.x = 700;
    game.player.y = 500;
    game.structures = [harvester, turret];

    const selectTarget = () => (game as unknown as { selectEnemyTarget(enemy: Enemy): void })
      .selectEnemyTarget(magmaSpitter);
    selectTarget();
    expect(magmaSpitter.targetId).toBe(turret.id);

    game.structures = [harvester];
    (game as unknown as { rebuildSpatial(): void }).rebuildSpatial();
    selectTarget();
    expect(magmaSpitter.targetId).toBe("player");

    game.player.x = 1500;
    game.player.y = 1500;
    selectTarget();
    expect(magmaSpitter.targetId).toBe(harvester.id);
  });

  it("sends magma projectiles through resource nodes to valid targets", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["magma-spitter"];
    const magmaSpitter = spawn(game, "magma-spitter", 500, 500);
    const harvester = structure(953, "harvester", 800, 500);
    game.player.x = 1500;
    game.player.y = 1500;
    game.structures = [harvester];
    for (const resource of game.world.resources) resource.destroyed = true;
    const blockingNode = game.world.resources[0]!;
    blockingNode.destroyed = false;
    blockingNode.x = 650;
    blockingNode.y = 500;
    (game as unknown as { rebuildSpatial(): void }).rebuildSpatial();

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void }).selectEnemyTarget(magmaSpitter);
    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: Structure, dt: number): void;
    }).enemyRangedAttack(magmaSpitter, harvester, definition.attack.chargeSeconds);
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.8);

    expect(harvester.health).toBe(harvester.maxHealth - magmaSpitter.structureDamage);
    expect(blockingNode.destroyed).toBe(false);
    expect(game.projectiles).toHaveLength(0);
  });

  it("registers Obsidian Charger for the volcanic roster with armor and a complete breach role", () => {
    const definition = ENEMY_REGISTRY["obsidian-charger"];
    expect(definition.assets.portrait).toBe("enemies/obsidian-charger-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 106, height: 95 });
    expect(definition.armor).toMatchObject({
      health: 125,
      projectileResistance: 0.6,
      brokenSprite: "enemies/obsidian-charger-zombie-broken",
    });
    expect(definition.ram).toMatchObject({
      damage: 390,
      distance: 440,
      targetKinds: ["wall", "door", "spikes"],
    });
    expect(definition.rosterEligible).toBe(true);
    expect(definition.campaignTierIds).toEqual(["volcanic"]);
    for (const tier of ["forest", "snowy", "desert"] as const) {
      expect(Object.values(selectEnemyRoster("staged-obsidian-charger", tier)))
        .not.toContain("obsidian-charger");
    }
  });

  it("resists arrows, then charges through an aligned fortification", () => {
    const game = gameFixture();
    game.phase = "night";
    const definition = ENEMY_REGISTRY["obsidian-charger"];
    const wall = structure(975, "wall", game.flag.x + 120, game.flag.y);
    wall.health = 320;
    wall.maxHealth = 320;
    const charger = spawn(game, "obsidian-charger", wall.x + 180, wall.y);
    game.structures = [wall];
    for (const resource of game.world.resources) resource.destroyed = true;
    const damageEnemy = (damage: number, source: "player-bow" | "player-melee") => {
      (game as unknown as {
        damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: typeof source, ownerPlayerId: string): void;
      }).damageEnemy(charger, damage, "#ffffff", source, game.player.id);
    };

    damageEnemy(50, "player-bow");
    expect(charger.armor).toBe(definition.armor!.health - 20);
    damageEnemy(definition.armor!.health - 20, "player-melee");
    expect(charger.armor).toBe(0);
    expect(charger.health).toBe(charger.maxHealth);

    const updateRam = (dt: number) => (game as unknown as {
      updateEnemyRam(enemy: Enemy, dt: number): boolean;
    }).updateEnemyRam(charger, dt);
    expect(updateRam(0.1)).toBe(true);
    expect(charger.chargeTargetId).toBe(wall.id);
    updateRam(definition.ram!.loadSeconds);
    expect(charger.charging).toBe(true);
    updateRam(0.5);

    expect(wall.health).toBe(0);
    expect(charger.chargeHitIds).toContain(wall.id);
  });

  it("registers the Caldera Sovereign as the complete armored volcanic boss", () => {
    const definition = ENEMY_REGISTRY["caldera-sovereign"];

    expect(isBossEnemyKind("caldera-sovereign")).toBe(true);
    expect(definition.rosterEligible).toBe(false);
    expect(definition.campaignTierIds).toEqual(["volcanic"]);
    expect(definition.assets.portrait).toBe("enemies/caldera-sovereign");
    expect(definition.armor).toMatchObject({
      scalesWithHealth: true,
      brokenSprite: "enemies/caldera-sovereign-broken",
    });
    expect(definition.areaStrike).toMatchObject({
      rngSeedKey: "caldera-sovereign:magma-fissures",
      damageSource: "caldera-sovereign",
    });
    expect(definition.phaseSlam).toMatchObject({
      reinforcementKind: "cinderburst",
      reinforcementCount: 5,
    });
    expect(definition.capabilities).toMatchObject({
      knockbackImmune: true,
      fireAura: true,
      meleeRetaliation: { kind: "burn", durationBalance: "calderaBurn" },
    });
    expect(definition.areaStrike?.statusEffect).toMatchObject({
      kind: "burn",
      durationBalance: "calderaBurn",
    });
  });

  it("centralizes complete knockback immunity for every boss", () => {
    const game = gameFixture();
    const applyKnockback = (enemy: Enemy) => (game as unknown as {
      applyEnemyKnockback(target: Enemy, x: number, y: number): boolean;
    }).applyEnemyKnockback(enemy, 80, -30);
    const bossKinds = Object.keys(ENEMY_REGISTRY)
      .filter((kind): kind is Enemy["kind"] => isBossEnemyKind(kind as Enemy["kind"]));

    for (const kind of bossKinds) {
      const boss = spawn(game, kind, game.player.x + 300, game.player.y);
      const before = { x: boss.x, y: boss.y };
      expect(applyKnockback(boss)).toBe(false);
      expect({ x: boss.x, y: boss.y }).toEqual(before);
    }

    const ordinary = spawn(game, "basic", game.player.x + 300, game.player.y);
    expect(applyKnockback(ordinary)).toBe(true);
    expect(ordinary.x).toBe(game.player.x + 380);
  });

  it("burns the melee attacker for two seconds but never retaliates against arrows", () => {
    const game = gameFixture();
    const boss = spawn(game, "caldera-sovereign", game.player.x + 60, game.player.y);
    const damage = (source: "player-melee" | "player-bow") => (game as unknown as {
      damageEnemy(target: Enemy, amount: number, color: string, damageSource: typeof source, ownerPlayerId: string): void;
    }).damageEnemy(boss, 10, "#ffffff", source, game.player.id);

    damage("player-melee");
    expect(isBurning(game.player)).toBe(true);
    expect(game.player.statuses?.burn?.remaining)
      .toBe(BALANCE.tierMechanics.volcanic.calderaBurnDuration);

    game.player.statuses = undefined;
    damage("player-bow");
    expect(isBurning(game.player)).toBe(false);
  });

  it("adds the shared two-second burn to magma-spike player and structure hits", () => {
    const game = gameFixture();
    const boss = spawn(game, "caldera-sovereign", game.player.x + 440, game.player.y);
    const wall = structure(980, "wall", game.player.x, game.player.y);
    game.structures = [wall];
    (game as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(boss);
    const targeted = game.areaStrikes.find((strike) =>
      strike.x === game.player.x && strike.y === game.player.y)!;

    (game as unknown as { resolveAreaStrike(strike: typeof targeted): void })
      .resolveAreaStrike(targeted);

    expect(game.player.statuses?.burn?.remaining)
      .toBe(BALANCE.tierMechanics.volcanic.calderaBurnDuration);
    expect(wall.statuses?.burn?.remaining)
      .toBe(BALANCE.tierMechanics.volcanic.calderaBurnDuration);
  });

  it("creates deterministic magma-fissure warnings around the defender", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstBoss = spawn(first, "caldera-sovereign", first.player.x + 440, first.player.y);
    const secondBoss = spawn(second, "caldera-sovereign", second.player.x + 440, second.player.y);
    const config = ENEMY_REGISTRY["caldera-sovereign"].areaStrike!;

    (first as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(firstBoss);
    (second as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(secondBoss);

    expect(first.areaStrikes).toEqual(second.areaStrikes);
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    expect(first.areaStrikes.every((strike) =>
      strike.sourceEnemyKind === "caldera-sovereign")).toBe(true);
    expect(first.areaStrikes.some((strike) =>
      strike.x === first.player.x && strike.y === first.player.y)).toBe(true);
  });

  it("breaks its crown before health and awakens one Cinderburst group", () => {
    const game = gameFixture();
    const boss = spawn(game, "caldera-sovereign", game.flag.x + 720, game.flag.y);
    const definition = ENEMY_REGISTRY["caldera-sovereign"];
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
      enemy.summonedBy === boss.id && enemy.kind === "cinderburst"))
      .toHaveLength(definition.phaseSlam!.reinforcementCount);

    boss.health = boss.maxHealth * 0.1;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void })
      .updateBoss(boss, definition.phaseSlam!.chargeDuration * 2);
    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id))
      .toHaveLength(definition.phaseSlam!.reinforcementCount);
  });
});
