import { SeededRng } from "./rng";

export type BountyDifficulty = 1 | 2 | 3;
export type BountyMetric =
  | "meleeKills"
  | "bowKills"
  | "turretKills"
  | "spikeKills"
  | "portalsRelocated"
  | "structuresRecycled"
  | "goldHarvestersCreated"
  | "diamondSpikesCreated"
  | "diamondTurretsCreated"
  | "diamondWallsCreated"
  | "diamondGlovesObtained"
  | "goldStructuresCreated"
  | "diamondStructuresCreated";

export interface BountyDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: BountyDifficulty;
  coinReward: 10 | 15 | 20;
  exclusionGroup: string;
  requirement: { metric: BountyMetric; target: number; minimumNight: number };
  icon: "trophy" | "timer" | "heart" | "upgrade-node" | "pressure-high" | "sun";
}

const bounty = (
  id: string,
  name: string,
  description: string,
  difficulty: BountyDifficulty,
  exclusionGroup: string,
  metric: BountyMetric,
  target: number,
  icon: BountyDefinition["icon"],
  minimumNight = 5,
): BountyDefinition => ({
  id, name, description, difficulty, exclusionGroup,
  coinReward: difficulty === 1 ? 10 : difficulty === 2 ? 15 : 20,
  requirement: { metric, target, minimumNight }, icon,
});

// Targets are calibrated against the five latest playtest runs lasting more than two
// nights. Variants share exclusion groups so a run never offers duplicate objective families.
export const BOUNTIES: readonly BountyDefinition[] = [
  bounty("close-quarters", "Close Quarters", "Defeat 110 zombies with melee attacks.", 1, "melee-kills", "meleeKills", 110, "heart"),
  bounty("brawler", "Brawler", "Defeat 130 zombies with melee attacks.", 1, "melee-kills", "meleeKills", 130, "heart"),
  bounty("front-line", "Front Line", "Defeat 150 zombies with melee attacks.", 1, "melee-kills", "meleeKills", 150, "heart"),
  bounty("pugilist", "Pugilist", "Defeat 175 zombies with melee attacks.", 1, "melee-kills", "meleeKills", 175, "heart"),
  bounty("army-of-one", "Army of One", "Defeat 200 zombies with melee attacks.", 1, "melee-kills", "meleeKills", 200, "trophy"),

  bounty("take-aim", "Take Aim", "Defeat 35 zombies with the bow.", 1, "bow-kills", "bowKills", 35, "pressure-high"),
  bounty("archers-eye", "Archer's Eye", "Defeat 50 zombies with the bow.", 1, "bow-kills", "bowKills", 50, "pressure-high"),
  bounty("sharpshooter", "Sharpshooter", "Defeat 65 zombies with the bow.", 1, "bow-kills", "bowKills", 65, "pressure-high"),
  bounty("long-shot", "Long Shot", "Defeat 80 zombies with the bow.", 1, "bow-kills", "bowKills", 80, "pressure-high"),
  bounty("bow-specialist", "Bow Specialist", "Defeat 100 zombies with the bow.", 1, "bow-kills", "bowKills", 100, "trophy"),

  bounty("crossfire", "Crossfire", "Let turrets defeat 100 zombies.", 1, "turret-kills", "turretKills", 100, "pressure-high"),
  bounty("battery", "Battery", "Let turrets defeat 130 zombies.", 1, "turret-kills", "turretKills", 130, "pressure-high"),
  bounty("kill-zone", "Kill Zone", "Let turrets defeat 160 zombies.", 1, "turret-kills", "turretKills", 160, "pressure-high"),
  bounty("automated-defense", "Automated Defense", "Let turrets defeat 200 zombies.", 1, "turret-kills", "turretKills", 200, "upgrade-node"),
  bounty("overwatch", "Overwatch", "Let turrets defeat 250 zombies.", 1, "turret-kills", "turretKills", 250, "trophy"),

  bounty("thorn-line", "Thorn Line", "Let spikes defeat 30 zombies.", 1, "spike-kills", "spikeKills", 30, "upgrade-node"),
  bounty("barbed-path", "Barbed Path", "Let spikes defeat 45 zombies.", 1, "spike-kills", "spikeKills", 45, "upgrade-node"),
  bounty("deadfall", "Deadfall", "Let spikes defeat 60 zombies.", 1, "spike-kills", "spikeKills", 60, "upgrade-node"),
  bounty("gauntlet", "The Gauntlet", "Let spikes defeat 80 zombies.", 1, "spike-kills", "spikeKills", 80, "pressure-high"),
  bounty("diamond-teeth", "Diamond Teeth", "Let spikes defeat 100 zombies.", 1, "spike-kills", "spikeKills", 100, "trophy"),

  bounty("portal-puncher", "Portal Puncher", "Relocate 8 portals.", 1, "portal-relocation", "portalsRelocated", 8, "pressure-high"),
  bounty("forced-march", "Forced March", "Relocate 10 portals.", 1, "portal-relocation", "portalsRelocated", 10, "pressure-high"),
  bounty("moving-targets", "Moving Targets", "Relocate 12 portals.", 1, "portal-relocation", "portalsRelocated", 12, "pressure-high"),
  bounty("banishment", "Banishment", "Relocate 15 portals.", 1, "portal-relocation", "portalsRelocated", 15, "trophy"),
  bounty("no-fixed-address", "No Fixed Address", "Relocate 18 portals.", 1, "portal-relocation", "portalsRelocated", 18, "trophy"),

  bounty("redeploy", "Redeploy", "Recycle 8 structures.", 1, "structure-recycling", "structuresRecycled", 8, "upgrade-node"),
  bounty("salvage-plan", "Salvage Plan", "Recycle 12 structures.", 1, "structure-recycling", "structuresRecycled", 12, "upgrade-node"),
  bounty("mobile-fort", "Mobile Fort", "Recycle 16 structures.", 1, "structure-recycling", "structuresRecycled", 16, "upgrade-node"),
  bounty("nothing-wasted", "Nothing Wasted", "Recycle 20 structures.", 1, "structure-recycling", "structuresRecycled", 20, "sun"),
  bounty("circular-economy", "Circular Economy", "Recycle 25 structures.", 1, "structure-recycling", "structuresRecycled", 25, "sun"),

  bounty("gold-rush", "Gold Rush", "Establish 3 gold harvesters.", 1, "gold-harvesters", "goldHarvestersCreated", 3, "sun"),
  bounty("gold-industry", "Gold Industry", "Establish 4 gold harvesters.", 1, "gold-harvesters", "goldHarvestersCreated", 4, "sun"),
  bounty("gold-network", "Gold Network", "Establish 5 gold harvesters.", 1, "gold-harvesters", "goldHarvestersCreated", 5, "sun"),
  bounty("gold-works", "Gold Works", "Establish 6 gold harvesters.", 1, "gold-harvesters", "goldHarvestersCreated", 6, "sun"),
  bounty("diamond-gloves", "Diamond Hands", "Obtain diamond gloves during the run.", 1, "diamond-gloves", "diamondGlovesObtained", 1, "heart"),

  bounty("diamond-caltrops", "Diamond Caltrops", "Establish 10 diamond spikes.", 2, "diamond-spikes", "diamondSpikesCreated", 10, "upgrade-node"),
  bounty("diamond-thicket", "Diamond Thicket", "Establish 14 diamond spikes.", 2, "diamond-spikes", "diamondSpikesCreated", 14, "upgrade-node"),
  bounty("diamond-maze", "Diamond Maze", "Establish 18 diamond spikes.", 2, "diamond-spikes", "diamondSpikesCreated", 18, "pressure-high"),
  bounty("diamond-gauntlet", "Diamond Gauntlet", "Establish 22 diamond spikes.", 2, "diamond-spikes", "diamondSpikesCreated", 22, "trophy"),

  bounty("diamond-battery", "Diamond Battery", "Establish 4 diamond turrets.", 2, "diamond-turrets", "diamondTurretsCreated", 4, "pressure-high"),
  bounty("diamond-crossfire", "Diamond Crossfire", "Establish 5 diamond turrets.", 2, "diamond-turrets", "diamondTurretsCreated", 5, "pressure-high"),
  bounty("diamond-arsenal", "Diamond Arsenal", "Establish 6 diamond turrets.", 2, "diamond-turrets", "diamondTurretsCreated", 6, "upgrade-node"),
  bounty("diamond-overwatch", "Diamond Overwatch", "Establish 8 diamond turrets.", 2, "diamond-turrets", "diamondTurretsCreated", 8, "trophy"),

  bounty("diamond-rampart", "Diamond Rampart", "Establish 10 diamond walls.", 2, "diamond-walls", "diamondWallsCreated", 10, "upgrade-node"),
  bounty("diamond-ring", "Diamond Ring", "Establish 14 diamond walls.", 2, "diamond-walls", "diamondWallsCreated", 14, "upgrade-node"),
  bounty("diamond-bastion", "Diamond Bastion", "Establish 18 diamond walls.", 3, "diamond-walls", "diamondWallsCreated", 18, "trophy"),
  bounty("diamond-citadel", "Diamond Citadel", "Establish 24 diamond walls.", 3, "diamond-walls", "diamondWallsCreated", 24, "trophy"),

  bounty("gilded-fort", "Gilded Fort", "Establish 30 gold structures.", 3, "gold-structures", "goldStructuresCreated", 30, "upgrade-node"),
  bounty("gold-standard", "Gold Standard", "Establish 40 gold structures.", 3, "gold-structures", "goldStructuresCreated", 40, "trophy"),
  bounty("all-diamond", "All Diamond", "Establish 20 diamond structures.", 3, "diamond-structures", "diamondStructuresCreated", 20, "trophy"),
] as const;

export interface RunBounty {
  definition: BountyDefinition;
  progress: number;
  completed: boolean;
}

export function selectRunBounties(seed: string): BountyDefinition[] {
  const rng = new SeededRng(`${seed}:bounties:v2`);
  const selected: BountyDefinition[] = [];
  const excludedGroups = new Set<string>();
  for (const candidate of rng.shuffle(BOUNTIES)) {
    if (excludedGroups.has(candidate.exclusionGroup)) continue;
    selected.push(candidate);
    excludedGroups.add(candidate.exclusionGroup);
    if (selected.length === 3) break;
  }
  return selected;
}
