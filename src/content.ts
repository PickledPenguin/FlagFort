import { ASSETS, cardAsset, tutorialAsset } from "./assets";
import type { Mutations, StructureKind, Tier, Upgrades } from "./types";

export interface TutorialDefinition {
  id: string;
  title: string;
  instructions: string;
  illustration: string;
  controls?: string[];
  order: number;
}

const tutorial = (id: string, title: string, instructions: string, order: number, controls?: string[]): TutorialDefinition => ({
  id,
  title,
  instructions,
  illustration: tutorialAsset(id),
  controls,
  order,
});

export const TUTORIAL_STAGES: readonly TutorialDefinition[] = [
  tutorial("move-aim", "Move and aim", "Use WASD to move. The player faces your pointer.", 1, ["W", "A", "S", "D"]),
  tutorial("punch-harvest", "Punch and harvest", "Choose fists, move within reach, then hold primary action.", 2, ["1"]),
  tutorial("resources-gloves", "Resources and gloves", "Better gloves gather tougher materials. Depleted nodes refill at true dawn.", 3),
  tutorial("day-clock", "Race the day clock", "The standard day lasts 60 seconds. Use Skip to Night when your defenses are ready.", 4),
  tutorial("choose-action", "Choose an action", "Use the build bar or press 1 through 8.", 5, ["1-8"]),
  tutorial("choose-material", "Choose a material", "Structure variants appear horizontally above the build bar.", 6),
  tutorial("build-upgrade", "Build and upgrade", "Place a structure or build a stronger matching tier over it.", 7),
  tutorial("doors", "Player-only doors", "You always pass through doors. Zombies treat them as defensive walls.", 8),
  tutorial("repair", "Repair structures by day", "The wrench repairs player-built structures only. The flag can never be repaired.", 9, ["2"]),
  tutorial("recycle", "Recycle by day", "Recycle a structure to regain 25 percent of invested resources, or more with an equipped Salvage Mallet.", 10, ["3"]),
  tutorial("portal-zones", "Portal safety zones", "Build outside the large purple portal restriction rings.", 11),
  tutorial("prepare-night", "Prepare for night", "Gather and fortify before the day reaches zero, or deliberately skip the remaining day with no reward.", 12),
  tutorial("fight-night", "Fight at night", "Slot 2 becomes the bow. Scheduled portal waves arrive in the first 15 seconds of the 30-second night.", 13, ["2"]),
  tutorial("night-locks", "Night restrictions", "Building, structure repair, recycling, and upgrades are disabled at night.", 14),
  tutorial("protect-flag", "Protect the flag", "Flag damage is permanent. Zero flag or player health ends the run.", 15),
  tutorial("sunlight", "Sunlight burns", "Sunlight starts only after a true transition to day, never during boss overtime.", 16),
  tutorial("dawn-choices", "Power has a price", "Choose benefits paired with enemy mutations. You have three run-wide rerolls.", 17),
  tutorial("boss-overtime", "Survive the final count", "Boss overtime remains nighttime at zero until the boss is defeated.", 18),
] as const;

export interface TutorialTaskDefinition {
  id: string;
  instructions: string;
  allowedSlots: readonly number[];
  allowedStructure?: StructureKind;
  allowedTier?: Tier;
  completionEvent: string;
  resources?: Partial<Record<"wood" | "stone" | "gold" | "diamond", number>>;
  highlight: string;
  placementArea?: "any" | "highlighted" | "target";
}

export interface TutorialSectionDefinition {
  id: string;
  title: string;
  summary: string;
  tasks: readonly TutorialTaskDefinition[];
}

export const TUTORIAL_SECTIONS: readonly TutorialSectionDefinition[] = [
  {
    id: "flag-objective",
    title: "Flag objective",
    summary: "The flag heals you and must survive all ten nights. Zombies arrive when the daytime count reaches zero.",
    tasks: [{ id: "heal", instructions: "Walk into the highlighted flag healing radius.", allowedSlots: [1], completionEvent: "healing-started", highlight: "flag-radius" }],
  },
  {
    id: "resource-harvesting",
    title: "Resource harvesting",
    summary: "Wood, stone, gold, and diamond need progressively better gloves. Depleted nodes stay and replenish at dawn.",
    tasks: [{ id: "tree", instructions: "Aim at the highlighted tree and hold left mouse until it is depleted.", allowedSlots: [1], completionEvent: "tree-depleted", highlight: "tree" }],
  },
  {
    id: "walls-spikes",
    title: "Walls and spikes",
    summary: "Walls are durable blockers. Spikes are weaker but damage attackers. Both place freely in valid space.",
    tasks: [
      { id: "wall-slot", instructions: "Click the highlighted wall slot or press 4.", allowedSlots: [4], allowedStructure: "wall", allowedTier: "wood", completionEvent: "selected-wall", resources: { wood: 10 }, highlight: "slot-4" },
      { id: "wall-place", instructions: "Select Wood and place one wall inside the highlighted area.", allowedSlots: [4], allowedStructure: "wall", allowedTier: "wood", completionEvent: "placed-wall", resources: { wood: 10 }, highlight: "placement-area", placementArea: "highlighted" },
      { id: "spike-slot", instructions: "Click the highlighted spikes slot or press 5.", allowedSlots: [5], allowedStructure: "spikes", allowedTier: "stone", completionEvent: "selected-spikes", resources: { wood: 14, stone: 9 }, highlight: "slot-5" },
      { id: "spike-place", instructions: "Select Stone and place one spike inside the highlighted area.", allowedSlots: [5], allowedStructure: "spikes", allowedTier: "stone", completionEvent: "placed-spikes", resources: { wood: 14, stone: 9 }, highlight: "placement-area", placementArea: "highlighted" },
    ],
  },
  {
    id: "player-door",
    title: "Player-only door",
    summary: "You pass through doors. Zombies treat every door as a blocking wall.",
    tasks: [
      { id: "door-slot", instructions: "Click the highlighted door slot or press 6, then select Gold.", allowedSlots: [6], allowedStructure: "door", allowedTier: "gold", completionEvent: "selected-door", resources: { wood: 20, stone: 14, gold: 10 }, highlight: "slot-6" },
      { id: "door-place", instructions: "Place one Gold door across the highlighted lane.", allowedSlots: [6], allowedStructure: "door", allowedTier: "gold", completionEvent: "placed-door", resources: { wood: 20, stone: 14, gold: 10 }, highlight: "placement-area", placementArea: "highlighted" },
      { id: "door-cross", instructions: "Walk fully through the placed door.", allowedSlots: [1], completionEvent: "crossed-door", highlight: "door" },
    ],
  },
  {
    id: "structure-upgrading",
    title: "Structure upgrading",
    summary: "Place the stronger matching tier over a weaker structure. Only the tier difference is spent.",
    tasks: [
      { id: "stone-wall", instructions: "Select the Stone wall and follow the highlighted upgrade arrow.", allowedSlots: [4], allowedStructure: "wall", allowedTier: "stone", completionEvent: "selected-wall", resources: { stone: 7 }, highlight: "slot-4" },
      { id: "upgrade", instructions: "Place the Stone wall directly over the wooden wall.", allowedSlots: [4], allowedStructure: "wall", allowedTier: "stone", completionEvent: "upgraded-wall", resources: { stone: 7 }, highlight: "wood-wall", placementArea: "target" },
    ],
  },
  {
    id: "harvester",
    title: "Harvester",
    summary: "A node is hit once per arm revolution. Higher tiers rotate faster and collect higher-tier resources.",
    tasks: [{ id: "harvest-two", instructions: "Place a Wooden harvester in the highlighted circle so its arm reaches multiple nodes.", allowedSlots: [7], allowedStructure: "harvester", allowedTier: "wood", completionEvent: "harvested-two-nodes", resources: { wood: 28 }, highlight: "placement-area", placementArea: "highlighted" }],
  },
  {
    id: "turret",
    title: "Turret",
    summary: "Turrets target automatically. The world-space circle is the exact configured attack range.",
    tasks: [{ id: "turret-kill", instructions: "Place a Wooden turret in the highlighted half, observe its range, and let it kill the trapped zombie.", allowedSlots: [8], allowedStructure: "turret", allowedTier: "wood", completionEvent: "turret-kill", resources: { wood: 32 }, highlight: "turret-half", placementArea: "highlighted" }],
  },
  {
    id: "repair",
    title: "Repair",
    summary: "Day repairs cost the missing-health share and restore full health. Cracks disappear. The flag cannot be repaired.",
    tasks: [
      { id: "wall", instructions: "Select Repair or press 2, then repair the lightly damaged wall.", allowedSlots: [2], completionEvent: "repaired-wall", resources: { wood: 3 }, highlight: "damaged-wall" },
      { id: "spikes", instructions: "Repair the moderately damaged spikes.", allowedSlots: [2], completionEvent: "repaired-spikes", resources: { wood: 7 }, highlight: "damaged-spikes" },
      { id: "door", instructions: "Repair the heavily damaged door.", allowedSlots: [2], completionEvent: "repaired-door", resources: { wood: 15 }, highlight: "damaged-door" },
    ],
  },
  {
    id: "recycling",
    title: "Recycling",
    summary: "Recycle only by day. Full health returns the active Salvage Mallet percentage of actual invested resources; damage reduces the refund.",
    tasks: [
      { id: "wall", instructions: "Select Recycle or press 3. Recycle the highlighted Wooden wall.", allowedSlots: [3], completionEvent: "recycled-wall", highlight: "wood-wall" },
      { id: "turret", instructions: "Recycle the highlighted Stone turret and review the exact icon refund.", allowedSlots: [3], completionEvent: "recycled-turret", highlight: "stone-turret" },
      { id: "harvester", instructions: "Recycle the highlighted Gold harvester.", allowedSlots: [3], completionEvent: "recycled-harvester", highlight: "gold-harvester" },
    ],
  },
] as const;

export type CardCategory = "unlock" | "upgrade" | "mutation";
export interface CardDefinition {
  id: string;
  category: CardCategory;
  title: string;
  description: string;
  effect: string;
  value: (current: number) => string;
  illustration: string;
  prerequisites: string[];
  maxLevel: number | null;
  weight: number;
  introductionNight: number;
  compatibility: string[];
}

const structureNames: Record<StructureKind, string> = {
  wall: "Wall", door: "Door", spikes: "Spikes", harvester: "Harvester", turret: "Turret",
};

export const UNLOCK_CARDS: readonly CardDefinition[] = [
  ...(["stone", "gold", "diamond"] as Tier[]).map((tier, index) => ({
    id: `gloves:${tier}`,
    category: "unlock" as const,
    title: `${tier[0]?.toUpperCase()}${tier.slice(1)} Gloves`,
    description: `Unlock ${tier} harvesting and increase resource yield per hit.`,
    effect: `Unlock the ${tier} glove tier in sequence.`,
    value: () => "Permanent for this run",
    illustration: cardAsset("unlocks", `gloves-${tier}`),
    prerequisites: index === 0 ? ["gloves:wood"] : [`gloves:${(["stone", "gold"] as Tier[])[index - 1]}`],
    maxLevel: 1,
    weight: 10,
    introductionNight: index < 2 ? 1 : 5,
    compatibility: [],
  })),
  ...(["wall", "spikes", "door", "harvester", "turret"] as StructureKind[]).flatMap((kind) =>
    (["gold", "diamond"] as Tier[]).map((tier, index) => ({
      id: `${kind}:${tier}`,
      category: "unlock" as const,
      title: `${tier[0]?.toUpperCase()}${tier.slice(1)} ${structureNames[kind]}`,
      description: `Unlock the ${tier} ${structureNames[kind].toLowerCase()} variant.`,
      effect: `Adds the ${tier} tier to the ${kind} build variants.`,
      value: () => "Permanent for this run",
      illustration: cardAsset("unlocks", `${kind}-${tier}`),
      prerequisites: [`${kind}:${index === 0 ? "stone" : "gold"}`],
      maxLevel: 1,
      weight: 10,
      introductionNight: index === 0 ? 2 : 5,
      compatibility: [],
    }))),
] as const;

const upgradeMeta: Record<keyof Upgrades, [string, string]> = {
  moveSpeed: ["Fleet Feet", "Increase player movement speed by 8 percent."],
  maxHealth: ["Heartwood", "Increase maximum player health by 20."],
  punchRate: ["Fast Hands", "Increase punch attack speed by 10 percent."],
  punchDamage: ["Heavy Hands", "Increase punch damage by 5."],
  bowRate: ["Quick Draw", "Increase bow fire rate by 8 percent."],
  bowDamage: ["Sharp Arrows", "Increase bow damage by 4."],
  harvestRate: ["Gatherer's Rhythm", "Increase direct harvesting speed by 10 percent."],
  repairEfficiency: ["Careful Repairs", "Reduce structure repair resource requirements."],
  structureDurability: ["Fortified", "Increase all player-built structure durability by 12 percent."],
  costReduction: ["Efficient Builder", "Reduce structure resource requirements by 8 percent."],
  turretDamage: ["Turret Power", "Increase turret damage by 15 percent."],
  turretRate: ["Turret Gears", "Increase turret fire rate by 10 percent."],
  turretRange: ["Long Sight", "Increase turret range by 10 percent."],
  harvesterSpeed: ["Harvester Gears", "Increase harvester rotation speed by 18 percent."],
  flagHealth: ["Sturdy Standard", "Increase maximum flag health by 20 without healing current health."],
  turretCapacity: ["Expanded Arsenal", "Increase maximum turret capacity by 1."],
  harvesterCapacity: ["Expanded Workshop", "Increase maximum harvester capacity by 1."],
};

export const UPGRADE_CARDS: readonly CardDefinition[] = (Object.keys(upgradeMeta) as Array<keyof Upgrades>).map((id) => ({
  id,
  category: "upgrade",
  title: upgradeMeta[id][0],
  description: upgradeMeta[id][1],
  effect: upgradeMeta[id][1],
  value: (current) => `Current accumulated value: ${Math.round(current * 100) / 100}`,
  illustration: cardAsset("upgrades", id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)),
  prerequisites: [],
  maxLevel: id.endsWith("Capacity") ? 21 : null,
  weight: 10,
  introductionNight: 1,
  compatibility: [],
}));

export const MUTATION_CARDS: readonly CardDefinition[] = ([
  "basicWeight", "runnerWeight", "breakerWeight", "jumperWeight", "summonerWeight",
  "health", "damage", "speed", "attackSpeed", "structureDamage", "waveSize",
] as Array<keyof Mutations>).map((id) => ({
  id,
  category: "mutation",
  title: id.replace(/[A-Z]/g, (letter) => ` ${letter}`).replace(/^./, (letter) => letter.toUpperCase()),
  description: `Increase the horde's ${id.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}.`,
  effect: `Stacks the ${id} mutation.`,
  value: (current) => `Current accumulated value: ${Math.round(current * 100) / 100}`,
  illustration: cardAsset("mutations", id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)),
  prerequisites: [],
  maxLevel: null,
  weight: 10,
  introductionNight: 1,
  compatibility: [],
}));

export const CARD_DEFINITIONS = [...UNLOCK_CARDS, ...UPGRADE_CARDS, ...MUTATION_CARDS] as const;
export { ASSETS };
