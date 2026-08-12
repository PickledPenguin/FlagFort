// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Structure } from "./types";

function gameFixture(): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "astral-enemy-tests", [], true, { settle: false });
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

describe("astral enemies", () => {
  it("registers the staged Rift Strider as a complete phasing attacker", () => {
    const definition = ENEMY_REGISTRY["rift-strider"];

    expect(definition.assets.portrait).toBe("enemies/rift-strider-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 84, height: 75 });
    expect(definition.leap).toMatchObject({
      range: 250,
      cooldown: 2.8,
      duration: 0.38,
      particleColor: "#9f7cff",
      launchPopupText: "PHASE",
      landingPopupText: "RETURN",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland"] as const) {
      expect(Object.values(selectEnemyRoster("staged-rift-strider", tier)))
        .not.toContain("rift-strider");
    }
  });

  it("phases completely across a wall and rematerializes on the flag side", () => {
    const game = gameFixture();
    game.world.resources = [];
    const startX = game.flag.x - 400;
    const strider = spawn(game, "rift-strider", startX, game.flag.y);
    const wall: Structure = {
      id: 1400,
      kind: "wall",
      tier: "wood",
      x: startX + 65,
      y: game.flag.y,
      radius: BALANCE.structure.radius.wall,
      health: 500,
      maxHealth: 500,
      cooldown: 0,
      angle: 0,
      lastArmAngle: 0,
      harvesterHitResourceIds: new Set(),
      flash: 0,
    };
    game.structures = [wall];

    const phased = (game as unknown as {
      tryEnemyLeap(enemy: Enemy, blocker: Structure, target: typeof game.flag): boolean;
    }).tryEnemyLeap(strider, wall, game.flag);

    expect(phased).toBe(true);
    expect(strider.jumpTime).toBe(ENEMY_REGISTRY["rift-strider"].leap!.duration);
    expect(strider.jumpEndX).toBeGreaterThan(wall.x + wall.radius + strider.radius);
    expect(game.particles.some((particle) =>
      particle.text === "PHASE" && particle.color === "#9f7cff")).toBe(true);

    (game as unknown as { updateEnemyAirborne(enemy: Enemy, dt: number): void })
      .updateEnemyAirborne(strider, ENEMY_REGISTRY["rift-strider"].leap!.duration);

    expect(strider.jumpTime).toBe(0);
    expect(strider.x).toBeCloseTo(strider.jumpEndX);
    expect(game.particles.some((particle) => particle.text === "RETURN")).toBe(true);
    expect(wall.health).toBe(wall.maxHealth);
  });
});
