export type Difficulty = "easy" | "normal" | "hard" | "impossible";
export type Phase = "menu" | "day" | "night" | "dawn" | "paused" | "victory" | "defeat";
export type ResourceKind = "wood" | "stone" | "gold" | "diamond";
export type Tier = ResourceKind;
export type StructureKind = "wall" | "door" | "spikes" | "harvester" | "turret";
export type ActionKind = "fists" | "tool" | "recycle" | StructureKind;
export type EnemyKind = "basic" | "runner" | "breaker" | "jumper" | "summoner" | "boss";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Circle extends Vec2 {
  radius: number;
}

export interface Player extends Circle {
  health: number;
  maxHealth: number;
  angle: number;
  cooldown: number;
  toolCooldown: number;
  hurtFlash: number;
  punchHand: "right" | "left";
  punchSerial: number;
}

export interface Flag extends Circle {
  health: number;
  maxHealth: number;
  hurtFlash: number;
}

export interface ResourceNode extends Circle {
  id: number;
  kind: ResourceKind;
  health: number;
  maxHealth: number;
  hitFlash: number;
  destroyed?: boolean;
}

export interface Portal extends Circle {
  id: number;
  health: number;
  maxHealth: number;
  assignedSpawns: number;
  spawned: number;
  spawnCooldown: number;
  flash: number;
}

export interface Structure extends Circle {
  id: number;
  kind: StructureKind;
  tier: Tier;
  health: number;
  maxHealth: number;
  cooldown: number;
  angle: number;
  lastArmAngle: number;
  harvesterHitResourceIds: Set<number>;
  flash: number;
}

export interface Enemy extends Circle {
  id: number;
  kind: EnemyKind;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  structureDamage: number;
  attackRate: number;
  cooldown: number;
  attackWindup: number;
  targetId: number | "player" | "flag" | "tutorial" | null;
  scanCooldown: number;
  pathCooldown: number;
  path: Vec2[];
  pathIndex: number;
  flash: number;
  summonCooldown: number;
  summonedBy?: number;
  jumpCooldown: number;
  jumpTime: number;
  bossSmashWindup: number;
  bossHalfSummoned: boolean;
  acidCooldown: number;
  acidWindup: number;
  acidAimAngle: number;
  burning: boolean;
  sunlightExposure: number;
  sunlightEffectCooldown: number;
  deathCounted: boolean;
  stuckTime: number;
  routeCommitment: number;
  routeIncludesStructures: boolean;
  routeStructureRevision: number;
  jumpElapsed: number;
  jumpStartX: number;
  jumpStartY: number;
  jumpEndX: number;
  jumpEndY: number;
}

export interface Projectile extends Circle {
  id: number;
  owner: "player" | "turret" | "boss-acid";
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  damage: number;
  rangeLeft: number;
  lifetime: number;
  hitIds: Set<number | "player">;
  color: string;
}

export interface Particle extends Vec2 {
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  text?: string;
  resource?: ResourceKind;
}

export interface World {
  seed: string;
  clearings: Circle[];
  resources: ResourceNode[];
  foliage: Array<Circle & { shade: number }>;
  navigation: {
    valid: boolean;
    routes: Vec2[][];
    invalidGaps: Vec2[];
    attempts: number;
    fallback: boolean;
  };
}

export interface RunStats {
  resourcesGathered: number;
  structuresBuilt: number;
  zombiesDefeated: number;
  elapsed: number;
  nightsSurvived: number;
}

export interface RunRecord extends RunStats {
  seed: string;
  difficulty: Difficulty;
  challengeIds: string[];
  victory: boolean;
  date: string;
}

export interface Upgrades {
  moveSpeed: number;
  maxHealth: number;
  punchRate: number;
  punchDamage: number;
  bowRate: number;
  bowDamage: number;
  harvestRate: number;
  repairEfficiency: number;
  structureDurability: number;
  costReduction: number;
  turretDamage: number;
  turretRate: number;
  turretRange: number;
  harvesterSpeed: number;
  flagHealth: number;
  turretCapacity: number;
  harvesterCapacity: number;
}

export interface Mutations {
  basicWeight: number;
  runnerWeight: number;
  breakerWeight: number;
  jumperWeight: number;
  summonerWeight: number;
  health: number;
  damage: number;
  speed: number;
  attackSpeed: number;
  structureDamage: number;
  waveSize: number;
}

export interface Choice {
  id: string;
  name: string;
  description: string;
  mutationId: keyof Mutations;
  mutationName: string;
  mutationDescription: string;
  kind: "unlock" | "upgrade";
}

export interface UnlockState {
  gloves: Tier[];
  structures: Record<StructureKind, Tier[]>;
}
