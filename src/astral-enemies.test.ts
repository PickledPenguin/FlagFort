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

function wall(id: number, x: number, y: number): Structure {
  return {
    id, kind: "wall", tier: "wood", x, y,
    radius: BALANCE.structure.radius.wall, health: 600, maxHealth: 600,
    cooldown: 0, angle: 0, lastArmAngle: 0, harvesterHitResourceIds: new Set(), flash: 0,
  };
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

  it("registers the staged Comet Slinger as a flag-line ranged attacker", () => {
    const definition = ENEMY_REGISTRY["comet-slinger"];

    expect(definition.assets.portrait).toBe("enemies/comet-slinger-zombie");
    expect(definition.render).toEqual({ aspectRatio: 120 / 106, width: 85, height: 75 });
    expect(definition.targeting).toMatchObject({ mode: "flag", attackRange: 470, innerRadius: 210 });
    expect(definition.projectile).toMatchObject({
      appearance: "comet",
      damageSource: "comet-slinger",
      pierces: true,
      targets: ["player", "wall", "door", "spikes", "harvester", "turret", "flag"],
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland"] as const) {
      expect(Object.values(selectEnemyRoster("staged-comet-slinger", tier)))
        .not.toContain("comet-slinger");
    }
  });

  it("drives a piercing comet through an aligned wall and into the flag", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["comet-slinger"];
    game.world.resources = [];
    const slinger = spawn(game, "comet-slinger", game.flag.x - 360, game.flag.y);
    const blocker = wall(1450, game.flag.x - 150, game.flag.y);
    game.structures = [blocker];

    (game as unknown as { selectEnemyTarget(enemy: Enemy): void }).selectEnemyTarget(slinger);
    expect(slinger.targetId).toBe("flag");

    (game as unknown as {
      enemyRangedAttack(enemy: Enemy, target: typeof game.flag, dt: number): void;
    }).enemyRangedAttack(slinger, game.flag, definition.attack.chargeSeconds);

    expect(game.projectiles.at(-1)).toMatchObject({
      sourceEnemyKind: "comet-slinger",
      damageSource: "comet-slinger",
      intendedTargetId: "flag",
      appearance: "comet",
      pierces: true,
    });
    (game as unknown as { updateProjectiles(dt: number): void }).updateProjectiles(0.7);

    expect(blocker.health).toBe(blocker.maxHealth - slinger.damage);
    expect(game.flag.health).toBe(game.flag.maxHealth - slinger.damage);
    expect(game.projectiles).toHaveLength(1);
    expect(game.particles.some((particle) => particle.color === "#b89cff")).toBe(true);
  });

  it("registers the staged Void Herald as a capped Rift Strider caller", () => {
    const definition = ENEMY_REGISTRY["void-herald"];

    expect(definition.assets.portrait).toBe("enemies/void-herald-zombie");
    expect(definition.render).toEqual({ aspectRatio: 122 / 112, width: 93, height: 85 });
    expect(definition.summon).toMatchObject({
      cooldown: 5.6,
      cappedRetryCooldown: 1.8,
      maximumLiving: 3,
      kinds: ["rift-strider"],
      particleColor: "#a878ff",
      popupText: "ASTRAL GATE",
    });
    expect(definition.rosterEligible).toBe(false);
    for (const tier of ["forest", "snowy", "desert", "volcanic", "wasteland"] as const) {
      expect(Object.values(selectEnemyRoster("staged-void-herald", tier)))
        .not.toContain("void-herald");
    }
  });

  it("opens capped Rift Strider gates without adding summons to wave accounting", () => {
    const game = gameFixture();
    const definition = ENEMY_REGISTRY["void-herald"];
    const herald = spawn(game, "void-herald", game.flag.x + 320, game.flag.y);
    herald.summonCooldown = 0;

    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(herald, BALANCE.fixedStep);

    const summoned = game.enemies.find((enemy) => enemy.summonedBy === herald.id);
    expect(summoned).toMatchObject({ kind: "rift-strider", countsTowardWave: false });
    expect(herald.summonCooldown).toBe(definition.summon!.cooldown);
    expect(game.particles.some((particle) => particle.color === "#a878ff")).toBe(true);
    expect(game.particles.some((particle) => particle.text === "ASTRAL GATE")).toBe(true);

    game.enemies = [
      herald,
      ...Array.from({ length: definition.summon!.maximumLiving }, (_, index) => ({
        ...summoned!,
        id: 1500 + index,
        summonedBy: herald.id,
        health: 1,
      })),
    ];
    herald.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(herald, BALANCE.fixedStep);

    expect(game.enemies).toHaveLength(definition.summon!.maximumLiving + 1);
    expect(herald.summonCooldown).toBe(definition.summon!.cappedRetryCooldown);
  });
});
