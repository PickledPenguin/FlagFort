// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { ENEMY_REGISTRY, selectEnemyRoster } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
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

describe("staged volcanic enemies", () => {
  it("keeps Cinderburst staged while defining its complete production behavior", () => {
    const definition = ENEMY_REGISTRY.cinderburst;
    expect(definition.assets.portrait).toBe("enemies/cinderburst-zombie");
    expect(definition.render).toMatchObject({ aspectRatio: 108 / 100, width: 81, height: 75 });
    expect(definition.death).toMatchObject({
      mode: "burst",
      burstDamageSource: "cinderburst-burst",
      burstWaveSprite: "effects/cinderburst-wave",
      popupText: "CINDER BLAST",
    });
    expect(definition.rosterEligible).toBe(false);
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
});
