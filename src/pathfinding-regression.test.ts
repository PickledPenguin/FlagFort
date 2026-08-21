// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game, LOCAL_PLAYER_ID } from "./game";
import { Input } from "./input";
import { NavigationGrid, pathIntersectsObstacle } from "./pathfinding";
import type { Circle, Enemy, Structure } from "./types";

function createGame(): Game {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas>';
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun("normal", "pathfinding-regression", [], true, { settle: false });
  game.phase = "night";
  game.world.resources = [];
  return game;
}

function structure(id: number, kind: Structure["kind"], x: number, y: number): Structure {
  return {
    id,
    ownerId: LOCAL_PLAYER_ID,
    kind,
    tier: "wood",
    x,
    y,
    radius: BALANCE.structure.radius[kind],
    health: 500,
    maxHealth: 500,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
  };
}

function spawn(game: Game, kind: Enemy["kind"], x: number, y: number): Enemy {
  (game as unknown as {
    spawnEnemy(point: { x: number; y: number }, enemyKind: Enemy["kind"]): void;
  }).spawnEnemy({ x, y }, kind);
  const enemy = game.enemies.at(-1)!;
  enemy.x = x;
  enemy.y = y;
  enemy.scanCooldown = 99;
  return enemy;
}

describe("shared narrow-passage navigation regressions", () => {
  it("takes a direct passage whenever the zombie circle physically fits", () => {
    const actorRadius = 23;
    const obstacles = [
      { x: 500, y: 436, radius: 40 },
      { x: 500, y: 564, radius: 40 },
    ];
    const start = { x: 250, y: 500 };
    const goal = { x: 750, y: 500 };

    const path = new NavigationGrid(obstacles, actorRadius).find(start, goal);

    expect(path).toEqual([goal]);
    expect(pathIntersectsObstacle(start, path, obstacles, actorRadius)).toBe(false);
  });

  it("uses the precision fallback for an offset narrow opening in a resource wall", () => {
    const upperY = 1736;
    const lowerY = 1882;
    const obstacles: Circle[] = [];
    for (let y = upperY; y >= 0; y -= 88) obstacles.push({ x: 1800, y, radius: 45 });
    for (let y = lowerY; y <= BALANCE.mapSize; y += 88) obstacles.push({ x: 1800, y, radius: 45 });
    const start = { x: 1400, y: 1200 };
    const goal = { x: 2200, y: 1200 };

    const path = new NavigationGrid(obstacles, 23).find(start, goal);

    expect(path.length).toBeGreaterThan(2);
    expect(pathIntersectsObstacle(start, path, obstacles, 23)).toBe(false);
    expect(path.some((point) => point.x >= 1800 && point.y > upperY && point.y < lowerY))
      .toBe(true);
  });

  it("routes through a mixed resource and structure-sized cluster without clipping", () => {
    const obstacles = [
      { x: 510, y: 420, radius: 46 },
      { x: 510, y: 566, radius: BALANCE.structure.radius.wall },
      { x: 650, y: 470, radius: 42 },
      { x: 650, y: 616, radius: BALANCE.structure.radius.turret },
    ];
    const start = { x: 280, y: 520 };
    const goal = { x: 840, y: 520 };

    const path = new NavigationGrid(obstacles, 23).find(start, goal);

    expect(path.length).toBeGreaterThan(0);
    expect(pathIntersectsObstacle(start, path, obstacles, 23)).toBe(false);
  });
});

describe("shared zombie route recovery regressions", () => {
  it("rebuilds a stale route displaced into a resource cluster and reaches the harvester", () => {
    const game = createGame();
    const target = structure(9001, "harvester", game.flag.x + 520, game.flag.y);
    game.structures = [target];
    game.world.resources = [
      { id: 9101, kind: "stone", x: target.x - 230, y: target.y - 54, radius: 45, health: 50, maxHealth: 50, hitFlash: 0 },
      { id: 9102, kind: "wood", x: target.x - 230, y: target.y + 54, radius: 45, health: 50, maxHealth: 50, hitFlash: 0 },
    ];
    const zombie = spawn(game, "basic", target.x - 480, target.y);
    zombie.targetId = target.id;
    zombie.path = [{ x: target.x, y: target.y - 54 }];
    zombie.pathCooldown = 0;
    zombie.routeCommitment = 0;

    const update = game as unknown as { updateEnemies(dt: number): void };
    update.updateEnemies(BALANCE.fixedStep);
    expect(pathIntersectsObstacle(
      zombie,
      zombie.path.slice(zombie.pathIndex),
      game.world.resources,
      zombie.radius,
    )).toBe(false);

    const healthBefore = target.health;
    for (let frame = 0; frame < 720 && target.health === healthBefore; frame += 1) {
      update.updateEnemies(BALANCE.fixedStep);
    }
    expect(target.health).toBeLessThan(healthBefore);
    expect(zombie.forcedBlockerId).toBeFalsy();
  });

  it("attacks a genuinely blocking structure when no structure-safe route exists", () => {
    const game = createGame();
    const target = structure(9201, "harvester", game.flag.x + 430, game.flag.y);
    const blocker = structure(9202, "wall", game.flag.x + 115, game.flag.y);
    game.structures = [target, blocker];
    const zombie = spawn(
      game,
      "basic",
      blocker.x - blocker.radius - ENEMY_REGISTRY.basic.base.radius - 2,
      blocker.y,
    );
    zombie.targetId = target.id;
    const healthBefore = blocker.health;

    const update = game as unknown as { updateEnemies(dt: number): void };
    for (let frame = 0; frame < 180 && blocker.health === healthBefore; frame += 1) {
      update.updateEnemies(BALANCE.fixedStep);
    }

    expect(blocker.health).toBeLessThan(healthBefore);
    expect(target.health).toBe(target.maxHealth);
  });
});
