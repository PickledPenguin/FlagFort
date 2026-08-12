import { SeededRng } from "./rng";
import { campaignTier } from "./campaign";
import type { BossEnemyKind, CampaignTierId, DamageSource, EnemyKind, EnemyStatusEffect, RosterEnemyKind, RosterTier, StructureKind } from "./types";

export type EnemyTargetingMode = "standard" | "flag" | "harvester" | "archer" | "acidslinger" | "rammer";
export type EnemyAttackMode = "melee" | "arrow" | "acid" | "ram" | "boss";
export type EnemyDeathMode = "none" | "split" | "acid-burst";

export interface EnemyDefinition {
  id: EnemyKind;
  displayName: string;
  description: string;
  tell: string;
  tier: RosterTier | 10;
  introductionNight: number;
  selectionWeight: number;
  spawnWeight: number;
  threat: number;
  xp: number;
  base: {
    health: number;
    speed: number;
    damage: number;
    structureDamage: number;
    attackRate: number;
    radius: number;
  };
  caps: { perWave: number; simultaneous: number };
  assets: { portrait: string; body: string; hand: string };
  render?: { aspectRatio: number; width?: number; height: number };
  armor?: {
    health: number;
    scalesWithHealth?: boolean;
    projectileResistance: number;
    barColor: string;
    label: string;
    brokenSprite: string;
    breakShardCount: number;
    breakText?: string;
    breakShake: number;
  };
  audio: Partial<Record<"attack" | "projectile" | "impact" | "death" | "charge" | "move", string>>;
  targeting: {
    mode: EnemyTargetingMode;
    detectionRadius: number;
    attackRange: number;
    innerRadius?: number;
    lockSeconds: number;
  };
  movement: {
    avoidStructures: boolean;
    obstacleFallback: boolean;
    preferredRange: number;
    meleeSpikes: boolean;
  };
  attack: {
    mode: EnemyAttackMode;
    chargeSeconds: number;
    statusEffect?: EnemyStatusEffect;
  };
  projectile?: {
    owner: "enemy-arrow" | "enemy-acid";
    damageSource: DamageSource;
    speed: number;
    range: number;
    lifetime: number;
    radius: number;
    width: number;
    pierces: boolean;
    targets: readonly ("player" | "flag" | StructureKind)[];
    color: string;
    appearance: "arrow" | "snowball";
    statusEffect?: EnemyStatusEffect;
    impactBurst?: {
      color: string;
      count: number;
    };
  };
  death: {
    mode: EnemyDeathMode;
    splitCount?: number;
    childHealth?: number;
    childDamage?: number;
    childSize?: number;
    burstInnerRadius?: number;
    burstOuterRadius?: number;
    burstDamage?: number;
    burstPlayerDamage?: number;
    burstFlagDamage?: number;
    burstStructureDamage?: number;
    burstFalloff?: number;
    burstWaveDuration?: number;
    burstTargets?: readonly ("player" | "flag" | StructureKind)[];
    triggersFromSunlight?: boolean;
  };
  ram?: {
    targetRadius: number;
    damage: number;
    distance: number;
    speed: number;
    loadSeconds: number;
    targetKinds: readonly StructureKind[];
    telegraphColor: string;
    telegraphLength: number;
    healthBarWidth: number;
    chargeBurst: { color: string; count: number; popupText: string };
    breachBurst: { color: string; count: number; popupText: string };
  };
  summon?: {
    initialCooldown: { minimum: number; maximum: number };
    cooldown: number;
    cappedRetryCooldown: number;
    maximumLiving: number;
    kinds?: readonly [RosterEnemyKind, ...RosterEnemyKind[]];
    particleColor: string;
    particleCount: number;
    popupText: string;
  };
  leap?: {
    range: number;
    cooldown: number;
    duration: number;
    arcHeight: number;
    landingClearance: number;
    landingDistancePadding: number;
    landingAttempts: number;
    failedRetryCooldown: number;
    particleColor: string;
    launchParticleCount: number;
    landingParticleCount: number;
    launchPopupText: string;
    landingPopupText: string;
  };
  rosterEligible: boolean;
  campaignTierIds?: readonly CampaignTierId[];
  countsForKills: boolean;
}

const enemy = (definition: EnemyDefinition): EnemyDefinition => definition;

export const ENEMY_REGISTRY: Record<EnemyKind, EnemyDefinition> = {
  basic: enemy({ id: "basic", displayName: "Basic Zombie", description: "A steady attacker focused on the flag.", tell: "Green body", tier: 1, introductionNight: 1, selectionWeight: 3, spawnWeight: 70, threat: 1, xp: 1, base: { health: 42, speed: 115, damage: 7, structureDamage: 8, attackRate: 1.15, radius: 23 }, caps: { perWave: 999, simultaneous: 999 }, assets: { portrait: "enemies/basic-zombie", body: "gameplay/enemies/basic/body", hand: "gameplay/enemies/basic/hand" }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  runner: enemy({ id: "runner", displayName: "Runner", description: "Fast and evasive, but fragile.", tell: "Small bright-green body", tier: 2, introductionNight: 2, selectionWeight: 1, spawnWeight: 18, threat: 1.15, xp: 1, base: { health: 28, speed: 180, damage: 5, structureDamage: 5, attackRate: 0.72, radius: 20 }, caps: { perWave: 14, simultaneous: 10 }, assets: { portrait: "enemies/runner-zombie", body: "gameplay/enemies/runner/body", hand: "gameplay/enemies/runner/hand" }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.7 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  breaker: enemy({ id: "breaker", displayName: "Breaker", description: "Slow, armored, and brutal against structures.", tell: "Dark body and helmet", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 12, threat: 2.5, xp: 3, base: { health: 100, speed: 76, damage: 8, structureDamage: 18, attackRate: 1.45, radius: 29 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: "enemies/breaker-zombie", body: "gameplay/enemies/breaker/body", hand: "gameplay/enemies/breaker/hand" }, audio: { attack: "breaker-smash", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.8 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  gremlin: enemy({ id: "gremlin", displayName: "Gremlin", description: "Targets harvesters and anything in its way.", tell: "Devious ears", tier: 3, introductionNight: 3, selectionWeight: 0.8, spawnWeight: 10, threat: 2.1, xp: 2, base: { health: 58, speed: 132, damage: 6, structureDamage: 13, attackRate: 0.95, radius: 17.3 }, caps: { perWave: 7, simultaneous: 4 }, assets: { portrait: "enemies/gremlin-zombie", body: "enemies/gremlin-zombie", hand: "enemies/gremlin-zombie" }, render: { aspectRatio: 80 / 52, width: 60, height: 39 }, audio: { attack: "gremlin-sabotage", death: "zombie-death" }, targeting: { mode: "harvester", detectionRadius: 760, attackRange: 0, lockSeconds: 1.8 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.32 }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  splitter: enemy({ id: "splitter", displayName: "Splitter", description: "Breaks into two tiny combatants when killed in battle.", tell: "Cracked divided body", tier: 3, introductionNight: 3, selectionWeight: 0.7, spawnWeight: 8, threat: 1.4, xp: 2, base: { health: 54, speed: 112, damage: 7, structureDamage: 8, attackRate: 1.15, radius: 24 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: "enemies/splitter-zombie", body: "enemies/splitter-zombie", hand: "enemies/splitter-zombie" }, render: { aspectRatio: 70 / 50, height: 50, width: 70 }, audio: { attack: "zombie-attack", death: "splitter-split" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "split", splitCount: 2, childHealth: 0.25, childDamage: 0.25, childSize: 0.75 }, rosterEligible: true, countsForKills: true }),
  "splitter-child": enemy({ id: "splitter-child", displayName: "Splitter Child", description: "A tiny shard of a fallen Splitter.", tell: "Tiny cracked body", tier: 3, introductionNight: 3, selectionWeight: 0, spawnWeight: 0, threat: 0, xp: 0, base: { health: 13.5, speed: 112, damage: 1.75, structureDamage: 2, attackRate: 1.15, radius: 18 }, caps: { perWave: 24, simultaneous: 18 }, assets: { portrait: "enemies/splitter-child-zombie", body: "enemies/splitter-child-zombie", hand: "enemies/splitter-child-zombie" }, render: { aspectRatio: 28 / 23, height: 46, width: 56 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: false, countsForKills: false }),
  jumper: enemy({ id: "jumper", displayName: "Jumper", description: "Telegraphs a hop over one constructed barrier.", tell: "Green jump burst", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 10, threat: 2, xp: 2, base: { health: 48, speed: 128, damage: 8, structureDamage: 7, attackRate: 1.1, radius: 22 }, caps: { perWave: 9, simultaneous: 7 }, assets: { portrait: "enemies/jumper-zombie", body: "gameplay/enemies/jumper/body", hand: "gameplay/enemies/jumper/hand" }, audio: { attack: "zombie-attack", move: "jumper-jump", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 440, attackRange: 0, lockSeconds: 0.7 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, leap: { range: 180, cooldown: 0, duration: 0.55, arcHeight: 28, landingClearance: 10, landingDistancePadding: 24, landingAttempts: 5, failedRetryCooldown: 0.6, particleColor: "#b7ff8a", launchParticleCount: 9, landingParticleCount: 7, launchPopupText: "JUMP", landingPopupText: "LAND" }, rosterEligible: true, countsForKills: true }),
  popper: enemy({ id: "popper", displayName: "Popper", description: "Bursts into damaging acid when killed in combat.", tell: "Volatile acid sacs", tier: 5, introductionNight: 5, selectionWeight: 0.75, spawnWeight: 7, threat: 2.8, xp: 3, base: { health: 46, speed: 105, damage: 6, structureDamage: 7, attackRate: 1.18, radius: 24 }, caps: { perWave: 7, simultaneous: 6 }, assets: { portrait: "enemies/popper-zombie", body: "enemies/popper-zombie", hand: "enemies/popper-zombie" }, render: { aspectRatio: 80 / 60, height: 60, width: 80 }, audio: { attack: "zombie-attack", death: "popper-burst" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "acid-burst", burstInnerRadius: 52, burstOuterRadius: 145, burstDamage: 30, burstPlayerDamage: 30, burstFlagDamage: 30, burstStructureDamage: 30, burstFalloff: 1.7, burstWaveDuration: 0.38, burstTargets: ["player", "flag", "wall", "door", "spikes", "harvester", "turret"], triggersFromSunlight: false }, rosterEligible: true, countsForKills: true }),
  archer: enemy({ id: "archer", displayName: "Archer", description: "Charges black arrows at turrets, then the player.", tell: "Black bow", tier: 5, introductionNight: 5, selectionWeight: 0.65, spawnWeight: 6, threat: 3, xp: 3, base: { health: 44, speed: 92, damage: 10, structureDamage: 12, attackRate: 1.8, radius: 23 }, caps: { perWave: 7, simultaneous: 5 }, assets: { portrait: "enemies/archer-zombie", body: "enemies/archer-zombie", hand: "enemies/archer-zombie" }, render: { aspectRatio: 70 / 70, height: 70, width: 70 }, audio: { projectile: "archer-bow-fire", impact: "archer-arrow-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 620, attackRange: 470, lockSeconds: 1.1 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 390, meleeSpikes: false }, attack: { mode: "arrow", chargeSeconds: 1.15 }, projectile: { owner: "enemy-arrow", damageSource: "enemy-arrow", speed: 760, range: 680, lifetime: 1.4, radius: 4, width: 3, pierces: false, targets: ["turret", "player", "flag"], color: "#17191c", appearance: "arrow" }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  summoner: enemy({ id: "summoner", displayName: "Summoner", description: "Conjures reinforcements, up to five living summons.", tell: "Purple summoning ring", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 7, threat: 3.6, xp: 4, base: { health: 78, speed: 90, damage: 6, structureDamage: 8, attackRate: 1.3, radius: 26 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/summoner-zombie", body: "gameplay/enemies/summoner/body", hand: "gameplay/enemies/summoner/hand" }, audio: { attack: "zombie-attack", charge: "summoner-cast", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.7 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, summon: { initialCooldown: { minimum: 5, maximum: 8 }, cooldown: 4, cappedRetryCooldown: 2, maximumLiving: 5, particleColor: "#9d6bff", particleCount: 14, popupText: "SUMMON" }, rosterEligible: true, countsForKills: true }),
  acidslinger: enemy({ id: "acidslinger", displayName: "Acidslinger", description: "Bombards priority targets and melts obstacles blocking its route.", tell: "Green acid tank", tier: 7, introductionNight: 7, selectionWeight: 0.65, spawnWeight: 5, threat: 4.2, xp: 5, base: { health: 72, speed: 84, damage: 7, structureDamage: 9, attackRate: 1.5, radius: 25 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/acidslinger-zombie", body: "enemies/acidslinger-zombie", hand: "enemies/acidslinger-zombie" }, render: { aspectRatio: 98 / 56, height: 56, width: 98 }, audio: { projectile: "acidslinger-fire", impact: "acidslinger-impact", death: "zombie-death" }, targeting: { mode: "acidslinger", detectionRadius: 520, attackRange: 310, innerRadius: 230, lockSeconds: 1.2 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 245, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.35 }, projectile: { owner: "enemy-acid", damageSource: "enemy-acid", speed: 430, range: 440, lifetime: 1.3, radius: 9, width: 18, pierces: true, targets: ["player", "wall", "door", "spikes", "harvester", "turret", "flag"], color: "#73db35", appearance: "arrow" }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  rammer: enemy({ id: "rammer", displayName: "Rammer", description: "Loads a devastating charge through defensive lines.", tell: "Heavy horned helm", tier: 7, introductionNight: 7, selectionWeight: 0.55, spawnWeight: 4, threat: 5.2, xp: 6, base: { health: 155, speed: 62, damage: 4, structureDamage: 5, attackRate: 2, radius: 34 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/rammer-zombie", body: "enemies/rammer-zombie", hand: "enemies/rammer-zombie" }, render: { aspectRatio: 100 / 70, height: 61.6, width: 88 }, audio: { charge: "rammer-charge", move: "rammer-rush", impact: "rammer-impact", death: "zombie-death" }, targeting: { mode: "rammer", detectionRadius: 330, attackRange: 0, lockSeconds: 1.4 }, movement: { avoidStructures: false, obstacleFallback: false, preferredRange: 0, meleeSpikes: false }, attack: { mode: "ram", chargeSeconds: 1.7 }, death: { mode: "none" }, ram: { targetRadius: 260, damage: 300, distance: 390, speed: 560, loadSeconds: 1.7, targetKinds: ["wall", "door", "spikes"], telegraphColor: "rgba(255,181,83,.9)", telegraphLength: 130, healthBarWidth: 72, chargeBurst: { color: "#ffb35c", count: 14, popupText: "CHARGE" }, breachBurst: { color: "#ff9a51", count: 18, popupText: "BREACH" } }, rosterEligible: true, countsForKills: true }),
  frostbite: enemy({ id: "frostbite", displayName: "Frostbiter", description: "A swift ice skater whose chilling strikes slow defenders.", tell: "Icy claws", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 13, threat: 1.9, xp: 2, base: { health: 54, speed: 150, damage: 7, structureDamage: 7, attackRate: 0.88, radius: 21 }, caps: { perWave: 9, simultaneous: 7 }, assets: { portrait: "enemies/frostbite-zombie", body: "enemies/frostbite-zombie", hand: "enemies/frostbite-zombie" }, render: { aspectRatio: 1, height: 78, width: 78 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 0.62 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.25, statusEffect: { kind: "slow", duration: 3, targets: ["player", "turret"], popupTextColor: "#63c6e8" } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  snowballer: enemy({ id: "snowballer", displayName: "Snowballer", description: "A night-five ranged attacker that hurls packed ice at turrets and defenders.", tell: "Raised snowball and wool cap", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 8, threat: 3, xp: 3, base: { health: 52, speed: 88, damage: 9, structureDamage: 11, attackRate: 1.7, radius: 24 }, caps: { perWave: 7, simultaneous: 5 }, assets: { portrait: "enemies/snowballer-zombie", body: "enemies/snowballer-zombie", hand: "enemies/snowballer-zombie" }, render: { aspectRatio: 1, height: 80, width: 80 }, audio: { projectile: "archer-bow-fire", impact: "archer-arrow-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 590, attackRange: 350, lockSeconds: 1 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 350, meleeSpikes: false }, attack: { mode: "arrow", chargeSeconds: 1.05 }, projectile: { owner: "enemy-arrow", damageSource: "enemy-arrow", speed: 610, range: 620, lifetime: 1.45, radius: 7, width: 12, pierces: false, targets: ["turret", "player", "flag"], color: "#dff8ff", appearance: "snowball", statusEffect: { kind: "slow", duration: 1.75, targets: ["player", "turret"], popupTextColor: "#63c6e8" }, impactBurst: { color: "#e7fbff", count: 14 } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  icebound: enemy({ id: "icebound", displayName: "Icebound Crusher", description: "A night-seven frozen brute whose thick shell absorbs sustained fire.", tell: "Cracked ice armor", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 5, threat: 5, xp: 6, base: { health: 175, speed: 64, damage: 12, structureDamage: 22, attackRate: 1.55, radius: 35 }, caps: { perWave: 5, simultaneous: 3 }, assets: { portrait: "enemies/icebound-zombie", body: "enemies/icebound-zombie", hand: "enemies/icebound-zombie" }, render: { aspectRatio: 1, height: 98, width: 98 }, armor: { health: 90, projectileResistance: 0.5, barColor: "#79dced", label: "ICE ARMOR", brokenSprite: "enemies/icebound-zombie-broken", breakShardCount: 34, breakText: "Break", breakShake: 8 }, audio: { attack: "breaker-smash", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 1 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.38 }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  boss: enemy({ id: "boss", displayName: "The Boss", description: "Marches on the flag. At half health, slams the ground and raises ten zombies.", tell: "Ten health segments", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 40, xp: 20, base: { health: 1200, speed: 54, damage: 18, structureDamage: 88, attackRate: 1.8, radius: 66 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: "enemies/countdown-boss", body: "enemies/countdown-boss", hand: "gameplay/enemies/basic/hand" }, audio: { attack: "zombie-attack", projectile: "boss-acid-spit", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  "frost-warden": enemy({ id: "frost-warden", displayName: "Frost Warden", description: "Break its ice shell, survive Frost Slam, and evade erupting icicles.", tell: "Ice armor and ground warning circles", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 42, xp: 24, base: { health: 900, speed: 50, damage: 20, structureDamage: 96, attackRate: 1.9, radius: 68 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: "enemies/frost-warden", body: "enemies/frost-warden", hand: "gameplay/enemies/basic/hand" }, armor: { health: 560, scalesWithHealth: true, projectileResistance: 0.5, barColor: "#9cecff", label: "ICE ARMOR", brokenSprite: "enemies/frost-warden-broken", breakShardCount: 58, breakShake: 30 }, audio: { attack: "zombie-attack", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: false, campaignTierIds: ["snowy"], countsForKills: true }),
};

export const ROSTER_TIERS: readonly RosterTier[] = [1, 2, 3, 5, 7];

export function isBossEnemyKind(kind: EnemyKind): kind is BossEnemyKind {
  const definition = ENEMY_REGISTRY[kind];
  return definition.tier === 10 && !definition.rosterEligible;
}

export type EnemyRoster = Record<RosterTier, RosterEnemyKind>;

export function selectEnemyRoster(seed: string, campaignTierId: CampaignTierId = "forest"): EnemyRoster {
  const rng = new SeededRng(`${seed}:enemy-roster`);
  const selected = Object.fromEntries(ROSTER_TIERS.map((tier) => {
    const candidates = Object.values(ENEMY_REGISTRY).filter(
      (entry): entry is EnemyDefinition & { id: RosterEnemyKind } =>
        entry.rosterEligible && entry.tier === tier
        && (!entry.campaignTierIds || entry.campaignTierIds.includes(campaignTierId)),
    );
    return [tier, rng.weighted(candidates.map((entry) => ({ value: entry.id, weight: entry.selectionWeight })))];
  })) as EnemyRoster;
  for (const kind of campaignTier(campaignTierId).specialEnemies) {
    const tier = ENEMY_REGISTRY[kind].tier;
    if (tier === 10) {
      throw new Error(`Campaign special enemy ${kind} must occupy a roster tier.`);
    }
    selected[tier] = kind;
  }
  return selected;
}

export function rosterMilestones(roster: EnemyRoster, bossKind: BossEnemyKind = "boss"): Array<{ night: number; enemy: EnemyKind; label: string }> {
  return [
    ...ROSTER_TIERS.map((tier) => {
      const kind = roster[tier];
      const definition = ENEMY_REGISTRY[kind];
      return { night: definition.introductionNight, enemy: kind, label: definition.displayName };
    }),
    { night: ENEMY_REGISTRY[bossKind].introductionNight, enemy: bossKind, label: ENEMY_REGISTRY[bossKind].displayName },
  ].sort((a, b) => a.night - b.night);
}

export function introducedRosterEnemies(roster: EnemyRoster, night: number): RosterEnemyKind[] {
  return ROSTER_TIERS
    .map((tier) => roster[tier])
    .filter((kind) => ENEMY_REGISTRY[kind].introductionNight <= night);
}

export function endlessRosterOrder(seed: string, roster: EnemyRoster): RosterEnemyKind[] {
  const selected = new Set(Object.values(roster));
  const candidates = Object.values(ENEMY_REGISTRY)
    .filter((entry): entry is EnemyDefinition & { id: RosterEnemyKind } =>
      entry.rosterEligible && !selected.has(entry.id as RosterEnemyKind));
  return new SeededRng(`${seed}:endless-roster`).shuffle(candidates.map((entry) => entry.id));
}

export function endlessRosterAdditions(
  seed: string,
  roster: EnemyRoster,
  night: number,
  interval = 5,
): RosterEnemyKind[] {
  const completedIntervals = Math.max(
    0,
    Math.floor((night - 10) / Math.max(1, interval)),
  );
  return endlessRosterOrder(seed, roster).slice(0, completedIntervals);
}

export function activeRosterEnemies(
  seed: string,
  roster: EnemyRoster,
  night: number,
  endless: boolean,
  interval = 5,
): RosterEnemyKind[] {
  const base = introducedRosterEnemies(roster, night);
  if (!endless) return base;
  return [...new Set([...base, ...endlessRosterAdditions(seed, roster, night, interval)])];
}

export function endlessRosterMilestones(
  seed: string,
  roster: EnemyRoster,
  interval = 5,
): Array<{ night: number; enemy: RosterEnemyKind; label: string }> {
  return endlessRosterOrder(seed, roster).map((enemyKind, index) => ({
    night: 10 + Math.max(1, interval) * (index + 1),
    enemy: enemyKind,
    label: ENEMY_REGISTRY[enemyKind].displayName,
  }));
}

export function mutationWeightKey(kind: RosterEnemyKind): "basicWeight" | "runnerWeight" | "breakerWeight" | "jumperWeight" | "summonerWeight" {
  // Save-compatible mutation fields represent roster tiers. The seeded enemy
  // selected for that tier is the live consumer of the corresponding weight.
  const tier = ENEMY_REGISTRY[kind].tier;
  if (tier === 1) return "basicWeight";
  if (tier === 2) return "runnerWeight";
  if (tier === 3) return "breakerWeight";
  if (tier === 5) return "jumperWeight";
  return "summonerWeight";
}
