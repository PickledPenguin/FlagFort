import { describe, expect, it } from "vitest";
import {
  emptyPlaytestActivity,
  serializeRunDifficultyLog,
  summarizeNight,
  type NightDifficultyLog,
} from "./dev-run-telemetry";
import { adaptiveDifficulty, createMutations, createUpgrades } from "./rules";
import { performanceDifficultyDelta } from "./performance-difficulty";

function nightLog(): NightDifficultyLog {
  const log: NightDifficultyLog = {
    night: 2,
    status: "complete",
    executiveSummary: "",
    adaptive: adaptiveDifficulty(300, 2, 4, [0.123456]),
    correctiveInput: { sourceNight: 1, result: performanceDifficultyDelta(null) },
    wave: {
      baseBudget: 20,
      mutationBonus: 3,
      selectedDifficultyMultiplier: 1,
      adaptiveMultiplier: 1.123456,
      challengeMultiplier: 1,
      requestedThreatBudget: 26,
      scheduledEnemyCount: 21,
      scheduledThreat: 25.8,
      roster: { basic: 18, runner: 3 },
    },
    analysis: {
      structureInventory: {
        start: { wall: { wood: 2 }, turret: { stone: 1 } },
        end: { wall: { wood: 1 }, turret: { stone: 1 } },
      },
      resourcesUnspent: { wood: 4, stone: 2, gold: 0, diamond: 0 },
      activity: emptyPlaytestActivity(),
      population: {
        spawned: {
          scheduled: { basic: 18, runner: 3 },
          boss: {},
          summons: { basic: 2 },
          children: { "splitter-child": 2 },
        },
        killed: {
          scheduled: { basic: 18, runner: 3 },
          boss: {},
          summons: { basic: 2 },
          children: { "splitter-child": 2 },
        },
      },
      bossKillTimeSeconds: null,
    },
    outcome: {
      night: 2,
      totalIncomingDamage: 12,
      damagedStructureCount: 1,
      damagedStructureValue: 10,
      destroyedStructureCount: 0,
      destroyedStructureValue: 0,
      flagDamage: 0,
      flagMaximumHealth: 100,
      zombiesEnteringFlagRadius: 2,
      personalZombieKills: 12,
      playerDamageTaken: 2,
      playerMaximumHealth: 100,
      totalZombieKills: 21,
      totalZombiesSpawned: 21,
      survivingZombiesAtDawn: 0,
      correctiveForNextNight: performanceDifficultyDelta(null),
    },
  };
  log.executiveSummary = summarizeNight(log);
  return log;
}

describe("developer run telemetry", () => {
  it("writes one compact, rounded JSON record per night with an executive summary", () => {
    const night = nightLog();
    const output = serializeRunDifficultyLog({
      schema: "flagfort-dev-run-v2",
      seed: "telemetry-seed",
      difficulty: "normal",
      mode: "campaign",
      startedAt: "2026-08-03T00:00:00.000Z",
      endedAt: "2026-08-03T00:10:00.000Z",
      victory: false,
      nights: [night],
      final: {
        structureInventory: { turret: { stone: 1 } },
        resourcesUnspent: { wood: 4, stone: 2, gold: 0, diamond: 0 },
        activity: emptyPlaytestActivity(),
        loadout: {
          playerLevel: 4,
          permanentUpgrades: {},
          equipment: {},
          temporaryUpgrades: createUpgrades(),
          mutations: createMutations(),
        },
      },
    });
    const lines = output.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: "run",
      schema: "flagfort-dev-run-v2",
      nightCount: 1,
      final: { structureInventory: { turret: { stone: 1 } } },
    });
    expect(JSON.parse(lines[1]!)).toMatchObject({
      type: "night",
      night: 2,
      executiveSummary: expect.stringContaining("Night 2"),
      wave: { adaptiveMultiplier: 1.1235 },
      analysis: {
        population: { spawned: { summons: { basic: 2 }, children: { "splitter-child": 2 } } },
      },
    });
    expect(JSON.parse(lines[1]!).executiveSummary)
      .toContain("21 scheduled (21 spawned), 0 boss, 2 summons, 2 children");
  });
});
