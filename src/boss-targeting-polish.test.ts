// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { CAMPAIGN_TIERS, campaignTier } from "./campaign";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Game } from "./game";
import { Input } from "./input";
import { biomePopupColor } from "./popup-colors";
import type { CampaignTierId, Difficulty, Enemy, PlayerId, Structure } from "./types";

function gameFixture(difficulty: Difficulty = "normal", campaignTierId: CampaignTierId = "forest"): Game {
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
    const slam = ENEMY_REGISTRY.boss.phaseSlam!;
    updateBoss(boss, slam.chargeDuration + 0.01);

    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id && enemy.kind === "basic"))
      .toHaveLength(slam.reinforcementCount);
    expect(game.areaEffects.filter((effect) => effect.kind === "boss-slam")).toHaveLength(1);

    boss.health = boss.maxHealth * 0.1;
    updateBoss(boss, slam.chargeDuration * 2);
    expect(game.enemies.filter((enemy) => enemy.summonedBy === boss.id && enemy.kind === "basic"))
      .toHaveLength(slam.reinforcementCount);
    expect(game.areaEffects.filter((effect) => effect.kind === "boss-slam")).toHaveLength(1);
  });

  it("dispatches the configured health phase without relying on the Forest boss identity", () => {
    const game = gameFixture("normal", "snowy");
    const warden = spawn(game, "frost-warden", game.flag.x + 900, game.flag.y);
    const inheritedSlam = ENEMY_REGISTRY.boss.phaseSlam!;
    ENEMY_REGISTRY["frost-warden"].phaseSlam = { ...inheritedSlam, reinforcementCount: 2 };

    try {
      warden.health = warden.maxHealth * inheritedSlam.triggerHealthRatio;
      const updateBoss = (game as unknown as {
        updateBoss(enemy: Enemy, dt: number): void;
      }).updateBoss.bind(game);
      updateBoss(warden, inheritedSlam.chargeDuration + 0.01);

      expect(game.enemies.filter((enemy) => enemy.summonedBy === warden.id))
        .toHaveLength(2);
      expect(game.areaEffects.at(-1)).toMatchObject({
        kind: inheritedSlam.areaEffect,
        radius: inheritedSlam.radius,
      });
    } finally {
      delete ENEMY_REGISTRY["frost-warden"].phaseSlam;
    }
  });

  it("makes every campaign boss hit an intercepting player without abandoning its flag march", () => {
    for (const tier of CAMPAIGN_TIERS) {
      const game = gameFixture("normal", tier.id);
      const boss = spawn(game, tier.boss, game.flag.x - 250, game.flag.y);
      game.player.x = boss.x - 75;
      game.player.y = boss.y;
      boss.attackWindup = 0.99;
      boss.cooldown = 0;
      const xBefore = boss.x;
      const healthBefore = game.player.health;

      (game as unknown as { updateEnemies(dt: number): void }).updateEnemies(0.1);

      expect(game.player.health, tier.id).toBeLessThan(healthBefore);
      expect(boss.x, tier.id).toBeGreaterThan(xBefore);
      expect(boss.targetId, tier.id).toBe("flag");
    }
  });

  it("makes both bosses meaningfully dangerous to structures", () => {
    for (const tier of CAMPAIGN_TIERS) {
      const definition = ENEMY_REGISTRY[tier.boss];
      expect(definition.base.structureDamage, tier.id)
        .toBeGreaterThan(definition.base.damage * 4);
    }
  });

  it("keeps every half-health slam one-shot and unable to damage the flag", () => {
    for (const tier of CAMPAIGN_TIERS) {
      const definition = ENEMY_REGISTRY[tier.boss];
      const slam = definition.phaseSlam;
      if (!slam) continue;
      const game = gameFixture("normal", tier.id);
      const boss = spawn(game, tier.boss, game.flag.x + 80, game.flag.y);
      const flagHealth = game.flag.health;
      boss.health = boss.maxHealth * slam.triggerHealthRatio;
      const updateBoss = (game as unknown as {
        updateBoss(enemy: Enemy, dt: number): void;
      }).updateBoss.bind(game);

      updateBoss(boss, slam.chargeDuration + 0.01);
      updateBoss(boss, slam.chargeDuration * 2);

      expect(game.flag.health, tier.id).toBe(flagHealth);
      expect(game.areaEffects.filter((effect) => effect.kind === slam.areaEffect), tier.id)
        .toHaveLength(1);
    }
  });
});

describe("boss difficulty scaling", () => {
  it.each(["easy", "normal", "hard", "extreme"] as const)("applies the %s boss curve to every campaign boss", (difficulty) => {
    const scaling = BALANCE.bossDifficulty[difficulty];
    for (const tier of CAMPAIGN_TIERS) {
      const game = gameFixture(difficulty, tier.id);
      const boss = spawn(game, tier.boss, game.flag.x + 700, game.flag.y);
      const base = ENEMY_REGISTRY[tier.boss].base;
      const adaptiveHealth = 1
        + (game.adaptiveState.multiplier - 1) * BALANCE.adaptive.healthInfluence;
      const adaptiveDamage = 1
        + (game.adaptiveState.multiplier - 1) * BALANCE.adaptive.damageInfluence;

      expect(boss.maxHealth, tier.id).toBeCloseTo(base.health * scaling.health * adaptiveHealth);
      expect(boss.damage, tier.id).toBeCloseTo(base.damage * scaling.damage * adaptiveDamage);
      expect(boss.structureDamage, tier.id)
        .toBeCloseTo(base.structureDamage * scaling.damage * adaptiveDamage);
      expect(boss.speed, tier.id).toBeCloseTo(base.speed * scaling.speed);
      expect(boss.attackRate, tier.id).toBeCloseTo(base.attackRate / scaling.attackSpeed);
    }
  });

  it.each(["easy", "normal", "hard", "extreme"] as const)("applies the %s enemy curve to every campaign special", (difficulty) => {
    const scaling = BALANCE.difficulty[difficulty];
    for (const tier of CAMPAIGN_TIERS) {
      const game = gameFixture(difficulty, tier.id);
      const adaptiveHealth = 1
        + (game.adaptiveState.multiplier - 1) * BALANCE.adaptive.healthInfluence;
      const adaptiveDamage = 1
        + (game.adaptiveState.multiplier - 1) * BALANCE.adaptive.damageInfluence;
      for (const kind of tier.specialEnemies) {
        const enemy = spawn(game, kind, game.flag.x + 700, game.flag.y);
        const base = ENEMY_REGISTRY[kind].base;

        expect(enemy.maxHealth, kind).toBeCloseTo(base.health * scaling.enemyHealth * adaptiveHealth);
        expect(enemy.damage, kind).toBeCloseTo(base.damage * scaling.enemyDamage * adaptiveDamage);
        expect(enemy.structureDamage, kind)
          .toBeCloseTo(base.structureDamage * scaling.enemyDamage * adaptiveDamage);
        expect(enemy.speed, kind).toBeCloseTo(base.speed * scaling.enemySpeed);
        expect(enemy.attackRate, kind).toBeCloseTo(base.attackRate / scaling.attackSpeed);
      }
    }
  });
});

describe("route-aware ranged obstruction targeting", () => {
  it.each(["acidslinger", "sandstormer"] as const)(
    "%s ignores nearby off-route walls and attacks only a wall blocking its flag route",
    (kind) => {
      const game = gameFixture();
      const enemy = spawn(game, kind, game.flag.x - 300, game.flag.y);
      game.player.x = enemy.x;
      game.player.y = enemy.y + 1000;
      const unrelated = wall(800, enemy.x + 10, enemy.y + 60);
      game.structures = [unrelated];
      const internals = game as unknown as {
        selectEnemyTarget(enemy: Enemy): void;
        firstBlockingStructure(enemy: Enemy, target: { x: number; y: number }): Structure | undefined;
        findAdjacentStuckBlocker(enemy: Enemy, target: { x: number; y: number }): Structure | undefined;
      };

      internals.selectEnemyTarget(enemy);
      expect(enemy.targetId).toBe("flag");
      expect(internals.firstBlockingStructure(enemy, game.flag)).toBeUndefined();
      expect(internals.findAdjacentStuckBlocker(enemy, game.flag)).toBeUndefined();

      const blocking = wall(801, enemy.x + 70, enemy.y);
      game.structures.push(blocking);
      expect(internals.firstBlockingStructure(enemy, game.flag)?.id).toBe(blocking.id);

      game.structures = [unrelated];
      internals.selectEnemyTarget(enemy);
      expect(enemy.targetId).toBe("flag");
      expect(internals.firstBlockingStructure(enemy, game.flag)).toBeUndefined();
    },
  );
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
