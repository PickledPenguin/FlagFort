// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY } from "./enemy-registry";
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
});
