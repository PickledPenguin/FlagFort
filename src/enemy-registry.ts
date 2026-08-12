import { SeededRng } from "./rng";
import { campaignTier } from "./campaign";
import { DESERT_ENEMY_ARTWORK } from "./desert-enemy-artwork";
import { ASTRAL_ENEMY_ARTWORK } from "./astral-enemy-artwork";
import { VOLCANIC_ENEMY_ARTWORK } from "./volcanic-enemy-artwork";
import { WASTELAND_ENEMY_ARTWORK } from "./wasteland-enemy-artwork";
import { MIRE_ENEMY_ARTWORK } from "./mire-enemy-artwork";
import type { BossEnemyKind, CampaignTierId, DamageSource, EnemyKind, EnemyStatusEffect, RosterEnemyKind, RosterTier, StructureKind } from "./types";

export type EnemyTargetingMode = "standard" | "flag" | "player" | "harvester" | "archer" | "acidslinger" | "rammer";
export type EnemyAttackMode = "melee" | "arrow" | "acid" | "ram" | "boss";
export type EnemyDeathMode = "none" | "split" | "burst";

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
    breakShardColors: readonly [{ value: string; weight: number }, ...Array<{ value: string; weight: number }>];
    breakAudio: string;
    breakText?: string;
    breakShake: number;
    breakStatusPulse?: {
      radius: number;
      duration: number;
      statusEffect: EnemyStatusEffect;
      areaEffect: "frost-slam";
      particleColor: string;
      particleCount: number;
      popupText: string;
      popupTextColor: string;
      popupTextOffsetY: number;
      appearance?: {
        center: string;
        middle: string;
        edge: string;
        stroke: string;
        highlight: string;
      };
    };
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
    lifeSteal?: {
      healingRatio: number;
      targets: readonly ("player" | "flag" | StructureKind)[];
      particleColor: string;
      particleCount: number;
      popupText: string;
    };
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
    appearance: "arrow" | "snowball" | "sandblast" | "magma" | "sludge" | "comet" | "spore";
    statusEffect?: EnemyStatusEffect;
    impactBurst?: {
      color: string;
      count: number;
    };
  };
  death: {
    mode: EnemyDeathMode;
    childKind?: EnemyKind;
    splitCount?: number;
    childHealth?: number;
    childDamage?: number;
    childSize?: number;
    particleColor?: string;
    particleCount?: number;
    popupText?: string;
    screenShake?: number;
    burstInnerRadius?: number;
    burstOuterRadius?: number;
    burstDamage?: number;
    burstPlayerDamage?: number;
    burstFlagDamage?: number;
    burstStructureDamage?: number;
    burstFalloff?: number;
    burstWaveDuration?: number;
    burstDamageSource?: DamageSource;
    burstWaveSprite?: string;
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
  areaStrike?: {
    appearance: {
      shape: "spike";
      warningFill: string;
      warningOutline: string;
      warningProgress: string;
      warningPulse: string;
      eruptionShadow: string;
      eruptionEdge: string;
      eruptionHighlight: string;
      eruptionFarEdge: string;
      eruptionOutline: string;
    };
    rngSeedKey: string;
    initialCooldown: number;
    cooldown: number;
    activationRadius: number;
    randomStrikeCount: number;
    includesTargetedStrike: boolean;
    placementMinimumRadius: number;
    placementMaximumRadius: number;
    placementAngleJitter: number;
    strikeAngleJitter: number;
    warningDuration: number;
    eruptionDuration: number;
    radius: number;
    playerDamage: number;
    structureDamage: number;
    damageSource: DamageSource;
    statusEffect?: EnemyStatusEffect;
    impactColor: string;
    impactParticleCount: number;
    screenShake: number;
    impactAudio: string;
  };
  phaseSlam?: {
    triggerHealthRatio: number;
    chargeDuration: number;
    reinforcementKind: EnemyKind;
    reinforcementCount: number;
    radius: number;
    playerDamage: number;
    flagDamage: number;
    structureDamage: number;
    waveDuration: number;
    areaEffect: "boss-slam";
    particleColor: string;
    particleCount: number;
    popupText: string;
    telegraphColor: string;
    screenShake: number;
    impactAudio: string;
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
  splitter: enemy({ id: "splitter", displayName: "Splitter", description: "Breaks into two tiny combatants when killed in battle.", tell: "Cracked divided body", tier: 3, introductionNight: 3, selectionWeight: 0.7, spawnWeight: 8, threat: 1.4, xp: 2, base: { health: 54, speed: 112, damage: 7, structureDamage: 8, attackRate: 1.15, radius: 24 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: "enemies/splitter-zombie", body: "enemies/splitter-zombie", hand: "enemies/splitter-zombie" }, render: { aspectRatio: 70 / 50, height: 50, width: 70 }, audio: { attack: "zombie-attack", death: "splitter-split" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "split", childKind: "splitter-child", splitCount: 2, childHealth: 0.25, childDamage: 0.25, childSize: 0.75, particleColor: "#b9e36f", particleCount: 18, popupText: "SPLIT" }, rosterEligible: true, countsForKills: true }),
  "splitter-child": enemy({ id: "splitter-child", displayName: "Splitter Child", description: "A tiny shard of a fallen Splitter.", tell: "Tiny cracked body", tier: 3, introductionNight: 3, selectionWeight: 0, spawnWeight: 0, threat: 0, xp: 0, base: { health: 13.5, speed: 112, damage: 1.75, structureDamage: 2, attackRate: 1.15, radius: 18 }, caps: { perWave: 24, simultaneous: 18 }, assets: { portrait: "enemies/splitter-child-zombie", body: "enemies/splitter-child-zombie", hand: "enemies/splitter-child-zombie" }, render: { aspectRatio: 28 / 23, height: 46, width: 56 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, rosterEligible: false, countsForKills: false }),
  jumper: enemy({ id: "jumper", displayName: "Jumper", description: "Telegraphs a hop over one constructed barrier.", tell: "Green jump burst", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 10, threat: 2, xp: 2, base: { health: 48, speed: 128, damage: 8, structureDamage: 7, attackRate: 1.1, radius: 22 }, caps: { perWave: 9, simultaneous: 7 }, assets: { portrait: "enemies/jumper-zombie", body: "gameplay/enemies/jumper/body", hand: "gameplay/enemies/jumper/hand" }, audio: { attack: "zombie-attack", move: "jumper-jump", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 440, attackRange: 0, lockSeconds: 0.7 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, leap: { range: 180, cooldown: 0, duration: 0.55, arcHeight: 28, landingClearance: 10, landingDistancePadding: 24, landingAttempts: 5, failedRetryCooldown: 0.6, particleColor: "#b7ff8a", launchParticleCount: 9, landingParticleCount: 7, launchPopupText: "JUMP", landingPopupText: "LAND" }, rosterEligible: true, countsForKills: true }),
  "dune-hopper": enemy({ id: "dune-hopper", displayName: "Dune Hopper", description: "Vaults defensive lines in long, sand-trailing bounds, but is fragile once cornered.", tell: "Springing legs and red desert scarf", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 11, threat: 2.2, xp: 2, base: { health: 50, speed: 138, damage: 7, structureDamage: 5, attackRate: 0.95, radius: 22 }, caps: { perWave: 9, simultaneous: 7 }, assets: { portrait: DESERT_ENEMY_ARTWORK.duneHopper, body: DESERT_ENEMY_ARTWORK.duneHopper, hand: DESERT_ENEMY_ARTWORK.duneHopper }, render: { aspectRatio: 104 / 96, width: 78, height: 72 }, audio: { attack: "zombie-attack", move: "jumper-jump", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 470, attackRange: 0, lockSeconds: 0.65 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.27 }, death: { mode: "none" }, leap: { range: 230, cooldown: 2.4, duration: 0.62, arcHeight: 42, landingClearance: 12, landingDistancePadding: 30, landingAttempts: 6, failedRetryCooldown: 0.75, particleColor: "#e9b85f", launchParticleCount: 14, landingParticleCount: 11, launchPopupText: "BOUND", landingPopupText: "LAND" }, rosterEligible: true, campaignTierIds: ["desert"], countsForKills: true }),
  sandcaster: enemy({ id: "sandcaster", displayName: "Sandcaster", description: "Hurls piercing sandblasts through aligned defenders, but folds under close pressure.", tell: "Raised sand orb and desert-blue robes", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 7, threat: 3.4, xp: 4, base: { health: 58, speed: 82, damage: 8, structureDamage: 13, attackRate: 1.85, radius: 25 }, caps: { perWave: 6, simultaneous: 4 }, assets: { portrait: DESERT_ENEMY_ARTWORK.sandcaster, body: DESERT_ENEMY_ARTWORK.sandcaster, hand: DESERT_ENEMY_ARTWORK.sandcaster }, render: { aspectRatio: 88 / 104, width: 68, height: 80 }, audio: { projectile: "archer-bow-fire", impact: "archer-arrow-impact", death: "zombie-death" }, targeting: { mode: "acidslinger", detectionRadius: 560, attackRange: 390, innerRadius: 210, lockSeconds: 1.15 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 330, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.2 }, projectile: { owner: "enemy-arrow", damageSource: "sandcaster", speed: 520, range: 540, lifetime: 1.35, radius: 9, width: 22, pierces: true, targets: ["player", "wall", "door", "spikes", "harvester", "turret", "flag"], color: "#d8a84f", appearance: "sandblast", impactBurst: { color: "#f1ca75", count: 12 } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["desert"], countsForKills: true }),
  tombguard: enemy({ id: "tombguard", displayName: "Tombguard", description: "A sandstone-plated structure bruiser that shrugs off projectiles until its shell is broken.", tell: "Layered sandstone armor and scarab crest", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 5, threat: 5.8, xp: 7, base: { health: 155, speed: 59, damage: 11, structureDamage: 26, attackRate: 1.6, radius: 36 }, caps: { perWave: 5, simultaneous: 3 }, assets: { portrait: DESERT_ENEMY_ARTWORK.tombguard.armored, body: DESERT_ENEMY_ARTWORK.tombguard.armored, hand: DESERT_ENEMY_ARTWORK.tombguard.armored }, render: { aspectRatio: 112 / 100, width: 102, height: 91 }, armor: { health: 110, projectileResistance: 0.65, barColor: "#d5a657", label: "TOMB ARMOR", brokenSprite: DESERT_ENEMY_ARTWORK.tombguard.broken, breakShardCount: 36, breakShardColors: [{ value: "#edc879", weight: 0.35 }, { value: "#b77b42", weight: 0.65 }], breakAudio: "ice-shatter", breakText: "CRACK", breakShake: 9 }, audio: { attack: "breaker-smash", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 360, attackRange: 0, lockSeconds: 1.05 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.4 }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["desert"], countsForKills: true }),
  cinderburst: enemy({ id: "cinderburst", displayName: "Cinderburst", description: "A volatile front-line attacker whose blazing core erupts when slain. Finish it away from your defenses.", tell: "Cracked charcoal shell around a glowing cinder core", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 9, threat: 3.3, xp: 4, base: { health: 72, speed: 122, damage: 8, structureDamage: 10, attackRate: 1.08, radius: 25 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: VOLCANIC_ENEMY_ARTWORK.cinderburst, body: VOLCANIC_ENEMY_ARTWORK.cinderburst, hand: VOLCANIC_ENEMY_ARTWORK.cinderburst }, render: { aspectRatio: 108 / 100, width: 81, height: 75 }, audio: { attack: "zombie-attack", death: "popper-burst" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 0.65 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.3 }, death: { mode: "burst", burstInnerRadius: 58, burstOuterRadius: 165, burstPlayerDamage: 28, burstFlagDamage: 24, burstStructureDamage: 42, burstFalloff: 1.8, burstWaveDuration: 0.44, burstDamageSource: "cinderburst-burst", burstWaveSprite: "effects/cinderburst-wave", burstTargets: ["player", "flag", "wall", "door", "spikes", "harvester", "turret"], triggersFromSunlight: false, particleColor: "#ff8738", particleCount: 42, popupText: "CINDER BLAST", screenShake: 9 }, rosterEligible: true, campaignTierIds: ["volcanic"], countsForKills: true }),
  "magma-spitter": enemy({ id: "magma-spitter", displayName: "Magma Spitter", description: "Bombards harvesters with arcing magma from long range, but is vulnerable when rushed.", tell: "Raised magma glob and furnace-bright jaw", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 6, threat: 4.2, xp: 5, base: { health: 68, speed: 76, damage: 10, structureDamage: 25, attackRate: 2.15, radius: 27 }, caps: { perWave: 6, simultaneous: 4 }, assets: { portrait: VOLCANIC_ENEMY_ARTWORK.magmaSpitter, body: VOLCANIC_ENEMY_ARTWORK.magmaSpitter, hand: VOLCANIC_ENEMY_ARTWORK.magmaSpitter }, render: { aspectRatio: 112 / 104, width: 82, height: 76 }, audio: { projectile: "boss-acid-spit", impact: "structure-damaged", death: "zombie-death" }, targeting: { mode: "harvester", detectionRadius: 720, attackRange: 430, innerRadius: 190, lockSeconds: 1.8 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 360, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.35 }, projectile: { owner: "enemy-acid", damageSource: "magma-spitter", speed: 390, range: 580, lifetime: 1.6, radius: 11, width: 24, pierces: false, targets: ["harvester", "turret", "wall", "door", "spikes", "player", "flag"], color: "#ff6a24", appearance: "magma", impactBurst: { color: "#ffb13b", count: 16 } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["volcanic"], countsForKills: true }),
  "obsidian-charger": enemy({ id: "obsidian-charger", displayName: "Obsidian Charger", description: "Shrugs off arrows behind volcanic plate, then smashes through a defensive line in one committed rush.", tell: "Wedge-shaped obsidian armor and glowing seams", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 4, threat: 6.8, xp: 8, base: { health: 178, speed: 58, damage: 7, structureDamage: 9, attackRate: 2.1, radius: 37 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: VOLCANIC_ENEMY_ARTWORK.obsidianCharger.armored, body: VOLCANIC_ENEMY_ARTWORK.obsidianCharger.armored, hand: VOLCANIC_ENEMY_ARTWORK.obsidianCharger.armored }, render: { aspectRatio: 116 / 104, width: 106, height: 95 }, armor: { health: 125, projectileResistance: 0.6, barColor: "#554d61", label: "OBSIDIAN ARMOR", brokenSprite: VOLCANIC_ENEMY_ARTWORK.obsidianCharger.broken, breakShardCount: 42, breakShardColors: [{ value: "#71677d", weight: 0.35 }, { value: "#292630", weight: 0.65 }], breakAudio: "ice-shatter", breakText: "SHATTER", breakShake: 11 }, audio: { charge: "rammer-charge", move: "rammer-rush", impact: "rammer-impact", death: "zombie-death" }, targeting: { mode: "rammer", detectionRadius: 380, attackRange: 0, lockSeconds: 1.25 }, movement: { avoidStructures: false, obstacleFallback: false, preferredRange: 0, meleeSpikes: false }, attack: { mode: "ram", chargeSeconds: 1.45 }, death: { mode: "none" }, ram: { targetRadius: 290, damage: 390, distance: 440, speed: 610, loadSeconds: 1.45, targetKinds: ["wall", "door", "spikes"], telegraphColor: "rgba(255,106,36,.92)", telegraphLength: 155, healthBarWidth: 82, chargeBurst: { color: "#ff7a2d", count: 18, popupText: "ERUPT" }, breachBurst: { color: "#ffb13b", count: 24, popupText: "MOLTEN BREACH" } }, rosterEligible: true, campaignTierIds: ["volcanic"], countsForKills: true }),
  "caldera-sovereign": enemy({ id: "caldera-sovereign", displayName: "Caldera Sovereign", description: "Crack its obsidian crown, escape erupting magma fissures, and contain the Cinderbursts awakened at half health.", tell: "Three arms, basalt crown, and furnace-bright ground warnings", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 56, xp: 32, base: { health: 1180, speed: 45, damage: 24, structureDamage: 120, attackRate: 2.1, radius: 76 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: VOLCANIC_ENEMY_ARTWORK.calderaSovereign.armored, body: VOLCANIC_ENEMY_ARTWORK.calderaSovereign.armored, hand: VOLCANIC_ENEMY_ARTWORK.calderaSovereign.armored }, render: { aspectRatio: 156 / 144, width: 137, height: 126 }, armor: { health: 690, scalesWithHealth: true, projectileResistance: 0.65, barColor: "#554d61", label: "CALDERA ARMOR", brokenSprite: VOLCANIC_ENEMY_ARTWORK.calderaSovereign.broken, breakShardCount: 72, breakShardColors: [{ value: "#71677d", weight: 0.35 }, { value: "#292630", weight: 0.65 }], breakAudio: "ice-shatter", breakText: "CROWN SHATTERED", breakShake: 30 }, audio: { attack: "breaker-smash", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.36 }, areaStrike: { appearance: { shape: "spike", warningFill: "rgba(255,86,24,.17)", warningOutline: "rgba(126,38,25,.94)", warningProgress: "rgba(255,207,76,.98)", warningPulse: "rgba(255,119,40,.42)", eruptionShadow: "rgba(75,24,20,.3)", eruptionEdge: "#8f2f24", eruptionHighlight: "#ffd45e", eruptionFarEdge: "#ff6528", eruptionOutline: "#491c1c" }, rngSeedKey: "caldera-sovereign:magma-fissures", initialCooldown: 1.1, cooldown: 3.9, activationRadius: 850, randomStrikeCount: 5, includesTargetedStrike: true, placementMinimumRadius: 110, placementMaximumRadius: 280, placementAngleJitter: 0.46, strikeAngleJitter: 0.28, warningDuration: 1.35, eruptionDuration: 0.74, radius: 62, playerDamage: 28, structureDamage: 68, damageSource: "caldera-sovereign", impactColor: "#ff8b32", impactParticleCount: 30, screenShake: 12, impactAudio: "breaker-smash" }, phaseSlam: { triggerHealthRatio: 0.5, chargeDuration: 1.5, reinforcementKind: "cinderburst", reinforcementCount: 5, radius: 300, playerDamage: 34, flagDamage: 52, structureDamage: 180, waveDuration: 0.58, areaEffect: "boss-slam", particleColor: "#ff6a24", particleCount: 40, popupText: "CALDERA AWAKENS", telegraphColor: "rgba(255,86,24,.88)", screenShake: 18, impactAudio: "breaker-smash" }, death: { mode: "none" }, rosterEligible: false, campaignTierIds: ["volcanic"], countsForKills: true }),
  radstalker: enemy({ id: "radstalker", displayName: "Radstalker", description: "Hunts exposed defenders through gaps in the fort and leaves them slowed by irradiated claws.", tell: "Hazard hood, glowing claws, and a cracked radiation canister", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 9, threat: 3.6, xp: 4, base: { health: 76, speed: 158, damage: 9, structureDamage: 6, attackRate: 0.82, radius: 23 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: WASTELAND_ENEMY_ARTWORK.radstalker, body: WASTELAND_ENEMY_ARTWORK.radstalker, hand: WASTELAND_ENEMY_ARTWORK.radstalker }, render: { aspectRatio: 110 / 100, width: 83, height: 75 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "player", detectionRadius: 720, attackRange: 0, lockSeconds: 1.4 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.24, statusEffect: { kind: "slow", duration: 2.6, targets: ["player"], popupTextColor: "#cfff71", particleColor: "#79d63c", popupText: "Irradiated" } }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  "sludge-lobber": enemy({ id: "sludge-lobber", displayName: "Sludge Lobber", description: "Suppresses turrets and defenders with toxic bombs that slow their attacks and movement.", tell: "Leaking tank, respirator, and a raised glowing sludge bomb", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 7, threat: 4.8, xp: 6, base: { health: 84, speed: 78, damage: 12, structureDamage: 18, attackRate: 2.05, radius: 27 }, caps: { perWave: 6, simultaneous: 4 }, assets: { portrait: WASTELAND_ENEMY_ARTWORK.sludgeLobber, body: WASTELAND_ENEMY_ARTWORK.sludgeLobber, hand: WASTELAND_ENEMY_ARTWORK.sludgeLobber }, render: { aspectRatio: 118 / 104, width: 85, height: 75 }, audio: { projectile: "acidslinger-fire", impact: "acidslinger-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 680, attackRange: 440, innerRadius: 190, lockSeconds: 1.55 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 370, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.3 }, projectile: { owner: "enemy-acid", damageSource: "sludge-lobber", speed: 410, range: 590, lifetime: 1.65, radius: 12, width: 25, pierces: false, targets: ["turret", "player", "flag"], color: "#8ddd3e", appearance: "sludge", statusEffect: { kind: "slow", duration: 3.4, targets: ["player", "turret"], popupTextColor: "#dfff86", particleColor: "#75c83b", popupText: "Sludged" }, impactBurst: { color: "#9ee84c", count: 18 } }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  "ruin-siren": enemy({ id: "ruin-siren", displayName: "Ruin Siren", description: "Broadcasts a rally signal that calls Radstalkers from the fallout. Silence it before its hunting pack grows.", tell: "Flashing red siren, radio backpack, and broadcast waves", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 4, threat: 6.4, xp: 8, base: { health: 118, speed: 68, damage: 8, structureDamage: 11, attackRate: 1.45, radius: 31 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: WASTELAND_ENEMY_ARTWORK.ruinSiren, body: WASTELAND_ENEMY_ARTWORK.ruinSiren, hand: WASTELAND_ENEMY_ARTWORK.ruinSiren }, render: { aspectRatio: 120 / 108, width: 94, height: 85 }, audio: { attack: "zombie-attack", charge: "summoner-cast", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 0.9 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.34 }, death: { mode: "none" }, summon: { initialCooldown: { minimum: 4.5, maximum: 6.5 }, cooldown: 5.2, cappedRetryCooldown: 1.8, maximumLiving: 4, kinds: ["radstalker"], particleColor: "#e65340", particleCount: 20, popupText: "RALLY SIGNAL" }, rosterEligible: false, countsForKills: true }),
  "reactor-revenant": enemy({ id: "reactor-revenant", displayName: "Reactor Revenant", description: "Breach its containment shell, escape irradiated ruptures, and silence the Ruin Sirens released when its core destabilizes.", tell: "Containment shell, exposed reactor core, and toxic ground warnings", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 65, xp: 38, base: { health: 1320, speed: 43, damage: 27, structureDamage: 132, attackRate: 2.2, radius: 79 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: WASTELAND_ENEMY_ARTWORK.reactorRevenant.armored, body: WASTELAND_ENEMY_ARTWORK.reactorRevenant.armored, hand: WASTELAND_ENEMY_ARTWORK.reactorRevenant.armored }, render: { aspectRatio: 160 / 148, width: 143, height: 132 }, armor: { health: 780, scalesWithHealth: true, projectileResistance: 0.68, barColor: "#8a9b73", label: "CONTAINMENT", brokenSprite: WASTELAND_ENEMY_ARTWORK.reactorRevenant.broken, breakShardCount: 78, breakShardColors: [{ value: "#bcc5a8", weight: 0.4 }, { value: "#56634c", weight: 0.6 }], breakAudio: "ice-shatter", breakText: "CONTAINMENT BREACHED", breakShake: 32 }, audio: { attack: "breaker-smash", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.38 }, areaStrike: { appearance: { shape: "spike", warningFill: "rgba(118,204,57,.17)", warningOutline: "rgba(67,102,47,.95)", warningProgress: "rgba(222,255,132,.98)", warningPulse: "rgba(143,224,72,.42)", eruptionShadow: "rgba(35,59,37,.3)", eruptionEdge: "#557a3d", eruptionHighlight: "#e4ff8f", eruptionFarEdge: "#87d843", eruptionOutline: "#30472d" }, rngSeedKey: "reactor-revenant:toxic-ruptures", initialCooldown: 1, cooldown: 3.6, activationRadius: 880, randomStrikeCount: 5, includesTargetedStrike: true, placementMinimumRadius: 115, placementMaximumRadius: 295, placementAngleJitter: 0.48, strikeAngleJitter: 0.3, warningDuration: 1.4, eruptionDuration: 0.78, radius: 65, playerDamage: 30, structureDamage: 74, damageSource: "reactor-revenant", statusEffect: { kind: "slow", duration: 3.8, targets: ["player", "turret"], popupTextColor: "#dfff86", particleColor: "#75c83b", popupText: "Irradiated" }, impactColor: "#9ee84c", impactParticleCount: 34, screenShake: 13, impactAudio: "acidslinger-impact" }, phaseSlam: { triggerHealthRatio: 0.5, chargeDuration: 1.6, reinforcementKind: "ruin-siren", reinforcementCount: 3, radius: 315, playerDamage: 36, flagDamage: 56, structureDamage: 190, waveDuration: 0.62, areaEffect: "boss-slam", particleColor: "#85d640", particleCount: 44, popupText: "CORE MELTDOWN", telegraphColor: "rgba(128,218,65,.88)", screenShake: 20, impactAudio: "breaker-smash" }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  "rift-strider": enemy({ id: "rift-strider", displayName: "Rift Strider", description: "Phases across a defensive line through a brief astral rift, but is vulnerable once it rematerializes.", tell: "Split portal ring and cyan-violet phase trails", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 9, threat: 4.2, xp: 5, base: { health: 86, speed: 148, damage: 11, structureDamage: 7, attackRate: 0.9, radius: 24 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: ASTRAL_ENEMY_ARTWORK.riftStrider, body: ASTRAL_ENEMY_ARTWORK.riftStrider, hand: ASTRAL_ENEMY_ARTWORK.riftStrider }, render: { aspectRatio: 116 / 104, width: 84, height: 75 }, audio: { attack: "zombie-attack", move: "summoner-cast", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 500, attackRange: 0, lockSeconds: 0.65 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.26 }, death: { mode: "none" }, leap: { range: 250, cooldown: 2.8, duration: 0.38, arcHeight: 12, landingClearance: 12, landingDistancePadding: 32, landingAttempts: 6, failedRetryCooldown: 0.7, particleColor: "#9f7cff", launchParticleCount: 18, landingParticleCount: 15, launchPopupText: "PHASE", landingPopupText: "RETURN" }, rosterEligible: true, campaignTierIds: ["rift"], countsForKills: true }),
  "comet-slinger": enemy({ id: "comet-slinger", displayName: "Comet Slinger", description: "Launches piercing comets down the flag line, punishing defenses stacked in a straight path. Rush it during its long windup.", tell: "Cradled cyan comet and star-bright trailing ribbons", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 7, threat: 5.2, xp: 6, base: { health: 78, speed: 80, damage: 13, structureDamage: 19, attackRate: 2.2, radius: 27 }, caps: { perWave: 6, simultaneous: 4 }, assets: { portrait: ASTRAL_ENEMY_ARTWORK.cometSlinger, body: ASTRAL_ENEMY_ARTWORK.cometSlinger, hand: ASTRAL_ENEMY_ARTWORK.cometSlinger }, render: { aspectRatio: 120 / 106, width: 85, height: 75 }, audio: { projectile: "boss-acid-spit", impact: "ice-shatter", death: "zombie-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 470, innerRadius: 210, lockSeconds: 99 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 410, meleeSpikes: false }, attack: { mode: "arrow", chargeSeconds: 1.5 }, projectile: { owner: "enemy-arrow", damageSource: "comet-slinger", speed: 560, range: 720, lifetime: 1.5, radius: 10, width: 26, pierces: true, targets: ["player", "wall", "door", "spikes", "harvester", "turret", "flag"], color: "#65e8ff", appearance: "comet", impactBurst: { color: "#b89cff", count: 16 } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["rift"], countsForKills: true }),
  "void-herald": enemy({ id: "void-herald", displayName: "Void Herald", description: "Opens astral gates that call Rift Striders behind defensive lines. Break the beacon before its phasing escort grows.", tell: "Floating void beacon, tuning staff, and violet rift rings", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 4, threat: 7.4, xp: 9, base: { health: 132, speed: 64, damage: 9, structureDamage: 12, attackRate: 1.55, radius: 32 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: ASTRAL_ENEMY_ARTWORK.voidHerald, body: ASTRAL_ENEMY_ARTWORK.voidHerald, hand: ASTRAL_ENEMY_ARTWORK.voidHerald }, render: { aspectRatio: 122 / 112, width: 93, height: 85 }, audio: { attack: "zombie-attack", charge: "summoner-cast", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 360, attackRange: 0, lockSeconds: 1 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.36 }, death: { mode: "none" }, summon: { initialCooldown: { minimum: 4.8, maximum: 6.8 }, cooldown: 5.6, cappedRetryCooldown: 1.8, maximumLiving: 3, kinds: ["rift-strider"], particleColor: "#a878ff", particleCount: 22, popupText: "ASTRAL GATE" }, rosterEligible: true, campaignTierIds: ["rift"], countsForKills: true }),
  "mire-lurker": enemy({ id: "mire-lurker", displayName: "Mire Lurker", description: "Stalks exposed defenders and leeches their health to mend its own wounds. Keep it outside the fort.", tell: "Low reed cloak, luminous eyes, and a leech tongue", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 9, threat: 4.8, xp: 6, base: { health: 96, speed: 154, damage: 12, structureDamage: 7, attackRate: 0.92, radius: 24 }, caps: { perWave: 8, simultaneous: 6 }, assets: { portrait: MIRE_ENEMY_ARTWORK.mireLurker, body: MIRE_ENEMY_ARTWORK.mireLurker, hand: MIRE_ENEMY_ARTWORK.mireLurker }, render: { aspectRatio: 116 / 104, width: 84, height: 75 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "player", detectionRadius: 760, attackRange: 0, lockSeconds: 1.5 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.25, lifeSteal: { healingRatio: 0.75, targets: ["player"], particleColor: "#6fc9a8", particleCount: 12, popupText: "LEECH" } }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  sporecaster: enemy({ id: "sporecaster", displayName: "Sporecaster", description: "Fires piercing spore volleys through packed defenders, slowing players and turrets caught in their path.", tell: "Luminous fungus colony and a raised spore sac", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 7, threat: 5.6, xp: 7, base: { health: 88, speed: 76, damage: 13, structureDamage: 18, attackRate: 2.15, radius: 27 }, caps: { perWave: 6, simultaneous: 4 }, assets: { portrait: MIRE_ENEMY_ARTWORK.sporecaster, body: MIRE_ENEMY_ARTWORK.sporecaster, hand: MIRE_ENEMY_ARTWORK.sporecaster }, render: { aspectRatio: 116 / 104, width: 84, height: 75 }, audio: { projectile: "acidslinger-fire", impact: "acidslinger-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 700, attackRange: 450, innerRadius: 200, lockSeconds: 1.65 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 380, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.4 }, projectile: { owner: "enemy-arrow", damageSource: "sporecaster", speed: 470, range: 640, lifetime: 1.6, radius: 11, width: 27, pierces: true, targets: ["turret", "player", "flag"], color: "#7ad9af", appearance: "spore", statusEffect: { kind: "slow", duration: 3, targets: ["player", "turret"], popupTextColor: "#c9ffe8", particleColor: "#68cda6", popupText: "Spored" }, impactBurst: { color: "#9cf0ca", count: 16 } }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  popper: enemy({ id: "popper", displayName: "Popper", description: "Bursts into damaging acid when killed in combat.", tell: "Volatile acid sacs", tier: 5, introductionNight: 5, selectionWeight: 0.75, spawnWeight: 7, threat: 2.8, xp: 3, base: { health: 46, speed: 105, damage: 6, structureDamage: 7, attackRate: 1.18, radius: 24 }, caps: { perWave: 7, simultaneous: 6 }, assets: { portrait: "enemies/popper-zombie", body: "enemies/popper-zombie", hand: "enemies/popper-zombie" }, render: { aspectRatio: 80 / 60, height: 60, width: 80 }, audio: { attack: "zombie-attack", death: "popper-burst" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.6 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "burst", burstInnerRadius: 52, burstOuterRadius: 145, burstDamage: 30, burstPlayerDamage: 30, burstFlagDamage: 30, burstStructureDamage: 30, burstFalloff: 1.7, burstWaveDuration: 0.38, burstDamageSource: "popper-burst", burstWaveSprite: "effects/popper-acid-burst", burstTargets: ["player", "flag", "wall", "door", "spikes", "harvester", "turret"], triggersFromSunlight: false, particleColor: "#67d73e", particleCount: 34, popupText: "ACID BURST", screenShake: 7 }, rosterEligible: true, countsForKills: true }),
  archer: enemy({ id: "archer", displayName: "Archer", description: "Charges black arrows at turrets, then the player.", tell: "Black bow", tier: 5, introductionNight: 5, selectionWeight: 0.65, spawnWeight: 6, threat: 3, xp: 3, base: { health: 44, speed: 92, damage: 10, structureDamage: 12, attackRate: 1.8, radius: 23 }, caps: { perWave: 7, simultaneous: 5 }, assets: { portrait: "enemies/archer-zombie", body: "enemies/archer-zombie", hand: "enemies/archer-zombie" }, render: { aspectRatio: 70 / 70, height: 70, width: 70 }, audio: { projectile: "archer-bow-fire", impact: "archer-arrow-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 620, attackRange: 470, lockSeconds: 1.1 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 390, meleeSpikes: false }, attack: { mode: "arrow", chargeSeconds: 1.15 }, projectile: { owner: "enemy-arrow", damageSource: "enemy-arrow", speed: 760, range: 680, lifetime: 1.4, radius: 4, width: 3, pierces: false, targets: ["turret", "player", "flag"], color: "#17191c", appearance: "arrow" }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  summoner: enemy({ id: "summoner", displayName: "Summoner", description: "Conjures reinforcements, up to five living summons.", tell: "Purple summoning ring", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 7, threat: 3.6, xp: 4, base: { health: 78, speed: 90, damage: 6, structureDamage: 8, attackRate: 1.3, radius: 26 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/summoner-zombie", body: "gameplay/enemies/summoner/body", hand: "gameplay/enemies/summoner/hand" }, audio: { attack: "zombie-attack", charge: "summoner-cast", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 330, attackRange: 0, lockSeconds: 0.7 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.294 }, death: { mode: "none" }, summon: { initialCooldown: { minimum: 5, maximum: 8 }, cooldown: 4, cappedRetryCooldown: 2, maximumLiving: 5, particleColor: "#9d6bff", particleCount: 14, popupText: "SUMMON" }, rosterEligible: true, countsForKills: true }),
  acidslinger: enemy({ id: "acidslinger", displayName: "Acidslinger", description: "Bombards priority targets and melts obstacles blocking its route.", tell: "Green acid tank", tier: 7, introductionNight: 7, selectionWeight: 0.65, spawnWeight: 5, threat: 4.2, xp: 5, base: { health: 72, speed: 84, damage: 7, structureDamage: 9, attackRate: 1.5, radius: 25 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/acidslinger-zombie", body: "enemies/acidslinger-zombie", hand: "enemies/acidslinger-zombie" }, render: { aspectRatio: 98 / 56, height: 56, width: 98 }, audio: { projectile: "acidslinger-fire", impact: "acidslinger-impact", death: "zombie-death" }, targeting: { mode: "acidslinger", detectionRadius: 520, attackRange: 310, innerRadius: 230, lockSeconds: 1.2 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 245, meleeSpikes: false }, attack: { mode: "acid", chargeSeconds: 1.35 }, projectile: { owner: "enemy-acid", damageSource: "enemy-acid", speed: 430, range: 440, lifetime: 1.3, radius: 9, width: 18, pierces: true, targets: ["player", "wall", "door", "spikes", "harvester", "turret", "flag"], color: "#73db35", appearance: "arrow" }, death: { mode: "none" }, rosterEligible: true, countsForKills: true }),
  rammer: enemy({ id: "rammer", displayName: "Rammer", description: "Loads a devastating charge through defensive lines.", tell: "Heavy horned helm", tier: 7, introductionNight: 7, selectionWeight: 0.55, spawnWeight: 4, threat: 5.2, xp: 6, base: { health: 155, speed: 62, damage: 4, structureDamage: 5, attackRate: 2, radius: 34 }, caps: { perWave: 4, simultaneous: 3 }, assets: { portrait: "enemies/rammer-zombie", body: "enemies/rammer-zombie", hand: "enemies/rammer-zombie" }, render: { aspectRatio: 100 / 70, height: 61.6, width: 88 }, audio: { charge: "rammer-charge", move: "rammer-rush", impact: "rammer-impact", death: "zombie-death" }, targeting: { mode: "rammer", detectionRadius: 330, attackRange: 0, lockSeconds: 1.4 }, movement: { avoidStructures: false, obstacleFallback: false, preferredRange: 0, meleeSpikes: false }, attack: { mode: "ram", chargeSeconds: 1.7 }, death: { mode: "none" }, ram: { targetRadius: 260, damage: 300, distance: 390, speed: 560, loadSeconds: 1.7, targetKinds: ["wall", "door", "spikes"], telegraphColor: "rgba(255,181,83,.9)", telegraphLength: 130, healthBarWidth: 72, chargeBurst: { color: "#ffb35c", count: 14, popupText: "CHARGE" }, breachBurst: { color: "#ff9a51", count: 18, popupText: "BREACH" } }, rosterEligible: true, countsForKills: true }),
  frostbite: enemy({ id: "frostbite", displayName: "Frostbiter", description: "A swift ice skater whose chilling strikes slow defenders.", tell: "Icy claws", tier: 3, introductionNight: 3, selectionWeight: 1, spawnWeight: 13, threat: 1.9, xp: 2, base: { health: 54, speed: 150, damage: 7, structureDamage: 7, attackRate: 0.88, radius: 21 }, caps: { perWave: 9, simultaneous: 7 }, assets: { portrait: "enemies/frostbite-zombie", body: "enemies/frostbite-zombie", hand: "enemies/frostbite-zombie" }, render: { aspectRatio: 1, height: 78, width: 78 }, audio: { attack: "zombie-attack", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 0.62 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.25, statusEffect: { kind: "slow", duration: 3, targets: ["player", "turret"], popupTextColor: "#63c6e8" } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  snowballer: enemy({ id: "snowballer", displayName: "Snowballer", description: "A night-five ranged attacker that hurls packed ice at turrets and defenders.", tell: "Raised snowball and wool cap", tier: 5, introductionNight: 5, selectionWeight: 1, spawnWeight: 8, threat: 3, xp: 3, base: { health: 52, speed: 88, damage: 9, structureDamage: 11, attackRate: 1.7, radius: 24 }, caps: { perWave: 7, simultaneous: 5 }, assets: { portrait: "enemies/snowballer-zombie", body: "enemies/snowballer-zombie", hand: "enemies/snowballer-zombie" }, render: { aspectRatio: 1, height: 80, width: 80 }, audio: { projectile: "archer-bow-fire", impact: "archer-arrow-impact", death: "zombie-death" }, targeting: { mode: "archer", detectionRadius: 590, attackRange: 350, lockSeconds: 1 }, movement: { avoidStructures: true, obstacleFallback: true, preferredRange: 350, meleeSpikes: false }, attack: { mode: "arrow", chargeSeconds: 1.05 }, projectile: { owner: "enemy-arrow", damageSource: "enemy-arrow", speed: 610, range: 620, lifetime: 1.45, radius: 7, width: 12, pierces: false, targets: ["turret", "player", "flag"], color: "#dff8ff", appearance: "snowball", statusEffect: { kind: "slow", duration: 1.75, targets: ["player", "turret"], popupTextColor: "#63c6e8" }, impactBurst: { color: "#e7fbff", count: 14 } }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  icebound: enemy({ id: "icebound", displayName: "Icebound Crusher", description: "A night-seven frozen brute whose thick shell absorbs sustained fire.", tell: "Cracked ice armor", tier: 7, introductionNight: 7, selectionWeight: 1, spawnWeight: 5, threat: 5, xp: 6, base: { health: 175, speed: 64, damage: 12, structureDamage: 22, attackRate: 1.55, radius: 35 }, caps: { perWave: 5, simultaneous: 3 }, assets: { portrait: "enemies/icebound-zombie", body: "enemies/icebound-zombie", hand: "enemies/icebound-zombie" }, render: { aspectRatio: 1, height: 98, width: 98 }, armor: { health: 90, projectileResistance: 0.5, barColor: "#79dced", label: "ICE ARMOR", brokenSprite: "enemies/icebound-zombie-broken", breakShardCount: 34, breakShardColors: [{ value: "#ffffff", weight: 0.45 }, { value: "#b9f5ff", weight: 0.55 }], breakAudio: "ice-shatter", breakText: "Break", breakShake: 8 }, audio: { attack: "breaker-smash", death: "zombie-death" }, targeting: { mode: "standard", detectionRadius: 350, attackRange: 0, lockSeconds: 1 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "melee", chargeSeconds: 0.38 }, death: { mode: "none" }, rosterEligible: true, campaignTierIds: ["snowy"], countsForKills: true }),
  boss: enemy({ id: "boss", displayName: "The Boss", description: "Marches on the flag. At half health, slams the ground and raises ten zombies.", tell: "Ten health segments", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 40, xp: 20, base: { health: 1200, speed: 54, damage: 18, structureDamage: 88, attackRate: 1.8, radius: 66 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: "enemies/countdown-boss", body: "enemies/countdown-boss", hand: "gameplay/enemies/basic/hand" }, audio: { attack: "zombie-attack", projectile: "boss-acid-spit", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.294 }, phaseSlam: { triggerHealthRatio: 0.5, chargeDuration: 1.25, reinforcementKind: "basic", reinforcementCount: 10, radius: 260, playerDamage: 34, flagDamage: 52, structureDamage: 184, waveDuration: 0.48, areaEffect: "boss-slam", particleColor: "#ff6b55", particleCount: 28, popupText: "GROUND SLAM", telegraphColor: "rgba(255,92,76,.82)", screenShake: 14, impactAudio: "breaker-smash" }, death: { mode: "none" }, rosterEligible: false, countsForKills: true }),
  "frost-warden": enemy({ id: "frost-warden", displayName: "Frost Warden", description: "Break its ice shell, survive Frost Slam, and evade erupting icicles.", tell: "Ice armor and ground warning circles", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 42, xp: 24, base: { health: 900, speed: 50, damage: 20, structureDamage: 96, attackRate: 1.9, radius: 68 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: "enemies/frost-warden", body: "enemies/frost-warden", hand: "gameplay/enemies/basic/hand" }, armor: { health: 560, scalesWithHealth: true, projectileResistance: 0.5, barColor: "#9cecff", label: "ICE ARMOR", brokenSprite: "enemies/frost-warden-broken", breakShardCount: 58, breakShardColors: [{ value: "#ffffff", weight: 0.45 }, { value: "#b9f5ff", weight: 0.55 }], breakAudio: "ice-shatter", breakShake: 30, breakStatusPulse: { radius: 300, duration: 0.72, statusEffect: { kind: "slow", duration: 4.5, targets: ["player", "turret"], popupTextColor: "#63c6e8" }, areaEffect: "frost-slam", particleColor: "#d9fbff", particleCount: 30, popupText: "FROST SLAM", popupTextColor: "#63c6e8", popupTextOffsetY: -126 } }, audio: { attack: "zombie-attack", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.294 }, areaStrike: { appearance: { shape: "spike", warningFill: "rgba(124,190,205,.16)", warningOutline: "rgba(67,117,129,.9)", warningProgress: "rgba(241,254,255,.96)", warningPulse: "rgba(229,251,255,.36)", eruptionShadow: "rgba(121,190,205,.2)", eruptionEdge: "#6eb4c5", eruptionHighlight: "#f7ffff", eruptionFarEdge: "#9cecff", eruptionOutline: "#4d91a3" }, rngSeedKey: "frost-warden:icicles", initialCooldown: 1.5, cooldown: 4.8, activationRadius: 780, randomStrikeCount: 3, includesTargetedStrike: true, placementMinimumRadius: 92, placementMaximumRadius: 230, placementAngleJitter: 0.38, strikeAngleJitter: 0.22, warningDuration: 1.15, eruptionDuration: 0.62, radius: 54, playerDamage: 22, structureDamage: 52, damageSource: "frost-warden", statusEffect: { kind: "slow", duration: 2.8, targets: ["player", "turret"], popupTextColor: "#63c6e8" }, impactColor: "#d9fbff", impactParticleCount: 22, screenShake: 9, impactAudio: "ice-shatter" }, death: { mode: "none" }, rosterEligible: false, campaignTierIds: ["snowy"], countsForKills: true }),
  "dune-colossus": enemy({ id: "dune-colossus", displayName: "Dune Colossus", description: "Shatter its sandstone shell, dodge erupting pillars, and survive the dune swarm it calls at half health.", tell: "Four arms, scarab crown, and widening sand warnings", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 48, xp: 28, base: { health: 1040, speed: 47, damage: 22, structureDamage: 108, attackRate: 2, radius: 72 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: DESERT_ENEMY_ARTWORK.duneColossus.armored, body: DESERT_ENEMY_ARTWORK.duneColossus.armored, hand: DESERT_ENEMY_ARTWORK.duneColossus.armored }, render: { aspectRatio: 152 / 140, width: 130, height: 120 }, armor: { health: 610, scalesWithHealth: true, projectileResistance: 0.6, barColor: "#d5a657", label: "COLOSSUS ARMOR", brokenSprite: DESERT_ENEMY_ARTWORK.duneColossus.broken, breakShardCount: 64, breakShardColors: [{ value: "#edc879", weight: 0.4 }, { value: "#a96535", weight: 0.6 }], breakAudio: "ice-shatter", breakText: "SHATTER", breakShake: 26 }, audio: { attack: "breaker-smash", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.34 }, areaStrike: { appearance: { shape: "spike", warningFill: "rgba(216,168,79,.16)", warningOutline: "rgba(144,91,43,.92)", warningProgress: "rgba(255,231,166,.96)", warningPulse: "rgba(241,202,117,.38)", eruptionShadow: "rgba(122,72,34,.24)", eruptionEdge: "#a96535", eruptionHighlight: "#ffe7a6", eruptionFarEdge: "#d8a84f", eruptionOutline: "#70401f" }, rngSeedKey: "dune-colossus:sand-pillars", initialCooldown: 1.25, cooldown: 4.25, activationRadius: 820, randomStrikeCount: 4, includesTargetedStrike: true, placementMinimumRadius: 105, placementMaximumRadius: 265, placementAngleJitter: 0.42, strikeAngleJitter: 0.25, warningDuration: 1.3, eruptionDuration: 0.7, radius: 58, playerDamage: 25, structureDamage: 60, damageSource: "dune-colossus", impactColor: "#f1ca75", impactParticleCount: 26, screenShake: 10, impactAudio: "breaker-smash" }, phaseSlam: { triggerHealthRatio: 0.5, chargeDuration: 1.4, reinforcementKind: "dune-hopper", reinforcementCount: 4, radius: 285, playerDamage: 30, flagDamage: 46, structureDamage: 165, waveDuration: 0.55, areaEffect: "boss-slam", particleColor: "#d8a84f", particleCount: 34, popupText: "DUNE SWARM", telegraphColor: "rgba(216,168,79,.84)", screenShake: 16, impactAudio: "breaker-smash" }, death: { mode: "none" }, rosterEligible: false, campaignTierIds: ["desert"], countsForKills: true }),
  "eclipse-regent": enemy({ id: "eclipse-regent", displayName: "Eclipse Regent", description: "Shatter its orbiting moon plates, escape gravity ruptures, and close the Void Herald gates feeding its court.", tell: "Orbiting moon armor, singularity core, and violet ground warnings", tier: 10, introductionNight: 10, selectionWeight: 0, spawnWeight: 0, threat: 76, xp: 44, base: { health: 1460, speed: 41, damage: 30, structureDamage: 144, attackRate: 2.3, radius: 82 }, caps: { perWave: 1, simultaneous: 1 }, assets: { portrait: ASTRAL_ENEMY_ARTWORK.eclipseRegent.armored, body: ASTRAL_ENEMY_ARTWORK.eclipseRegent.armored, hand: ASTRAL_ENEMY_ARTWORK.eclipseRegent.armored }, render: { aspectRatio: 164 / 152, width: 148, height: 137 }, armor: { health: 860, scalesWithHealth: true, projectileResistance: 0.7, barColor: "#7567b7", label: "MOON PLATES", brokenSprite: ASTRAL_ENEMY_ARTWORK.eclipseRegent.broken, breakShardCount: 84, breakShardColors: [{ value: "#d8d4ff", weight: 0.4 }, { value: "#7567b7", weight: 0.6 }], breakAudio: "ice-shatter", breakText: "ECLIPSE UNBOUND", breakShake: 34, breakStatusPulse: { radius: 330, duration: 0.78, statusEffect: { kind: "slow", duration: 4.6, targets: ["player", "turret"], popupTextColor: "#d8c8ff", particleColor: "#9f7cff", popupText: "Gravity Bound" }, areaEffect: "frost-slam", particleColor: "#b89cff", particleCount: 42, popupText: "GRAVITY COLLAPSE", popupTextColor: "#d8c8ff", popupTextOffsetY: -138, appearance: { center: "rgba(159,124,255,.05)", middle: "rgba(159,124,255,.15)", edge: "rgba(184,156,255,.25)", stroke: "rgba(130,91,232,.98)", highlight: "rgba(232,226,255,.94)" } } }, audio: { attack: "breaker-smash", charge: "summoner-cast", death: "boss-death" }, targeting: { mode: "flag", detectionRadius: 9999, attackRange: 0, lockSeconds: 99 }, movement: { avoidStructures: false, obstacleFallback: true, preferredRange: 0, meleeSpikes: true }, attack: { mode: "boss", chargeSeconds: 0.4 }, summon: { initialCooldown: { minimum: 3.2, maximum: 4.2 }, cooldown: 9.2, cappedRetryCooldown: 2.2, maximumLiving: 2, kinds: ["void-herald"], particleColor: "#a878ff", particleCount: 30, popupText: "ECLIPSE GATE" }, areaStrike: { appearance: { shape: "spike", warningFill: "rgba(126,91,218,.18)", warningOutline: "rgba(69,47,125,.96)", warningProgress: "rgba(220,212,255,.98)", warningPulse: "rgba(174,137,255,.44)", eruptionShadow: "rgba(31,21,69,.34)", eruptionEdge: "#6048a8", eruptionHighlight: "#e8e2ff", eruptionFarEdge: "#9f7cff", eruptionOutline: "#2f2459" }, rngSeedKey: "eclipse-regent:gravity-ruptures", initialCooldown: 0.9, cooldown: 3.35, activationRadius: 920, randomStrikeCount: 6, includesTargetedStrike: true, placementMinimumRadius: 120, placementMaximumRadius: 315, placementAngleJitter: 0.5, strikeAngleJitter: 0.32, warningDuration: 1.45, eruptionDuration: 0.82, radius: 68, playerDamage: 32, structureDamage: 80, damageSource: "eclipse-regent", statusEffect: { kind: "slow", duration: 3.2, targets: ["player", "turret"], popupTextColor: "#d8c8ff", particleColor: "#9f7cff", popupText: "Gravity Bound" }, impactColor: "#b89cff", impactParticleCount: 38, screenShake: 14, impactAudio: "ice-shatter" }, death: { mode: "none" }, rosterEligible: false, campaignTierIds: ["rift"], countsForKills: true }),
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
