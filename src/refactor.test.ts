// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it, vi } from "vitest";
import { allAssetPaths, ASSETS } from "./assets";
import { CHALLENGES, nightTimeline } from "./challenges";
import { CARD_DEFINITIONS, TUTORIAL_STAGES } from "./content";
import { BALANCE } from "./config";
import { Game } from "./game";
import { Input } from "./input";
import { adaptiveDifficulty, expectedStructurePoints, rerollCost, structurePointValue } from "./rules";
import { Ui } from "./ui";
import type { Enemy, EnemyKind } from "./types";

function input(): Input {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => ({
    bottom: 720, height: 720, left: 0, right: 1280, top: 0, width: 1280, x: 0, y: 0,
    toJSON: () => ({}),
  });
  canvas.setPointerCapture = vi.fn();
  return new Input(canvas);
}

function enemy(kind: EnemyKind, id: number): Enemy {
  const base = BALANCE.enemy[kind];
  return {
    id,
    kind,
    x: BALANCE.mapSize / 2 + 300,
    y: BALANCE.mapSize / 2,
    radius: base.radius,
    health: base.health,
    maxHealth: base.health,
    speed: base.speed,
    damage: base.damage,
    structureDamage: base.structureDamage,
    attackRate: base.attackRate,
    cooldown: 0,
    attackWindup: 0,
    targetId: "flag",
    scanCooldown: 10,
    pathCooldown: 10,
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
  };
}

describe("foundational refactor", () => {
  it("uses one resolvable shared SVG for every resource icon", () => {
    expect(new Set(Object.values(ASSETS.resources)).size).toBe(4);
    for (const path of allAssetPaths()) {
      expect(path.endsWith(".svg")).toBe(true);
      expect(path.startsWith("./images/")).toBe(true);
    }
  });

  it("keeps tutorial and card content centralized and stable", () => {
    expect(TUTORIAL_STAGES).toHaveLength(18);
    expect(new Set(TUTORIAL_STAGES.map((stage) => stage.id)).size).toBe(TUTORIAL_STAGES.length);
    expect(CARD_DEFINITIONS.length).toBeGreaterThan(30);
    expect(CARD_DEFINITIONS.every((card) => Boolean(card.id && card.effect && card.illustration))).toBe(true);
  });

  it("treats all standard nights and timeline maps as 30 seconds", () => {
    expect(BALANCE.nightDuration).toBe(30);
    expect(nightTimeline(false).at(-1)?.second).toBe(30);
    expect(CHALLENGES.every((challenge) => challenge.nightDuration === 30)).toBe(true);
  });

  it("keeps boss night active through the timer and until every counted enemy dies", () => {
    const game = new Game(input());
    game.startRun("normal", "boss-overtime");
    const boss = enemy("boss", 9001);
    const ordinary = enemy("basic", 9002);
    game.phase = "night";
    game.night = 10;
    game.timer = 10;
    game.enemies = [boss, ordinary];
    const bossState = game as unknown as {
      nightWaveScheduled: boolean;
      bossSpawnedThisNight: boolean;
    };
    bossState.nightWaveScheduled = true;
    bossState.bossSpawnedThisNight = true;
    for (const portal of game.portals) portal.spawned = portal.assignedSpawns;
    game.update(0.02);
    expect(game.phase).toBe("night");
    expect(game.timer).toBeLessThan(10);
    expect(ordinary.burning).toBe(false);
    expect(ordinary.sunlightExposure).toBe(0);
    boss.health = 0;
    game.update(0.02);
    expect(game.phase).toBe("night");
    game.timer = 0;
    game.update(0.02);
    expect(game.phase).toBe("night");
    ordinary.health = 0;
    game.update(0.02);
    expect(game.phase).toBe("victory");
  });

  it("lets the boss cross a resource without targeting or damaging it", () => {
    const game = new Game(input());
    game.startRun("normal", "boss-resource");
    game.phase = "night";
    game.timer = 10;
    const node = game.world.resources[0]!;
    const boss = enemy("boss", 9010);
    boss.x = node.x;
    boss.y = node.y;
    const health = node.health;
    game.enemies = [boss];
    game.update(0.02);
    expect(node.destroyed).not.toBe(true);
    expect(node.health).toBe(health);
    expect(boss.targetId).toBe("flag");
  });

  it("keeps the boss locked to the flag while its acid attack tracks the player", () => {
    const game = new Game(input());
    game.startRun("normal", "boss-flag-only");
    game.phase = "night";
    game.timer = 20;
    const boss = enemy("boss", 9020);
    boss.x = game.player.x + 250;
    boss.y = game.player.y;
    boss.scanCooldown = 0;
    boss.acidCooldown = 0;
    boss.acidWindup = BALANCE.boss.acidTelegraph - 0.01;
    game.enemies = [boss];
    game.update(0.02);
    expect(boss.targetId).toBe("flag");
    expect(game.projectiles.some((projectile) => projectile.owner === "boss-acid")).toBe(true);
  });

  it("never exposes the flag as a repair target", () => {
    const game = new Game(input());
    game.startRun("normal", "permanent-flag");
    game.flag.health -= 20;
    game.selectSlot(2);
    game.input.mouse = { x: 640, y: 360 };
    game.update(0.02);
    expect(game.toolPreview?.target).not.toBe(game.flag);
    expect(game.flag.health).toBeLessThan(game.flag.maxHealth);
  });

  it("preserves absolute flag health when maximum health is upgraded", () => {
    const game = new Game(input());
    game.startRun("normal", "flag-upgrade");
    game.flag.health = 71;
    game.phase = "dawn";
    game.choices = [{
      id: "flagHealth",
      name: "Sturdy Standard",
      description: "Maximum only",
      mutationId: "health",
      mutationName: "Thick Skulls",
      mutationDescription: "More health",
      kind: "upgrade",
    }];
    game.chooseDawn(0);
    expect(game.flag.health).toBe(71);
    expect(game.flag.maxHealth).toBeGreaterThan(71);
  });

  it("tracks turret and harvester capacity independently", () => {
    const game = new Game(input());
    game.startRun("normal", "capacity");
    expect(game.getCapacity("turret")).toEqual({ current: 0, maximum: 3 });
    expect(game.getCapacity("harvester")).toEqual({ current: 0, maximum: 3 });
    game.upgrades.turretCapacity = 2;
    expect(game.getCapacity("turret").maximum).toBe(5);
    expect(game.getCapacity("harvester").maximum).toBe(3);
  });

  it("applies corrected challenge rules without making the flag repairable", () => {
    const game = new Game(input());
    game.startRun("normal", "challenges", ["fragile-flag", "fifty-percent-days", "no-repairs"]);
    expect(game.flag.maxHealth).toBe(75);
    expect(game.flag.health).toBe(75);
    expect(game.timer).toBe(30);
    expect(game.getPhaseDuration()).toBe(30);
    expect(game.hasChallenge("no-repairs")).toBe(true);
  });

  it("charges three deterministic halvings to leave one eighth", () => {
    let wallet = { wood: 80, stone: 40, gold: 24, diamond: 8 };
    for (let count = 0; count < 3; count += 1) {
      const cost = rerollCost(wallet);
      wallet = {
        wood: wallet.wood - cost.wood,
        stone: wallet.stone - cost.stone,
        gold: wallet.gold - cost.gold,
        diamond: wallet.diamond - cost.diamond,
      };
    }
    expect(wallet).toEqual({ wood: 10, stone: 5, gold: 3, diamond: 1 });
  });

  it("uses centralized structure points and a clamped expected progression curve", () => {
    expect(structurePointValue("wall", "wood")).toBe(10);
    expect(structurePointValue("turret", "diamond")).toBe(380);
    expect(expectedStructurePoints(10)).toBe(2081);
    expect(expectedStructurePoints(15)).toBeGreaterThan(2081);
    expect(adaptiveDifficulty(0, 10).multiplier).toBe(BALANCE.adaptive.effective.minimumMultiplier);
    expect(adaptiveDifficulty(10_000, 1).multiplier).toBe(BALANCE.adaptive.structure.maximumMultiplier);
  });

  it("renders a centered numeric clock without a spinning hand", () => {
    document.body.innerHTML = '<div id="hud"></div><div id="overlay"></div><div id="toast"></div>';
    const game = new Game(input());
    const ui = new Ui(
      game,
      document.querySelector("#hud")!,
      document.querySelector("#overlay")!,
      document.querySelector("#toast")!,
    );
    game.startRun("normal", "clock");
    game.timer = BALANCE.dayDuration / 2;
    ui.render(true);
    expect(document.querySelector("[data-clock-hand]")).toBeNull();
    expect(document.querySelector<HTMLElement>("[data-clock]")?.textContent).toBe("30");
  });
});
