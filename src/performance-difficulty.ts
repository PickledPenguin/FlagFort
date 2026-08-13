import { BALANCE } from "./config";

export interface NightPerformanceSnapshot {
  night: number;
  totalIncomingDamage: number;
  damagedStructureCount: number;
  damagedStructureValue: number;
  destroyedStructureCount: number;
  destroyedStructureValue: number;
  flagDamage: number;
  flagMaximumHealth: number;
  zombiesEnteringFlagRadius: number;
  personalZombieKills: number;
  playerDamageTaken: number;
  playerMaximumHealth: number;
  totalZombieKills: number;
  totalZombiesSpawned: number;
  survivingZombiesAtDawn: number;
}

export interface PerformanceDifficultyResult {
  delta: number;
  easyPerformance: number;
  pressurePenalty: number;
  clearRate: number;
  personalKillRate: number;
  survivorRate: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const safeRatio = (value: number, denominator: number): number =>
  denominator > 0 ? Math.max(0, value) / denominator : 0;

/** Uses only the finalized preceding-night snapshot. No RNG or live state. */
export function performanceDifficultyDelta(
  snapshot: NightPerformanceSnapshot | null,
): PerformanceDifficultyResult {
  if (!snapshot || snapshot.night < 1) {
    return { delta: 0, easyPerformance: 0, pressurePenalty: 0, clearRate: 0, personalKillRate: 0, survivorRate: 0 };
  }
  const config = BALANCE.adaptive.autoCorrective;
  const spawned = Math.max(1, snapshot.totalZombiesSpawned);
  const clearRate = clamp01(snapshot.totalZombieKills / spawned);
  const personalKillRate = clamp01(snapshot.personalZombieKills / spawned);
  const survivorRate = clamp01(snapshot.survivingZombiesAtDawn / spawned);
  const easyPerformance = clamp01(
    clearRate * config.performanceWeights.clearRate
      + personalKillRate * config.performanceWeights.personalKillRate
      + (snapshot.survivingZombiesAtDawn === 0 ? config.performanceWeights.fullClear : 0),
  );
  const pressurePenalty = clamp01(
    safeRatio(snapshot.totalIncomingDamage, config.normalizers.totalIncomingDamage)
      * config.pressureWeights.totalIncomingDamage
      + safeRatio(snapshot.damagedStructureCount, config.normalizers.damagedStructureCount)
        * config.pressureWeights.damagedStructureCount
      + safeRatio(snapshot.damagedStructureValue, config.normalizers.damagedStructureValue)
        * config.pressureWeights.damagedStructureValue
      + safeRatio(snapshot.destroyedStructureCount, config.normalizers.destroyedStructureCount)
        * config.pressureWeights.destroyedStructureCount
      + safeRatio(snapshot.destroyedStructureValue, config.normalizers.destroyedStructureValue)
        * config.pressureWeights.destroyedStructureValue
      + safeRatio(snapshot.flagDamage, snapshot.flagMaximumHealth)
        * config.pressureWeights.flagDamage
      + safeRatio(snapshot.zombiesEnteringFlagRadius, config.normalizers.zombiesEnteringFlagRadius)
        * config.pressureWeights.zombiesEnteringFlagRadius
      + safeRatio(snapshot.playerDamageTaken, snapshot.playerMaximumHealth)
        * config.pressureWeights.playerDamageTaken
      + survivorRate * config.pressureWeights.survivingZombies,
  );
  const rampProgress = clamp01((snapshot.night - 1) / Math.max(1, config.fullStrengthAfterNight - 1));
  const strength = config.startingStrength + (1 - config.startingStrength) * rampProgress;
  const performanceDifference = easyPerformance - pressurePenalty;
  const rawDelta = performanceDifference >= 0
    ? config.maximumDelta * strength * performanceDifference
    : Math.abs(config.minimumDelta) * strength * performanceDifference;
  return {
    delta: Math.max(config.minimumDelta, Math.min(config.maximumDelta, rawDelta)),
    easyPerformance,
    pressurePenalty,
    clearRate,
    personalKillRate,
    survivorRate,
  };
}
