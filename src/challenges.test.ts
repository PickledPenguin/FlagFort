import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import {
  CHALLENGES,
  challengeXpBonusPercent,
  DEFAULT_CHALLENGE_MODIFIERS,
  resolveChallengeModifiers,
} from "./challenges";
import { challengeIcon } from "./challenge-icons";
import { Game } from "./game";
import { Input } from "./input";
import type { Enemy, Portal, StructureKind, Tier } from "./types";
import { generateWorld } from "./world";

function input(): Input {
  return {
    mouse: { x: 640, y: 360 },
    mouseDown: false,
    pressed: false,
    escapePressed: false,
    numberPressed: 0,
    keys: new Set<string>(),
    endFrame: () => undefined,
    releasePointer: () => undefined,
  } as unknown as Input;
}

function privateGame(game: Game): {
  beginDawn(): void;
  beginNight(): void;
  endRun(victory: boolean, reason: string): void;
  rollEnemyKind(): Enemy["kind"];
  spawnEnemy(portal: Portal, kind: Enemy["kind"]): void;
  spawnPortals(playSpawnSound?: boolean): void;
  structureMaxHealth(kind: StructureKind, tier: Tier): number;
} {
  return game as unknown as ReturnType<typeof privateGame>;
}

describe("challenge configuration", () => {
  it("defines exactly 12 concise accessible-card challenges with shared SVG icons", () => {
    expect(CHALLENGES).toHaveLength(12);
    expect(new Set(CHALLENGES.map((challenge) => challenge.id)).size).toBe(12);
    for (const challenge of CHALLENGES) {
      expect(challenge.description).not.toContain("\n");
      expect(challengeIcon(challenge.icon)).toContain('class="challenge-icon"');
      expect(challengeIcon(challenge.icon)).toContain(`./images/challenges/${challenge.icon}.svg`);
      expect(challenge.nightDuration).toBe(BALANCE.nightDuration);
    }
  });

  it("keeps challenge XP in the requested balance and display order", () => {
    expect(CHALLENGES.map(({ title, xpBonusPercent }) => [title, xpBonusPercent])).toEqual([
      ["Expensive Construction", 5],
      ["Resource Drought", 10],
      ["Short Days", 10],
      ["Horde Night", 10],
      ["Elite Invasion", 10],
      ["Mortal Defender", 15],
      ["Portal Swarm", 15],
      ["Glass Defenses", 15],
      ["Accelerated Horde", 20],
      ["Fragile Flag", 20],
      ["No Repairs", 20],
      ["Heavy Horde", 25],
    ]);
    expect(challengeXpBonusPercent(CHALLENGES.map((challenge) => challenge.id))).toBe(175);
    expect(challengeXpBonusPercent(["heavy-horde", "heavy-horde", "unknown"])).toBe(25);
  });

  it.each([
    ["short-days", "dayDurationMultiplier", 0.5],
    ["resource-drought", "resourceNodeMultiplier", 0.5],
    ["expensive-construction", "constructionCostMultiplier", 1.5],
    ["no-repairs", "disablesStructureRepair", true],
    ["glass-defenses", "structureHealthMultiplier", 0.5],
    ["fragile-flag", "flagHealthMultiplier", 0.5],
    ["mortal-defender", "disablesPlayerHealing", true],
    ["portal-swarm", "portalCountMultiplier", 2],
    ["horde-night", "ordinaryZombieCountMultiplier", 1.5],
    ["elite-invasion", "specialZombieWeightMultiplier", 2],
    ["accelerated-horde", "enemySpeedMultiplier", 1.25],
    ["heavy-horde", "enemyHealthMultiplier", 1.5],
  ] as const)("applies %s independently", (id, key, expected) => {
    const modifiers = resolveChallengeModifiers([id]);
    expect(modifiers[key]).toBe(expected);
    for (const [otherKey, defaultValue] of Object.entries(DEFAULT_CHALLENGE_MODIFIERS)) {
      if (otherKey === key) continue;
      const challenge = CHALLENGES.find((candidate) => candidate.id === id)!;
      const explicitlyChanged = Object.hasOwn(challenge.modifiers, otherKey);
      if (!explicitlyChanged) {
        expect(modifiers[otherKey as keyof typeof modifiers]).toBe(defaultValue);
      }
    }
  });

  it("combines all 12 once without hidden overrides or duplicate multiplication", () => {
    const ids = CHALLENGES.map((challenge) => challenge.id);
    expect(resolveChallengeModifiers([...ids, ...ids])).toEqual({
      dayDurationMultiplier: 0.5,
      resourceNodeMultiplier: 0.5,
      constructionCostMultiplier: 1.5,
      structureHealthMultiplier: 0.5,
      flagHealthMultiplier: 0.5,
      portalCountMultiplier: 2,
      ordinaryZombieCountMultiplier: 1.5,
      specialZombieWeightMultiplier: 2,
      enemySpeedMultiplier: 1.25,
      enemyAttackSpeedMultiplier: 1.25,
      enemyHealthMultiplier: 1.5,
      enemyDamageMultiplier: 1.25,
      disablesStructureRepair: true,
      disablesFlagHealthUpgrades: true,
      disablesPlayerHealing: true,
      disablesDawnPlayerHealing: true,
    });
  });

  it("keeps resource drought seeded and preserves at least one node of every resource", () => {
    const first = generateWorld("drought-seed", 0.5);
    const second = generateWorld("drought-seed", 0.5);
    expect(first.resources).toEqual(second.resources);
    for (const kind of ["wood", "stone", "gold", "diamond"] as const) {
      const count = first.resources.filter((node) => node.kind === kind).length;
      expect(count).toBe(Math.max(1, Math.floor(BALANCE.resource.counts[kind] * 0.5)));
    }
  });
});

describe("challenge gameplay effects", () => {
  it("starts an all-challenges run with reflected timer, world, portals, costs, and health", () => {
    const game = new Game(input());
    game.startRun("normal", "all-challenges", CHALLENGES.map((challenge) => challenge.id));
    expect(game.timer).toBe(30);
    expect(game.flag.maxHealth).toBe(75);
    expect(game.portals).toHaveLength(4);
    expect(game.getTierCost("wall", "wood").wood).toBe(15);
    expect(privateGame(game).structureMaxHealth("wall", "wood")).toBe(75);
    expect(game.getChallengeModifiers().disablesStructureRepair).toBe(true);
  });

  it("doubles late-run portals without bypassing placement restrictions", () => {
    const game = new Game(input());
    game.startRun("normal", "portal-swarm", ["portal-swarm"]);
    game.night = 7;
    game.portals = [];
    privateGame(game).spawnPortals(false);
    expect(game.portals).toHaveLength(8);
    for (const portal of game.portals) {
      expect(Math.hypot(portal.x - game.flag.x, portal.y - game.flag.y))
        .toBeGreaterThanOrEqual(BALANCE.flagGenerationRadius);
      for (const other of game.portals) {
        if (portal === other) continue;
        expect(Math.hypot(portal.x - other.x, portal.y - other.y))
          .toBeGreaterThanOrEqual(BALANCE.portal.noBuildRadius * 2);
      }
    }
  });

  it("disables both healing paths and flag maximum-health benefits", () => {
    const game = new Game(input());
    game.startRun("normal", "mortal", ["mortal-defender", "fragile-flag"]);
    game.player.health = 25;
    game.player.x = game.flag.x;
    game.player.y = game.flag.y;
    game.update(1);
    expect(game.player.health).toBe(25);
    privateGame(game).beginDawn();
    expect(game.player.health).toBe(25);

    game.choices = [{
      id: "flagHealth",
      name: "Sturdy Standard",
      description: "Maximum health",
      mutationId: "health",
      mutationName: "Thick Skulls",
      mutationDescription: "More health",
      kind: "upgrade",
    }];
    const before = game.flag.maxHealth;
    game.chooseDawn(0);
    expect(game.flag.maxHealth).toBe(before);
    expect(game.upgrades.flagHealth).toBe(0);
  });

  it("scales horde count, movement, attack speed, health, and damage independently", () => {
    const baseline = new Game(input());
    baseline.startRun("normal", "horde-scaling");
    const accelerated = new Game(input());
    accelerated.startRun("normal", "horde-scaling", [
      "horde-night",
      "accelerated-horde",
      "heavy-horde",
    ]);

    privateGame(baseline).beginNight();
    privateGame(accelerated).beginNight();
    const baselineWave = baseline.portals.reduce((sum, portal) => sum + portal.assignedSpawns, 0);
    const challengeWave = accelerated.portals.reduce((sum, portal) => sum + portal.assignedSpawns, 0);
    expect(challengeWave).toBe(Math.round(baselineWave * 1.5));

    privateGame(baseline).spawnEnemy(baseline.portals[0]!, "basic");
    privateGame(accelerated).spawnEnemy(accelerated.portals[0]!, "basic");
    const ordinary = baseline.enemies.at(-1)!;
    const modified = accelerated.enemies.at(-1)!;
    expect(modified.speed / ordinary.speed).toBeCloseTo(1.25);
    expect(ordinary.attackRate / modified.attackRate).toBeCloseTo(1.25);
    expect(modified.maxHealth / ordinary.maxHealth).toBeCloseTo(1.5);
    expect(modified.damage / ordinary.damage).toBeCloseTo(1.25);
    expect(modified.structureDamage / ordinary.structureDamage).toBeCloseTo(1.25);
  });

  it("keeps elite zombies behind their introduction nights", () => {
    const game = new Game(input());
    game.startRun("normal", "elite-restrictions", ["elite-invasion"]);
    game.night = 1;
    expect(Array.from({ length: 100 }, () => privateGame(game).rollEnemyKind()))
      .toEqual(Array(100).fill("basic"));
  });

  it("records the complete challenge configuration in the run summary record", () => {
    const game = new Game(input());
    const ids = CHALLENGES.map((challenge) => challenge.id);
    game.startRun("normal", "record-challenges", ids);
    privateGame(game).endRun(false, "Test");
    expect(game.records[0]?.challengeIds).toEqual(ids);
  });
});
