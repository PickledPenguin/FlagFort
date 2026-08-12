import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { generateChoiceOfferings, mutationText } from "./choices";
import { ENEMY_REGISTRY, introducedRosterEnemies } from "./enemy-registry";
import { Game } from "./game";
import type { Input } from "./input";
import { NavigationGrid, pathIntersectsObstacle } from "./pathfinding";
import {
  applyMutation,
  applyUpgrade,
  canUnlock,
  createMutations,
  createUnlocks,
  createUpgrades,
  cumulativeCost,
  dismantleRefund,
  proportionalRepairCost,
  flagRepairPayment,
  upgradeCost,
} from "./rules";
import type { Enemy, Structure } from "./types";
import { generateWorld } from "./world";

function fakeInput(): Input {
  const input = {
    keys: new Set(),
    mouse: { x: 640, y: 360 },
    mouseDown: false,
    pressed: false,
    escapePressed: false,
    numberPressed: 0,
    endFrame() {
      input.pressed = false;
      input.escapePressed = false;
      input.numberPressed = 0;
    },
    releasePointer() {
      input.mouseDown = false;
      input.pressed = false;
    },
  };
  return input as unknown as Input;
}

function testStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 500,
    kind: "wall",
    tier: "wood",
    x: BALANCE.mapSize / 2 + 100,
    y: BALANCE.mapSize / 2 + 120,
    radius: BALANCE.structure.radius.wall,
    health: 75,
    maxHealth: 150,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
    ...overrides,
  };
}

function testEnemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 700,
    kind: "basic",
    x: BALANCE.mapSize / 2 + 400,
    y: BALANCE.mapSize / 2,
    radius: 23,
    health: 200,
    maxHealth: 200,
    speed: 0,
    damage: 0,
    structureDamage: 0,
    attackRate: 1,
    cooldown: 0,
    attackWindup: 0,
    targetId: "flag",
    scanCooldown: 2,
    pathCooldown: 2,
    path: [],
    pathIndex: 0,
    flash: 0,
    summonCooldown: 10,
    jumpCooldown: 0,
    jumpTime: 0,
    bossSmashWindup: 0,
    bossHalfSummoned: true,
    acidCooldown: 10,
    acidWindup: 0,
    acidAimAngle: 0,
    burning: false,
    sunlightExposure: 0,
    sunlightEffectCooldown: 0,
    deathCounted: false,
    stuckTime: 0,
    routeCommitment: 0,
    routeIncludesStructures: false,
    routeStructureRevision: 0,
    jumpElapsed: 0,
    jumpStartX: 0,
    jumpStartY: 0,
    jumpEndX: 0,
    jumpEndY: 0,
    ...overrides,
  };
}

describe("seeded generation", () => {
  it("produces identical worlds for the same seed", () => {
    expect(generateWorld("oak-123")).toEqual(generateWorld("oak-123"));
  });

  it("produces meaningful differences for different seeds", () => {
    const a = generateWorld("oak-123");
    const b = generateWorld("pine-987");
    expect(a.resources.slice(0, 12)).not.toEqual(b.resources.slice(0, 12));
    expect(a.clearings).not.toEqual(b.clearings);
  });

  it("validates portal routes and safe gaps for ordinary zombie navigation", () => {
    const world = generateWorld("validated-forest");
    expect(world.navigation.valid).toBe(true);
    expect(world.navigation.routes).toHaveLength(8);
    expect(world.navigation.routes.every((route) => route.length > 0)).toBe(true);
    for (let index = 0; index < world.resources.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < world.resources.length; otherIndex += 1) {
        const a = world.resources[index]!;
        const b = world.resources[otherIndex]!;
        const boundaryGap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
        expect(boundaryGap).toBeGreaterThanOrEqual(BALANCE.resource.minimumBoundarySeparation - 0.001);
      }
    }
  });

  it("produces identical choice offerings for the same run state", () => {
    const unlocks = createUnlocks();
    const upgrades = createUpgrades();
    const mutations = createMutations();
    const a = generateChoiceOfferings("choice-seed", 3, 1, unlocks, upgrades, mutations);
    const b = generateChoiceOfferings("choice-seed", 3, 1, unlocks, upgrades, mutations);
    expect(a).toEqual(b);
  });

  it("names the exact mutation target and stat", () => {
    expect(mutationText("basicWeight", 0)).toBe("Basic zombie spawn weight +12.");
    expect(mutationText("waveSize", 3)).toBe("Each portal wave size +6 zombies.");
    expect(mutationText("health", 0.12)).toBe("All zombies health +24%.");
    expect(mutationText("damage", 0)).toBe("All zombies player damage +10%.");
    expect(mutationText("structureDamage", 0)).toBe("All zombies structure damage +12%.");
  });
});

describe("structure economy", () => {
  it("uses cumulative structure costs", () => {
    expect(cumulativeCost("wall", "gold")).toEqual({ wood: 10, stone: 7, gold: 5, diamond: 0 });
    expect(cumulativeCost("door", "stone")).toEqual({ wood: 20, stone: 14, gold: 0, diamond: 0 });
  });

  it("charges only the difference when upgrading", () => {
    expect(upgradeCost("turret", "stone", "diamond")).toEqual({ wood: 0, stone: 0, gold: 16, diamond: 10 });
  });

  it("returns a consistently rounded refund from actual invested resources", () => {
    expect(dismantleRefund(
      { wood: 14, stone: 9, gold: 7, diamond: 4 },
      0.25,
    )).toEqual({ wood: 3, stone: 2, gold: 1, diamond: 1 });
  });

  it("clamps structure cost reduction at sixty percent", () => {
    expect(cumulativeCost("wall", "wood", 9)).toEqual({ wood: 4, stone: 0, gold: 0, diamond: 0 });
  });

  it("calculates proportional cumulative repair costs", () => {
    expect(proportionalRepairCost("wall", "gold", 75, 100)).toEqual({
      wood: 3,
      stone: 2,
      gold: 2,
      diamond: 0,
    });
    expect(proportionalRepairCost("door", "stone", 0, 100)).toEqual({
      wood: 20,
      stone: 14,
      gold: 0,
      diamond: 0,
    });
    expect(proportionalRepairCost("wall", "gold", 100, 100)).toEqual({
      wood: 0,
      stone: 0,
      gold: 0,
      diamond: 0,
    });
  });

  it("repairs a structure to full only when the complete cost is affordable", () => {
    const input = fakeInput();
    const game = new Game(input);
    game.startRun("normal", "repair-seed");
    const structure = testStructure();
    game.structures.push(structure);
    game.selectSlot(2);
    game.resources = { wood: 0, stone: 0, gold: 0, diamond: 0 };
    input.mouse = { x: 740, y: 480 };
    input.mouseDown = true;
    input.pressed = true;
    game.update(0.02);
    expect(structure.health).toBe(75);
    expect(game.resources.wood).toBe(0);

    game.resources.wood = 10;
    input.mouseDown = true;
    input.pressed = true;
    game.update(0.02);
    expect(structure.health).toBe(structure.maxHealth);
    expect(game.resources.wood).toBe(5);
  });

  it("recycles only the selected structure and returns the existing refund", () => {
    const input = fakeInput();
    const game = new Game(input);
    game.startRun("normal", "recycle-seed");
    game.structures.push(testStructure());
    game.selectSlot(3);
    input.mouse = { x: 740, y: 480 };
    input.mouseDown = true;
    input.pressed = true;
    game.update(0.02);
    expect(game.structures).toHaveLength(0);
    expect(game.resources).toEqual({ wood: 1, stone: 0, gold: 0, diamond: 0 });
  });
});

describe("repairs, unlocks, upgrades, and mutations", () => {
  it("uses the flag repair resource priority", () => {
    expect(flagRepairPayment({ wood: 80, stone: 40, gold: 20, diamond: 1 })).toEqual({ diamond: 1 });
    expect(flagRepairPayment({ wood: 80, stone: 40, gold: 2, diamond: 0 })).toEqual({ gold: 2 });
    expect(flagRepairPayment({ wood: 80, stone: 4, gold: 1, diamond: 0 })).toEqual({ stone: 4 });
    expect(flagRepairPayment({ wood: 8, stone: 3, gold: 1, diamond: 0 })).toEqual({ wood: 8 });
  });

  it("enforces unlock prerequisites", () => {
    const unlocks = createUnlocks();
    expect(canUnlock("gloves:stone", unlocks)).toBe(true);
    expect(canUnlock("gloves:gold", unlocks)).toBe(false);
    expect(canUnlock("wall:gold", unlocks)).toBe(true);
    expect(canUnlock("wall:diamond", unlocks)).toBe(false);
  });

  it("stacks upgrades and clamps cost reduction", () => {
    const upgrades = createUpgrades();
    applyUpgrade(upgrades, "punchDamage");
    applyUpgrade(upgrades, "punchDamage");
    expect(upgrades.punchDamage).toBe(BALANCE.upgrades.punchDamage.amount * 2);
    for (let i = 0; i < 20; i += 1) applyUpgrade(upgrades, "costReduction");
    expect(upgrades.costReduction).toBe(BALANCE.upgradeCaps.costReduction);
  });

  it("stacks mutations", () => {
    const mutations = createMutations();
    applyMutation(mutations, "damage");
    applyMutation(mutations, "damage");
    expect(mutations.damage).toBeCloseTo(BALANCE.mutations.damage.amount * 2);
  });

  it("does not offer special-zombie mutations before introduction", () => {
    for (let screen = 0; screen < 3; screen += 1) {
      const choices = generateChoiceOfferings(
        `early-${screen}`,
        1,
        screen,
        createUnlocks(),
        createUpgrades(),
        createMutations(),
      );
      expect(choices.every((choice) =>
        !["runnerWeight", "breakerWeight", "jumperWeight", "summonerWeight"].includes(choice.mutationId))).toBe(true);
    }
  });
});

describe("resource obstacle navigation", () => {
  it("routes around a resource directly between an enemy and its goal", () => {
    const obstacle = { x: 500, y: 500, radius: 48 };
    const start = { x: 260, y: 500 };
    const goal = { x: 760, y: 500 };
    const navigation = new NavigationGrid([obstacle], 23);
    const path = navigation.find(start, goal);
    expect(path.length).toBeGreaterThan(1);
    expect(pathIntersectsObstacle(start, path, [obstacle], 23)).toBe(false);
  });

  it("routes different zombie radii through dense clusters and narrow passages", () => {
    const obstacles = [
      { x: 460, y: 360, radius: 44 },
      { x: 460, y: 470, radius: 34 },
      { x: 460, y: 650, radius: 44 },
      { x: 580, y: 430, radius: 38 },
      { x: 580, y: 650, radius: 38 },
    ];
    for (const radius of [20, 23, 29]) {
      const start = { x: 250, y: 540 };
      const goal = { x: 820, y: 540 };
      const path = new NavigationGrid(obstacles, radius).find(start, goal);
      expect(path.length).toBeGreaterThan(0);
      expect(pathIntersectsObstacle(start, path, obstacles, radius)).toBe(false);
    }
  });

  it("treats depleted resource nodes as unchanged static obstacles", () => {
    const depleted = { x: 500, y: 500, radius: 42, health: 0, maxHealth: 18 };
    const start = { x: 300, y: 500 };
    const goal = { x: 700, y: 500 };
    const path = new NavigationGrid([depleted], 20).find(start, goal);
    expect(pathIntersectsObstacle(start, path, [depleted], 20)).toBe(false);
  });

  it("routes to a constructed blocker positioned beside a resource", () => {
    const resource = { x: 500, y: 500, radius: 46 };
    const start = { x: 280, y: 500 };
    const wallTarget = { x: 610, y: 570 };
    const path = new NavigationGrid([resource], 23).find(start, wallTarget);
    expect(path.length).toBeGreaterThan(0);
    expect(pathIntersectsObstacle(start, path, [resource], 23)).toBe(false);
  });

  it("routes to a local turret target on the opposite side of a resource", () => {
    const resource = { x: 520, y: 520, radius: 50 };
    const start = { x: 270, y: 470 };
    const turretTarget = { x: 770, y: 560 };
    const path = new NavigationGrid([resource], 29).find(start, turretTarget);
    expect(path.length).toBeGreaterThan(0);
    expect(pathIntersectsObstacle(start, path, [resource], 29)).toBe(false);
  });
});

describe("phase and run rules", () => {
  it("keeps difficulty modifiers distinct without changing phase durations", () => {
    const difficulties = Object.values(BALANCE.difficulty);
    expect(new Set(difficulties.map((value) => value.enemyHealth)).size).toBe(4);
    expect(BALANCE.dayDuration).toBe(60);
    expect(BALANCE.nightDuration).toBe(30);
  });

  it("transitions from day to night only when the countdown reaches zero", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "phase-seed");
    game.timer = 0.01;
    game.update(0.02);
    expect(game.phase).toBe("night");
    expect(game.timer).toBe(30);
  });

  it("replenishes every resource node at dawn", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "dawn-seed");
    (game as unknown as { beginNight(): void }).beginNight();
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.enemies = [];
    game.timer = 0.01;
    game.world.resources[0]!.health = 0;
    game.world.resources[1]!.health = 1;
    game.update(0.02);
    expect(game.phase).toBe("dawn");
    expect(game.world.resources.every((node) => node.health === node.maxHealth)).toBe(true);
  });

  it("blocks building inside a portal safety zone", () => {
    const input = fakeInput();
    const game = new Game(input);
    game.startRun("normal", "portal-zone-seed");
    game.player.x += 500;
    game.camera.x = game.player.x;
    const portal = game.portals[0]!;
    portal.x = game.player.x + 150;
    portal.y = game.player.y;
    input.mouse = { x: 790, y: 480 };
    game.resources.wood = 100;
    game.selectSlot(4);
    game.update(0.02);
    expect(game.buildPreview?.valid).toBe(false);
    expect(game.buildPreview?.reason).toBe("Portal no-build zone");
  });

  it("starts dawn upgrades at zero while keeping daytime combat until every zombie is killed", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "sunlight-state-seed");
    (game as unknown as { beginNight(): void }).beginNight();
    const enemy = testEnemy();
    game.enemies = [enemy];
    game.timer = 0.01;
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.update(0.02);
    expect(game.phase).toBe("dawn");
    expect(game.isCombatMode()).toBe(true);
    expect(game.choices).toHaveLength(3);

    for (let screen = 0; screen < 3; screen += 1) game.chooseDawn(0);
    if (game.enemyWarning) game.dismissEnemyWarning();
    expect(game.phase).toBe("day");
    expect(game.isCombatMode()).toBe(true);
    expect(enemy.burning).toBe(true);
    const healthBeforeSunlight = enemy.health;
    game.update(1);
    expect(enemy.health).toBeLessThan(healthBeforeSunlight);

    enemy.health = 0;
    game.update(0.02);
    expect(game.phase).toBe("day");
    expect(game.isCombatMode()).toBe(false);
  });

  it("stops spawning queued ordinary zombies when the normal night clock ends", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "zero-clock-spawn-seed");
    game.phase = "night";
    game.timer = 0;
    game.phaseElapsed = BALANCE.nightSpawnCutoff;
    const portal = game.portals[0]!;
    portal.assignedSpawns = 5;
    portal.spawned = 1;
    portal.spawnCooldown = 0;
    game.update(0.02);
    expect(portal.spawned).toBe(1);
    expect(game.phase).toBe("dawn");
  });

  it("stops scheduled portal spawning after the first 15 seconds", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "front-loaded-spawns");
    game.phase = "night";
    game.timer = 30;
    game.phaseElapsed = BALANCE.nightSpawnCutoff;
    const portal = game.portals[0]!;
    portal.assignedSpawns = 8;
    portal.spawned = 2;
    portal.spawnCooldown = 0;
    game.update(0.02);
    expect(portal.spawned).toBe(portal.assignedSpawns);
  });

  it("lets an acid projectile pierce and damage each player-built target once", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "acid-pierce");
    game.phase = "night";
    game.timer = 20;
    game.player.x += 500;
    game.camera.x = game.player.x;
    const wall = testStructure({
      id: 508,
      x: game.player.x + 50,
      y: game.player.y,
      health: 150,
      maxHealth: 150,
    });
    game.structures = [wall];
    game.projectiles.push({
      id: 9008,
      owner: "boss-acid",
      x: game.player.x - 100,
      y: game.player.y,
      previousX: game.player.x - 100,
      previousY: game.player.y,
      vx: 1000,
      vy: 0,
      radius: BALANCE.boss.acidRadius,
      damage: BALANCE.boss.acidDamage,
      rangeLeft: 900,
      lifetime: 2,
      hitIds: new Set(),
      color: "#b8ff3d",
    });
    game.update(0.2);
    expect(game.player.health).toBe(game.player.maxHealth - BALANCE.boss.acidDamage);
    expect(wall.health).toBe(150 - BALANCE.boss.acidDamage);
    const playerHealth = game.player.health;
    const wallHealth = wall.health;
    game.update(0.02);
    expect(game.player.health).toBe(playerHealth);
    expect(wall.health).toBe(wallHealth);
    expect(game.projectiles[0]?.hitIds).toEqual(new Set(["player", wall.id]));
  });

  it("lets the player pass through a door while zombies still damage it as a blocker", () => {
    const input = fakeInput();
    const game = new Game(input);
    game.startRun("normal", "player-only-door");
    const door = testStructure({
      id: 509,
      kind: "door",
      x: game.player.x + 60,
      y: game.player.y,
      radius: BALANCE.structure.radius.door,
      health: 125,
      maxHealth: 125,
    });
    game.structures = [door];
    input.keys.add("KeyD");
    game.update(0.5);
    expect(game.player.x).toBeGreaterThan(door.x + door.radius);
    input.keys.clear();

    const zombie = testEnemy({
      id: 709,
      x: door.x + door.radius + 23,
      y: door.y,
      speed: 0,
      structureDamage: 12,
      scanCooldown: 0,
    });
    game.phase = "night";
    game.timer = 20;
    game.enemies = [zombie];
    const doorHealth = door.health;
    game.update(0.4);
    expect(door.health).toBeLessThan(doorHealth);
  });

  it("lets melee zombies complete attacks at normal frame intervals", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "melee-flag-attack");
    game.phase = "night";
    game.timer = 20;
    const zombie = testEnemy({
      x: game.flag.x + game.flag.radius + BALANCE.enemy.basic.radius,
      y: game.flag.y,
      damage: BALANCE.enemy.basic.damage,
      scanCooldown: 0,
    });
    game.enemies = [zombie];
    const flagHealth = game.flag.health;

    for (let frame = 0; frame < 120; frame += 1) game.update(1 / 60);

    expect(game.flag.health).toBeLessThan(flagHealth);
  });

  it("schedules every introduced special zombie in each wave", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "special-wave-coverage");
    game.night = 7;
    (game as unknown as { beginNight(): void }).beginNight();
    const scheduledKinds = new Set(game.getWaveForecast().map((entry) => entry.kind));
    const introducedSpecials = introducedRosterEnemies(game.enemyRoster, game.night)
      .filter((kind) => kind !== "basic");

    for (const kind of introducedSpecials) expect(scheduledKinds).toContain(kind);
  });

  it("never lets a jumper attack a blocking wall while its jump is cooling down", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "jumper-obstacle");
    game.phase = "night";
    game.timer = 20;
    const wall = testStructure({
      id: 510,
      x: game.flag.x + 100,
      y: game.flag.y,
      health: 150,
      maxHealth: 150,
    });
    const jumper = testEnemy({
      id: 710,
      kind: "jumper",
      x: wall.x + wall.radius + BALANCE.enemy.jumper.radius + 2,
      y: wall.y,
      radius: BALANCE.enemy.jumper.radius,
      speed: BALANCE.enemy.jumper.speed,
      structureDamage: BALANCE.enemy.jumper.structureDamage,
      jumpCooldown: 2,
      scanCooldown: 0,
    });
    game.structures = [wall];
    game.enemies = [jumper];
    const wallHealth = wall.health;
    game.update(0.2);
    expect(wall.health).toBe(wallHealth);
    expect(jumper.targetId).toBe("flag");
  });

  it("lets jumpers chain obstacle jumps without pathfinding around barriers", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "jumper-chain");
    game.phase = "night";
    const wall = testStructure({
      id: 511,
      x: game.flag.x + 160,
      y: game.flag.y,
    });
    const jumper = testEnemy({
      id: 711,
      kind: "jumper",
      x: wall.x + wall.radius + BALANCE.enemy.jumper.radius + 1,
      y: wall.y,
      radius: BALANCE.enemy.jumper.radius,
      speed: BALANCE.enemy.jumper.speed,
      jumpCooldown: 0,
      targetId: "flag",
    });
    game.structures = [wall];
    game.enemies = [jumper];

    game.update(BALANCE.fixedStep);

    expect(jumper.jumpTime).toBeGreaterThan(0);
    expect(jumper.path).toEqual([]);
    expect(jumper.jumpCooldown).toBe(0);
  });

  it("locks a rammer windup direction through target destruction and knockback", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "rammer-lock");
    game.phase = "night";
    const wall = testStructure({
      id: 512,
      x: game.flag.x + 120,
      y: game.flag.y,
      health: 500,
      maxHealth: 500,
    });
    const rammer = testEnemy({
      id: 712,
      kind: "rammer",
      x: wall.x + 180,
      y: wall.y,
      radius: BALANCE.enemy.rammer.radius,
      structureDamage: BALANCE.enemy.rammer.structureDamage,
      targetId: "flag",
    });
    game.structures = [wall];
    game.enemies = [rammer];
    const updateRammer = (dt: number) => (game as unknown as {
      updateRammer(enemy: Enemy, dt: number): boolean;
    }).updateRammer(rammer, dt);

    expect(updateRammer(0.2)).toBe(true);
    const lockedAngle = rammer.angle;
    wall.health = 0;
    game.structures = [];
    rammer.x += 70;
    rammer.y -= 35;
    game.player.x = rammer.x + rammer.radius;
    game.player.y = rammer.y;
    updateRammer(ENEMY_REGISTRY.rammer.ram!.loadSeconds);

    expect(rammer.angle).toBe(lockedAngle);
    expect(rammer.charging).toBe(true);
    expect(rammer.chargeDistanceLeft).toBe(ENEMY_REGISTRY.rammer.ram!.distance);
  });

  it("summons roster-aware specials without adding them to wave accounting", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "summoner-roster");
    game.phase = "night";
    game.night = 7;
    game.enemyRoster = {
      1: "basic", 2: "runner", 3: "breaker", 5: "jumper", 7: "summoner",
    };
    game.mutations.basicWeight = -100;
    game.mutations.runnerWeight = -100;
    game.mutations.breakerWeight = -100;
    game.mutations.jumperWeight = -100;
    game.mutations.summonerWeight = 100;
    const summoner = testEnemy({
      id: 713,
      kind: "summoner",
      summonCooldown: 0,
      countsTowardWave: true,
    });
    game.enemies = [summoner];

    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(summoner, BALANCE.fixedStep);

    const summoned = game.enemies.find((enemy) => enemy.summonedBy === summoner.id);
    expect(summoned?.kind).toBe("summoner");
    expect(summoned?.countsTowardWave).toBe(false);
    const defeatedBefore = game.stats.zombiesDefeated;
    if (summoned) {
      (game as unknown as {
        damageEnemy(enemy: Enemy, damage: number, color: string, source: "player-melee", owner: string): void;
      }).damageEnemy(summoned, summoned.health, "#fff", "player-melee", game.player.id);
    }
    expect(game.stats.zombiesDefeated).toBe(defeatedBefore);
    if (summoned) summoned.health = 1;
    game.enemies = summoned ? [summoned] : [];
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    (game as unknown as { nightWaveScheduled: boolean }).nightWaveScheduled = true;
    expect((game as unknown as { isNightWaveCleared(): boolean }).isNightWaveCleared()).toBe(true);
  });

  it("uses registry timing and living caps for enemy summoning", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "summoner-registry");
    game.phase = "night";
    const config = ENEMY_REGISTRY.summoner.summon!;
    const summoner = testEnemy({
      id: 714,
      kind: "summoner",
      summonCooldown: 0,
      countsTowardWave: true,
    });
    game.enemies = [
      summoner,
      ...Array.from({ length: config.maximumLiving }, (_, index) => testEnemy({
        id: 800 + index,
        kind: "basic",
        summonedBy: summoner.id,
        health: 1,
      })),
    ];

    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(summoner, BALANCE.fixedStep);

    expect(game.enemies).toHaveLength(config.maximumLiving + 1);
    expect(summoner.summonCooldown).toBe(config.cappedRetryCooldown);

    game.enemies.at(-1)!.health = 0;
    summoner.summonCooldown = 0;
    (game as unknown as { updateEnemySummon(enemy: Enemy, dt: number): void })
      .updateEnemySummon(summoner, BALANCE.fixedStep);

    expect(game.enemies.filter((enemy) => enemy.summonedBy === summoner.id && enemy.health > 0))
      .toHaveLength(config.maximumLiving);
    expect(summoner.summonCooldown).toBe(config.cooldown);
  });

  it("pauses and resumes from dawn choice screens", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "pause-dawn");
    game.phase = "dawn";

    game.togglePause();
    expect(game.phase).toBe("paused");
    expect(game.previousPhase).toBe("dawn");

    game.togglePause();
    expect(game.phase).toBe("dawn");
  });

  it("escalates sunlight damage while the new day continues", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "sunlight-damage-seed");
    const enemy = testEnemy({ burning: true, health: 500, maxHealth: 500 });
    game.enemies.push(enemy);
    const firstHealth = enemy.health;
    game.update(1);
    const firstDamage = firstHealth - enemy.health;
    const secondStart = enemy.health;
    game.update(1);
    const secondDamage = secondStart - enemy.health;
    expect(enemy.sunlightExposure).toBe(2);
    expect(secondDamage).toBeGreaterThan(firstDamage);
  });

  it("keeps the boss night for the full timer and completes after the complete wave is eliminated", () => {
    const game = new Game(fakeInput());
    game.startRun("normal", "boss-seed");
    game.phase = "night";
    game.night = 10;
    game.timer = 10;
    const bossState = game as unknown as {
      nightWaveScheduled: boolean;
      bossSpawnedThisNight: boolean;
    };
    bossState.nightWaveScheduled = true;
    bossState.bossSpawnedThisNight = true;
    game.enemies.push({
      id: 999,
      kind: "boss",
      x: 200,
      y: 200,
      radius: 66,
      health: 100,
      maxHealth: 100,
      speed: 0,
      damage: 0,
      structureDamage: 0,
      attackRate: 1,
      cooldown: 1,
      attackWindup: 0,
      targetId: "flag",
      scanCooldown: 1,
      pathCooldown: 1,
      path: [],
      pathIndex: 0,
      flash: 0,
      summonCooldown: 1,
      jumpCooldown: 0,
      jumpTime: 0,
      bossSmashWindup: 0,
      bossHalfSummoned: true,
      acidCooldown: 10,
      acidWindup: 0,
      acidAimAngle: 0,
      burning: false,
      sunlightExposure: 0,
      sunlightEffectCooldown: 0,
      deathCounted: false,
      stuckTime: 0,
      routeCommitment: 0,
      routeIncludesStructures: false,
      routeStructureRevision: 0,
      jumpElapsed: 0,
      jumpStartX: 0,
      jumpStartY: 0,
      jumpEndX: 0,
      jumpEndY: 0,
    });
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.update(0.02);
    expect(game.phase).toBe("night");
    game.enemies = [];
    game.update(0.02);
    expect(game.phase).toBe("night");
    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("victory");
  });

  it("completes the deterministic ten-night loop with three dawn choices per night", () => {
    const game = new Game(fakeInput());
    game.startRun("easy", "ten-night-seed");
    for (let completedNight = 1; completedNight <= 9; completedNight += 1) {
      game.timer = 0;
      game.update(0.02);
      expect(game.phase).toBe("night");
      expect(game.night).toBe(completedNight);
      for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
      game.enemies = [];
      game.timer = 0;
      game.update(0.02);
      expect(game.phase).toBe("dawn");
      for (let screen = 0; screen < 3; screen += 1) {
        expect(game.choices).toHaveLength(3);
        game.chooseDawn(0);
      }
      if (game.enemyWarning) game.dismissEnemyWarning();
      expect(game.phase).toBe("day");
      expect(game.night).toBe(completedNight + 1);
    }

    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("night");
    game.phaseElapsed = BALANCE.endless.bossSpawnDelay;
    game.update(BALANCE.fixedStep);
    expect(game.enemies.some((enemy) => enemy.kind === "boss")).toBe(true);
    const boss = game.enemies.find((enemy) => enemy.kind === "boss");
    if (!boss) throw new Error("Night 10 boss was not created");
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.enemies = [];
    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("victory");
    expect(game.stats.nightsSurvived).toBe(10);
  });
});
