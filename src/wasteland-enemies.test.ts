// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { ENEMY_REGISTRY, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy } from "./types";

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
});
