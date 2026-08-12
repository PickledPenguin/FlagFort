import { SeededRng } from "./rng";

export type BountyDifficulty = 1 | 2 | 3;
export type BountyMetric =
  | "zombiesDefeated"
  | "personalKills"
  | "meleeKills"
  | "bowKills"
  | "resourcesGathered"
  | "structuresBuilt"
  | "turretsBuilt"
  | "harvestersBuilt"
  | "structuresUpgraded"
  | "structuresRepaired"
  | "structuresRecycled"
  | "portalsDestroyed"
  | "nightsSurvived";

export interface BountyDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: BountyDifficulty;
  coinReward: 10 | 15 | 20;
  requirement: { metric: BountyMetric; target: number };
  icon: "trophy" | "timer" | "heart" | "upgrade-node" | "pressure-high" | "sun";
}

const bounty = (
  id: string,
  name: string,
  description: string,
  difficulty: BountyDifficulty,
  metric: BountyMetric,
  target: number,
  icon: BountyDefinition["icon"],
): BountyDefinition => ({
  id, name, description, difficulty,
  coinReward: difficulty === 1 ? 10 : difficulty === 2 ? 15 : 20,
  requirement: { metric, target }, icon,
});

// 35 Tier 1, 10 Tier 2, and 5 Tier 3 definitions. All targets are biome-neutral.
export const BOUNTIES: readonly BountyDefinition[] = [
  bounty("thin-the-crowd", "Thin the Crowd", "Defeat 20 zombies.", 1, "zombiesDefeated", 20, "trophy"),
  bounty("steady-defense", "Steady Defense", "Defeat 35 zombies.", 1, "zombiesDefeated", 35, "trophy"),
  bounty("hands-on", "Hands On", "Personally defeat 10 zombies.", 1, "personalKills", 10, "heart"),
  bounty("front-line", "Front Line", "Personally defeat 18 zombies.", 1, "personalKills", 18, "heart"),
  bounty("close-quarters", "Close Quarters", "Defeat 6 zombies with melee attacks.", 1, "meleeKills", 6, "heart"),
  bounty("brawler", "Brawler", "Defeat 12 zombies with melee attacks.", 1, "meleeKills", 12, "heart"),
  bounty("take-aim", "Take Aim", "Defeat 6 zombies with the bow.", 1, "bowKills", 6, "pressure-high"),
  bounty("archers-eye", "Archer's Eye", "Defeat 12 zombies with the bow.", 1, "bowKills", 12, "pressure-high"),
  bounty("gatherer", "Gatherer", "Gather 80 resources.", 1, "resourcesGathered", 80, "sun"),
  bounty("stockpile", "Stockpile", "Gather 140 resources.", 1, "resourcesGathered", 140, "sun"),
  bounty("lumber-and-stone", "Lumber and Stone", "Gather 200 resources.", 1, "resourcesGathered", 200, "sun"),
  bounty("raise-a-wall", "Raise a Wall", "Build 3 structures.", 1, "structuresBuilt", 3, "upgrade-node"),
  bounty("fortify", "Fortify", "Build 6 structures.", 1, "structuresBuilt", 6, "upgrade-node"),
  bounty("builder", "Builder", "Build 9 structures.", 1, "structuresBuilt", 9, "upgrade-node"),
  bounty("first-turret", "First Turret", "Build 1 turret.", 1, "turretsBuilt", 1, "pressure-high"),
  bounty("crossfire", "Crossfire", "Build 2 turrets.", 1, "turretsBuilt", 2, "pressure-high"),
  bounty("workshop", "Workshop", "Build 1 harvester.", 1, "harvestersBuilt", 1, "sun"),
  bounty("industry", "Industry", "Build 2 harvesters.", 1, "harvestersBuilt", 2, "sun"),
  bounty("better-materials", "Better Materials", "Upgrade 1 structure.", 1, "structuresUpgraded", 1, "upgrade-node"),
  bounty("reinforced", "Reinforced", "Upgrade 3 structures.", 1, "structuresUpgraded", 3, "upgrade-node"),
  bounty("field-repair", "Field Repair", "Repair 1 structure.", 1, "structuresRepaired", 1, "heart"),
  bounty("maintenance", "Maintenance", "Repair 3 structures.", 1, "structuresRepaired", 3, "heart"),
  bounty("reuse", "Reuse", "Recycle 1 structure.", 1, "structuresRecycled", 1, "upgrade-node"),
  bounty("redeploy", "Redeploy", "Recycle 2 structures.", 1, "structuresRecycled", 2, "upgrade-node"),
  bounty("portal-puncher", "Portal Puncher", "Destroy 1 portal.", 1, "portalsDestroyed", 1, "pressure-high"),
  bounty("hold-one-night", "First Watch", "Survive 1 night.", 1, "nightsSurvived", 1, "timer"),
  bounty("hold-two-nights", "Second Watch", "Survive 2 nights.", 1, "nightsSurvived", 2, "timer"),
  bounty("hold-three-nights", "Third Watch", "Survive 3 nights.", 1, "nightsSurvived", 3, "timer"),
  bounty("mixed-arms", "Mixed Arms", "Personally defeat 15 zombies.", 1, "personalKills", 15, "trophy"),
  bounty("busy-hands", "Busy Hands", "Build 5 structures.", 1, "structuresBuilt", 5, "upgrade-node"),
  bounty("resource-run", "Resource Run", "Gather 110 resources.", 1, "resourcesGathered", 110, "sun"),
  bounty("night-shift", "Night Shift", "Survive 4 nights.", 1, "nightsSurvived", 4, "timer"),
  bounty("repair-crew", "Repair Crew", "Repair 2 structures.", 1, "structuresRepaired", 2, "heart"),
  bounty("sharpshooter", "Sharpshooter", "Defeat 9 zombies with the bow.", 1, "bowKills", 9, "pressure-high"),
  bounty("scrapper", "Scrapper", "Defeat 9 zombies with melee attacks.", 1, "meleeKills", 9, "heart"),

  bounty("horde-breaker", "Horde Breaker", "Defeat 75 zombies.", 2, "zombiesDefeated", 75, "trophy"),
  bounty("personal-best", "Personal Best", "Personally defeat 35 zombies.", 2, "personalKills", 35, "heart"),
  bounty("melee-specialist", "Melee Specialist", "Defeat 24 zombies with melee attacks.", 2, "meleeKills", 24, "heart"),
  bounty("bow-specialist", "Bow Specialist", "Defeat 24 zombies with the bow.", 2, "bowKills", 24, "pressure-high"),
  bounty("quartermaster", "Quartermaster", "Gather 320 resources.", 2, "resourcesGathered", 320, "sun"),
  bounty("fortress-plan", "Fortress Plan", "Build 14 structures.", 2, "structuresBuilt", 14, "upgrade-node"),
  bounty("battery", "Battery", "Build 4 turrets.", 2, "turretsBuilt", 4, "pressure-high"),
  bounty("assembly-line", "Assembly Line", "Build 4 harvesters.", 2, "harvestersBuilt", 4, "sun"),
  bounty("masterwork", "Masterwork", "Upgrade 6 structures.", 2, "structuresUpgraded", 6, "upgrade-node"),
  bounty("long-watch", "Long Watch", "Survive 7 nights.", 2, "nightsSurvived", 7, "timer"),

  bounty("army-of-one", "Army of One", "Personally defeat 60 zombies.", 3, "personalKills", 60, "trophy"),
  bounty("demolition", "Demolition", "Destroy 4 portals.", 3, "portalsDestroyed", 4, "pressure-high"),
  bounty("grand-fort", "Grand Fort", "Build 22 structures.", 3, "structuresBuilt", 22, "upgrade-node"),
  bounty("war-economy", "War Economy", "Gather 600 resources.", 3, "resourcesGathered", 600, "sun"),
  bounty("final-watch", "Final Watch", "Survive 10 nights.", 3, "nightsSurvived", 10, "timer"),
] as const;

export interface RunBounty {
  definition: BountyDefinition;
  progress: number;
  completed: boolean;
}

export function selectRunBounties(seed: string): BountyDefinition[] {
  const rng = new SeededRng(`${seed}:bounties:v1`);
  return rng.shuffle(BOUNTIES).slice(0, 3);
}
