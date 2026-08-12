// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, isBossEnemyKind } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Structure } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "desert-enemy-tests", [], true, { settle: false });
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

describe("staged Desert enemies", () => {
  it("gives Tombguard projectile-resistant armor that melee can crack efficiently", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.tombguard;
    const tombguard = spawn(game, "tombguard", game.player.x + 100, game.player.y);
    const damageEnemy = (damage: number, source: "player-bow" | "player-melee") => {
      (game as unknown as {
        damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: typeof source, ownerPlayerId: string | null): void;
      }).damageEnemy(tombguard, damage, "#ffffff", source, game.player.id);
    };

    expect(tombguard.armor).toBe(definition.armor!.health);
    expect(tombguard.health).toBe(tombguard.maxHealth);

    damageEnemy(40, "player-bow");
    expect(tombguard.armor).toBe(definition.armor!.health - 14);
    expect(tombguard.health).toBe(tombguard.maxHealth);

    damageEnemy(96, "player-melee");
    expect(tombguard.armor).toBe(0);
    expect(tombguard.health).toBe(tombguard.maxHealth);

    damageEnemy(20, "player-melee");
    expect(tombguard.health).toBe(tombguard.maxHealth - 20);
  });

  it("lets a Sandcaster sandblast pierce an aligned wall and defender", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.sandcaster;
    const sandcaster = spawn(game, "sandcaster", game.player.x - 220, game.player.y);
    const wall: Structure = {
      id: 810,
      kind: "wall",
      tier: "wood",
      x: game.player.x - 100,
      y: game.player.y,
      radius: BALANCE.structure.radius.wall,
      health: 200,
      maxHealth: 200,
      cooldown: 0,
      angle: 0,
      lastArmAngle: 0,
      harvesterHitResourceIds: new Set(),
      flash: 0,
    };
    game.structures = [wall];

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyRangedAttack(sandcaster, game.player, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "sandcaster",
      damageSource: "sandcaster",
      appearance: "sandblast",
      pierces: true,
    });

    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.5);

    expect(wall.health).toBe(wall.maxHealth - sandcaster.damage);
    expect(game.player.health).toBe(game.player.maxHealth - sandcaster.damage);
    expect(game.projectiles).toHaveLength(1);
    expect(game.projectiles[0]!.hitIds).toEqual(new Set([wall.id, "player"]));
  });

  it("stages the Dune Colossus as a complete armored campaign boss", () => {
    const definition = ENEMY_REGISTRY["dune-colossus"];

    expect(isBossEnemyKind("dune-colossus")).toBe(true);
    expect(definition.rosterEligible).toBe(false);
    expect(definition.campaignTierIds).toEqual(["desert"]);
    expect(definition.assets.portrait).toBe("enemies/dune-colossus");
    expect(definition.armor?.brokenSprite).toBe("enemies/dune-colossus-broken");
    expect(definition.armor?.scalesWithHealth).toBe(true);
    expect(definition.areaStrike?.damageSource).toBe("dune-colossus");
    expect(definition.phaseSlam?.reinforcementKind).toBe("dune-hopper");
  });

  it("creates deterministic sand-pillar warnings around the defender", () => {
    const first = gameFixture();
    const second = gameFixture();
    const firstBoss = spawn(first, "dune-colossus", first.player.x + 420, first.player.y);
    const secondBoss = spawn(second, "dune-colossus", second.player.x + 420, second.player.y);
    const config = ENEMY_REGISTRY["dune-colossus"].areaStrike!;

    (first as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(firstBoss);
    (second as unknown as { createAreaStrikeAttack(enemy: Enemy): void })
      .createAreaStrikeAttack(secondBoss);

    expect(first.areaStrikes).toEqual(second.areaStrikes);
    expect(first.areaStrikes).toHaveLength(
      config.randomStrikeCount + Number(config.includesTargetedStrike),
    );
    expect(first.areaStrikes.every((strike) => strike.sourceEnemyKind === "dune-colossus"))
      .toBe(true);
    expect(first.areaStrikes.some((strike) =>
      strike.x === first.player.x && strike.y === first.player.y)).toBe(true);
  });

  it("breaks its shell before health and calls one Dune Hopper swarm at half health", () => {
    const game = gameFixture();
    const boss = spawn(game, "dune-colossus", game.flag.x + 700, game.flag.y);
    const config = ENEMY_REGISTRY["dune-colossus"];
    const damageEnemy = (damage: number) => {
      (game as unknown as {
        damageEnemy(enemy: Enemy, amount: number, color: string, damageSource: "player-melee", ownerPlayerId: string): void;
      }).damageEnemy(boss, damage, "#ffffff", "player-melee", game.player.id);
    };

    expect(boss.armor).toBeCloseTo(
      config.armor!.health * boss.maxHealth / config.base.health,
    );
    damageEnemy(boss.armor!);
    expect(boss.health).toBe(boss.maxHealth);
    expect(boss.armor).toBe(0);

    damageEnemy(boss.maxHealth * 0.55);
    expect(boss.bossHalfSummoned).toBe(true);
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void })
      .updateBoss(boss, config.phaseSlam!.chargeDuration + 0.01);

    expect(game.enemies.filter((enemy) =>
      enemy.summonedBy === boss.id && enemy.kind === "dune-hopper"))
      .toHaveLength(config.phaseSlam!.reinforcementCount);

    boss.health = boss.maxHealth * 0.1;
    (game as unknown as { updateBoss(enemy: Enemy, dt: number): void })
      .updateBoss(boss, config.phaseSlam!.chargeDuration * 2);
    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id))
      .toHaveLength(config.phaseSlam!.reinforcementCount);
  });
});
