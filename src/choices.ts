import { BALANCE } from "./config";
import { SeededRng } from "./rng";
import { canUnlock } from "./rules";
import {
  ENEMY_REGISTRY,
  introducedRosterEnemies,
  mutationWeightKey,
  selectEnemyRoster,
  type EnemyRoster,
} from "./enemy-registry";
import type { Choice, Mutations, RosterEnemyKind, StructureKind, Tier, UnlockState, Upgrades } from "./types";

const unlockNames: Record<string, string> = {
  "gloves:stone": "Stone Gloves",
  "gloves:gold": "Gold Gloves",
  "gloves:diamond": "Diamond Gloves",
};

for (const structure of ["wall", "spikes", "door", "harvester", "turret"] as StructureKind[]) {
  for (const tier of ["gold", "diamond"] as Tier[]) {
    unlockNames[`${structure}:${tier}`] = `${tier[0]?.toUpperCase()}${tier.slice(1)} ${structure[0]?.toUpperCase()}${structure.slice(1)}`;
  }
}

export function availableUnlocks(unlocks: UnlockState): string[] {
  return Object.keys(unlockNames).filter((id) => canUnlock(id, unlocks));
}

function currentRosterKinds(
  night: number,
  roster: EnemyRoster,
  additionalRoster: readonly RosterEnemyKind[],
): RosterEnemyKind[] {
  return [...new Set([...introducedRosterEnemies(roster, night), ...additionalRoster])];
}

function availableMutationKeys(
  night: number,
  roster: EnemyRoster,
  additionalRoster: readonly RosterEnemyKind[],
): Array<keyof Mutations> {
  const keys: Array<keyof Mutations> = [
    "health",
    "damage",
    "speed",
    "attackSpeed",
    "structureDamage",
    "waveSize",
  ];
  for (const kind of currentRosterKinds(night, roster, additionalRoster)) {
    const key = mutationWeightKey(kind);
    if (key === "basicWeight") continue;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

function mutationTargets(
  key: keyof Mutations,
  night: number,
  roster: EnemyRoster,
  additionalRoster: readonly RosterEnemyKind[],
): RosterEnemyKind[] {
  const introduced = currentRosterKinds(night, roster, additionalRoster);
  const exact = introduced.filter((kind) => mutationWeightKey(kind) === key);
  return exact.length > 0 ? exact : introduced;
}

export interface MutationPresentation {
  summary: string;
  comparison: string;
}

export function mutationPresentation(
  key: keyof Mutations,
  current: number,
  targets: readonly RosterEnemyKind[] = [],
): MutationPresentation {
  const amount = BALANCE.mutations[key].amount;
  const next = current + amount;
  const names = targets.map((kind) => ENEMY_REGISTRY[kind].displayName).join(", ");
  if (key === "basicWeight" || key === "runnerWeight" || key === "breakerWeight"
    || key === "jumperWeight" || key === "summonerWeight") {
    const fallbackNames: Partial<Record<keyof Mutations, string>> = {
      basicWeight: "Basic zombie",
      runnerWeight: "Runner zombie",
      breakerWeight: "Breaker zombie",
      jumperWeight: "Jumper zombie",
      summonerWeight: "Summoner zombie",
    };
    return {
      summary: `+${Math.round(amount)} ${names || fallbackNames[key] || "Selected zombie"} spawn weight`,
      comparison: `+${Math.round(current)} -> +${Math.round(next)}`,
    };
  }
  if (key === "waveSize") {
    return {
      summary: `+${Math.round(amount)} zombies to the next wave`,
      comparison: `+${Math.round(current)} -> +${Math.round(next)}`,
    };
  }
  const amountPercent = Math.round(amount * 100);
  const currentPercent = Math.round(current * 100);
  const nextPercent = Math.round(next * 100);
  const stat: Record<"health" | "damage" | "speed" | "attackSpeed" | "structureDamage", string> = {
    health: "health",
    damage: "player damage",
    speed: "speed",
    attackSpeed: "attack speed",
    structureDamage: "structure damage",
  };
  return {
    summary: `+${amountPercent}% ${stat[key]} for ${names || "all zombies"}`,
    comparison: `+${currentPercent}% -> +${nextPercent}%`,
  };
}

export function mutationText(
  key: keyof Mutations,
  current: number,
  targets: readonly RosterEnemyKind[] = [],
): string {
  return mutationPresentation(key, current, targets).summary;
}

function upgradeText(key: keyof Upgrades, current: number): string {
  const next = current + BALANCE.upgrades[key].amount;
  if (key === "maxHealth") return `Player maximum health becomes ${100 + Math.round(next)}.`;
  if (key === "flagHealth") return `Flag maximum health gains ${Math.round(next)} total. Current health does not increase.`;
  if (key === "turretCapacity") return `Maximum turret capacity becomes ${BALANCE.structure.startingCapacity.turret + Math.round(next)}.`;
  if (key === "harvesterCapacity") return `Maximum harvester capacity becomes ${BALANCE.structure.startingCapacity.harvester + Math.round(next)}.`;
  const subjects: Record<Exclude<keyof Upgrades, "maxHealth" | "flagHealth" | "turretCapacity" | "harvesterCapacity">, string> = {
    moveSpeed: "Player movement speed",
    punchRate: "Punch attack speed",
    punchDamage: "Punch damage",
    bowRate: "Bow fire rate",
    bowDamage: "Bow damage",
    harvestRate: "Harvest speed",
    repairEfficiency: "Repair efficiency",
    structureDurability: "Structure durability",
    costReduction: "Structure cost reduction",
    turretDamage: "Turret damage",
    turretRate: "Turret fire rate",
    turretRange: "Turret range",
    harvesterSpeed: "Harvester rotation speed",
  };
  if (key === "punchDamage" || key === "bowDamage") {
    return `${subjects[key]} gains ${Math.round(next)} total.`;
  }
  return `${subjects[key]} reaches +${Math.round(next * 100)}%.`;
}

function pairChoice(
  rng: SeededRng,
  benefitId: string,
  kind: "unlock" | "upgrade",
  night: number,
  upgrades: Upgrades,
  mutations: Mutations,
  roster: EnemyRoster,
  additionalRoster: readonly RosterEnemyKind[],
): Choice {
  const mutationId = rng.pick(availableMutationKeys(night, roster, additionalRoster));
  const mutation = BALANCE.mutations[mutationId];
  const mutationTargetKinds = mutationTargets(mutationId, night, roster, additionalRoster);
  const exactWeightTarget = mutationTargetKinds.length === 1
    && mutationWeightKey(mutationTargetKinds[0]!) === mutationId;
  const mutationName = exactWeightTarget
    ? `${ENEMY_REGISTRY[mutationTargetKinds[0]!].displayName} Surge`
    : mutation.name;
  if (kind === "unlock") {
    return {
      id: benefitId,
      name: unlockNames[benefitId] ?? benefitId,
      description: benefitId.startsWith("gloves")
        ? "Harvest tougher resources and gather more per hit."
        : "Build this stronger material tier.",
      mutationId,
      mutationName,
      mutationDescription: mutationText(mutationId, mutations[mutationId], mutationTargetKinds),
      mutationTargetKinds,
      kind,
    };
  }
  const upgradeId = benefitId as keyof Upgrades;
  const upgrade = BALANCE.upgrades[upgradeId];
  return {
    id: benefitId,
    name: upgrade.name,
    description: upgradeText(upgradeId, upgrades[upgradeId]),
    mutationId,
    mutationName,
    mutationDescription: mutationText(mutationId, mutations[mutationId], mutationTargetKinds),
    mutationTargetKinds,
    kind,
  };
}

export function availableUpgradeKeys(
  upgrades: Upgrades,
  excluded: ReadonlySet<string> = new Set(),
  disabledBenefits: ReadonlySet<string> = new Set(),
): Array<keyof Upgrades> {
  return (Object.keys(upgrades) as Array<keyof Upgrades>).filter((id) =>
    !excluded.has(id)
      && !disabledBenefits.has(id)
      && upgrades[id] < BALANCE.upgradeCaps[id] - 1e-9);
}

export function generateChoiceOfferings(
  seed: string,
  night: number,
  screen: number,
  unlocks: UnlockState,
  upgrades: Upgrades,
  mutations: Mutations,
  excluded: ReadonlySet<string> = new Set(),
  reroll = 0,
  disabledBenefits: ReadonlySet<string> = new Set(),
  roster: EnemyRoster = selectEnemyRoster(seed),
  additionalRoster: readonly RosterEnemyKind[] = [],
): Choice[] {
  const rng = new SeededRng(`${seed}:choices:${night}:${screen}:reroll:${reroll}`);
  const unlockPool = availableUnlocks(unlocks).filter((id) => !excluded.has(id));
  const useUnlocks = screen === 0 && unlockPool.length > 0;
  const upgradeKeys = availableUpgradeKeys(upgrades, excluded, disabledBenefits);
  let pool: Array<string | keyof Upgrades> = useUnlocks ? unlockPool : upgradeKeys;
  if (useUnlocks) {
    const multiplier = night <= 4 ? 3 : night <= 6 ? 2 : 1;
    const nextGlove = unlockPool.find((id) => id.startsWith("gloves:"));
    if (nextGlove && multiplier > 1) pool = [...pool, ...Array(multiplier - 1).fill(nextGlove)];
  }
  return rng
    .shuffle(pool)
    .filter((id, index, values) => values.indexOf(id) === index)
    .slice(0, 3)
    .map((id) => pairChoice(
      rng,
      String(id),
      useUnlocks ? "unlock" : "upgrade",
      night,
      upgrades,
      mutations,
      roster,
      additionalRoster,
    ));
}

export function applyUnlock(unlocks: UnlockState, id: string): void {
  const [category, tier] = id.split(":") as [string, Tier];
  if (category === "gloves") {
    if (!unlocks.gloves.includes(tier)) unlocks.gloves.push(tier);
    return;
  }
  const values = unlocks.structures[category as StructureKind];
  if (!values.includes(tier)) values.push(tier);
}
