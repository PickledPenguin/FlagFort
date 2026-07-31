// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { resourceCostLayout } from "./cost-layout";
import { Game } from "./game";
import type { Input } from "./input";
import { dismantleRefund, emptyWallet } from "./rules";
import type { Enemy, Structure } from "./types";
import { Ui } from "./ui";
import { costIcons } from "./ui-icons";

function input(): Input {
  const state = {
    keys: new Set<string>(),
    mouse: { x: 640, y: 360 },
    mouseDown: false,
    pressed: false,
    escapePressed: false,
    numberPressed: 0,
    endFrame() {
      state.pressed = false;
      state.escapePressed = false;
      state.numberPressed = 0;
    },
    releasePointer() {
      state.mouseDown = false;
      state.pressed = false;
    },
  };
  return state as unknown as Input;
}

function enemy(overrides: Partial<Enemy> = {}): Enemy {
  return {
    id: 70,
    kind: "basic",
    x: 1800,
    y: 1800,
    radius: 23,
    health: 100,
    maxHealth: 100,
    speed: 100,
    damage: 5,
    structureDamage: 5,
    attackRate: 1,
    cooldown: 0,
    attackWindup: 0,
    targetId: "flag",
    scanCooldown: 1,
    pathCooldown: 0,
    path: [],
    pathIndex: 0,
    flash: 0,
    summonCooldown: 10,
    jumpCooldown: 0,
    jumpTime: 0,
    bossSmashWindup: 0,
    bossHalfSummoned: false,
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

function structure(kind: Structure["kind"], x: number, y: number, tier: Structure["tier"] = "wood"): Structure {
  const index = BALANCE.tierIndex[tier];
  const maxHealth = BALANCE.structure.health[kind][index] ?? 100;
  return {
    id: Math.round(x * 10 + y),
    kind,
    tier,
    x,
    y,
    radius: BALANCE.structure.radius[kind],
    health: maxHealth,
    maxHealth,
    cooldown: 0,
    angle: 0,
    lastArmAngle: 0,
    harvesterHitResourceIds: new Set(),
    flash: 0,
  };
}

describe("interface refinements", () => {
  it("uses the shared triangle and square resource geometry", () => {
    const triangle = resourceCostLayout({ wood: 1, stone: 2, gold: 3, diamond: 0 });
    expect(triangle.map(({ row, column }) => [row, column])).toEqual([[1, 1], [1, 2], [2, 1]]);
    const square = resourceCostLayout({ wood: 1, stone: 2, gold: 3, diamond: 4 });
    expect(square.map(({ row, column }) => [row, column])).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
    expect(costIcons({ wood: 1, stone: 2, gold: 3, diamond: 0 })).toContain("count-3");
  });

  it("uses the gameplay range for every turret preview tier", () => {
    const game = new Game(input());
    for (const tier of ["wood", "stone", "gold", "diamond"] as const) {
      expect(game.getTurretRange(tier)).toBe(BALANCE.structure.turretRange[BALANCE.tierIndex[tier]]);
    }
  });

  it("removes the clock hand and exposes ten milestone nodes", () => {
    const game = new Game(input());
    game.startRun("normal", "progress");
    const hud = document.createElement("div");
    const overlay = document.createElement("div");
    const toast = document.createElement("div");
    const ui = new Ui(game, hud, overlay, toast);
    ui.render(true);
    expect(hud.querySelector("[data-clock-hand]")).toBeNull();
    expect(hud.querySelectorAll(".run-node")).toHaveLength(10);
    expect(BALANCE.nightMilestones.map((item) => item.night)).toEqual([1, 2, 3, 5, 7, 10]);
  });

  it("uses transitionend instead of timeout cleanup for card swipes", () => {
    const game = new Game(input());
    const ui = new Ui(game, document.createElement("div"), document.createElement("div"), document.createElement("div"));
    const source = (ui as unknown as { animateChoiceReplacement: () => void }).animateChoiceReplacement.toString();
    expect(source).toContain("transitionend");
    expect(source).not.toContain("setTimeout");
  });
});

describe("combat and navigation refinements", () => {
  it("attacks a blocking wall instead of reaching through it to a nearby flag", () => {
    const game = new Game(input());
    game.startRun("normal", "blocked-flag");
    game.world.resources = [];
    const wall = structure("wall", game.flag.x - 29, game.flag.y);
    const basic = enemy({
      kind: "basic",
      x: game.flag.x - 58,
      y: game.flag.y,
      speed: 0,
      targetId: "flag",
      scanCooldown: 10,
    });
    const flagHealth = game.flag.health;
    const wallHealth = wall.health;
    game.structures = [wall];
    game.enemies = [basic];
    (game as unknown as { updateEnemies: (dt: number) => void }).updateEnemies(0.4);
    expect(wall.health).toBeLessThan(wallHealth);
    expect(game.flag.health).toBe(flagHealth);
  });

  it("alternates punch hands and applies one hit per attack", () => {
    const game = new Game(input());
    game.startRun("normal", "hands");
    game.player.angle = 0;
    const target = enemy({ x: game.player.x + 50, y: game.player.y, speed: 0 });
    game.enemies = [target];
    (game as unknown as { rebuildSpatial: () => void }).rebuildSpatial();
    const punch = (game as unknown as { punch: () => void }).punch.bind(game);
    const advanceSwing = (game as unknown as { updateMeleeSwing: (dt: number) => void }).updateMeleeSwing.bind(game);
    punch();
    advanceSwing(0.3);
    expect(game.player.punchHand).toBe("right");
    expect(target.health).toBe(100 - BALANCE.player.punchDamage);
    game.player.cooldown = 0;
    punch();
    advanceSwing(0.3);
    expect(game.player.punchHand).toBe("left");
    expect(target.health).toBe(100 - BALANCE.player.punchDamage * 2);
    expect(game.player.punchSerial).toBe(2);
  });

  it("uses the smaller radius only for zombie separation", () => {
    const game = new Game(input());
    const a = enemy({ id: 1, x: 100, y: 100 });
    const b = enemy({ id: 2, x: 130, y: 100 });
    game.enemies = [a, b];
    (game as unknown as { rebuildSpatial: () => void }).rebuildSpatial();
    (game as unknown as { separateEnemies: () => void }).separateEnemies();
    expect(a.x).toBe(100);
    expect(b.x).toBe(130);
    expect(BALANCE.navigation.zombieSeparationRadiusMultiplier).toBeCloseTo(0.5);
  });

  it("routes a runner through a short gap and falls back for an excessive detour", () => {
    const game = new Game(input());
    game.startRun("normal", "runner-routing");
    game.world.resources = [];
    const y = game.player.y;
    const runner = enemy({ kind: "runner", x: game.player.x - 260, y, radius: BALANCE.enemy.runner.radius });
    game.structures = [structure("wall", game.player.x, y)];
    (game as unknown as { moveEnemyToward: (e: Enemy, t: { x: number; y: number }, dt: number) => void })
      .moveEnemyToward(runner, { x: game.player.x + 260, y }, 0.02);
    expect(runner.routeIncludesStructures).toBe(true);
    runner.routeCommitment = 0;
    runner.pathCooldown = 0;
    game.structures = Array.from({ length: 21 }, (_, index) =>
      structure("wall", game.player.x, y - 700 + index * 70));
    (game as unknown as { structureRevision: number }).structureRevision += 1;
    (game as unknown as { moveEnemyToward: (e: Enemy, t: { x: number; y: number }, dt: number) => void })
      .moveEnemyToward(runner, { x: game.player.x + 260, y }, 0.02);
    expect(runner.routeIncludesStructures).toBe(false);
  });

  it("jumps over a constructed blocker and lands before resuming pursuit", () => {
    const game = new Game(input());
    game.startRun("normal", "jumper");
    game.world.resources = [];
    const jumper = enemy({
      kind: "jumper",
      x: 1000,
      y: 1000,
      radius: BALANCE.enemy.jumper.radius,
    });
    const wall = structure("wall", 1100, 1000);
    const target = { ...game.flag, x: 1400, y: 1000 };
    game.structures = [wall];
    game.enemies = [jumper];
    const didJump = (game as unknown as {
      tryJumperLeap: (e: Enemy, blocker: Structure, target: typeof game.flag) => boolean;
    }).tryJumperLeap(jumper, wall, target);
    expect(didJump).toBe(true);
    expect(jumper.jumpTime).toBe(BALANCE.jumper.jumpDuration);
    expect(jumper.x).toBe(jumper.jumpStartX);
    (game as unknown as { updateJumperAirborne: (e: Enemy, dt: number) => void })
      .updateJumperAirborne(jumper, BALANCE.jumper.jumpDuration);
    expect(jumper.jumpTime).toBe(0);
    expect(jumper.x).toBeCloseTo(jumper.jumpEndX);
  });
});

describe("night, economy, and tutorial refinements", () => {
  it("runs 30-second nights and completes scheduled spawning by 15 seconds", () => {
    const game = new Game(input());
    game.startRun("normal", "wave");
    (game as unknown as { beginNight: () => void }).beginNight();
    game.phaseElapsed = BALANCE.nightSpawnCutoff;
    (game as unknown as { updatePortals: (dt: number) => void }).updatePortals(0);
    expect(game.timer).toBe(30);
    expect(game.portals.every((portal) => portal.spawned === portal.assignedSpawns)).toBe(true);
  });

  it("enters normal dawn early after the complete wave is eliminated", () => {
    const game = new Game(input());
    game.startRun("normal", "early-dawn");
    (game as unknown as { beginNight: () => void }).beginNight();
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.enemies = [];
    game.update(0.02);
    expect(game.phase).toBe("dawn");
    expect(game.stats.nightsSurvived).toBe(1);
  });

  it("hits each resource once per harvester revolution", () => {
    const game = new Game(input());
    game.startRun("normal", "harvester");
    game.world.resources = [{
      id: 10,
      kind: "wood",
      x: game.player.x + BALANCE.structure.harvesterArm[0],
      y: game.player.y,
      radius: BALANCE.resource.radius.wood,
      health: 100,
      maxHealth: 100,
      hitFlash: 0,
    }];
    const harvester = structure("harvester", game.player.x, game.player.y);
    game.structures = [harvester];
    (game as unknown as { rebuildSpatial: () => void }).rebuildSpatial();
    const update = (game as unknown as { updateHarvester: (s: Structure, dt: number) => void }).updateHarvester.bind(game);
    update(harvester, 0.001);
    const first = game.resources.wood;
    update(harvester, 0.001);
    expect(game.resources.wood).toBe(first);
    harvester.angle = Math.PI * 2 - 0.001;
    update(harvester, 0.01);
    expect(game.resources.wood).toBeGreaterThan(first);
  });

  it("uses icon particles for gains and health-adjusted recycling", () => {
    const game = new Game(input());
    game.startRun("normal", "icons");
    const node = game.world.resources.find((item) => item.kind === "wood")!;
    (game as unknown as { harvestNode: (n: typeof node, tier: "wood", scale: number) => void })
      .harvestNode(node, "wood", 1);
    expect(game.particles.some((particle) => particle.resource === "wood" && particle.text?.startsWith("+"))).toBe(true);
    expect(dismantleRefund({ wood: 10, stone: 0, gold: 0, diamond: 0 }, 0.25, 150, 150).wood).toBe(2);
    expect(dismantleRefund({ wood: 10, stone: 0, gold: 0, diamond: 0 }, 0.25, 75, 150).wood).toBe(1);
    expect(dismantleRefund({ wood: 10, stone: 0, gold: 0, diamond: 0 }, 0.25, 0, 150)).toEqual(emptyWallet());
  });

  it("gates tutorial actions, auto-completes events, and isolates run records", () => {
    const game = new Game(input());
    const recordsBefore = [...game.records];
    game.startTutorial(0);
    expect(game.tutorialMode).toBe(true);
    expect(game.isTutorialSlotAllowed(1)).toBe(true);
    expect(game.isTutorialSlotAllowed(8)).toBe(false);
    game.player.x = game.flag.x;
    game.player.y = game.flag.y;
    game.update(0.1);
    expect(game.tutorialSectionComplete).toBe(true);
    expect(game.records).toEqual(recordsBefore);
    expect(game.stats.nightsSurvived).toBe(0);
  });

  it("contains every tutorial section and removes flag systems after section one", () => {
    const controls = input();
    const game = new Game(controls);
    const arenaCenter = BALANCE.mapSize / 2;
    const arenaLimit = BALANCE.tutorialArena.radius - BALANCE.tutorialArena.boundaryInset;

    game.startTutorial(0);
    expect(game.hasActiveFlag()).toBe(true);
    game.tutorialSectionComplete = true;
    expect(game.advanceTutorialSection()).toBe(true);
    expect(game.tutorialSection).toBe(1);
    expect(game.hasActiveFlag()).toBe(false);

    game.player.health = game.player.maxHealth / 2;
    game.player.x = game.flag.x;
    game.player.y = game.flag.y;
    game.update(0.2);
    expect(game.player.health).toBe(game.player.maxHealth / 2);

    game.startTutorial(6);
    expect(game.hasActiveFlag()).toBe(false);
    expect(game.enemies).toHaveLength(1);
    expect(game.enemies[0]?.targetId).toBe("tutorial");
    game.update(0.2);
    expect(game.enemies[0]?.targetId).toBe("tutorial");

    for (let section = 0; section < 9; section += 1) {
      game.startTutorial(section);
      const circles = [
        ...game.world.resources,
        ...game.structures,
        ...game.enemies,
        ...(game.tutorialPlacementArea ? [game.tutorialPlacementArea] : []),
      ];
      expect(circles.every((circle) => game.isInsideTutorialArena(
        circle.x,
        circle.y,
        circle.radius,
      ))).toBe(true);
    }

    game.startTutorial(1);
    game.player.x = arenaCenter + BALANCE.tutorialArena.radius;
    game.player.y = arenaCenter;
    controls.keys.add("KeyD");
    game.update(0.2);
    controls.keys.delete("KeyD");
    expect(Math.hypot(game.player.x - arenaCenter, game.player.y - arenaCenter)
      + game.player.radius).toBeLessThanOrEqual(arenaLimit);
    expect(game.camera).toEqual({ x: arenaCenter, y: arenaCenter });
  });
});
