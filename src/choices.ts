import { BALANCE } from "./config";
import { SeededRng } from "./rng";
import { canUnlock } from "./rules";
import type { Choice, Mutations, StructureKind, Tier, UnlockState, Upgrades } from "./types";

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

function availableMutationKeys(night: number): Array<keyof Mutations> {
  const keys: Array<keyof Mutations> = [
    "basicWeight",
    "health",
    "damage",
    "speed",
    "attackSpeed",
    "structureDamage",
    "waveSize",
  ];
  if (night >= 2) keys.push("runnerWeight");
  if (night >= 3) keys.push("breakerWeight");
  if (night >= 5) keys.push("jumperWeight");
  if (night >= 7) keys.push("summonerWeight");
  return keys;
}

export function mutationText(key: keyof Mutations, current: number): string {
  const next = current + BALANCE.mutations[key].amount;
  const amount = Math.round(next);
  if (key === "basicWeight") return `Basic zombie spawn weight +${amount}.`;
  if (key === "runnerWeight") return `Runner zombie spawn weight +${amount}.`;
  if (key === "breakerWeight") return `Breaker zombie spawn weight +${amount}.`;
  if (key === "jumperWeight") return `Jumper zombie spawn weight +${amount}.`;
  if (key === "summonerWeight") return `Summoner zombie spawn weight +${amount}.`;
  if (key === "waveSize") return `Each portal wave size +${amount} zombies.`;
  const percent = Math.round(next * 100);
  const stat: Record<"health" | "damage" | "speed" | "attackSpeed" | "structureDamage", string> = {
    health: "health",
    damage: "player damage",
    speed: "speed",
    attackSpeed: "attack speed",
    structureDamage: "structure damage",
  };
  return `All zombies ${stat[key]} +${percent}%.`;
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
): Choice {
  const mutationId = rng.pick(availableMutationKeys(night));
  const mutation = BALANCE.mutations[mutationId];
  if (kind === "unlock") {
    return {
      id: benefitId,
      name: unlockNames[benefitId] ?? benefitId,
      description: benefitId.startsWith("gloves")
        ? "Harvest tougher resources and gather more per hit."
        : "Build this stronger material tier.",
      mutationId,
      mutationName: mutation.name,
      mutationDescription: mutationText(mutationId, mutations[mutationId]),
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
    mutationName: mutation.name,
    mutationDescription: mutationText(mutationId, mutations[mutationId]),
    kind,
  };
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
): Choice[] {
  const rng = new SeededRng(`${seed}:choices:${night}:${screen}:reroll:${reroll}`);
  const unlockPool = availableUnlocks(unlocks).filter((id) => !excluded.has(id));
  const useUnlocks = screen === 0 && unlockPool.length > 0;
  const upgradeKeys = (Object.keys(upgrades) as Array<keyof Upgrades>).filter((id) => {
    if (excluded.has(id) || disabledBenefits.has(id)) return false;
    if (id === "turretCapacity") {
      return BALANCE.structure.startingCapacity.turret + upgrades.turretCapacity < BALANCE.structure.maximumCapacity.turret;
    }
    if (id === "harvesterCapacity") {
      return BALANCE.structure.startingCapacity.harvester + upgrades.harvesterCapacity < BALANCE.structure.maximumCapacity.harvester;
    }
    return true;
  });
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
    .map((id) => pairChoice(rng, String(id), useUnlocks ? "unlock" : "upgrade", night, upgrades, mutations));
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
