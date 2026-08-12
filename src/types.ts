export type Difficulty = "easy" | "normal" | "hard" | "extreme";
export type RunMode = "campaign" | "endless";
export const CAMPAIGN_TIER_IDS = ["forest", "snowy"] as const;
export type CampaignTierId = typeof CAMPAIGN_TIER_IDS[number];

export function isCampaignTierId(value: unknown): value is CampaignTierId {
  return typeof value === "string"
    && (CAMPAIGN_TIER_IDS as readonly string[]).includes(value);
}
export type Phase = "menu" | "day" | "night" | "dawn" | "paused" | "victory" | "defeat";
export type ResourceKind = "wood" | "stone" | "gold" | "diamond";
export type Tier = ResourceKind;
export type StructureKind = "wall" | "door" | "spikes" | "harvester" | "turret";
export type ActionKind = "fists" | "tool" | "recycle" | StructureKind;
export type RosterTier = 1 | 2 | 3 | 5 | 7;
export type RosterEnemyKind =
  | "basic"
  | "runner"
  | "breaker"
  | "gremlin"
  | "splitter"
  | "jumper"
  | "popper"
  | "archer"
  | "summoner"
  | "acidslinger"
  | "rammer"
  | "frostbite"
  | "snowballer"
  | "icebound";
export type BossEnemyKind = "boss" | "frost-warden";
export type EnemyKind = RosterEnemyKind | "splitter-child" | "dune-hopper" | BossEnemyKind;
export type PlayerId = string;
export type DamageSource =
  | "player-melee"
  | "player-bow"
  | "turret"
  | "spikes"
  | "sunlight"
  | "boss-acid"
  | "enemy-arrow"
  | "enemy-acid"
  | "popper-burst"
  | "rammer-charge"
  | "frost-warden"
  | "enemy";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Circle extends Vec2 {
  radius: number;
}

export interface TimedStatusEffect {
  remaining: number;
}

export interface EntityStatuses {
  slow?: TimedStatusEffect;
}

export interface EnemyStatusEffect {
  kind: "slow";
  duration: number;
  targets: readonly ("player" | "turret")[];
  popupTextColor: string;
}

export interface Player extends Circle {
  id: PlayerId;
  health: number;
  maxHealth: number;
  angle: number;
  cooldown: number;
  toolCooldown: number;
  hurtFlash: number;
  punchHand: "right" | "left";
  punchSerial: number;
  statuses?: EntityStatuses;
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
  biomeOverlay?: boolean;
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
  ownerId?: PlayerId;
  investedResources?: Record<ResourceKind, number>;
  kind: StructureKind;
  tier: Tier;
  health: number;
  maxHealth: number;
  cooldown: number;
  angle: number;
  lastArmAngle: number;
  harvesterHitResourceIds: Set<number>;
  flash: number;
  statuses?: EntityStatuses;
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
  attackSpeedMultiplier?: number;
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
  countsTowardWave?: boolean;
  jumpCooldown: number;
  jumpTime: number;
  bossSmashWindup: number;
  bossSlamWave?: number;
  bossHalfSummoned: boolean;
  acidCooldown: number;
  acidWindup: number;
  acidAimAngle: number;
  burning: boolean;
  sunlightExposure: number;
  sunlightEffectCooldown: number;
  deathCounted: boolean;
  lastDamageSource?: DamageSource | null;
  lastHitByPlayerId?: PlayerId | null;
  stuckTime: number;
  fullyStuckTime?: number;
  forcedBlockerId?: number | null;
  routeCommitment: number;
  routeIncludesStructures: boolean;
  routeStructureRevision: number;
  jumpElapsed: number;
  jumpStartX: number;
  jumpStartY: number;
  jumpEndX: number;
  jumpEndY: number;
  angle?: number;
  child?: boolean;
  deathResolved?: boolean;
  deathReason?: "combat" | "sunlight" | "dawn" | "forced" | null;
  chargeProgress?: number;
  chargeTargetId?: number | null;
  charging?: boolean;
  chargeDistanceLeft?: number;
  chargeDamageLeft?: number;
  chargeHitIds?: Set<number>;
  armor?: number;
  maxArmor?: number;
  areaStrikeCooldown?: number;
  areaStrikeSerial?: number;
}

export interface Projectile extends Circle {
  id: number;
  owner: "player" | "turret" | "boss-acid" | "enemy-arrow" | "enemy-acid";
  ownerPlayerId?: PlayerId | null;
  damageSource?: DamageSource;
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  vx: number;
  vy: number;
  damage: number;
  rangeLeft: number;
  lifetime: number;
  hitIds: Set<number | "player" | "flag">;
  intendedTargetId?: number | "player" | "flag";
  color: string;
  sourceEnemyKind?: EnemyKind;
  appearance?: "arrow" | "snowball";
  statusEffect?: EnemyStatusEffect;
  impactBurst?: {
    color: string;
    count: number;
  };
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
  shape?: "shard";
}

export interface AreaEffect extends Vec2 {
  kind: "boss-slam" | "frost-slam" | "popper-acid";
  radius: number;
  remaining: number;
  duration: number;
}

export interface AreaStrike extends Vec2 {
  id: number;
  sourceEnemyKind: EnemyKind;
  radius: number;
  angle: number;
  warningRemaining: number;
  warningDuration: number;
  eruptionRemaining: number;
  eruptionDuration: number;
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
  mode?: RunMode;
  campaignTierId?: CampaignTierId;
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
  mutationTargetKinds?: RosterEnemyKind[];
  kind: "unlock" | "upgrade";
}

export interface UnlockState {
  gloves: Tier[];
  structures: Record<StructureKind, Tier[]>;
}
