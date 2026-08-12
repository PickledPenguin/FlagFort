// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { CAMPAIGN_TIER_IDS } from "./types";
import { ENEMY_REGISTRY, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Structure } from "./types";

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

describe("mire enemies", () => {
  it("registers Mire Lurker as a staged defender-hunting leech", () => {
    const definition = ENEMY_REGISTRY["mire-lurker"];

    expect(definition.assets.portrait).toBe("enemies/mire-lurker-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 84, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "player", detectionRadius: 760 });
    expect(definition.attack.lifeSteal).toEqual({
      healingRatio: 0.75,
      targets: ["player"],
      particleColor: "#6fc9a8",
      particleCount: 12,
      popupText: "LEECH",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of CAMPAIGN_TIER_IDS) {
      expect(Object.values(selectEnemyRoster("staged-mire-lurker", tier)))
        .not.toContain("mire-lurker");
    }
  });

  it("hunts an exposed defender and heals from damage actually dealt", () => {
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
    const lurkerHealthBefore = lurker.health;
    (game as unknown as {
      enemyAttack(enemy: Enemy, target: typeof game.player, dt: number): void;
    }).enemyAttack(lurker, game.player, 1);

    const damageDealt = playerHealthBefore - game.player.health;
    expect(damageDealt).toBeGreaterThan(0);
    expect(lurker.health).toBeCloseTo(lurkerHealthBefore + damageDealt * 0.75);
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

  it("registers Sporecaster as a staged piercing suppression enemy", () => {
    const definition = ENEMY_REGISTRY.sporecaster;

    expect(definition.assets.portrait).toBe("enemies/sporecaster-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 84, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "archer", attackRange: 450, innerRadius: 200 });
    expect(definition.projectile).toMatchObject({
      appearance: "spore",
      damageSource: "sporecaster",
      pierces: true,
      targets: ["turret", "player", "flag"],
      statusEffect: {
        kind: "slow",
        duration: 3,
        targets: ["player", "turret"],
        popupTextColor: "#c9ffe8",
        particleColor: "#68cda6",
        popupText: "Spored",
      },
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of CAMPAIGN_TIER_IDS) {
      expect(Object.values(selectEnemyRoster("staged-sporecaster", tier)))
        .not.toContain("sporecaster");
    }
  });

  it("pierces a priority turret and suppresses an aligned defender", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY.sporecaster;
    const caster = spawn(game, "sporecaster", game.flag.x - 360, game.flag.y);
    const target = turret(1700, game.flag.x - 150, game.flag.y);
    game.player.x = game.flag.x + 25;
    game.player.y = game.flag.y;
    game.structures = [target];

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
      pierces: true,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.9);

    expect(target.health).toBe(target.maxHealth - caster.structureDamage);
    expect(target.statuses?.slow?.remaining).toBe(3);
    expect(game.player.health).toBeLessThan(game.player.maxHealth);
    expect(game.player.statuses?.slow?.remaining).toBe(3);
    expect(game.projectiles).toHaveLength(1);
    expect(game.particles.some((particle) => particle.color === "#68cda6")).toBe(true);
    expect(game.particles.some((particle) =>
      particle.text === "Spored" && particle.color === "#c9ffe8"))
      .toBe(true);
  });
});
