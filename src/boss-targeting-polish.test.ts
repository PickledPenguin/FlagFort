// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { campaignTier } from "./campaign";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { biomePopupColor } from "./popup-colors";
import type { Difficulty, Enemy, PlayerId, Structure } from "./types";

function gameFixture(difficulty: Difficulty = "normal", campaignTierId: "forest" | "snowy" = "forest"): Game {
  document.body.innerHTML = "<canvas></canvas>";
  const game = new Game(new Input(document.querySelector("canvas")!));
  game.startRun(difficulty, `polish-${difficulty}-${campaignTierId}`, [], true, {
    settle: false,
    campaignTierId,
  });
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
    id,
    kind: "wall",
    tier: "wood",
    x,
    y,
    radius: BALANCE.structure.radius.wall,
    health: 150,
    maxHealth: 150,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
  };
}

describe("base boss polish", () => {
  it("charges one Ground Slam and raises exactly ten basics after crossing half health", () => {
    const game = gameFixture();
    const boss = spawn(game, "boss", game.flag.x + 900, game.flag.y);
    const updateBoss = (game as unknown as { updateBoss(enemy: Enemy, dt: number): void }).updateBoss.bind(game);
    (game as unknown as {
      damageEnemy(enemy: Enemy, amount: number, color: string, source: "player-melee", ownerId: PlayerId): void;
    }).damageEnemy(boss, boss.maxHealth * 0.7, "#fff", "player-melee", game.player.id);

    expect(boss.bossHalfSummoned).toBe(true);
    updateBoss(boss, BALANCE.boss.slam.chargeDuration + 0.01);

    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id && enemy.kind === "basic"))
      .toHaveLength(BALANCE.boss.slam.reinforcementCount);
    expect(game.areaEffects.filter((effect) => effect.kind === "boss-slam")).toHaveLength(1);

    boss.health = boss.maxHealth * 0.1;
    updateBoss(boss, BALANCE.boss.slam.chargeDuration * 2);
    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id && enemy.kind === "basic"))
      .toHaveLength(BALANCE.boss.slam.reinforcementCount);
    expect(game.areaEffects.filter((effect) => effect.kind === "boss-slam")).toHaveLength(1);
  });

  it("hits a nearby player without abandoning its march toward the flag", () => {
    const game = gameFixture();
    const boss = spawn(game, "boss", game.flag.x - 250, game.flag.y);
    game.player.x = boss.x - 75;
    game.player.y = boss.y;
    boss.attackWindup = 0.99;
    boss.cooldown = 0;
    const xBefore = boss.x;
    const healthBefore = game.player.health;

    (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(0.1);

    expect(game.player.health).toBeLessThan(healthBefore);
    expect(boss.x).toBeGreaterThan(xBefore);
    expect(boss.targetId).toBe("flag");
  });

  it("makes both bosses meaningfully dangerous to structures", () => {
    expect(ENEMY_REGISTRY.boss.base.structureDamage).toBeGreaterThan(ENEMY_REGISTRY.boss.base.damage * 4);
    expect(ENEMY_REGISTRY["frost-warden"].base.structureDamage)
      .toBeGreaterThan(ENEMY_REGISTRY["frost-warden"].base.damage * 4);
  });
});

describe("boss difficulty scaling", () => {
  it.each(["easy", "normal", "hard", "extreme"] as const)("applies the %s boss curve to both bosses", (difficulty) => {
    const forest = gameFixture(difficulty);
    const boss = spawn(forest, "boss", forest.flag.x + 700, forest.flag.y);
    const snowy = gameFixture(difficulty, "snowy");
    const warden = spawn(snowy, "frost-warden", snowy.flag.x + 700, snowy.flag.y);
    const scaling = BALANCE.bossDifficulty[difficulty];
    const forestAdaptiveHealth = 1
      + (forest.adaptiveState.multiplier - 1) * BALANCE.adaptive.healthInfluence;
    const forestAdaptiveDamage = 1
      + (forest.adaptiveState.multiplier - 1) * BALANCE.adaptive.damageInfluence;

    expect(boss.maxHealth).toBeCloseTo(
      ENEMY_REGISTRY.boss.base.health * scaling.health * forestAdaptiveHealth,
    );
    expect(boss.damage).toBeCloseTo(
      ENEMY_REGISTRY.boss.base.damage * scaling.damage * forestAdaptiveDamage,
    );
    expect(boss.speed).toBeCloseTo(ENEMY_REGISTRY.boss.base.speed * scaling.speed);
    expect(boss.attackRate).toBeCloseTo(ENEMY_REGISTRY.boss.base.attackRate / scaling.attackSpeed);
    expect(warden.maxHealth).toBeLessThan(boss.maxHealth);
    expect(warden.maxHealth + warden.maxIceArmor!).toBeGreaterThan(boss.maxHealth);
  });
});

describe("Acidslinger obstruction targeting", () => {
  it("ignores nearby off-route walls and attacks only a wall blocking its flag route", () => {
    const game = gameFixture();
    const acid = spawn(game, "acidslinger", game.flag.x - 300, game.flag.y);
    game.player.x = acid.x;
    game.player.y = acid.y + 1000;
    const unrelated = wall(800, acid.x + 10, acid.y + 60);
    game.structures = [unrelated];
    const internals = game as unknown as {
      selectEnemyTarget(enemy: Enemy): void;
      firstBlockingStructure(enemy: Enemy, target: { x: number; y: number }): Structure | undefined;
      findAdjacentStuckBlocker(enemy: Enemy, target: { x: number; y: number }): Structure | undefined;
    };

    internals.selectEnemyTarget(acid);
    expect(acid.targetId).toBe("flag");
    expect(internals.firstBlockingStructure(acid, game.flag)).toBeUndefined();
    expect(internals.findAdjacentStuckBlocker(acid, game.flag)).toBeUndefined();

    const blocking = wall(801, acid.x + 70, acid.y);
    game.structures.push(blocking);
    expect(internals.firstBlockingStructure(acid, game.flag)?.id).toBe(blocking.id);

    game.structures = [unrelated];
    internals.selectEnemyTarget(acid);
    expect(acid.targetId).toBe("flag");
    expect(internals.firstBlockingStructure(acid, game.flag)).toBeUndefined();
  });
});

describe("biome popup contrast", () => {
  it("darkens light ordinary feedback while preserving semantic frost blue", () => {
    const contrast = campaignTier("snowy").biome.popupContrast;
    expect(biomePopupColor(
      "#aab0aa",
      contrast,
    )).not.toBe("#aab0aa");
    expect(biomePopupColor(
      BALANCE.snowyEnemies.slow.popupTextColor,
      contrast,
    )).toBe(BALANCE.snowyEnemies.slow.popupTextColor);
    expect(biomePopupColor(
      "#aab0aa",
      undefined,
    )).toBe("#aab0aa");
  });
});
