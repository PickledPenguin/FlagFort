import type { NightPerformanceSnapshot, PerformanceDifficultyResult } from "./performance-difficulty";
import type { AdaptiveDifficulty, ResourceWallet } from "./rules";
import type { PermanentUpgradeId } from "./meta-balance";
import type {
  DamageSource,
  Difficulty,
  EnemyKind,
  Mutations,
  RunMode,
  StructureKind,
  Tier,
  Upgrades,
} from "./types";

export type StructureTally = Partial<Record<StructureKind, Partial<Record<Tier, number>>>>;
export type EnemyTally = Partial<Record<EnemyKind, number>>;
export type DamageTally = Partial<Record<DamageSource, number>>;

export interface EnemyTargetDamage {
  player?: number;
  flag?: number;
  structures?: Partial<Record<StructureKind, number>>;
}

export interface PlaytestActivityLog {
  structures: {
    built: StructureTally;
    upgraded: StructureTally;
    repaired: StructureTally;
    destroyed: StructureTally;
  };
  resources: {
    gathered: ResourceWallet;
    spent: ResourceWallet;
    refunded: ResourceWallet;
  };
  outgoingDamageBySource: DamageTally;
  incomingDamageBySource: DamageTally;
  killsBySource: DamageTally;
  enemyDamageByKindAndTarget: Partial<Record<EnemyKind, EnemyTargetDamage>>;
  timeSeconds: {
    gathering: number;
    building: number;
    repairing: number;
    fighting: number;
  };
  cardsChosen: ChoiceSelectionLog[];
}

export interface ChoiceSelectionLog {
  afterNight: number;
  screen: number;
  id: string;
  name: string;
  kind: "unlock" | "upgrade";
  mutationId: string;
  mutationName: string;
}

export interface EnemyPopulationLog {
  spawned: {
    scheduled: EnemyTally;
    boss: EnemyTally;
    summons: EnemyTally;
    children: EnemyTally;
  };
  killed: {
    scheduled: EnemyTally;
    boss: EnemyTally;
    summons: EnemyTally;
    children: EnemyTally;
  };
}

export interface RunLoadoutLog {
  playerLevel: number;
  permanentUpgrades: Partial<Record<PermanentUpgradeId, number>>;
  equipment: Record<string, { tier: Tier | null; equipped: boolean }>;
  temporaryUpgrades: Upgrades;
  mutations: Mutations;
}

export function emptyResourceLog(): ResourceWallet {
  return { wood: 0, stone: 0, gold: 0, diamond: 0 };
}

export function emptyPlaytestActivity(): PlaytestActivityLog {
  return {
    structures: { built: {}, upgraded: {}, repaired: {}, destroyed: {} },
    resources: { gathered: emptyResourceLog(), spent: emptyResourceLog(), refunded: emptyResourceLog() },
    outgoingDamageBySource: {},
    incomingDamageBySource: {},
    killsBySource: {},
    enemyDamageByKindAndTarget: {},
    timeSeconds: { gathering: 0, building: 0, repairing: 0, fighting: 0 },
    cardsChosen: [],
  };
}

export interface NightDifficultyLog {
  night: number;
  status: "complete" | "partial";
  executiveSummary: string;
  adaptive: AdaptiveDifficulty;
  correctiveInput: {
    sourceNight: number | null;
    result: PerformanceDifficultyResult;
  };
  wave: {
    baseBudget: number;
    mutationBonus: number;
    selectedDifficultyMultiplier: number;
    adaptiveMultiplier: number;
    challengeMultiplier: number;
    requestedThreatBudget: number;
    scheduledEnemyCount: number;
    scheduledThreat: number;
    roster: Partial<Record<EnemyKind, number>>;
  };
  analysis: {
    structureInventory: {
      start: StructureTally;
      end?: StructureTally;
    };
    resourcesUnspent?: ResourceWallet;
    activity: PlaytestActivityLog;
    population: EnemyPopulationLog;
    bossKillTimeSeconds: number | null;
  };
  outcome?: NightPerformanceSnapshot & {
    correctiveForNextNight: PerformanceDifficultyResult;
  };
}

export interface RunDifficultyLog {
  schema: "flagfort-dev-run-v2";
  seed: string;
  difficulty: Difficulty;
  mode: RunMode;
  startedAt: string;
  endedAt: string;
  victory: boolean;
  nights: NightDifficultyLog[];
  final: {
    structureInventory: StructureTally;
    resourcesUnspent: ResourceWallet;
    activity: PlaytestActivityLog;
    loadout: RunLoadoutLog;
  };
}

const round = (value: number): number => Math.round(value * 10_000) / 10_000;

function rounded<T>(value: T): T {
  if (typeof value === "number") return round(value) as T;
  if (Array.isArray(value)) return value.map(rounded) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, rounded(item)]),
    ) as T;
  }
  return value;
}

export function summarizeNight(log: NightDifficultyLog): string {
  const outcome = log.outcome;
  const pressure = log.correctiveInput.result.pressurePenalty;
  const correction = log.adaptive.otherDelta;
  const total = (tally: EnemyTally): number => Object.values(tally).reduce((sum, value) => sum + (value ?? 0), 0);
  const spawned = log.analysis.population.spawned;
  const population = `${log.wave.scheduledEnemyCount} scheduled (${total(spawned.scheduled)} spawned), ${total(spawned.boss)} boss, ${total(spawned.summons)} summons, ${total(spawned.children)} children`;
  const result = outcome
    ? `${outcome.totalZombieKills}/${outcome.totalZombiesSpawned} counted enemies cleared; ${round(outcome.totalIncomingDamage)} incoming damage`
    : "night ended before its outcome finalized";
  return `Night ${log.night}: ${population} at ${round(log.adaptive.multiplier)}x adaptive difficulty; prior correction +${round(correction)}, pressure ${round(pressure)}; ${result}.`;
}

export function serializeRunDifficultyLog(report: RunDifficultyLog): string {
  const normalized = rounded(report);
  const header = {
    type: "run",
    schema: normalized.schema,
    seed: normalized.seed,
    difficulty: normalized.difficulty,
    mode: normalized.mode,
    startedAt: normalized.startedAt,
    endedAt: normalized.endedAt,
    victory: normalized.victory,
    nightCount: normalized.nights.length,
    final: normalized.final,
  };
  return [
    JSON.stringify(header),
    ...normalized.nights.map((night) => JSON.stringify({ type: "night", ...night })),
  ].join("\n") + "\n";
}

function isLocalDevelopment(): boolean {
  if (!import.meta.env.DEV || typeof location === "undefined") return false;
  return location.hostname === "localhost" || location.hostname === "127.0.0.1";
}

export function finishRunDifficultyLog(report: RunDifficultyLog): void {
  if (!isLocalDevelopment()) return;
  const normalized = rounded(report);
  if (normalized.nights.length === 0) return;
  console.groupCollapsed(
    `[FlagFort Difficulty] ${normalized.victory ? "Victory" : "Run complete"} | ${normalized.seed} | ${normalized.nights.length} night(s)`,
  );
  for (const night of normalized.nights) {
    console.groupCollapsed(`[Night ${night.night}] ${night.executiveSummary}`);
    console.table({
      structurePoints: night.adaptive.actual,
      expectedStructurePoints: night.adaptive.expected,
      structureDifference: night.adaptive.difference,
      structureMultiplier: night.adaptive.structureMultiplier,
      playerLevel: night.adaptive.playerLevel,
      levelMultiplier: night.adaptive.levelMultiplier,
      correctiveDelta: night.adaptive.otherDelta,
      effectiveMultiplier: night.adaptive.multiplier,
      requestedThreatBudget: night.wave.requestedThreatBudget,
      scheduledEnemyCount: night.wave.scheduledEnemyCount,
      scheduledThreat: night.wave.scheduledThreat,
    });
    console.log("Adaptive detection", night.adaptive);
    console.log("Corrective input", night.correctiveInput);
    console.log("Wave", night.wave);
    console.log("Outcome", night.outcome ?? { status: "partial" });
    console.log("Analysis", night.analysis);
    console.groupEnd();
  }
  console.log("Final run analysis", normalized.final);
  console.groupEnd();
  void fetch("/__flagfort_dev_log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      seed: normalized.seed,
      endedAt: normalized.endedAt,
      content: serializeRunDifficultyLog(normalized),
    }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json() as { path: string };
    console.info(`[FlagFort Difficulty] Saved ${result.path}`);
  }).catch((error: unknown) => {
    console.warn("[FlagFort Difficulty] Could not save the local run log", error);
  });
}
