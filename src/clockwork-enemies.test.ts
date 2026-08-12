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
  game.startRun("normal", "clockwork-enemy-tests", [], true, { settle: false });
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

describe("clockwork enemies", () => {
  it("registers Springjack as a complete but staged spring-powered skirmisher", () => {
    const definition = ENEMY_REGISTRY.springjack;

    expect(definition.assets.portrait).toBe("enemies/springjack-zombie");
    expect(definition.render).toEqual({ aspectRatio: 116 / 104, width: 86, height: 77 });
    expect(definition.tier).toBe(3);
    expect(definition.introductionNight).toBe(3);
    expect(definition.leap).toMatchObject({
      range: 280,
      cooldown: 2.2,
      duration: 0.7,
      arcHeight: 58,
      particleColor: "#e2b85d",
      launchPopupText: "SPRING LOADED",
      landingPopupText: "CLANG",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland", "rift", "mire"] as const) {
      expect(Object.values(selectEnemyRoster("staged-springjack", tier)))
        .not.toContain("springjack");
    }
  });

  it("vaults a defensive wall without damaging it and lands beyond the line", () => {
    const game = gameFixture();
    game.world.resources = [];
    const startX = game.flag.x - 420;
    const springjack = spawn(game, "springjack", startX, game.flag.y);
    const wall: Structure = {
      id: 2100,
      kind: "wall",
      tier: "wood",
      x: startX + 70,
      y: game.flag.y,
      radius: BALANCE.structure.radius.wall,
      health: 600,
      maxHealth: 600,
      cooldown: 0,
      angle: 0,
      lastArmAngle: 0,
      harvesterHitResourceIds: new Set(),
      flash: 0,
    };
    game.structures = [wall];

    const vaulted = (game as unknown as {
      tryEnemyLeap(enemy: Enemy, blocker: Structure, target: typeof game.flag): boolean;
    }).tryEnemyLeap(springjack, wall, game.flag);

    expect(vaulted).toBe(true);
    expect(springjack.jumpEndX).toBeGreaterThan(wall.x + wall.radius + springjack.radius);
    expect(game.particles.some((particle) =>
      particle.text === "SPRING LOADED" && particle.color === "#e2b85d")).toBe(true);

    (game as unknown as { updateEnemyAirborne(enemy: Enemy, dt: number): void })
      .updateEnemyAirborne(springjack, ENEMY_REGISTRY.springjack.leap!.duration);

    expect(springjack.jumpTime).toBe(0);
    expect(springjack.x).toBeCloseTo(springjack.jumpEndX);
    expect(game.particles.some((particle) => particle.text === "CLANG")).toBe(true);
    expect(wall.health).toBe(wall.maxHealth);
  });
});
