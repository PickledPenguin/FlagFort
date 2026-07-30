// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mitigatePlayerDamage, isRepairFree, swordStats } from "./equipment";
import { Game, LOCAL_PLAYER_ID } from "./game";
import { Input } from "./input";
import { resolveEffectiveStat } from "./modifiers";
import { ProfileManager } from "./profile";
import type { Enemy, Structure } from "./types";

class TestStore {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function gameWithProfile(): { game: Game; profile: ProfileManager } {
  document.body.innerHTML = `<canvas width="1280" height="720"></canvas>`;
  const canvas = document.querySelector("canvas")!;
  const profile = new ProfileManager(new TestStore());
  const game = new Game(new Input(canvas), profile);
  game.startRun("normal", "meta-tests", [], true, { settle: false });
  return { game, profile };
}

function enemy(id: number, x: number, y: number, health = 10): Enemy {
  return {
    id,
    kind: "basic",
    x,
    y,
    radius: 23,
    health,
    maxHealth: health,
    speed: 0,
    damage: 0,
    structureDamage: 0,
    attackRate: 1,
    cooldown: 0,
    attackWindup: 0,
    targetId: null,
    scanCooldown: 0,
    pathCooldown: 0,
    path: [],
    pathIndex: 0,
    flash: 0,
    summonCooldown: 0,
    jumpCooldown: 0,
    jumpTime: 0,
    bossSmashWindup: 0,
    bossHalfSummoned: false,
    acidCooldown: 0,
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

describe("effective stats and equipment", () => {
  it("uses the documented additive percentage pipeline", () => {
    expect(resolveEffectiveStat({
      base: 100,
      permanent: 0.2,
      equipment: 0.1,
      challenge: -0.1,
      temporary: 0.3,
      mutation: 0.05,
      contextual: 0.05,
      temporaryFlat: 5,
    })).toBe(165);
  });

  it("clamps Diamond helmet mitigation at 50 percent", () => {
    expect(mitigatePlayerDamage(100, "wood")).toBe(90);
    expect(mitigatePlayerDamage(100, "diamond")).toBe(50);
    expect(mitigatePlayerDamage(-10, "diamond")).toBe(0);
  });

  it("uses deterministic one-roll repair thresholds", () => {
    expect(isRepairFree("diamond", true, 0.4999)).toBe(true);
    expect(isRepairFree("diamond", true, 0.5)).toBe(false);
    expect(isRepairFree("wood", false, 0)).toBe(false);
  });

  it("defines progressive sword tiers with the required endpoints", () => {
    expect(swordStats("wood")?.damageMultiplier).toBe(1.1);
    expect(swordStats("wood")?.cooldownMultiplier).toBe(2);
    expect(swordStats("diamond")?.damageMultiplier).toBe(2);
    expect(swordStats("diamond")!.targetLimit).toBeGreaterThan(swordStats("wood")!.targetLimit);
  });

  it("applies structure bonuses from the structure owner", () => {
    const { game, profile } = gameWithProfile();
    profile.profile.permanentUpgrades.structureHealth = 2;
    const local = (game as unknown as {
      structureMaxHealth(kind: "wall", tier: "wood", owner: string): number;
    }).structureMaxHealth("wall", "wood", LOCAL_PLAYER_ID);
    const remote = (game as unknown as {
      structureMaxHealth(kind: "wall", tier: "wood", owner: string): number;
    }).structureMaxHealth("wall", "wood", "future-player");
    expect(local).toBeCloseTo(remote * 1.2);
  });

  it("keeps normal repair affordability but consumes nothing on a successful wrench roll", () => {
    const { game, profile } = gameWithProfile();
    profile.profile.equipment.wrench = { tier: "diamond", equipped: true };
    game.resources.wood = 10;
    const structure = {
      id: 1,
      ownerId: LOCAL_PLAYER_ID,
      kind: "wall",
      tier: "wood",
      x: game.player.x + 20,
      y: game.player.y,
      radius: 33,
      health: 50,
      maxHealth: 100,
      cooldown: 0,
      angle: 0,
      lastArmAngle: 0,
      harvesterHitResourceIds: new Set<number>(),
      flash: 0,
    } satisfies Structure;
    game.toolPreview = {
      x: structure.x,
      y: structure.y,
      action: "repair",
      valid: true,
      affordable: true,
      target: structure,
      cost: { wood: 5, stone: 0, gold: 0, diamond: 0 },
      refund: { wood: 0, stone: 0, gold: 0, diamond: 0 },
      restoreAmount: 50,
      reason: "",
    };
    (game as unknown as { rng: { next(): number } }).rng.next = () => 0.1;
    (game as unknown as { repair(): void }).repair();
    expect(game.resources.wood).toBe(10);
    expect(structure.health).toBe(100);
  });

  it("cleaves each target once and credits direct melee ownership", () => {
    const { game, profile } = gameWithProfile();
    profile.profile.equipment.sword = { tier: "diamond", equipped: true };
    game.phase = "night";
    game.selectedSlot = 1;
    game.player.angle = 0;
    const first = enemy(1, game.player.x + 50, game.player.y - 10);
    const second = enemy(2, game.player.x + 55, game.player.y + 10);
    game.enemies = [first, second];
    (game as unknown as { rebuildSpatial(): void }).rebuildSpatial();
    (game as unknown as { punch(): void }).punch();
    expect(first.health).toBeLessThanOrEqual(0);
    expect(second.health).toBeLessThanOrEqual(0);
    expect(game.directPlayerKills.basic).toBe(2);
  });
});
