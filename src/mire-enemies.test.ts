// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { CAMPAIGN_TIER_IDS } from "./types";
import { ENEMY_REGISTRY, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy } from "./types";

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
});
