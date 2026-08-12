import { BALANCE, RESOURCE_ORDER, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { actionBarActions } from "./action-bar";
import { resolveChallengeModifiers, type ChallengeModifiers } from "./challenges";
import { emitAudioCue, emitAudioSpatialState } from "./audio";
import { availableUnlocks, availableUpgradeKeys, applyUnlock, generateChoiceOfferings } from "./choices";
import { Input } from "./input";
import { NavigationGrid, pathIntersectsObstacle } from "./pathfinding";
import { browserStorage } from "./storage";
import { TUTORIAL_SECTIONS, type TutorialTaskDefinition } from "./content";
import { generateSeed, SeededRng } from "./rng";
import { generateWorld } from "./world";
import {
  addWallet,
  adaptiveDifficulty,
  applyMutation,
  applyUpgrade,
  baseWaveThreatBudget,
  endlessWaveThreatBudget,
  canAfford,
  createMutations,
  createUnlocks,
  createUpgrades,
  cumulativeCost,
  dismantleRefund,
  emptyWallet,
  proportionalRepairCost,
  rerollCost,
  spend,
  structurePointValue,
  type AdaptiveDifficulty,
  type AdaptivePowerInput,
  upgradeCost,
  type ResourceWallet,
} from "./rules";
import { distance, overlaps, segmentCircle, SpatialHash } from "./spatial";
import {
  freeRepairChance,
  mitigatePlayerDamage,
  recyclingRate,
  swordStats,
} from "./equipment";
import {
  EQUIPMENT_ORDER,
  META_BALANCE,
  permanentUpgradePercent,
  type PermanentUpgradeId,
} from "./meta-balance";
import { resolveActionCooldown, resolveEffectiveStat } from "./modifiers";
import { applySlow, isSlowed, updateStatuses } from "./status-effects";
import {
  performanceDifficultyDelta,
  type NightPerformanceSnapshot,
  type PerformanceDifficultyResult,
} from "./performance-difficulty";
import type { GamePlatform } from "./platform";
import type { ProfileManager, RunSettlementResult } from "./profile";
import { campaignTier } from "./campaign";
import { calculateXpRewards, settleCoinInvestment } from "./rewards";
import { biomePopupColor } from "./popup-colors";
import {
  emptyPlaytestActivity,
  finishRunDifficultyLog,
  summarizeNight,
  type ChoiceSelectionLog,
  type EnemyPopulationLog,
  type NightDifficultyLog,
  type PlaytestActivityLog,
  type RunLoadoutLog,
  type StructureTally,
} from "./dev-run-telemetry";
import {
  ENEMY_REGISTRY,
  activeRosterEnemies,
  endlessRosterAdditions,
  endlessRosterMilestones,
  isBossEnemyKind,
  mutationWeightKey,
  rosterMilestones,
  selectEnemyRoster,
  type EnemyRoster,
} from "./enemy-registry";
import type {
  ActionKind,
  AreaEffect,
  BossEnemyKind,
  Choice,
  CampaignTierId,
  DamageSource,
  Difficulty,
  Enemy,
  EnemyKind,
  EnemyStatusEffect,
  Flag,
  IcicleStrike,
  Particle,
  Phase,
  Player,
  PlayerId,
  Portal,
  Projectile,
  ResourceNode,
  RosterEnemyKind,
  RunRecord,
  RunMode,
  RunStats,
  Structure,
  StructureKind,
  Tier,
  Vec2,
  World,
} from "./types";

interface NightPerformanceTracker {
  night: number;
  totalIncomingDamage: number;
  flagDamage: number;
  zombiesEnteringFlagRadius: number;
  playerDamageTaken: number;
  totalZombiesSpawned: number;
  waveEnemyIds: Set<number>;
  personalWaveZombieKills: number;
  damagedStructureIds: Set<number>;
  destroyedStructureIds: Set<number>;
  structureValues: Map<number, number>;
  flagRadiusEnemyIds: Set<number>;
  populationCategoryByEnemyId: Map<number, keyof EnemyPopulationLog["spawned"]>;
  population: EnemyPopulationLog;
  bossKillTimeSeconds: number | null;
}

export interface BuildPreview {
  x: number;
  y: number;
  valid: boolean;
  upgrading: Structure | null;
  kind: StructureKind;
  tier: Tier;
  reason: string;
  cost: ResourceWallet;
  affordable: boolean;
  capacityReached: boolean;
}

export interface ToolPreview {
  x: number;
  y: number;
  action: "repair" | "recycle";
  valid: boolean;
  affordable: boolean;
  target: Structure | Flag | null;
  cost: ResourceWallet;
  refund: ResourceWallet;
  restoreAmount: number;
  reason: string;
}

interface TutorialTarget {
  x: number;
  y: number;
  radius: number;
  tutorialTarget: true;
}

const center = BALANCE.mapSize / 2;
export const LOCAL_PLAYER_ID: PlayerId = "local-player";
function emptyEnemyCounts(): Record<EnemyKind, number> {
  return Object.fromEntries(Object.keys(ENEMY_REGISTRY).map((kind) => [kind, 0])) as Record<EnemyKind, number>;
}

function scaleCost(cost: ResourceWallet, multiplier: number): ResourceWallet {
  return {
    wood: Math.ceil(cost.wood * multiplier),
    stone: Math.ceil(cost.stone * multiplier),
    gold: Math.ceil(cost.gold * multiplier),
    diamond: Math.ceil(cost.diamond * multiplier),
  };
}

export class Game {
  phase: Phase = "menu";
  previousPhase: Phase = "day";
  difficulty: Difficulty = "normal";
  runMode: RunMode = "campaign";
  activeCampaignTierId: CampaignTierId = "forest";
  runStartNight = 1;
  seed = "";
  enemyRoster: EnemyRoster = selectEnemyRoster("preview");
  waveSchedule: EnemyKind[] = [];
  night = 1;
  timer: number = BALANCE.dayDuration;
  phaseElapsed = 0;
  world: World = generateWorld("preview");
  player: Player = {
    id: LOCAL_PLAYER_ID,
    x: center,
    y: center + 120,
    radius: BALANCE.player.radius,
    health: BALANCE.player.maxHealth,
    maxHealth: BALANCE.player.maxHealth,
    angle: -Math.PI / 2,
    cooldown: 0,
    toolCooldown: 0,
    hurtFlash: 0,
    punchHand: "left",
    punchSerial: 0,
  };
  flag: Flag = {
    x: center,
    y: center,
    radius: BALANCE.flag.radius,
    health: BALANCE.flag.health,
    maxHealth: BALANCE.flag.health,
    hurtFlash: 0,
  };
  camera: Vec2 = { x: center, y: center };
  resources: ResourceWallet = emptyWallet();
  structures: Structure[] = [];
  portals: Portal[] = [];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  particles: Particle[] = [];
  areaEffects: AreaEffect[] = [];
  icicleStrikes: IcicleStrike[] = [];
  selectedSlot = 1;
  selectedTiers: Record<StructureKind, Tier> = {
    wall: "wood",
    spikes: "wood",
    door: "wood",
    harvester: "wood",
    turret: "wood",
  };
  unlocks = createUnlocks();
  upgrades = createUpgrades();
  mutations = createMutations();
  stats: RunStats = {
    resourcesGathered: 0,
    structuresBuilt: 0,
    zombiesDefeated: 0,
    elapsed: 0,
    nightsSurvived: 0,
  };
  directPlayerKills: Record<EnemyKind, number> = emptyEnemyCounts();
  runSettlementId: string | null = null;
  runInvestment = 0;
  lastSettlement: RunSettlementResult | null = null;
  choices: Choice[] = [];
  dawnScreen = 0;
  dawnPicked = new Set<string>();
  enemyWarning: EnemyKind | null = null;
  defeatReason = "";
  buildPreview: BuildPreview | null = null;
  toolPreview: ToolPreview | null = null;
  toast = "";
  toastTime = 0;
  toastCritical = false;
  shake = 0;
  records: RunRecord[] = [];
  modalLock = false;
  rerollsUsed = 0;
  rerollConfirmation = false;
  skipNightConfirmation = false;
  activeChallenges = new Set<string>();
  structureScore = 0;
  adaptiveState: AdaptiveDifficulty = adaptiveDifficulty(0, 1);
  lastNightPerformance: NightPerformanceSnapshot | null = null;
  performanceDifficulty: PerformanceDifficultyResult = performanceDifficultyDelta(null);
  autoCorrectiveDelta = 0;
  devDifficultyLogs: NightDifficultyLog[] = [];
  debugNavigation = BALANCE.debug.navigation
    || (typeof location !== "undefined" && new URLSearchParams(location.search).has("navDebug"));
  debugAdaptive = BALANCE.debug.adaptiveHud
    || (typeof location !== "undefined" && new URLSearchParams(location.search).has("adaptiveDebug"));
  phaseTransitionImpact = 0;
  tutorialMode = false;
  tutorialSection = 0;
  tutorialTask = 0;
  tutorialSectionComplete = false;
  tutorialPlacementArea: { x: number; y: number; radius: number } | null = null;
  flagPresent = true;

  private rng = new SeededRng("preview:gameplay");
  private summonRng = new SeededRng("preview:summons");
  private runTelemetryStartedAt = new Date().toISOString();
  private cyclePlaytestActivity = emptyPlaytestActivity();
  private runPlaytestActivity = emptyPlaytestActivity();
  private nextId = 1000;
  private toastQueue: Array<{ message: string; critical: boolean }> = [];
  private enemyHash = new SpatialHash<Enemy>(180);
  private obstacleHash = new SpatialHash<ResourceNode | Structure>(180);
  private navigationFields = new Map<number, NavigationGrid>();
  private structureRevision = 0;
  private tutorialHarvestedNodeIds = new Set<number>();
  private tutorialDoorStartSide = 0;
  private nightWaveScheduled = false;
  private combatMode = false;
  private waveScheduleCursor = 0;
  private bossSpawnedThisNight = false;
  private fortPulseUsedNight = 0;
  private playerDamageWarned = false;
  private flagWarningCooldown = 0;
  private footstepCooldown = 0;
  private healingActive = false;
  private readonly tutorialTarget: TutorialTarget = {
    x: center,
    y: center,
    radius: 1,
    tutorialTarget: true,
  };
  private audioSpatialCooldown = 0;
  private meleeSwingDuration = 0;
  private meleeSwingElapsed = 0;
  private meleeImpactPending = false;
  private meleeSwingUsesSword = false;
  private uiDirty = true;
  private nightPerformance: NightPerformanceTracker | null = null;
  private onMajorScreen: (() => void) | null = null;

  constructor(
    readonly input: Input,
    readonly profileManager: ProfileManager | null = null,
    readonly platform: GamePlatform | null = null,
  ) {
    this.loadRecords();
  }

  bindUi(_onUiChange: () => void, onMajorScreen: () => void): void {
    this.onMajorScreen = onMajorScreen;
  }

  private markUi(major = false): void {
    this.uiDirty = true;
    if (major) this.onMajorScreen?.();
  }

  consumeUiDirty(): boolean {
    const dirty = this.uiDirty;
    this.uiDirty = false;
    return dirty;
  }

  startRun(
    difficulty: Difficulty,
    requestedSeed: string,
    challengeIds: readonly string[] = [],
    suppressPortalAudio = false,
    runOptions: { investment?: number; settle?: boolean; settlementId?: string; campaignTierId?: CampaignTierId } = {},
  ): boolean {
    this.tutorialMode = false;
    this.flagPresent = true;
    this.difficulty = difficulty;
    this.runMode = "campaign";
    this.activeCampaignTierId = runOptions.campaignTierId ?? "forest";
    this.runStartNight = 1;
    this.activeChallenges = new Set(
      challengeIds.map((id) => id === "fifty-percent-days" ? "short-days" : id),
    );
    this.seed = requestedSeed.trim() || generateSeed();
    this.enemyRoster = selectEnemyRoster(this.seed, this.activeCampaignTierId);
    const shouldSettle = runOptions.settle !== false && !this.tutorialMode;
    this.runSettlementId = shouldSettle
      ? runOptions.settlementId ?? this.createSettlementId()
      : null;
    this.runInvestment = 0;
    this.lastSettlement = null;
    if (this.runSettlementId && this.profileManager) {
      const requestedInvestment = Math.max(0, Math.floor(runOptions.investment ?? 0));
      if (!this.profileManager.beginRunSettlement(this.runSettlementId, requestedInvestment)) return false;
      this.runInvestment = this.profileManager.profile.pendingRunSettlement?.investment ?? 0;
    }
    this.rng = new SeededRng(`${this.seed}:gameplay:${difficulty}:${this.activeCampaignTierId}`);
    this.summonRng = new SeededRng(`${this.seed}:summons:${difficulty}:${this.activeCampaignTierId}`);
    this.nextId = 1000;
    const challengeModifiers = this.getChallengeModifiers();
    this.world = generateWorld(this.seed, challengeModifiers.resourceNodeMultiplier, this.activeCampaignTierId);
    this.night = 1;
    this.timer = this.getDayDuration();
    this.phaseElapsed = 0;
    this.phase = "day";
    this.previousPhase = "day";
    this.player = {
      id: LOCAL_PLAYER_ID,
      x: center,
      y: center + 120,
      radius: BALANCE.player.radius,
      health: BALANCE.player.maxHealth,
      maxHealth: BALANCE.player.maxHealth,
      angle: -Math.PI / 2,
      cooldown: 0,
      toolCooldown: 0,
      hurtFlash: 0,
      punchHand: "left",
      punchSerial: 0,
    };
    const flagHealth = Math.max(1, Math.round(
      BALANCE.flag.health
        * BALANCE.difficulty[difficulty].flagHealth
        * challengeModifiers.flagHealthMultiplier,
    ));
    this.flag = {
      x: center,
      y: center,
      radius: BALANCE.flag.radius,
      health: flagHealth,
      maxHealth: flagHealth,
      hurtFlash: 0,
    };
    this.camera = { x: center, y: center };
    this.resources = emptyWallet();
    this.structures = [];
    this.portals = [];
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.areaEffects = [];
    this.icicleStrikes = [];
    this.navigationFields.clear();
    this.structureRevision = 0;
    this.nightWaveScheduled = false;
    this.combatMode = false;
    this.selectedSlot = 1;
    this.selectedTiers = { wall: "wood", spikes: "wood", door: "wood", harvester: "wood", turret: "wood" };
    this.unlocks = createUnlocks();
    this.upgrades = createUpgrades();
    this.mutations = createMutations();
    this.stats = { resourcesGathered: 0, structuresBuilt: 0, zombiesDefeated: 0, elapsed: 0, nightsSurvived: 0 };
    this.directPlayerKills = emptyEnemyCounts();
    this.waveSchedule = [];
    this.waveScheduleCursor = 0;
    this.choices = [];
    this.dawnScreen = 0;
    this.dawnPicked = new Set();
    this.enemyWarning = null;
    this.rerollsUsed = 0;
    this.rerollConfirmation = false;
    this.skipNightConfirmation = false;
    this.structureScore = 0;
    this.adaptiveState = adaptiveDifficulty(
      0,
      1,
      this.profileManager?.profile.playerLevel ?? 1,
    );
    this.lastNightPerformance = null;
    this.performanceDifficulty = performanceDifficultyDelta(null);
    this.autoCorrectiveDelta = 0;
    this.nightPerformance = null;
    this.devDifficultyLogs = [];
    this.runTelemetryStartedAt = new Date().toISOString();
    this.cyclePlaytestActivity = emptyPlaytestActivity();
    this.runPlaytestActivity = emptyPlaytestActivity();
    this.playerDamageWarned = false;
    this.flagWarningCooldown = 0;
    this.footstepCooldown = 0;
    this.healingActive = false;
    this.audioSpatialCooldown = 0;
    this.meleeSwingDuration = 0;
    this.meleeSwingElapsed = 0;
    this.meleeImpactPending = false;
    this.meleeSwingUsesSword = false;
    this.defeatReason = "";
    this.toolPreview = null;
    this.spawnPortals(!suppressPortalAudio);
    this.syncSpatialAudio(true);
    this.notify(`Seed ${this.seed}`);
    this.markUi(true);
    return true;
  }

  restart(sameSeed: boolean): void {
    this.startRun(this.difficulty, sameSeed ? this.seed : "", [...this.activeChallenges], false, {
      campaignTierId: this.activeCampaignTierId,
    });
  }

  getCampaignTier() {
    return campaignTier(this.activeCampaignTierId);
  }

  getBossKind(): BossEnemyKind {
    return this.getCampaignTier().boss;
  }

  isBossEnemyKind(kind: EnemyKind): kind is BossEnemyKind {
    return isBossEnemyKind(kind);
  }

  continueIntoEndless(): boolean {
    if (this.phase !== "victory" || this.night !== 10 || this.runMode !== "campaign") {
      return false;
    }
    this.runMode = "endless";
    this.runStartNight = 11;
    this.stats = {
      resourcesGathered: 0,
      structuresBuilt: 0,
      zombiesDefeated: 0,
      elapsed: 0,
      nightsSurvived: 0,
    };
    this.directPlayerKills = emptyEnemyCounts();
    this.devDifficultyLogs = [];
    this.runTelemetryStartedAt = new Date().toISOString();
    this.cyclePlaytestActivity = emptyPlaytestActivity();
    this.runPlaytestActivity = emptyPlaytestActivity();
    this.lastSettlement = null;
    this.runInvestment = 0;
    this.runSettlementId = this.profileManager ? this.createSettlementId() : null;
    if (this.runSettlementId && this.profileManager
      && !this.profileManager.beginRunSettlement(this.runSettlementId, 0)) {
      this.runSettlementId = null;
      return false;
    }
    this.phase = "night";
    this.beginDawn();
    return true;
  }

  returnToMenu(): void {
    this.tutorialMode = false;
    this.flagPresent = false;
    this.phase = "menu";
    this.syncSpatialAudio(false);
    this.markUi(true);
  }

  endRunVoluntarily(): void {
    if (this.phase !== "day" && this.phase !== "night" && this.phase !== "paused") return;
    this.endRun(false, "Run ended by player.");
  }

  startTutorial(section = 0): void {
    this.startRun("normal", "flagfall-training", [], true, { settle: false });
    this.tutorialMode = true;
    this.tutorialSection = Math.max(0, Math.min(TUTORIAL_SECTIONS.length - 1, section));
    this.tutorialTask = 0;
    this.setupTutorialSection();
  }

  replayTutorialSection(): void {
    if (!this.tutorialMode) return;
    this.tutorialTask = 0;
    this.setupTutorialSection();
  }

  advanceTutorialSection(): boolean {
    if (!this.tutorialMode || !this.tutorialSectionComplete) return false;
    if (this.tutorialSection >= TUTORIAL_SECTIONS.length - 1) {
      this.returnToMenu();
      return false;
    }
    this.tutorialSection += 1;
    this.tutorialTask = 0;
    this.setupTutorialSection();
    return true;
  }

  getTutorialTask(): TutorialTaskDefinition | null {
    return TUTORIAL_SECTIONS[this.tutorialSection]?.tasks[this.tutorialTask] ?? null;
  }

  isTutorialSlotAllowed(slot: number): boolean {
    return !this.tutorialMode || Boolean(this.getTutorialTask()?.allowedSlots.includes(slot));
  }

  isTutorialTierAllowed(kind: StructureKind, tier: Tier): boolean {
    if (!this.tutorialMode) return true;
    const task = this.getTutorialTask();
    return task?.allowedStructure === kind && task.allowedTier === tier;
  }

  hasActiveFlag(): boolean {
    return this.flagPresent;
  }

  isInsideTutorialArena(x: number, y: number, radius = 0): boolean {
    if (!this.tutorialMode) return true;
    return Math.hypot(x - center, y - center) + radius
      <= BALANCE.tutorialArena.radius - BALANCE.tutorialArena.boundaryInset;
  }

  private constrainToTutorialArena(entity: { x: number; y: number; radius: number }): void {
    if (!this.tutorialMode) return;
    const dx = entity.x - center;
    const dy = entity.y - center;
    const distanceFromCenter = Math.hypot(dx, dy);
    const maximumDistance = Math.max(
      0,
      BALANCE.tutorialArena.radius - BALANCE.tutorialArena.boundaryInset - entity.radius,
    );
    if (distanceFromCenter <= maximumDistance) return;
    if (distanceFromCenter === 0) {
      entity.x = center;
      entity.y = center;
      return;
    }
    entity.x = center + (dx / distanceFromCenter) * maximumDistance;
    entity.y = center + (dy / distanceFromCenter) * maximumDistance;
  }

  private setupTutorialSection(): void {
    const section = TUTORIAL_SECTIONS[this.tutorialSection];
    if (!section) return;
    this.phase = "day";
    this.combatMode = false;
    this.previousPhase = "day";
    this.timer = BALANCE.dayDuration;
    this.phaseElapsed = 0;
    this.footstepCooldown = 0;
    this.healingActive = false;
    this.modalLock = false;
    this.tutorialSectionComplete = false;
    this.tutorialPlacementArea = null;
    this.tutorialHarvestedNodeIds.clear();
    this.tutorialDoorStartSide = 0;
    this.flagPresent = section.id === "flag-objective";
    this.resources = emptyWallet();
    this.structures = [];
    this.enemies = [];
    this.portals = [];
    this.projectiles = [];
    this.particles = [];
    this.world = {
      seed: `tutorial-${section.id}`,
      clearings: [{ x: center, y: center, radius: BALANCE.tutorialArena.radius }],
      resources: [],
      foliage: [],
      navigation: { valid: true, routes: [], invalidGaps: [], attempts: 0, fallback: false },
    };
    this.flag = {
      x: center,
      y: center - 330,
      radius: BALANCE.flag.radius,
      health: BALANCE.flag.health,
      maxHealth: BALANCE.flag.health,
      hurtFlash: 0,
    };
    this.player.x = center - 170;
    this.player.y = center + 120;
    this.player.health = this.player.maxHealth;
    this.player.cooldown = 0;
    this.player.toolCooldown = 0;
    this.player.statuses = undefined;
    this.player.punchHand = "left";
    this.player.punchSerial = 0;
    this.camera = { x: center, y: center };
    this.selectedSlot = 1;
    for (const kind of STRUCTURE_ORDER) this.unlocks.structures[kind] = [...TIER_ORDER];

    const addNode = (kind: keyof ResourceWallet, x: number, y: number): ResourceNode => {
      const maxHealth = BALANCE.resource.health[kind];
      const node: ResourceNode = {
        id: this.nextId++,
        kind,
        x,
        y,
        radius: BALANCE.resource.radius[kind],
        health: maxHealth,
        maxHealth,
        hitFlash: 0,
      };
      this.world.resources.push(node);
      this.constrainToTutorialArena(node);
      return node;
    };
    const addStructure = (
      kind: StructureKind,
      tier: Tier,
      x: number,
      y: number,
      healthFraction = 1,
    ): Structure => {
      const maxHealth = this.structureMaxHealth(kind, tier);
      const structure: Structure = {
        id: this.nextId++,
        ownerId: LOCAL_PLAYER_ID,
        investedResources: scaleCost(
          cumulativeCost(kind, tier, this.upgrades.costReduction),
          this.getChallengeModifiers().constructionCostMultiplier,
        ),
        kind,
        tier,
        x,
        y,
        radius: BALANCE.structure.radius[kind],
        health: maxHealth * healthFraction,
        maxHealth,
        cooldown: 0,
        angle: 0,
        lastArmAngle: 0,
        harvesterHitResourceIds: new Set(),
        flash: 0,
      };
      this.structures.push(structure);
      this.constrainToTutorialArena(structure);
      return structure;
    };

    switch (section.id) {
      case "flag-objective":
        this.flag.x = center;
        this.flag.y = center;
        this.player.x = center;
        this.player.y = center
          - BALANCE.tutorialArena.radius
          + this.player.radius
          + BALANCE.tutorialArena.boundaryInset
          + 32;
        this.player.health = this.player.maxHealth * 0.75;
        break;
      case "resource-harvesting":
        this.player.x = center - 130;
        this.player.y = center;
        addNode("wood", center - 40, center);
        addNode("stone", center + 150, center - 120);
        addNode("gold", center + 155, center + 10);
        addNode("diamond", center + 145, center + 140);
        break;
      case "walls-spikes":
        this.tutorialPlacementArea = { x: center + 90, y: center, radius: 145 };
        break;
      case "player-door":
        this.tutorialPlacementArea = { x: center + 70, y: center, radius: 80 };
        this.player.x = center - 120;
        this.player.y = center;
        break;
      case "structure-upgrading":
        this.player.x = center - 120;
        this.player.y = center;
        this.tutorialPlacementArea = { x: center + 30, y: center, radius: 45 };
        addStructure("wall", "wood", center + 30, center);
        break;
      case "harvester":
        this.player.x = center - 160;
        this.player.y = center + 100;
        this.tutorialPlacementArea = { x: center, y: center, radius: 62 };
        addNode("wood", center - 85, center - 25);
        addNode("wood", center + 35, center - 88);
        addNode("stone", center + 88, center + 32);
        break;
      case "turret": {
        this.player.x = center - 140;
        this.player.y = center;
        this.tutorialPlacementArea = { x: center + 20, y: center, radius: 45 };
        this.spawnEnemy({ x: center + 260, y: center }, "basic");
        const enemy = this.enemies.at(-1);
        if (enemy) {
          enemy.x = center + 260;
          enemy.y = center;
          enemy.speed = 0;
          enemy.damage = 0;
          enemy.structureDamage = 0;
        }
        break;
      }
      case "repair":
        this.player.x = center - 150;
        this.player.y = center;
        addStructure("wall", "wood", center - 20, center - 90, 0.75);
        addStructure("spikes", "wood", center + 35, center, 0.5);
        addStructure("door", "wood", center - 20, center + 90, 0.25);
        break;
      case "recycling":
        this.player.x = center - 150;
        this.player.y = center;
        addStructure("wall", "wood", center - 20, center - 90);
        addStructure("turret", "stone", center + 35, center);
        addStructure("harvester", "gold", center - 20, center + 90);
        break;
    }
    if (this.tutorialPlacementArea) this.constrainToTutorialArena(this.tutorialPlacementArea);
    this.structureRevision += 1;
    this.navigationFields.clear();
    this.applyTutorialTaskResources();
    this.rebuildSpatial();
    this.markUi(true);
  }

  private applyTutorialTaskResources(): void {
    if (!this.tutorialMode) return;
    const task = this.getTutorialTask();
    this.resources = emptyWallet();
    for (const resource of RESOURCE_ORDER) this.resources[resource] = task?.resources?.[resource] ?? 0;
    if (task?.allowedStructure && task.allowedTier) {
      this.selectedTiers[task.allowedStructure] = task.allowedTier;
    }
    this.markUi();
  }

  private recordTutorialEvent(event: string): void {
    if (!this.tutorialMode || this.tutorialSectionComplete) return;
    const task = this.getTutorialTask();
    if (!task || task.completionEvent !== event) return;
    this.tutorialTask += 1;
    const section = TUTORIAL_SECTIONS[this.tutorialSection];
    if (!section || this.tutorialTask >= section.tasks.length) {
      this.tutorialSectionComplete = true;
      this.notify("Section complete");
    } else {
      this.applyTutorialTaskResources();
    }
    this.markUi(true);
  }

  private updateTutorialProgress(): void {
    const section = TUTORIAL_SECTIONS[this.tutorialSection];
    if (!section || this.tutorialSectionComplete) return;
    if (section.id === "player-door") {
      const door = this.structures.find((structure) => structure.kind === "door");
      if (door && this.tutorialDoorStartSide !== 0) {
        const currentSide = Math.sign(this.player.x - door.x);
        if (currentSide !== 0 && currentSide !== this.tutorialDoorStartSide
          && Math.abs(this.player.x - door.x) > this.player.radius + door.radius) {
          this.recordTutorialEvent("crossed-door");
        }
      }
    }
    if (section.id === "turret"
      && this.structures.some((structure) => structure.kind === "turret")
      && this.enemies.length === 0) {
      this.recordTutorialEvent("turret-kill");
    }
  }

  togglePause(): void {
    if (this.phase === "day" || this.phase === "night" || this.phase === "dawn") {
      this.previousPhase = this.phase;
      this.phase = "paused";
      emitAudioCue({ cue: "ui-cancel" });
      this.syncSpatialAudio(false);
      this.markUi(true);
    } else if (this.phase === "paused") {
      this.phase = this.previousPhase;
      emitAudioCue({ cue: "ui-confirm" });
      this.syncSpatialAudio(true);
      this.markUi(true);
    }
  }

  selectSlot(slot: number): void {
    const action = this.getActionBarActions()[slot - 1];
    if (!action) return;
    if (!this.isTutorialSlotAllowed(slot)) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    this.selectedSlot = slot;
    emitAudioCue({ cue: "ui-click" });
    if (this.tutorialMode && action && STRUCTURE_ORDER.includes(action as StructureKind)) {
      this.recordTutorialEvent(`selected-${action}`);
    }
    this.markUi();
  }

  selectTier(kind: StructureKind, tier: Tier): void {
    if (!this.unlocks.structures[kind].includes(tier) || !this.isTutorialTierAllowed(kind, tier)) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    this.selectedTiers[kind] = tier;
    emitAudioCue({ cue: "ui-click" });
    this.selectedSlot = STRUCTURE_ORDER.indexOf(kind) + 4;
    this.recordTutorialEvent(`selected-${kind}`);
    this.markUi();
  }

  chooseDawn(index: number): void {
    if (this.phase !== "dawn") return;
    const choice = this.choices[index];
    if (!choice) return;
    const choiceLog: ChoiceSelectionLog = {
      afterNight: this.night,
      screen: this.dawnScreen + 1,
      id: choice.id,
      name: choice.name,
      kind: choice.kind,
      mutationId: choice.mutationId,
      mutationName: choice.mutationName,
    };
    this.cyclePlaytestActivity.cardsChosen.push(choiceLog);
    this.runPlaytestActivity.cardsChosen.push(choiceLog);
    emitAudioCue({ cue: "card-select" });
    if (choice.kind === "unlock") {
      applyUnlock(this.unlocks, choice.id);
      if (choice.id.startsWith("gloves:")) {
        this.player.punchHand = "left";
        this.player.punchSerial = 0;
        this.player.cooldown = 0;
      }
    }
    else {
      const key = choice.id as keyof typeof this.upgrades;
      const oldPlayerMax = this.player.maxHealth;
      const oldFlagMax = this.flag.maxHealth;
      if (key !== "flagHealth" || !this.getChallengeModifiers().disablesFlagHealthUpgrades) {
        applyUpgrade(this.upgrades, key);
      }
      if (key === "maxHealth") {
        this.player.maxHealth = BALANCE.player.maxHealth + this.upgrades.maxHealth;
        this.player.health += this.player.maxHealth - oldPlayerMax;
      }
      if (key === "flagHealth") {
        if (!this.getChallengeModifiers().disablesFlagHealthUpgrades) {
          const increase = BALANCE.upgrades.flagHealth.amount;
          this.flag.maxHealth = oldFlagMax + increase;
          this.flag.health = Math.min(this.flag.maxHealth, this.flag.health + increase);
        }
      }
    }
    emitAudioCue({ cue: "upgrade-unlock", delayMs: 90 });
    applyMutation(this.mutations, choice.mutationId);
    emitAudioCue({ cue: "card-mutation", delayMs: 220 });
    this.dawnPicked.add(choice.id);
    this.dawnScreen += 1;
    if (this.dawnScreen >= 3) {
      this.beginNextDayWithWarning();
      return;
    }
    this.choices = generateChoiceOfferings(
      this.seed,
      this.night,
      this.dawnScreen,
      this.unlocks,
      this.upgrades,
      this.mutations,
      this.dawnPicked,
      0,
      this.disabledDawnBenefits(),
      this.enemyRoster,
      this.runMode === "endless"
        ? endlessRosterAdditions(
          this.seed,
          this.enemyRoster,
          this.night,
          BALANCE.endless.rosterAdditionInterval,
        )
        : [],
    );
    this.markUi(true);
  }

  dismissEnemyWarning(): void {
    if (!this.enemyWarning) return;
    this.enemyWarning = null;
    this.beginNextDay();
  }

  requestReroll(): void {
    if (this.phase !== "dawn" || this.enemyWarning
      || this.rerollsUsed >= BALANCE.reroll.limit || this.choices.length === 0) return;
    this.rerollConfirmation = true;
    this.markUi(true);
  }

  cancelReroll(): void {
    this.rerollConfirmation = false;
    this.markUi(true);
  }

  confirmReroll(): void {
    if (!this.rerollConfirmation || this.phase !== "dawn" || this.rerollsUsed >= BALANCE.reroll.limit) return;
    emitAudioCue({ cue: "card-reroll" });
    const discarded = new Set(this.choices.map((choice) => choice.id));
    this.spendResources(rerollCost(this.resources));
    this.rerollsUsed += 1;
    this.rerollConfirmation = false;
    this.choices = generateChoiceOfferings(
      this.seed,
      this.night,
      this.dawnScreen,
      this.unlocks,
      this.upgrades,
      this.mutations,
      new Set([...this.dawnPicked, ...discarded]),
      this.rerollsUsed,
      this.disabledDawnBenefits(),
      this.enemyRoster,
      this.runMode === "endless"
        ? endlessRosterAdditions(
          this.seed,
          this.enemyRoster,
          this.night,
          BALANCE.endless.rosterAdditionInterval,
        )
        : [],
    );
    if (this.choices.length < 3) {
      this.choices = generateChoiceOfferings(
        this.seed,
        this.night,
        this.dawnScreen,
        this.unlocks,
        this.upgrades,
        this.mutations,
        this.dawnPicked,
        this.rerollsUsed,
        this.disabledDawnBenefits(),
        this.enemyRoster,
        this.runMode === "endless"
          ? endlessRosterAdditions(
            this.seed,
            this.enemyRoster,
            this.night,
            BALANCE.endless.rosterAdditionInterval,
          )
          : [],
      );
    }
    this.notify(`Reroll ${this.rerollsUsed} of ${BALANCE.reroll.limit}`);
    this.markUi(true);
  }

  getRerollCost(): ResourceWallet {
    return rerollCost(this.resources);
  }

  requestSkipNight(): void {
    if (this.phase !== "day" || this.combatMode || this.skipNightConfirmation) return;
    this.skipNightConfirmation = true;
    this.modalLock = true;
    this.markUi(true);
  }

  cancelSkipNight(): void {
    this.skipNightConfirmation = false;
    this.modalLock = false;
    this.markUi(true);
  }

  confirmSkipNight(): void {
    if (!this.skipNightConfirmation || this.phase !== "day") return;
    this.skipNightConfirmation = false;
    this.modalLock = false;
    this.timer = 0;
    this.beginNight();
  }

  update(dt: number): void {
    if (this.modalLock) {
      this.input.endFrame();
      return;
    }
    if (this.input.escapePressed) this.togglePause();
    if (this.input.numberPressed) this.selectSlot(this.input.numberPressed);
    if (this.phase !== "day" && this.phase !== "night") {
      this.input.endFrame();
      return;
    }

    if (!this.tutorialMode) {
      this.stats.elapsed += dt;
      this.trackPlaytestTime(dt);
      this.timer = Math.max(0, this.timer - dt);
    }
    this.phaseElapsed += dt;
    this.footstepCooldown = Math.max(0, this.footstepCooldown - dt);
    this.audioSpatialCooldown = Math.max(0, this.audioSpatialCooldown - dt);
    const playerAttackSpeed = this.statusAttackSpeedMultiplier(this.player);
    this.player.cooldown = Math.max(0, this.player.cooldown - dt * playerAttackSpeed);
    this.player.toolCooldown = Math.max(0, this.player.toolCooldown - dt * playerAttackSpeed);
    updateStatuses(this.player, dt);
    this.player.hurtFlash = Math.max(0, this.player.hurtFlash - dt);
    if (this.flagPresent) this.flag.hurtFlash = Math.max(0, this.flag.hurtFlash - dt);
    this.flagWarningCooldown = Math.max(0, this.flagWarningCooldown - dt);
    this.phaseTransitionImpact = Math.max(0, this.phaseTransitionImpact - dt);
    this.toastTime = Math.max(0, this.toastTime - dt);
    this.shake = Math.max(0, this.shake - dt * 12);
    if (this.toastTime === 0 && this.toastQueue.length) {
      const next = this.toastQueue.shift();
      this.toast = next?.message ?? "";
      this.toastCritical = next?.critical ?? false;
      this.toastTime = this.toastCritical ? BALANCE.ui.criticalMessageDuration : BALANCE.ui.messageDuration;
    }

    this.rebuildSpatial();
    this.updateAim();
    this.updatePlayer(dt);
    this.updateMeleeSwing(dt);
    this.updateStructures(dt);
    this.updatePortals(dt);
    this.updateBossSpawn();
    this.updateEnemies(dt);
    this.updateIcicleStrikes(dt);
    this.trackFlagRadiusEntries();
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.updateHealing(dt);
    if (this.player.health >= this.player.maxHealth) this.playerDamageWarned = false;
    this.updateBuildPreview();
    this.updateToolPreview();
    this.handleAction();
    this.updateCamera(dt);
    if (this.audioSpatialCooldown <= 0) {
      this.audioSpatialCooldown = 0.2;
      this.syncSpatialAudio(true);
    }
    if (this.tutorialMode) this.updateTutorialProgress();

    if (this.combatMode && this.canLeaveCombatMode()) this.leaveCombatMode();

    if (this.tutorialMode) {
      this.player.health = Math.max(1, this.player.health);
      if (this.flagPresent) this.flag.health = Math.max(1, this.flag.health);
    } else if (this.player.health <= 0) this.endRun(false, "You fell to the horde.");
    else if (this.flag.health <= 0) this.endRun(false, "The flag was destroyed.");
    else if (this.timer <= 0) {
      if (this.phase === "day") this.beginNight();
      else if (!this.isBossNight()) this.beginDawn();
      else if (this.bossSpawnedThisNight
        && !this.enemies.some((enemy) => this.isBossEnemyKind(enemy.kind) && enemy.health > 0)
        && this.isNightWaveCleared()) {
        this.completeBossNight();
      }
    }
    this.input.endFrame();
  }

  private updateAim(): void {
    const target = this.screenToWorld(this.input.mouse);
    this.player.angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
  }

  private updatePlayer(dt: number): void {
    let x = 0;
    let y = 0;
    if (this.input.keys.has("KeyA")) x -= 1;
    if (this.input.keys.has("KeyD")) x += 1;
    if (this.input.keys.has("KeyW")) y -= 1;
    if (this.input.keys.has("KeyS")) y += 1;
    const length = Math.hypot(x, y);
    if (length === 0) return;
    const speed = resolveEffectiveStat({
      base: BALANCE.player.speed,
      permanent: this.getPermanentPercent("moveSpeed"),
      temporary: this.upgrades.moveSpeed,
      contextual: this.statusMovementMultiplier(this.player) - 1,
    });
    const moveX = (x / length) * speed * dt;
    const moveY = (y / length) * speed * dt;
    const beforeX = this.player.x;
    const beforeY = this.player.y;
    this.moveCircle(this.player, moveX, 0, true);
    this.moveCircle(this.player, 0, moveY, true);
    if (this.footstepCooldown <= 0 && Math.hypot(this.player.x - beforeX, this.player.y - beforeY) > 0.2) {
      this.footstepCooldown = 0.31;
      emitAudioCue({ cue: "player-footstep-grass", position: { x: this.player.x, y: this.player.y } });
    }
  }

  private moveCircle(entity: { x: number; y: number; radius: number }, dx: number, dy: number, player = false): void {
    entity.x = Math.max(entity.radius, Math.min(BALANCE.mapSize - entity.radius, entity.x + dx));
    entity.y = Math.max(entity.radius, Math.min(BALANCE.mapSize - entity.radius, entity.y + dy));
    const nearby = this.obstacleHash.query(entity.x, entity.y, entity.radius + 70);
    for (const obstacle of nearby) {
      if (player && "tier" in obstacle && obstacle.kind === "door") continue;
      if (player && "kind" in obstacle && "health" in obstacle && !("open" in obstacle) && obstacle.health <= 0) {
        // Depleted resources remain solid by design.
      }
      const d = distance(entity, obstacle);
      const min = entity.radius + obstacle.radius;
      if (d >= min || d === 0) continue;
      const push = min - d;
      entity.x += ((entity.x - obstacle.x) / d) * push;
      entity.y += ((entity.y - obstacle.y) / d) * push;
    }
    this.constrainToTutorialArena(entity);
  }

  private updateCamera(dt: number): void {
    if (this.tutorialMode) {
      this.camera.x = center;
      this.camera.y = center;
      return;
    }
    const factor = 1 - Math.exp(-dt * 8);
    this.camera.x += (this.player.x - this.camera.x) * factor;
    this.camera.y += (this.player.y - this.camera.y) * factor;
    const halfW = BALANCE.logicalWidth / 2;
    const halfH = BALANCE.logicalHeight / 2;
    this.camera.x = Math.max(halfW, Math.min(BALANCE.mapSize - halfW, this.camera.x));
    this.camera.y = Math.max(halfH, Math.min(BALANCE.mapSize - halfH, this.camera.y));
  }

  private handleAction(): void {
    if (!this.input.mouseDown) return;
    if (this.tutorialMode && !this.isTutorialSlotAllowed(this.selectedSlot)) return;
    const action = this.getSelectedAction();
    if (!action) return;
    if (action === "fists") this.punch();
    else if (action === "tool") {
      if (this.combatMode) this.shootBow();
      else if (this.input.pressed) this.repair();
    } else if (action === "recycle") {
      if (!this.combatMode && this.input.pressed) this.recycle();
    } else if (!this.combatMode && this.input.pressed) {
      this.placeStructure(action);
    }
  }

  private punch(): void {
    const sword = this.getEquippedSword();
    const interval = Math.max(0.16, resolveActionCooldown(
      BALANCE.player.punchRate,
      {
        temporary: this.upgrades.punchRate,
      },
      sword ? [sword.cooldownMultiplier] : [],
    ));
    if (this.player.cooldown > 0) return;
    this.player.cooldown = interval;
    this.meleeSwingDuration = interval;
    this.meleeSwingElapsed = 0;
    this.meleeImpactPending = Boolean(sword);
    this.meleeSwingUsesSword = Boolean(sword);
    const currentIndex = BALANCE.punchHands.indexOf(this.player.punchHand);
    this.player.punchHand = BALANCE.punchHands[(currentIndex + 1) % BALANCE.punchHands.length] ?? "right";
    this.player.punchSerial += 1;
    emitAudioCue({
      cue: sword ? "sword-swing" : "player-punch-swing",
      position: { x: this.player.x, y: this.player.y },
    });
    if (!sword) this.resolveMeleeImpact(null);
  }

  private updateMeleeSwing(dt: number): void {
    if (this.player.cooldown <= 0 && !this.meleeImpactPending) return;
    this.meleeSwingElapsed += dt;
    const hitTime = this.meleeSwingDuration
      * META_BALANCE.equipment.swordAnimation.damageProgress;
    if (!this.meleeImpactPending || this.meleeSwingElapsed < hitTime) return;
    this.meleeImpactPending = false;
    this.resolveMeleeImpact(this.meleeSwingUsesSword ? this.getEquippedSword() : null);
  }

  private resolveMeleeImpact(sword: ReturnType<typeof swordStats>): void {
    const range = sword?.range ?? BALANCE.player.punchRange;
    const candidates = this.enemyHash.query(this.player.x, this.player.y, range + 40)
      .filter((enemy) => this.inMeleeArc(enemy, range, sword?.arc ?? BALANCE.player.punchArc))
      .sort((a, b) => distance(this.player, a) - distance(this.player, b));
    const targets = sword ? candidates : candidates.slice(0, 1);
    if (targets.length) {
      const damaged = new Set<number>();
      for (const enemy of targets) {
        if (damaged.has(enemy.id)) continue;
        damaged.add(enemy.id);
        const damage = resolveEffectiveStat({
          base: BALANCE.player.punchDamage,
          permanent: this.getPermanentPercent("punchDamage"),
          equipment: sword ? sword.damageMultiplier - 1 : 0,
          temporaryFlat: this.upgrades.punchDamage,
        });
        this.damageEnemy(enemy, damage, "#fff3c6", "player-melee", this.player.id);
        if (sword) {
          enemy.x += Math.cos(this.player.angle) * sword.knockback;
          enemy.y += Math.sin(this.player.angle) * sword.knockback;
          this.constrainToTutorialArena(enemy);
        }
      }
      const impact = targets[0];
      if (impact) emitAudioCue({
        cue: sword ? "sword-hit" : "player-punch-impact",
        position: { x: impact.x, y: impact.y },
      });
      return;
    }
    const portal = this.portals
      .filter((item) => this.inMeleeArc(item, range, sword?.arc ?? BALANCE.player.punchArc))
      .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    if (portal) {
      emitAudioCue({ cue: sword ? "sword-hit" : "player-punch-impact", position: { x: portal.x, y: portal.y } });
      portal.health -= BALANCE.glovePortalDamage[this.getBestGlove()];
      portal.flash = 0.16;
      this.burst(portal.x, portal.y, "#9c73ff", 8);
      if (portal.health <= 0) this.relocatePortal(portal);
      return;
    }
    const node = this.obstacleHash.query(this.player.x, this.player.y, range + 70)
      .filter((item): item is ResourceNode => !("tier" in item))
      .filter((item) => this.inMeleeArc(item, range, sword?.arc ?? BALANCE.player.punchArc))
      .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    if (node) {
      const harvestInterval = Math.max(
        0.12,
        resolveActionCooldown(
          BALANCE.player.punchRate,
          {
            permanent: this.getPermanentPercent("harvestRate"),
            temporary: this.upgrades.punchRate + this.upgrades.harvestRate,
          },
          sword ? [sword.cooldownMultiplier] : [],
        ),
      );
      this.player.cooldown = sword
        ? Math.max(0, harvestInterval - this.meleeSwingElapsed)
        : harvestInterval;
      this.meleeSwingDuration = harvestInterval;
      this.harvestNode(node, this.getBestGlove(), 1, "player");
    }
    else this.burst(
      this.player.x + Math.cos(this.player.angle) * 65,
      this.player.y + Math.sin(this.player.angle) * 65,
      "#e8dab9",
      3,
    );
  }

  private inMeleeArc(
    target: { x: number; y: number; radius: number },
    range: number,
    arc: number,
  ): boolean {
    const d = distance(this.player, target);
    if (d > range + target.radius) return false;
    const angle = Math.atan2(target.y - this.player.y, target.x - this.player.x);
    const delta = Math.atan2(Math.sin(angle - this.player.angle), Math.cos(angle - this.player.angle));
    return Math.abs(delta) <= arc;
  }

  private shootBow(): void {
    const interval = Math.max(0.15, resolveActionCooldown(BALANCE.bow.rate, {
      permanent: this.getPermanentPercent("bowRate"),
      temporary: this.upgrades.bowRate,
    }));
    if (this.player.toolCooldown > 0) return;
    this.player.toolCooldown = interval;
    const angle = this.player.angle;
    this.projectiles.push({
      id: this.nextId++,
      owner: "player",
      ownerPlayerId: this.player.id,
      damageSource: "player-bow",
      x: this.player.x + Math.cos(angle) * 43,
      y: this.player.y + Math.sin(angle) * 43,
      previousX: this.player.x,
      previousY: this.player.y,
      vx: Math.cos(angle) * BALANCE.bow.speed,
      vy: Math.sin(angle) * BALANCE.bow.speed,
      radius: BALANCE.bow.radius,
      damage: resolveEffectiveStat({
        base: BALANCE.bow.damage,
        permanent: this.getPermanentPercent("bowDamage"),
        temporaryFlat: this.upgrades.bowDamage,
      }),
      rangeLeft: BALANCE.bow.range,
      lifetime: BALANCE.bow.range / BALANCE.bow.speed + 0.2,
      hitIds: new Set(),
      color: "#f6e2a8",
    });
    emitAudioCue({ cue: "bow-fire", position: { x: this.player.x, y: this.player.y } });
    this.burst(this.player.x + Math.cos(angle) * 34, this.player.y + Math.sin(angle) * 34, "#fff6d7", 3);
  }

  private repair(): void {
    if (this.getChallengeModifiers().disablesStructureRepair) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    const preview = this.toolPreview;
    if (!preview || preview.action !== "repair" || !preview.valid || !preview.target) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    if (!preview.affordable) {
      this.notify("Cannot afford full repair");
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    if (preview.target === this.flag) return;
    const structure = preview.target as Structure;
    const wrench = this.profileManager?.profile.equipment.wrench;
    const chance = freeRepairChance(wrench?.tier ?? null, wrench?.equipped ?? false);
    const free = chance > 0 && this.rng.next() < chance;
    if (!free) this.spendResources(preview.cost);
    structure.health = structure.maxHealth;
    this.recordStructureActivity("repaired", structure.kind, structure.tier);
    this.burst(structure.x, structure.y, "#74f3a5", 16, free ? "FREE REPAIR" : "FULL REPAIR");
    if (!free) this.floatWallet(structure.x, structure.y + 30, preview.cost, "-");
    emitAudioCue({ cue: "structure-repair", position: { x: structure.x, y: structure.y } });
    if (free) emitAudioCue({ cue: "resource-collected" });
    this.recordTutorialEvent(`repaired-${structure.kind}`);
  }

  private recycle(): void {
    const preview = this.toolPreview;
    if (!preview || preview.action !== "recycle" || !preview.valid || !preview.target || preview.target === this.flag) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    const structure = preview.target as Structure;
    if (!this.isOwnedByPlayer(structure, this.player.id)) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    addWallet(this.resources, preview.refund);
    this.recordResources("refunded", preview.refund);
    this.structures = this.structures.filter((item) => item !== structure);
    this.invalidateStructureTargets(structure.id);
    this.recalculateStructureScore();
    this.structureRevision += 1;
    this.navigationFields.clear();
    this.burst(structure.x, structure.y, "#f0cf88", 24, "RECYCLED");
    this.floatWallet(structure.x, structure.y + 30, preview.refund, "+");
    emitAudioCue({ cue: "structure-recycle", position: { x: structure.x, y: structure.y } });
    this.recordTutorialEvent(`recycled-${structure.kind}`);
    this.rebuildSpatial();
  }

  private updateToolPreview(): void {
    const action = this.getSelectedAction();
    if (this.combatMode || (action !== "tool" && action !== "recycle")) {
      this.toolPreview = null;
      return;
    }
    if (action === "tool" && this.getChallengeModifiers().disablesStructureRepair) {
      this.toolPreview = {
        x: this.player.x,
        y: this.player.y,
        action: "repair",
        valid: false,
        affordable: false,
        target: null,
        cost: emptyWallet(),
        refund: emptyWallet(),
        restoreAmount: 0,
        reason: "Structure repair disabled by No Repairs",
      };
      return;
    }
    const mouse = this.screenToWorld(this.input.mouse);
    const angle = Math.atan2(mouse.y - this.player.y, mouse.x - this.player.x);
    const pointerDistance = distance(this.player, mouse);
    const clampedDistance = Math.min(pointerDistance, BALANCE.player.buildReach);
    const x = this.player.x + Math.cos(angle) * clampedDistance;
    const y = this.player.y + Math.sin(angle) * clampedDistance;
    const inReach = pointerDistance <= BALANCE.player.buildReach;
    let structure = inReach
      ? this.structures.filter((item) =>
        this.isOwnedByPlayer(item, this.player.id)
        && distance(mouse, item) <= item.radius + 20)
        .sort((a, b) => distance(mouse, a) - distance(mouse, b))[0] ?? null
      : null;
    if (this.tutorialMode && structure) {
      const requiredKind = this.getTutorialTask()?.completionEvent.split("-").at(-1);
      if (requiredKind && structure.kind !== requiredKind) structure = null;
    }
    if (action === "recycle") {
      const refund = structure
        ? dismantleRefund(
          this.structureInvestment(structure),
          this.getRecyclingRate(),
          structure.health,
          structure.maxHealth,
        )
        : emptyWallet();
      const recyclingPercent = Math.round(this.getRecyclingRate() * 100);
      this.toolPreview = {
        x,
        y,
        action,
        valid: Boolean(structure),
        affordable: true,
        target: structure,
        cost: emptyWallet(),
        refund,
        restoreAmount: 0,
        reason: structure
          ? `Recycle at ${recyclingPercent}% value`
          : inReach ? "Owned structure required" : "Out of reach",
      };
      return;
    }
    if (structure) {
      const cost = proportionalRepairCost(
        structure.kind,
        structure.tier,
        structure.health,
        structure.maxHealth,
        this.upgrades.repairEfficiency,
      );
      const damaged = structure.health < structure.maxHealth;
      this.toolPreview = {
        x,
        y,
        action: "repair",
        valid: damaged,
        affordable: damaged && canAfford(this.resources, cost),
        target: structure,
        cost,
        refund: emptyWallet(),
        restoreAmount: structure.maxHealth - structure.health,
        reason: damaged ? "Repair to full health" : "Already at full health",
      };
      return;
    }
    this.toolPreview = {
      x,
      y,
      action: "repair",
      valid: false,
      affordable: false,
      target: null,
      cost: emptyWallet(),
      refund: emptyWallet(),
      restoreAmount: 0,
      reason: inReach ? "Damaged player-built structure required" : "Out of reach",
    };
  }

  private updateBuildPreview(): void {
    const action = this.getSelectedAction();
    if (this.combatMode || !action || action === "fists" || action === "tool" || action === "recycle") {
      this.buildPreview = null;
      return;
    }
    const mouse = this.screenToWorld(this.input.mouse);
    const angle = Math.atan2(mouse.y - this.player.y, mouse.x - this.player.x);
    const d = Math.min(distance(this.player, mouse), BALANCE.player.buildReach);
    const x = this.player.x + Math.cos(angle) * d;
    const y = this.player.y + Math.sin(angle) * d;
    const kind = action;
    const tier = this.selectedTiers[kind];
    const radius = BALANCE.structure.radius[kind];
    const candidate = { x, y, radius };
    const upgrading = this.structures.find((item) => item.kind === kind && overlaps(candidate, item, -radius * 0.7)) ?? null;
    let valid = true;
    let reason = "";
    const tutorialArea = this.tutorialMode ? this.tutorialPlacementArea : null;
    const tutorialPlacementRequired = Boolean(this.getTutorialTask()?.placementArea);
    if (tutorialArea && tutorialPlacementRequired
      && distance(tutorialArea, candidate) > tutorialArea.radius) {
      valid = false;
      reason = "Use the highlighted tutorial area";
    } else if (!this.isInsideTutorialArena(candidate.x, candidate.y, radius)) {
      valid = false;
      reason = "Arena boundary";
    } else if (this.flagPresent && distance(this.flag, candidate) < BALANCE.flagProtectedRadius + radius) {
      valid = false;
      reason = "Flag no-build zone";
    } else if (this.portals.some((portal) => distance(portal, candidate) < BALANCE.portal.noBuildRadius + radius)) {
      valid = false;
      reason = "Portal no-build zone";
    } else if (x < radius || y < radius || x > BALANCE.mapSize - radius || y > BALANCE.mapSize - radius) {
      valid = false;
      reason = "Map boundary";
    } else if (overlaps(candidate, this.player, 7)) {
      valid = false;
      reason = "Too close to player";
    } else if (this.enemies.some((enemy) => overlaps(candidate, enemy, 5))) {
      valid = false;
      reason = "Enemy in the way";
    } else if (upgrading) {
      if (BALANCE.tierIndex[tier] <= BALANCE.tierIndex[upgrading.tier]) {
        valid = false;
        reason = "Select a stronger tier";
      }
    } else if (this.structures.some((item) => overlaps(candidate, item, 4))) {
      valid = false;
      reason = "Overlaps a structure";
    }
    const baseCost = upgrading
      ? upgradeCost(kind, upgrading.tier, tier, this.upgrades.costReduction)
      : cumulativeCost(kind, tier, this.upgrades.costReduction);
    const cost = scaleCost(
      baseCost,
      this.getChallengeModifiers().constructionCostMultiplier,
    );
    const capacityReached = !upgrading && this.isCapacityReached(kind);
    if (capacityReached) {
      valid = false;
      reason = `${kind === "turret" ? "Turret" : "Harvester"} capacity reached`;
    }
    this.buildPreview = {
      x,
      y,
      valid,
      upgrading,
      kind,
      tier,
      reason,
      cost,
      affordable: canAfford(this.resources, cost),
      capacityReached,
    };
  }

  private placeStructure(kind: StructureKind): void {
    const preview = this.buildPreview;
    if (!preview || preview.kind !== kind || !preview.valid) {
      if (preview?.reason) this.notify(preview.reason);
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    const cost = preview.cost;
    if (!canAfford(this.resources, cost)) {
      this.notify("Not enough resources");
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    this.spendResources(cost);
    if (preview.upgrading) {
      const structure = preview.upgrading;
      const investedResources = this.structureInvestment(structure);
      addWallet(investedResources, cost);
      structure.investedResources = investedResources;
      const ratio = structure.health / structure.maxHealth;
      structure.tier = preview.tier;
      structure.maxHealth = this.structureMaxHealth(
        kind,
        preview.tier,
        structure.ownerId ?? this.player.id,
      );
      structure.health = structure.maxHealth * ratio;
      this.recordStructureActivity("upgraded", structure.kind, structure.tier);
      this.burst(structure.x, structure.y, BALANCE.tierColors[preview.tier], 12, "UPGRADE");
      emitAudioCue({ cue: "structure-upgrade", position: { x: structure.x, y: structure.y } });
      this.recordTutorialEvent(`upgraded-${kind}`);
    } else {
      const maxHealth = this.structureMaxHealth(kind, preview.tier);
      this.structures.push({
        id: this.nextId++,
        ownerId: this.player.id,
        investedResources: { ...cost },
        kind,
        tier: preview.tier,
        x: preview.x,
        y: preview.y,
        radius: BALANCE.structure.radius[kind],
        health: maxHealth,
        maxHealth,
        cooldown: 0,
        angle: 0,
        lastArmAngle: 0,
        harvesterHitResourceIds: new Set(),
        flash: 0,
      });
      this.stats.structuresBuilt += 1;
      this.recordStructureActivity("built", kind, preview.tier);
      this.burst(preview.x, preview.y, BALANCE.tierColors[preview.tier], 10, "BUILT");
      emitAudioCue({ cue: "structure-place", position: { x: preview.x, y: preview.y } });
      this.recordTutorialEvent(`placed-${kind}`);
      if (kind === "door") {
        this.tutorialDoorStartSide = Math.sign(this.player.x - preview.x) || -1;
      }
    }
    this.recalculateStructureScore();
    this.structureRevision += 1;
    this.navigationFields.clear();
    this.rebuildSpatial();
  }

  private updateStructures(dt: number): void {
    for (const structure of this.structures) {
      structure.cooldown = Math.max(
        0,
        structure.cooldown - dt * this.statusAttackSpeedMultiplier(structure),
      );
      updateStatuses(structure, dt);
      structure.flash = Math.max(0, structure.flash - dt);
      if (structure.kind === "turret" && (this.phase === "night" || this.tutorialMode || this.enemies.some((enemy) => enemy.burning))) {
        this.updateTurret(structure);
      }
      if (structure.kind === "harvester" && this.phase === "day") this.updateHarvester(structure, dt);
    }
  }

  private updateTurret(structure: Structure): void {
    const tierIndex = BALANCE.tierIndex[structure.tier];
    const ownerId = structure.ownerId ?? this.player.id;
    const range = this.getTurretRange(structure.tier, ownerId);
    const target = this.enemyHash.query(structure.x, structure.y, range)
      .filter((enemy) => distance(structure, enemy) <= range)
      .sort((a, b) => distance(structure, a) - distance(structure, b))[0];
    if (!target) return;
    structure.angle = Math.atan2(target.y - structure.y, target.x - structure.x);
    if (structure.cooldown > 0) return;
    structure.cooldown = Math.max(
      0.16,
      resolveActionCooldown(BALANCE.structure.turretRate[tierIndex] ?? 1, {
        permanent: this.getPermanentPercent("turretRate", ownerId),
        temporary: this.upgrades.turretRate,
      }),
    );
    this.projectiles.push({
      id: this.nextId++,
      owner: "turret",
      ownerPlayerId: ownerId,
      damageSource: "turret",
      x: structure.x + Math.cos(structure.angle) * 30,
      y: structure.y + Math.sin(structure.angle) * 30,
      previousX: structure.x,
      previousY: structure.y,
      vx: Math.cos(structure.angle) * BALANCE.bow.speed,
      vy: Math.sin(structure.angle) * BALANCE.bow.speed,
      radius: 5,
      damage: resolveEffectiveStat({
        base: BALANCE.structure.turretDamage[tierIndex] ?? 8,
        permanent: this.getPermanentPercent("turretDamage", ownerId),
        temporary: this.upgrades.turretDamage,
      }),
      rangeLeft: range,
      lifetime: range / BALANCE.bow.speed + 0.2,
      hitIds: new Set(),
      color: BALANCE.tierColors[structure.tier],
    });
    emitAudioCue({ cue: "turret-fire", position: { x: structure.x, y: structure.y } });
    this.burst(structure.x, structure.y, BALANCE.tierColors[structure.tier], 2);
  }

  private updateHarvester(structure: Structure, dt: number): void {
    const tierIndex = BALANCE.tierIndex[structure.tier];
    const speed = resolveEffectiveStat({
      base: BALANCE.structure.harvesterSpeed[tierIndex] ?? 0.8,
      permanent: this.getPermanentPercent(
        "harvesterSpeed",
        structure.ownerId ?? this.player.id,
      ),
      temporary: this.upgrades.harvesterSpeed,
    });
    structure.lastArmAngle = structure.angle;
    const unwrappedAngle = structure.angle + speed * dt;
    structure.angle = unwrappedAngle % BALANCE.harvester.revolutionRadians;
    if (unwrappedAngle >= BALANCE.harvester.revolutionRadians || structure.angle < structure.lastArmAngle) {
      structure.harvesterHitResourceIds.clear();
      emitAudioCue({ cue: "harvester-swing", position: { x: structure.x, y: structure.y } });
    }
    const arm = BALANCE.structure.harvesterArm[tierIndex] ?? 98;
    const tip = {
      x: structure.x + Math.cos(structure.angle) * arm,
      y: structure.y + Math.sin(structure.angle) * arm,
      radius: 14,
    };
    for (const item of this.obstacleHash.query(tip.x, tip.y, 70)) {
      if ("tier" in item) continue;
      const node = item;
      if (node.health > 0 && overlaps(tip, node) && !structure.harvesterHitResourceIds.has(node.id)) {
        structure.harvesterHitResourceIds.add(node.id);
        this.harvestNode(node, structure.tier, 0.2, "harvester");
        if (this.tutorialMode) {
          this.tutorialHarvestedNodeIds.add(node.id);
          if (this.tutorialHarvestedNodeIds.size >= 2) this.recordTutorialEvent("harvested-two-nodes");
        }
      }
    }
  }

  private harvestNode(
    node: ResourceNode,
    tier: Tier,
    damageScale: number,
    audioOrigin: "player" | "harvester" = "player",
  ): void {
    if (node.health <= 0) return;
    const amount = BALANCE.harvest[tier][node.kind];
    if (amount <= 0) {
      if (damageScale >= 1) this.notify(`Need better gloves for ${node.kind}`);
      return;
    }
    node.health = Math.max(0, node.health - Math.max(1, amount * damageScale));
    node.hitFlash = 0.16;
    this.resources[node.kind] += amount;
    this.stats.resourcesGathered += amount;
    this.recordResources("gathered", { ...emptyWallet(), [node.kind]: amount });
    this.burst(node.x, node.y, BALANCE.tierColors[node.kind], 4);
    this.floatResource(node.x, node.y - 24, node.kind, `+${amount}`);
    const hitCue = `${node.kind}-hit` as "wood-hit" | "stone-hit" | "gold-hit" | "diamond-hit";
    emitAudioCue({
      cue: hitCue,
      position: audioOrigin === "harvester" ? { x: node.x, y: node.y } : undefined,
      playbackChannel: audioOrigin === "harvester" ? "harvester-harvest" : "player-harvest",
    });
    // No resource collected audio, muddles the specific resource hit sounds and not necessary
    //emitAudioCue({ cue: "resource-collected", position: { x: node.x, y: node.y } });
    if (node.health <= 0) {
      this.burst(node.x, node.y, "#aab0aa", 12, "DEPLETED");
      emitAudioCue({ cue: "resource-depleted", position: { x: node.x, y: node.y } });
      if (this.tutorialMode && node.kind === "wood") this.recordTutorialEvent("tree-depleted");
    }
  }

  private updatePortals(dt: number): void {
    for (const portal of this.portals) {
      portal.flash = Math.max(0, portal.flash - dt);
      if (this.phase !== "night" || this.timer <= 0 || portal.spawned >= portal.assignedSpawns) continue;
      const scheduleProgress = Math.min(
        1,
        this.phaseElapsed / BALANCE.nightSpawnCutoff,
      );
      const scheduledCount = Math.min(
        portal.assignedSpawns,
        Math.floor(scheduleProgress * portal.assignedSpawns + 1e-6),
      );
      let boundedWork = 0;
      while (portal.spawned < scheduledCount && boundedWork < portal.assignedSpawns) {
        let kind = this.waveSchedule[this.waveScheduleCursor] ?? "basic";
        const activeKind = this.enemies.filter((enemy) => enemy.health > 0 && enemy.kind === kind).length;
        if (activeKind >= this.getEnemySimultaneousCap(kind)) kind = "basic";
        portal.spawned += 1;
        this.waveScheduleCursor += 1;
        this.spawnEnemy(portal, kind);
        boundedWork += 1;
      }
    }
  }

  private updateBossSpawn(): void {
    if (this.phase !== "night" || !this.isBossNight() || this.bossSpawnedThisNight
      || this.phaseElapsed < BALANCE.endless.bossSpawnDelay) return;
    const portal = new SeededRng(`${this.seed}:boss-portal:${this.night}`).pick(this.portals);
    this.spawnEnemy(portal, this.getBossKind());
    this.bossSpawnedThisNight = true;
    emitAudioCue({ cue: "portal-spawn", position: { x: portal.x, y: portal.y } });
    this.notify("BOSS INCOMING", true);
    emitAudioCue({ cue: "boss-roar", position: { x: portal.x, y: portal.y }, delayMs: 90 });
    this.markUi(true);
  }

  private isNightWaveCleared(): boolean {
    if (!this.nightWaveScheduled) return false;
    const scheduledWaveComplete = this.portals.every((portal) => portal.spawned >= portal.assignedSpawns);
    if (!scheduledWaveComplete) return false;
    return !this.enemies.some((enemy) => enemy.health > 0 && enemy.countsTowardWave !== false);
  }

  private canLeaveCombatMode(): boolean {
    if (this.phase === "night") return !this.isBossNight() && this.isNightWaveCleared();
    if (this.phase === "day") return !this.enemies.some((enemy) => enemy.health > 0);
    return false;
  }

  private leaveCombatMode(): void {
    this.combatMode = false;
    this.selectedSlot = 1;
    this.notify("All zombies killed", true);
    emitAudioCue({ cue: "wave-cleared" });
    this.markUi(true);
  }

  private spawnEnemy(
    portal: Portal | Vec2,
    kind: EnemyKind,
    summonedBy?: number,
    child = false,
    countsTowardWave = true,
  ): void {
    const definition = ENEMY_REGISTRY[kind];
    const base = BALANCE.enemy[kind];
    const difficulty = BALANCE.difficulty[this.difficulty];
    const bossDifficulty = this.isBossEnemyKind(kind)
      ? BALANCE.bossDifficulty[this.difficulty]
      : null;
    const healthDifficulty = bossDifficulty?.health ?? difficulty.enemyHealth;
    const damageDifficulty = bossDifficulty?.damage ?? difficulty.enemyDamage;
    const speedDifficulty = bossDifficulty?.speed ?? difficulty.enemySpeed;
    const attackSpeedDifficulty = bossDifficulty?.attackSpeed ?? difficulty.attackSpeed;
    const challenges = this.getChallengeModifiers();
    // Scaling order: base, selected difficulty, accumulated mutation, then clamped adaptive influence.
    const adaptiveHealth = 1 + (this.adaptiveState.multiplier - 1) * BALANCE.adaptive.healthInfluence;
    const adaptiveDamage = 1 + (this.adaptiveState.multiplier - 1) * BALANCE.adaptive.damageInfluence;
    const mutationParentKind = kind === "splitter-child" ? "splitter" : kind;
    const mutationApplies = this.isBossEnemyKind(kind)
      || this.getActiveRoster().includes(mutationParentKind as RosterEnemyKind);
    const mutation = mutationApplies ? this.mutations : createMutations();
    const attackSpeedMultiplier = resolveEffectiveStat({
      base: 1,
      permanent: attackSpeedDifficulty - 1,
      mutation: mutation.attackSpeed,
      challenge: challenges.enemyAttackSpeedMultiplier - 1,
    });
    const endlessIndex = this.runMode === "endless" ? Math.max(0, this.night - 10) : 0;
    const bossCycle = this.isBossEnemyKind(kind) && this.runMode === "endless"
      ? Math.max(0, Math.floor((this.night - 10) / 5))
      : 0;
    const endlessHealthMultiplier = this.isBossEnemyKind(kind)
      ? Math.pow(BALANCE.endless.bossHealthGrowthPerCycle, bossCycle)
      : Math.pow(BALANCE.endless.healthGrowthPerNight, endlessIndex);
    const endlessDamageMultiplier = this.isBossEnemyKind(kind)
      ? Math.pow(BALANCE.endless.bossDamageGrowthPerCycle, bossCycle)
      : Math.pow(BALANCE.endless.damageGrowthPerNight, endlessIndex);
    const health = base.health
      * healthDifficulty
      * (1 + mutation.health)
      * adaptiveHealth
      * challenges.enemyHealthMultiplier
      * endlessHealthMultiplier;
    const angle = this.rng.range(0, Math.PI * 2);
    const radius = base.radius;
    this.enemies.push({
      id: this.nextId++,
      kind,
      x: portal.x + Math.cos(angle) * 18,
      y: portal.y + Math.sin(angle) * 18,
      radius,
      health,
      maxHealth: health,
      speed: base.speed
        * speedDifficulty
        * (1 + mutation.speed)
        * challenges.enemySpeedMultiplier,
      damage: base.damage
        * damageDifficulty
        * (1 + mutation.damage)
        * adaptiveDamage
        * challenges.enemyDamageMultiplier
        * endlessDamageMultiplier,
      structureDamage: base.structureDamage * damageDifficulty
        * (1 + mutation.structureDamage)
        * adaptiveDamage
        * challenges.enemyDamageMultiplier
        * endlessDamageMultiplier,
      attackRate: base.attackRate / Math.max(0.05, attackSpeedMultiplier),
      attackSpeedMultiplier,
      cooldown: 0,
      attackWindup: 0,
      targetId: this.tutorialMode && !this.flagPresent ? "tutorial" : "flag",
      scanCooldown: this.rng.range(0, 0.4),
      pathCooldown: this.rng.range(0, 0.7),
      path: [],
      pathIndex: 0,
      flash: 0,
      summonCooldown: this.rng.range(5, 8),
      summonedBy,
      countsTowardWave,
      jumpCooldown: kind === "jumper" ? BALANCE.jumper.jumpCooldown : 0,
      jumpTime: 0,
      bossSmashWindup: 0,
      bossSlamWave: 0,
      bossHalfSummoned: false,
      acidCooldown: kind === "boss" ? BALANCE.boss.acidAttackInterval : 0,
      acidWindup: 0,
      acidAimAngle: 0,
      burning: false,
      sunlightExposure: 0,
      sunlightEffectCooldown: 0,
      deathCounted: false,
      lastDamageSource: null,
      lastHitByPlayerId: null,
      stuckTime: 0,
      fullyStuckTime: 0,
      forcedBlockerId: null,
      routeCommitment: 0,
      routeIncludesStructures: false,
      routeStructureRevision: this.structureRevision,
      jumpElapsed: 0,
      jumpStartX: 0,
      jumpStartY: 0,
      jumpEndX: 0,
      jumpEndY: 0,
      angle: 0,
      child,
      deathResolved: false,
      deathReason: null,
      chargeProgress: 0,
      chargeTargetId: null,
      charging: false,
      chargeDistanceLeft: 0,
      chargeDamageLeft: 0,
      chargeHitIds: new Set(),
      armor: definition.armor
        ? definition.armor.health * (definition.armor.scalesWithHealth ? health / Math.max(1, base.health) : 1)
        : undefined,
      maxArmor: definition.armor
        ? definition.armor.health * (definition.armor.scalesWithHealth ? health / Math.max(1, base.health) : 1)
        : undefined,
      icicleCooldown: kind === "frost-warden"
        ? BALANCE.snowyEnemies.frostWarden.icicle.initialCooldown
        : undefined,
      icicleAttackSerial: kind === "frost-warden" ? 0 : undefined,
    });
    const spawned = this.enemies.at(-1);
    if (spawned) {
      this.constrainToTutorialArena(spawned);
      if (this.phase === "night" && this.nightPerformance) {
        const category: keyof EnemyPopulationLog["spawned"] = child
          ? "children"
          : this.isBossEnemyKind(kind)
            ? "boss"
            : summonedBy !== undefined
              ? "summons"
              : "scheduled";
        this.nightPerformance.populationCategoryByEnemyId.set(spawned.id, category);
        this.incrementEnemyTally(this.nightPerformance.population.spawned[category], kind);
        if (countsTowardWave) {
          this.nightPerformance.totalZombiesSpawned += 1;
          this.nightPerformance.waveEnemyIds.add(spawned.id);
        }
      }
    }
  }

  private endlessMilestoneCount(): number {
    return this.runMode === "endless"
      ? Math.max(0, Math.floor((this.night - 10) / BALANCE.endless.rosterAdditionInterval))
      : 0;
  }

  private getEnemyPerWaveCap(kind: EnemyKind): number {
    if (kind === "basic" || this.isBossEnemyKind(kind) || kind === "splitter-child") {
      return ENEMY_REGISTRY[kind].caps.perWave;
    }
    return Math.ceil(
      ENEMY_REGISTRY[kind].caps.perWave
        * (1 + this.endlessMilestoneCount() * BALANCE.endless.specialCapGrowthPerMilestone),
    );
  }

  private getEnemySimultaneousCap(kind: EnemyKind): number {
    if (kind === "basic" || this.isBossEnemyKind(kind) || kind === "splitter-child") {
      return ENEMY_REGISTRY[kind].caps.simultaneous;
    }
    return Math.ceil(
      ENEMY_REGISTRY[kind].caps.simultaneous
        * (1 + this.endlessMilestoneCount() * BALANCE.endless.specialCapGrowthPerMilestone),
    );
  }

  private rollEnemyKind(
    rng: SeededRng = this.rng,
    counts: ReadonlyMap<EnemyKind, number> = new Map(),
    budgetLeft = Number.POSITIVE_INFINITY,
    specialsOnly = false,
  ): EnemyKind {
    const specialBoost = 1 + Math.max(0, this.adaptiveState.multiplier - 1)
      * BALANCE.adaptive.specialWeightInfluence;
    const eliteMultiplier = this.getChallengeModifiers().specialZombieWeightMultiplier;
    const counterConfig = BALANCE.adaptive.powerAwareness.turretCounterWeights;
    const extremeTurretPower = this.adaptiveState.turretCoverageRatio >= counterConfig.coverageThreshold
      || this.adaptiveState.turretDps / Math.max(1, this.adaptiveState.expectedTurretDps)
        >= counterConfig.dpsRatioThreshold;
    const introduced = this.getActiveRoster();
    const entries = introduced.flatMap((kind) => {
      const definition = ENEMY_REGISTRY[kind];
      const count = counts.get(kind) ?? 0;
      if (specialsOnly && kind === "basic") return [];
      if (definition.threat > budgetLeft || count >= this.getEnemyPerWaveCap(kind)) return [];
      const mutation = this.mutations[mutationWeightKey(kind)];
      const special = definition.tier === 1 ? 1 : specialBoost * eliteMultiplier;
      const counterWeight = extremeTurretPower && kind === "archer"
        ? counterConfig.archerMultiplier
        : extremeTurretPower && kind === "acidslinger"
          ? counterConfig.acidslingerMultiplier
          : 1;
      return [{ value: kind as EnemyKind, weight: Math.max(0, definition.spawnWeight + mutation) * special * counterWeight }];
    });
    return entries.length > 0 ? rng.weighted(entries) : "basic";
  }

  private buildWaveSchedule(threatBudget: number): EnemyKind[] {
    const rng = new SeededRng(`${this.seed}:wave:${this.night}:${this.difficulty}`);
    const introduced = this.getActiveRoster();
    const guaranteedSpecials = introduced.filter((kind) => kind !== "basic");
    const result: EnemyKind[] = [];
    const counts = new Map<EnemyKind, number>();
    let remaining = Math.max(1, threatBudget);
    for (const kind of guaranteedSpecials) {
      const definition = ENEMY_REGISTRY[kind];
      if (definition.threat > remaining) continue;
      result.push(kind);
      counts.set(kind, 1);
      remaining -= definition.threat;
    }
    let guard = 0;
    const specialThreatTarget = this.runMode === "endless"
      ? threatBudget * BALANCE.endless.minimumSpecialThreatShare
      : 0;
    let specialThreat = result.reduce(
      (sum, kind) => sum + (kind === "basic" ? 0 : ENEMY_REGISTRY[kind].threat),
      0,
    );
    while (remaining >= ENEMY_REGISTRY.basic.threat
      && guard < BALANCE.endless.maximumScheduledEnemies
      && result.length < BALANCE.endless.maximumScheduledEnemies) {
      guard += 1;
      const needsSpecial = specialThreat < specialThreatTarget;
      let kind = this.rollEnemyKind(rng, counts, remaining, needsSpecial);
      if (needsSpecial && kind === "basic") kind = this.rollEnemyKind(rng, counts, remaining);
      const definition = ENEMY_REGISTRY[kind];
      const justIntroduced = definition.introductionNight === this.night && definition.tier > 2;
      const introductionCap = Math.max(1, Math.floor(threatBudget * BALANCE.waveSafety.firstIntroductionShare / definition.threat));
      if (justIntroduced && (counts.get(kind) ?? 0) >= introductionCap) kind = "basic";
      result.push(kind);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      remaining -= ENEMY_REGISTRY[kind].threat;
      if (kind !== "basic") specialThreat += ENEMY_REGISTRY[kind].threat;
    }
    return rng.shuffle(result);
  }

  getWaveForecast(): Array<{ kind: EnemyKind; count: number; threat: number }> {
    const counts = new Map<EnemyKind, number>();
    for (const kind of this.waveSchedule) counts.set(kind, (counts.get(kind) ?? 0) + 1);
    return [...counts.entries()].map(([kind, count]) => ({ kind, count, threat: ENEMY_REGISTRY[kind].threat * count }));
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      this.updateSunlight(enemy, dt);
      if (enemy.health <= 0) continue;
      enemy.cooldown = Math.max(0, enemy.cooldown - dt);
      enemy.scanCooldown -= dt;
      enemy.pathCooldown -= dt;
      enemy.flash = Math.max(0, enemy.flash - dt);
      enemy.jumpCooldown = Math.max(0, enemy.jumpCooldown - dt);
      enemy.routeCommitment = Math.max(0, enemy.routeCommitment - dt);
      enemy.bossSlamWave = Math.max(0, (enemy.bossSlamWave ?? 0) - dt);
      const definition = ENEMY_REGISTRY[enemy.kind];
      if (typeof enemy.targetId === "number"
        && !this.structures.some((structure) =>
          structure.id === enemy.targetId && structure.health > 0)) {
        this.invalidateEnemyTarget(enemy);
        this.selectEnemyTarget(enemy);
      }
      this.resolveEnemyStructureOverlap(enemy, dt);
      if (enemy.kind === "rammer" && this.updateRammer(enemy, dt)) continue;
      if (enemy.jumpTime > 0) {
        this.updateJumperAirborne(enemy, dt);
        continue;
      }
      if (enemy.kind === "summoner") this.updateSummoner(enemy, dt);
      if (this.isBossEnemyKind(enemy.kind)) this.updateBoss(enemy, dt);
      if (enemy.scanCooldown <= 0) {
        enemy.scanCooldown = 0.35 + this.rng.range(0, 0.15);
        this.selectEnemyTarget(enemy);
      }
      const target = this.getEnemyTarget(enemy);
      if (!target) {
        this.invalidateEnemyTarget(enemy);
        this.selectEnemyTarget(enemy);
        continue;
      }
      if ("tutorialTarget" in target) {
        enemy.attackWindup = 0;
        continue;
      }
      const reach = enemy.radius + target.radius + 5;
      const targetDistance = distance(enemy, target);
      enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      if (definition.movement.avoidStructures) this.refreshEnemyPath(enemy, target);
      const bossPlayerReach = enemy.radius + this.player.radius + 5;
      if (enemy.kind === "boss" && distance(enemy, this.player) <= bossPlayerReach) {
        this.enemyAttack(enemy, this.player, dt);
        this.moveEnemyToward(enemy, target, dt, true);
        continue;
      }
      if ((definition.attack.mode === "arrow" || definition.attack.mode === "acid")
        && targetDistance <= this.enemyAttackRange(enemy)) {
        this.enemyRangedAttack(enemy, target, dt);
        continue;
      }
      if (definition.attack.mode === "arrow" || definition.attack.mode === "acid") {
        enemy.chargeProgress = Math.max(0, (enemy.chargeProgress ?? 0) - dt * 0.35);
        enemy.attackWindup = definition.attack.chargeSeconds > 0
          ? (enemy.chargeProgress ?? 0) / definition.attack.chargeSeconds
          : 0;
      }
      if (targetDistance <= reach) {
        this.enemyAttack(enemy, target, dt);
        if (target === this.player && enemy.attackWindup > 0) {
          this.moveEnemyToward(enemy, target, dt, true);
        }
        continue;
      }
      const movementTarget = enemy.path[enemy.pathIndex] ?? target;
      const blocker = this.firstBlockingStructure(enemy, movementTarget);
      const blockerReach = this.isBossEnemyKind(enemy.kind) ? BALANCE.boss.obstacleAttackRange : 9;
      if (definition.movement.avoidStructures && enemy.routeIncludesStructures && enemy.path.length > 0) {
        this.moveEnemyToward(enemy, target, dt);
        continue;
      }
      if (enemy.kind === "jumper") {
        const jumpBlocker = blocker ?? this.firstBlockingResource(enemy, movementTarget);
        if (jumpBlocker
          && distance(enemy, jumpBlocker) <= enemy.radius + jumpBlocker.radius + blockerReach) {
          if (enemy.jumpCooldown <= 0 && this.tryJumperLeap(enemy, jumpBlocker, target)) continue;
          this.moveEnemyToward(enemy, target, dt);
          continue;
        }
      }
      if (blocker && distance(enemy, blocker) <= enemy.radius + blocker.radius + blockerReach) {
        if (definition.attack.mode === "arrow" || definition.attack.mode === "acid") {
          if (enemy.kind === "snowballer" && blocker.kind !== "turret") {
            this.moveEnemyToward(enemy, target, dt);
          } else {
            this.enemyRangedAttack(enemy, blocker, dt, true);
          }
        } else {
          this.enemyAttack(enemy, blocker, dt);
        }
        continue;
      }
      this.moveEnemyToward(enemy, target, dt);
    }

    this.separateEnemies();
    if (this.tutorialMode) {
      for (const enemy of this.enemies) this.constrainToTutorialArena(enemy);
    }
    for (const enemy of this.enemies) {
      if (enemy.health > 0) continue;
      this.resolveEnemyDeath(enemy);
      if (enemy.burning) {
        this.burst(enemy.x, enemy.y, "#737875", 12);
        this.burst(enemy.x, enemy.y, "#ff8b38", 10, "POOF");
      }
    }
    const structureCountBeforeCleanup = this.structures.length;
    for (const structure of this.structures) {
      if (structure.health <= 0) {
        this.burst(structure.x, structure.y, "#cc5c4f", 22, "BROKEN");
        emitAudioCue({ cue: "structure-destroyed", position: { x: structure.x, y: structure.y } });
      }
    }
    this.enemies = this.enemies.filter((enemy) => enemy.health > 0);
    this.structures = this.structures.filter((structure) => structure.health > 0);
    if (this.structures.length !== structureCountBeforeCleanup) {
      const livingStructureIds = new Set(this.structures.map((structure) => structure.id));
      for (const enemy of this.enemies) {
        if (typeof enemy.targetId === "number" && !livingStructureIds.has(enemy.targetId)) {
          this.invalidateEnemyTarget(enemy);
          this.selectEnemyTarget(enemy);
        }
      }
      this.structureRevision += 1;
      this.navigationFields.clear();
    }
    this.recalculateStructureScore();
  }

  private updateSunlight(enemy: Enemy, dt: number): void {
    if (!enemy.burning || this.isBossEnemyKind(enemy.kind)) return;
    const sunlightActive = this.phase === "day";
    if (!sunlightActive) return;
    enemy.sunlightExposure += dt;
    enemy.sunlightEffectCooldown -= dt;
    const damagePerSecond = Math.min(
      BALANCE.sunlight.maximumDamage,
      BALANCE.sunlight.startingDamage + BALANCE.sunlight.damageEscalation * enemy.sunlightExposure,
    );
    enemy.lastDamageSource = "sunlight";
    enemy.lastHitByPlayerId = null;
    const healthBefore = Math.max(0, enemy.health);
    const requestedDamage = damagePerSecond * dt;
    const appliedDamage = this.routeEnemyDamage(enemy, requestedDamage, "sunlight");
    this.recordOutgoingDamage("sunlight", appliedDamage);
    if (enemy.health <= 0) {
      if (healthBefore > 0) this.recordEnemyKill(enemy, "sunlight");
      enemy.deathReason = "sunlight";
    }
    if (enemy.sunlightEffectCooldown <= 0) {
      enemy.sunlightEffectCooldown = BALANCE.sunlight.effectInterval;
      this.particles.push({
        x: enemy.x + this.rng.range(-enemy.radius * 0.5, enemy.radius * 0.5),
        y: enemy.y - this.rng.range(0, enemy.radius * 0.7),
        vx: this.rng.range(-9, 9),
        vy: this.rng.range(-48, -25),
        life: 0.45,
        maxLife: 0.45,
        radius: this.rng.range(3, 7),
        color: this.rng.next() > 0.45 ? "#ff8b38" : "#ffd34d",
      });
    }
  }

  private selectEnemyTarget(enemy: Enemy): void {
    if (this.tutorialMode && !this.flagPresent) {
      enemy.targetId = "tutorial";
      return;
    }
    if (enemy.forcedBlockerId) {
      const blocker = this.structures.find((structure) =>
        structure.id === enemy.forcedBlockerId && structure.health > 0);
      if (blocker) {
        enemy.targetId = blocker.id;
        return;
      }
      enemy.forcedBlockerId = null;
    }
    const definition = ENEMY_REGISTRY[enemy.kind];
    if (definition.targeting.mode === "flag" || definition.targeting.mode === "rammer") {
      enemy.targetId = "flag";
      return;
    }
    const detection = definition.targeting.detectionRadius;
    if (definition.targeting.mode === "harvester") {
      const locked = typeof enemy.targetId === "number"
        ? this.structures.find((item) => item.id === enemy.targetId && item.kind === "harvester")
        : null;
      if (locked && locked.health > 0
        && distance(enemy, locked) <= detection * BALANCE.navigation.targetHysteresis
        && enemy.routeCommitment > 0) return;
      const harvesters = this.structures
        .filter((item) => item.kind === "harvester" && item.health > 0
          && distance(enemy, item) <= detection)
        .sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id - b.id);
      enemy.targetId = harvesters[0]?.id ?? "flag";
      enemy.routeCommitment = definition.targeting.lockSeconds;
      return;
    }
    const playerInRange = distance(enemy, this.player) <= detection;
    const candidates = this.structures.filter((structure) => distance(enemy, structure) <= detection);
    const turrets = candidates.filter((item) => item.kind === "turret").sort((a, b) => distance(enemy, a) - distance(enemy, b));
    const harvesters = candidates.filter((item) => item.kind === "harvester").sort((a, b) => distance(enemy, a) - distance(enemy, b));
    if (definition.targeting.mode === "archer") {
      enemy.targetId = turrets[0]?.id ?? (playerInRange ? "player" : "flag");
      return;
    }
    if (definition.targeting.mode === "acidslinger") {
      if (turrets[0]) enemy.targetId = turrets[0].id;
      else if (playerInRange) enemy.targetId = "player";
      else enemy.targetId = "flag";
      return;
    }
    if (distance(enemy, this.flag) <= detection) enemy.targetId = "flag";
    else if (playerInRange) enemy.targetId = "player";
    else if (turrets[0]) enemy.targetId = turrets[0].id;
    else if (harvesters[0]) enemy.targetId = harvesters[0].id;
    else enemy.targetId = "flag";
  }

  private getEnemyTarget(enemy: Enemy): (Player | Flag | Structure | TutorialTarget) | null {
    if (enemy.forcedBlockerId) {
      const blocker = this.structures.find((structure) =>
        structure.id === enemy.forcedBlockerId && structure.health > 0);
      if (blocker) return blocker;
      enemy.forcedBlockerId = null;
    }
    if (enemy.targetId === "player") return this.player;
    if (enemy.targetId === "flag") return this.flagPresent ? this.flag : null;
    if (enemy.targetId === "tutorial") return this.tutorialTarget;
    if (typeof enemy.targetId === "number") {
      return this.structures.find((item) => item.id === enemy.targetId && item.health > 0) ?? null;
    }
    return null;
  }

  private invalidateEnemyTarget(enemy: Enemy): void {
    enemy.targetId = null;
    enemy.path = [];
    enemy.pathIndex = 0;
    enemy.pathCooldown = BALANCE.navigation.targetRepathCooldown;
    enemy.routeCommitment = 0;
    enemy.routeIncludesStructures = false;
    enemy.stuckTime = 0;
    enemy.fullyStuckTime = 0;
    enemy.forcedBlockerId = null;
    enemy.attackWindup = 0;
    enemy.chargeProgress = 0;
  }

  private invalidateStructureTargets(structureId: number): void {
    for (const enemy of this.enemies) {
      if (enemy.targetId !== structureId) continue;
      this.invalidateEnemyTarget(enemy);
      this.selectEnemyTarget(enemy);
    }
  }

  private resolveEnemyStructureOverlap(enemy: Enemy, dt: number): void {
    for (const structure of this.structures) {
      if (structure.health <= 0 || !overlaps(enemy, structure)) continue;
      const d = distance(enemy, structure);
      const minimum = enemy.radius + structure.radius + 1;
      const fallbackAngle = ((enemy.id * 31 + structure.id * 17) % 360) * Math.PI / 180;
      const nx = d > 0.001 ? (enemy.x - structure.x) / d : Math.cos(fallbackAngle);
      const ny = d > 0.001 ? (enemy.y - structure.y) / d : Math.sin(fallbackAngle);
      const push = Math.min(minimum - d, BALANCE.navigation.overlapResolveSpeed * dt);
      enemy.x += nx * push;
      enemy.y += ny * push;
    }
  }

  private tryJumperLeap(
    enemy: Enemy,
    blocker: Pick<Structure, "x" | "y" | "radius">,
    target: Player | Flag | Structure,
  ): boolean {
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const minimumDistance = blocker.radius + enemy.radius + BALANCE.jumper.landingClearance + 24;
    const attempts = 5;
    let landing: { x: number; y: number; radius: number } | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const leapDistance = minimumDistance
        + (BALANCE.jumper.jumpRange - minimumDistance) * (attempt / Math.max(1, attempts - 1));
      const candidate = {
        x: enemy.x + Math.cos(angle) * leapDistance,
        y: enemy.y + Math.sin(angle) * leapDistance,
        radius: enemy.radius,
      };
      const withinMap = candidate.x >= enemy.radius && candidate.y >= enemy.radius
        && candidate.x <= BALANCE.mapSize - enemy.radius
        && candidate.y <= BALANCE.mapSize - enemy.radius;
      const withinArena = this.isInsideTutorialArena(candidate.x, candidate.y, candidate.radius);
      const blockedByStructure = this.structures.some((structure) =>
        overlaps(candidate, structure, BALANCE.jumper.landingClearance));
      const blockedByResource = this.world.resources.some((node) =>
        !node.destroyed && overlaps(candidate, node, BALANCE.jumper.landingClearance));
      const blockedByEntity = overlaps(candidate, this.player, BALANCE.jumper.landingClearance)
        || (this.flagPresent && overlaps(candidate, this.flag, BALANCE.jumper.landingClearance))
        || this.enemies.some((other) => other !== enemy && overlaps(candidate, other, 2));
      if (withinMap && withinArena && !blockedByStructure && !blockedByResource && !blockedByEntity) {
        landing = candidate;
        break;
      }
    }
    if (!landing) {
      enemy.jumpCooldown = BALANCE.jumper.failedRetryDelay;
      enemy.path = [];
      enemy.pathIndex = 0;
      return false;
    }
    enemy.jumpTime = BALANCE.jumper.jumpDuration;
    enemy.jumpElapsed = 0;
    enemy.jumpCooldown = BALANCE.jumper.jumpCooldown;
    enemy.jumpStartX = enemy.x;
    enemy.jumpStartY = enemy.y;
    enemy.jumpEndX = landing.x;
    enemy.jumpEndY = landing.y;
    enemy.pathCooldown = 0;
    enemy.path = [];
    enemy.pathIndex = 0;
    emitAudioCue({ cue: "jumper-jump", position: { x: enemy.x, y: enemy.y } });
    this.burst(enemy.x, enemy.y, "#b7ff8a", 9, "JUMP");
    return true;
  }

  private updateJumperAirborne(enemy: Enemy, dt: number): void {
    enemy.jumpElapsed = Math.min(BALANCE.jumper.jumpDuration, enemy.jumpElapsed + dt);
    const progress = Math.min(1, enemy.jumpElapsed / BALANCE.jumper.jumpDuration);
    const eased = progress * progress * (3 - 2 * progress);
    enemy.x = enemy.jumpStartX + (enemy.jumpEndX - enemy.jumpStartX) * eased;
    enemy.y = enemy.jumpStartY + (enemy.jumpEndY - enemy.jumpStartY) * eased;
    enemy.jumpTime = Math.max(0, BALANCE.jumper.jumpDuration - enemy.jumpElapsed);
    enemy.attackWindup = 0;
    if (progress >= 1) {
      enemy.jumpTime = 0;
      enemy.pathCooldown = 0;
      enemy.path = [];
      enemy.pathIndex = 0;
      enemy.stuckTime = 0;
      enemy.fullyStuckTime = 0;
      this.burst(enemy.x, enemy.y, "#b7ff8a", 7, "LAND");
    }
  }

  private enemyAttack(enemy: Enemy, target: Player | Flag | Structure, dt: number): void {
    if (enemy.jumpTime > 0) return;
    if (enemy.cooldown > 0) return;
    enemy.attackWindup += dt * 3.4 * (enemy.attackSpeedMultiplier ?? 1);
    if (enemy.attackWindup < 1) return;
    enemy.attackWindup = 0;
    enemy.cooldown = enemy.attackRate;
    const isStructure = "kind" in target && "tier" in target;
    const rawDamage = isStructure ? enemy.structureDamage : enemy.damage;
    const playerWasFull = target === this.player && this.player.health >= this.player.maxHealth;
    const damage = this.applyIncomingDamage(target, rawDamage, enemy.kind, "enemy");
    this.applyEnemyStatusEffect(ENEMY_REGISTRY[enemy.kind].attack.statusEffect, target);
    emitAudioCue({
      cue: (ENEMY_REGISTRY[enemy.kind].audio.attack ?? "zombie-attack") as import("./audio").SoundId,
      position: { x: enemy.x, y: enemy.y },
    });
    if (target === this.player) {
      emitAudioCue({ cue: "player-hurt", position: { x: this.player.x, y: this.player.y } });
    } else if (target === this.flag) {
      emitAudioCue({ cue: "flag-damaged" });
    } else {
      emitAudioCue({ cue: "structure-damaged", position: { x: target.x, y: target.y } });
    }
    if (target === this.player && playerWasFull && !this.playerDamageWarned) {
      this.playerDamageWarned = true;
      const healingDisabled = this.getChallengeModifiers().disablesPlayerHealing;
      this.notify(
        healingDisabled
          ? "You are damaged! Healing is disabled."
          : "You are damaged! Your flag heals you.",
        true,
      );
    }
    if (target === this.flag && this.flagWarningCooldown <= 0) {
      this.flagWarningCooldown = BALANCE.ui.flagWarningCooldown;
      this.notify(
        this.flag.health <= this.flag.maxHealth * 0.25
          ? "Your flag was damaged! Critical flag health!"
          : "Your flag was damaged!",
        true,
      );
    }
    if ("hurtFlash" in target) target.hurtFlash = 0.22;
    else target.flash = 0.22;
    if (isStructure && target.kind === "spikes" && ENEMY_REGISTRY[enemy.kind].movement.meleeSpikes) {
      const index = BALANCE.tierIndex[target.tier];
      this.damageEnemy(
        enemy,
        BALANCE.structure.spikeRetaliation[index] ?? 4,
        "#e5e5e5",
        "spikes",
        target.ownerId ?? this.player.id,
      );
    }
    this.shake = Math.max(this.shake, this.isBossEnemyKind(enemy.kind) ? 10 : 3);
    this.burst(target.x, target.y, "#ff695f", this.isBossEnemyKind(enemy.kind) ? 14 : 6, `-${Math.round(damage)}`);
  }

  private moveEnemyToward(
    enemy: Enemy,
    target: { x: number; y: number },
    dt: number,
    preserveMeleeWindup = false,
  ): void {
    if (enemy.kind === "jumper") {
      enemy.path = [];
      enemy.pathIndex = 0;
      enemy.routeIncludesStructures = false;
    } else this.refreshEnemyPath(enemy, target);
    const waypoint = enemy.path[enemy.pathIndex] ?? target;
    if (distance(enemy, waypoint) < 34 && enemy.pathIndex < enemy.path.length - 1) enemy.pathIndex += 1;
    const active = enemy.path[enemy.pathIndex] ?? target;
    const angle = Math.atan2(active.y - enemy.y, active.x - enemy.x);
    const attackMode = ENEMY_REGISTRY[enemy.kind].attack.mode;
    if (!preserveMeleeWindup && (attackMode === "melee" || attackMode === "boss")) {
      enemy.attackWindup = Math.max(0, enemy.attackWindup - dt * 2.5);
    }
    const sunlightMultiplier = enemy.burning && this.phase === "day" ? BALANCE.sunlight.movementMultiplier : 1;
    const windupMovementMultiplier = preserveMeleeWindup ? 1 : enemy.attackWindup > 0 ? 0.2 : 1;
    const speed = enemy.speed * sunlightMultiplier * windupMovementMultiplier;
    const beforeX = enemy.x;
    const beforeY = enemy.y;
    enemy.x += Math.cos(angle) * speed * dt;
    enemy.y += Math.sin(angle) * speed * dt;
    this.resolveResourceCollision(enemy);
    this.resolveEnemyStructureOverlap(enemy, dt);
    const moved = Math.hypot(enemy.x - beforeX, enemy.y - beforeY);
    const completelyStuck = moved
      <= BALANCE.navigation.fullyStuckMaximumProgressPerSecond * dt;
    enemy.fullyStuckTime = completelyStuck ? (enemy.fullyStuckTime ?? 0) + dt : 0;
    if ((enemy.fullyStuckTime ?? 0) >= BALANCE.navigation.fullyStuckAttackDelay) {
      const forcedBlocker = this.findAdjacentStuckBlocker(enemy, target);
      if (forcedBlocker) {
        enemy.forcedBlockerId = forcedBlocker.id;
        enemy.targetId = forcedBlocker.id;
        enemy.path = [];
        enemy.pathIndex = 0;
        enemy.pathCooldown = 0;
        enemy.routeCommitment = ENEMY_REGISTRY[enemy.kind].targeting.lockSeconds;
        enemy.fullyStuckTime = 0;
        this.burst(enemy.x, enemy.y, "#ffad3d", 6, "BLOCKED");
      }
    }
    if (moved < speed * dt * 0.18) enemy.stuckTime += dt;
    else enemy.stuckTime = Math.max(0, enemy.stuckTime - dt * 2);
    if (enemy.stuckTime >= BALANCE.navigation.stuckRepathTime) {
      enemy.stuckTime = 0;
      enemy.pathCooldown = 0;
      enemy.path = [];
      enemy.pathIndex = 0;
    }
  }

  private findAdjacentStuckBlocker(
    enemy: Enemy,
    target: { x: number; y: number },
  ): Structure | undefined {
    const directBlocker = this.firstBlockingStructure(enemy, target);
    const maximumGap = BALANCE.navigation.stuckBlockerSearchPadding;
    if (directBlocker
      && distance(enemy, directBlocker) <= enemy.radius + directBlocker.radius + maximumGap) {
      return directBlocker;
    }
    if (enemy.kind === "acidslinger") return undefined;
    return this.structures
      .filter((structure) => structure.health > 0)
      .filter((structure) =>
        distance(enemy, structure) <= enemy.radius + structure.radius + maximumGap)
      .sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id - b.id)[0];
  }

  private refreshEnemyPath(enemy: Enemy, target: { x: number; y: number }): void {
    const routeInvalidated = enemy.routeIncludesStructures
      && enemy.routeStructureRevision !== this.structureRevision;
    if ((enemy.path.length === 0 || (enemy.pathCooldown <= 0 && enemy.routeCommitment <= 0)) || routeInvalidated) {
      const avoidsStructures = ENEMY_REGISTRY[enemy.kind].movement.avoidStructures;
      enemy.pathCooldown = avoidsStructures
        ? BALANCE.navigation.runnerRepathInterval
        : BALANCE.navigation.repathIntervalMin + this.rng.range(0, BALANCE.navigation.repathIntervalJitter);
      enemy.routeIncludesStructures = false;
      enemy.routeStructureRevision = this.structureRevision;
      if (avoidsStructures) {
        const naturalObstacles = this.world.resources.filter((node) => !node.destroyed);
        const navigationalStructures = this.structures.filter((structure) =>
          !("id" in target && target.id === structure.id));
        const gapRoute = new NavigationGrid([...naturalObstacles, ...navigationalStructures], enemy.radius).find(enemy, target);
        const directDistance = Math.max(1, distance(enemy, target));
        const routeDistance = this.pathLength(enemy, gapRoute);
        if (
          gapRoute.length > 0
          && !pathIntersectsObstacle(enemy, gapRoute, navigationalStructures, enemy.radius)
          && routeDistance <= directDistance * BALANCE.navigation.runnerMaximumDetourRatio
          && routeDistance - directDistance <= BALANCE.navigation.runnerMaximumExtraDistance
        ) {
          enemy.path = gapRoute;
          enemy.pathIndex = 0;
          enemy.routeIncludesStructures = true;
          enemy.routeCommitment = BALANCE.navigation.runnerRouteCommitmentDuration;
        } else {
          const naturalNavigation = new NavigationGrid(naturalObstacles, enemy.radius);
          enemy.path = naturalNavigation.find(enemy, target);
          enemy.pathIndex = 0;
        }
      } else {
      const radiusKey = Math.ceil(enemy.radius);
      let navigation = this.navigationFields.get(radiusKey);
      if (!navigation) {
        const naturalObstacles = this.isBossEnemyKind(enemy.kind)
          ? []
          : this.world.resources.filter((node) => !node.destroyed);
        navigation = new NavigationGrid(naturalObstacles, radiusKey);
        this.navigationFields.set(radiusKey, navigation);
      }
      enemy.path = navigation.find(enemy, target);
      enemy.pathIndex = 0;
      }
    }
  }

  private firstBlockingStructure(enemy: Enemy, target: { x: number; y: number }): Structure | undefined {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const lengthSquared = Math.max(1, dx * dx + dy * dy);
    return this.structures
      .filter((structure) => !("id" in target && target.id === structure.id))
      .filter((structure) => segmentCircle(enemy.x, enemy.y, target.x, target.y, {
        ...structure,
        radius: structure.radius + enemy.radius
          * (this.isBossEnemyKind(enemy.kind) ? BALANCE.boss.obstaclePathWidth : 0.45),
      }))
      .sort((a, b) => {
        const aTravel = ((a.x - enemy.x) * dx + (a.y - enemy.y) * dy) / lengthSquared;
        const bTravel = ((b.x - enemy.x) * dx + (b.y - enemy.y) * dy) / lengthSquared;
        return aTravel - bTravel || a.id - b.id;
      })[0];
  }

  private firstBlockingResource(enemy: Enemy, target: { x: number; y: number }): ResourceNode | undefined {
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const lengthSquared = Math.max(1, dx * dx + dy * dy);
    return this.world.resources
      .filter((resource) => !resource.destroyed)
      .filter((resource) => segmentCircle(enemy.x, enemy.y, target.x, target.y, {
        ...resource,
        radius: resource.radius + enemy.radius * 0.45,
      }))
      .sort((a, b) => {
        const aTravel = ((a.x - enemy.x) * dx + (a.y - enemy.y) * dy) / lengthSquared;
        const bTravel = ((b.x - enemy.x) * dx + (b.y - enemy.y) * dy) / lengthSquared;
        return aTravel - bTravel || a.id - b.id;
      })[0];
  }

  private pathLength(start: Vec2, path: readonly Vec2[]): number {
    let total = 0;
    let previous = start;
    for (const point of path) {
      total += distance(previous, point);
      previous = point;
    }
    return total;
  }

  private resolveResourceCollision(enemy: Enemy): void {
    if (this.isBossEnemyKind(enemy.kind)) return;
    for (const item of this.obstacleHash.query(enemy.x, enemy.y, enemy.radius + 70)) {
      if ("tier" in item || item.destroyed) continue;
      const node = item;
      if (!overlaps(enemy, node)) continue;
      const d = Math.max(0.001, distance(enemy, node));
      const push = enemy.radius + node.radius - d;
      enemy.x += ((enemy.x - node.x) / d) * push;
      enemy.y += ((enemy.y - node.y) / d) * push;
    }
  }

  private separateEnemies(): void {
    for (const enemy of this.enemies) {
      for (const other of this.enemyHash.query(enemy.x, enemy.y, enemy.radius * 2.2)) {
        if (other.id <= enemy.id || enemy.jumpTime > 0 || other.jumpTime > 0) continue;
        const minimumDistance = (enemy.radius + other.radius)
          * BALANCE.navigation.zombieSeparationRadiusMultiplier;
        const d = Math.max(0.01, distance(enemy, other));
        if (d >= minimumDistance) continue;
        const nx = (enemy.x - other.x) / d;
        const ny = (enemy.y - other.y) / d;
        const push = (minimumDistance - d) * BALANCE.navigation.zombieSeparationForce;
        enemy.x += nx * push;
        enemy.y += ny * push;
        other.x -= nx * push;
        other.y -= ny * push;
      }
    }
  }

  private enemyAttackRange(enemy: Enemy): number {
    return ENEMY_REGISTRY[enemy.kind].targeting.attackRange;
  }

  private statusMovementMultiplier(target: Player | Structure): number {
    return isSlowed(target) ? BALANCE.snowyEnemies.slow.movementMultiplier : 1;
  }

  private statusAttackSpeedMultiplier(target: Player | Structure): number {
    return isSlowed(target) ? BALANCE.snowyEnemies.slow.attackSpeedMultiplier : 1;
  }

  private applySlowStatus(
    target: Player | Structure,
    duration: number,
    popupTextColor: string = BALANCE.snowyEnemies.slow.popupTextColor,
  ): void {
    applySlow(target, duration);
    this.burst(
      target.x,
      target.y,
      BALANCE.snowyEnemies.slow.tint,
      8,
      "Slowed",
      popupTextColor,
    );
  }

  private applyEnemyStatusEffect(
    effect: EnemyStatusEffect | undefined,
    target: Player | Flag | Structure,
  ): void {
    if (!effect) return;
    if (target === this.player && effect.targets.includes("player")) {
      if (effect.kind === "slow") {
        this.applySlowStatus(this.player, effect.duration, effect.popupTextColor);
      }
      return;
    }
    if ("tier" in target && target.kind === "turret" && effect.targets.includes("turret")) {
      if (effect.kind === "slow") {
        this.applySlowStatus(target, effect.duration, effect.popupTextColor);
      }
    }
  }

  private enemyRangedAttack(
    enemy: Enemy,
    target: Player | Flag | Structure,
    dt: number,
    obstacleFallback = false,
  ): void {
    if (enemy.cooldown > 0) return;
    const definition = ENEMY_REGISTRY[enemy.kind];
    const projectile = definition.projectile;
    if (!projectile) return;
    enemy.chargeProgress = (enemy.chargeProgress ?? 0) + dt * (enemy.attackSpeedMultiplier ?? 1);
    enemy.attackWindup = Math.min(1, enemy.chargeProgress / definition.attack.chargeSeconds);
    enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    if (enemy.chargeProgress < definition.attack.chargeSeconds) return;
    const structureTarget = "kind" in target && "tier" in target ? target : null;
    const validTarget = target === this.player || target === this.flag
      || (structureTarget !== null && this.structures.some((structure) => structure.id === structureTarget.id && structure.health > 0));
    if (!validTarget) return;
    enemy.chargeProgress = 0;
    enemy.attackWindup = 0;
    enemy.cooldown = enemy.attackRate;
    const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.angle = angle;
    const targetId = target === this.player ? "player" : target === this.flag ? "flag" : structureTarget!.id;
    this.projectiles.push({
      id: this.nextId++, owner: projectile.owner, ownerPlayerId: null,
      damageSource: projectile.damageSource, intendedTargetId: targetId,
      x: enemy.x + Math.cos(angle) * (enemy.radius + 8),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 8),
      previousX: enemy.x, previousY: enemy.y,
      vx: Math.cos(angle) * projectile.speed, vy: Math.sin(angle) * projectile.speed,
      radius: projectile.radius,
      damage: obstacleFallback ? enemy.structureDamage : enemy.damage,
      rangeLeft: projectile.range, lifetime: projectile.lifetime,
      hitIds: new Set(), color: projectile.color,
      sourceEnemyKind: enemy.kind,
      appearance: projectile.appearance,
      statusEffect: projectile.statusEffect,
      impactBurst: projectile.impactBurst,
    });
    emitAudioCue({
      cue: (definition.audio.projectile ?? "zombie-attack") as import("./audio").SoundId,
      position: { x: enemy.x, y: enemy.y },
    });
  }

  private updateRammer(enemy: Enemy, dt: number): boolean {
    const definition = ENEMY_REGISTRY.rammer;
    const ram = definition.ram!;
    enemy.angle ??= 0;
    enemy.chargeProgress ??= 0;
    enemy.chargeDistanceLeft ??= 0;
    enemy.chargeDamageLeft ??= 0;
    enemy.chargeHitIds ??= new Set();
    const chargeHitIds = enemy.chargeHitIds;
    if (enemy.charging) {
      if (enemy.health <= 0) {
        enemy.charging = false;
        return true;
      }
      const travel = Math.min(enemy.chargeDistanceLeft, ram.speed * dt);
      if (enemy.cooldown <= 0) {
        enemy.cooldown = 0.28;
        emitAudioCue({
          cue: (definition.audio.move ?? "zombie-attack") as import("./audio").SoundId,
          position: { x: enemy.x, y: enemy.y },
        });
      }
      const start = { x: enemy.x, y: enemy.y };
      const end = { x: enemy.x + Math.cos(enemy.angle) * travel, y: enemy.y + Math.sin(enemy.angle) * travel };
      const resourceHit = this.world.resources
        .filter((node) => !node.destroyed && segmentCircle(start.x, start.y, end.x, end.y, { ...node, radius: node.radius + enemy.radius }))
        .sort((a, b) => distance(start, a) - distance(start, b) || a.id - b.id)[0];
      const structures = this.structures
        .filter((structure) => ram.targetKinds.includes(structure.kind)
          && !chargeHitIds.has(structure.id)
          && segmentCircle(start.x, start.y, end.x, end.y, { ...structure, radius: structure.radius + enemy.radius * 0.65 }))
        .sort((a, b) => distance(start, a) - distance(start, b) || a.id - b.id);
      for (const structure of structures) {
        if (resourceHit && distance(start, resourceHit) <= distance(start, structure)) break;
        enemy.chargeHitIds.add(structure.id);
        const remainingHealth = Math.max(0, structure.health);
        if (enemy.chargeDamageLeft >= remainingHealth) {
          this.applyIncomingDamage(structure, remainingHealth, "rammer", "rammer-charge");
          enemy.chargeDamageLeft -= remainingHealth;
          this.burst(structure.x, structure.y, "#ff9a51", 18, "BREACH");
        } else {
          this.applyIncomingDamage(structure, enemy.chargeDamageLeft, "rammer", "rammer-charge");
          enemy.chargeDamageLeft = 0;
        }
        structure.flash = 0.3;
        emitAudioCue({
          cue: (definition.audio.impact ?? "breaker-smash") as import("./audio").SoundId,
          position: { x: structure.x, y: structure.y },
        });
        if (enemy.chargeDamageLeft <= 0) break;
      }
      if (resourceHit || enemy.chargeDamageLeft <= 0) {
        enemy.charging = false;
        enemy.chargeTargetId = null;
        enemy.chargeDistanceLeft = 0;
        enemy.pathCooldown = 0;
        return true;
      }
      enemy.x = end.x;
      enemy.y = end.y;
      enemy.chargeDistanceLeft -= travel;
      if (enemy.chargeDistanceLeft <= 0) {
        enemy.charging = false;
        enemy.chargeTargetId = null;
      }
      return true;
    }
    if (enemy.chargeTargetId !== null && enemy.chargeTargetId !== undefined
      && enemy.chargeProgress > 0) {
      enemy.chargeProgress += dt * (enemy.attackSpeedMultiplier ?? 1);
      enemy.attackWindup = Math.min(1, enemy.chargeProgress / ram.loadSeconds);
      if (enemy.chargeProgress < ram.loadSeconds) return true;
      this.beginRammerCharge(enemy);
      return true;
    }
    const target = this.structures
      .filter((structure) => ram.targetKinds.includes(structure.kind) && distance(enemy, structure) <= ram.targetRadius)
      .filter((structure) => {
        const flagAngle = Math.atan2(this.flag.y - enemy.y, this.flag.x - enemy.x);
        const targetAngle = Math.atan2(structure.y - enemy.y, structure.x - enemy.x);
        return Math.abs(Math.atan2(Math.sin(targetAngle - flagAngle), Math.cos(targetAngle - flagAngle))) <= 0.85;
      })
      .sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id - b.id)[0];
    if (!target) {
      enemy.chargeTargetId = null;
      enemy.chargeProgress = Math.max(0, enemy.chargeProgress - dt);
      return false;
    }
    enemy.chargeTargetId = target.id;
    enemy.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    if (enemy.chargeProgress <= 0) {
      emitAudioCue({
        cue: (definition.audio.charge ?? "zombie-attack") as import("./audio").SoundId,
        position: { x: enemy.x, y: enemy.y },
      });
    }
    enemy.chargeProgress += dt * (enemy.attackSpeedMultiplier ?? 1);
    enemy.attackWindup = Math.min(1, enemy.chargeProgress / ram.loadSeconds);
    if (enemy.chargeProgress < ram.loadSeconds) return true;
    this.beginRammerCharge(enemy);
    return true;
  }

  private beginRammerCharge(enemy: Enemy): void {
    const definition = ENEMY_REGISTRY.rammer;
    const ram = definition.ram!;
    enemy.chargeProgress = 0;
    enemy.attackWindup = 0;
    enemy.charging = true;
    enemy.chargeDistanceLeft = ram.distance;
    enemy.chargeDamageLeft = ram.damage * (enemy.structureDamage / Math.max(1, definition.base.structureDamage));
    (enemy.chargeHitIds ??= new Set()).clear();
    emitAudioCue({
      cue: (definition.audio.move ?? "zombie-attack") as import("./audio").SoundId,
      position: { x: enemy.x, y: enemy.y },
    });
    this.burst(enemy.x, enemy.y, "#ffb35c", 14, "CHARGE");
  }

  private resolveEnemyDeath(enemy: Enemy): void {
    if (enemy.deathResolved) return;
    enemy.deathResolved = true;
    const definition = ENEMY_REGISTRY[enemy.kind];
    const reason = enemy.deathReason ?? (enemy.lastDamageSource === "sunlight" ? "sunlight" : "combat");
    if (definition.countsForKills && enemy.countsTowardWave !== false && !enemy.deathCounted) {
      enemy.deathCounted = true;
      this.stats.zombiesDefeated += 1;
      if (enemy.lastHitByPlayerId === this.player.id
        && (enemy.lastDamageSource === "player-melee" || enemy.lastDamageSource === "player-bow")) {
        this.directPlayerKills[enemy.kind] += 1;
      }
    }
    emitAudioCue({
      cue: (definition.audio.death ?? "zombie-death") as import("./audio").SoundId,
      position: { x: enemy.x, y: enemy.y },
    });
    if (definition.death.mode === "split" && reason === "combat") this.spawnSplitterChildren(enemy);
    if (definition.death.mode === "acid-burst"
      && (reason === "combat" || (reason === "sunlight" && definition.death.triggersFromSunlight))) {
      this.popperBurst(enemy);
    }
  }

  private spawnSplitterChildren(parent: Enemy): void {
    const death = ENEMY_REGISTRY.splitter.death;
    const count = death.splitCount ?? 2;
    const activeChildren = this.enemies.filter((enemy) => enemy.child && enemy.health > 0).length;
    const available = Math.max(0, Math.min(count,
      BALANCE.waveSafety.maximumActiveChildren - activeChildren,
      BALANCE.waveSafety.maximumActiveEnemies - this.enemies.filter((enemy) => enemy.health > 0).length));
    for (let index = 0; index < available; index += 1) {
      const angle = (Math.PI * 2 * index / count) + (parent.id % 11) * 0.17;
      const candidate = {
        x: parent.x + Math.cos(angle) * (parent.radius + 10),
        y: parent.y + Math.sin(angle) * (parent.radius + 10),
        radius: parent.radius * (death.childSize ?? 0.25),
      };
      const blocked = this.structures.some((item) => overlaps(candidate, item, 2))
        || this.world.resources.some((item) => !item.destroyed && overlaps(candidate, item, 2));
      if (blocked) continue;
      this.spawnEnemy(candidate, "splitter-child", parent.id, true);
      const child = this.enemies.at(-1);
      if (!child) continue;
      child.radius = candidate.radius;
      child.health = parent.maxHealth * (death.childHealth ?? 0.25);
      child.maxHealth = child.health;
      child.damage = parent.damage * (death.childDamage ?? 0.25);
      child.structureDamage = parent.structureDamage * (death.childDamage ?? 0.25);
      child.speed = parent.speed;
    }
    this.burst(parent.x, parent.y, "#b9e36f", 18, "SPLIT");
  }

  private popperBurst(enemy: Enemy): void {
    const death = ENEMY_REGISTRY.popper.death;
    const inner = death.burstInnerRadius ?? 52;
    const outer = death.burstOuterRadius ?? 145;
    const playerScale = enemy.damage / Math.max(1, ENEMY_REGISTRY.popper.base.damage);
    const structureScale = enemy.structureDamage / Math.max(1, ENEMY_REGISTRY.popper.base.structureDamage);
    const damageAt = (target: { x: number; y: number; radius: number }, maximum: number): number => {
      const edge = Math.max(0, distance(enemy, target) - target.radius);
      if (edge > outer) return 0;
      if (edge <= inner) return maximum;
      const t = 1 - (edge - inner) / Math.max(1, outer - inner);
      return maximum * Math.pow(t, death.burstFalloff ?? 1.7);
    };
    if (death.burstTargets?.includes("player")) {
      const damage = damageAt(this.player, (death.burstPlayerDamage ?? death.burstDamage ?? 30) * playerScale);
      if (damage > 0) {
        this.applyIncomingDamage(this.player, damage, "popper", "popper-burst");
        this.player.hurtFlash = 0.25;
      }
    }
    if (this.flagPresent && death.burstTargets?.includes("flag")) {
      const damage = damageAt(this.flag, (death.burstFlagDamage ?? death.burstDamage ?? 30) * playerScale);
      if (damage > 0) {
        this.applyIncomingDamage(this.flag, damage, "popper", "popper-burst");
        this.flag.hurtFlash = 0.25;
        emitAudioCue({ cue: "flag-damaged" });
      }
    }
    for (const structure of this.structures) {
      if (!this.isOwnedByPlayer(structure, this.player.id)) continue;
      if (!death.burstTargets?.includes(structure.kind)) continue;
      const damage = damageAt(structure, (death.burstStructureDamage ?? death.burstDamage ?? 30) * structureScale);
      if (damage <= 0) continue;
      this.applyIncomingDamage(structure, damage, "popper", "popper-burst");
      structure.flash = 0.25;
    }
    const duration = death.burstWaveDuration ?? 0.38;
    this.areaEffects.push({ kind: "popper-acid", x: enemy.x, y: enemy.y, radius: outer, remaining: duration, duration });
    this.burst(enemy.x, enemy.y, "#67d73e", 34, "ACID BURST");
    this.shake = Math.max(this.shake, 7);
  }

  private updateSummoner(enemy: Enemy, dt: number): void {
    if (enemy.countsTowardWave === false) return;
    enemy.summonCooldown -= dt * (enemy.attackSpeedMultiplier ?? 1);
    if (enemy.summonCooldown > 0) return;
    const living = this.enemies.filter((item) => item.summonedBy === enemy.id && item.health > 0).length;
    if (living >= 5) {
      enemy.summonCooldown = 2;
      return;
    }
    enemy.summonCooldown = 4;
    const kind = this.rollEnemyKind(this.summonRng);
    this.spawnEnemy(enemy, kind, enemy.id, false, false);
    emitAudioCue({ cue: "summoner-cast", position: { x: enemy.x, y: enemy.y } });
    this.burst(enemy.x, enemy.y, "#9d6bff", 14, "SUMMON");
  }

  private updateBoss(enemy: Enemy, dt: number): void {
    if (enemy.kind === "frost-warden") {
      this.updateFrostWarden(enemy, dt);
      return;
    }
    if (!this.flagPresent) return;
    enemy.targetId = "flag";
    const attackSpeed = enemy.attackSpeedMultiplier ?? 1;
    enemy.acidCooldown = Math.max(0, enemy.acidCooldown - dt * attackSpeed);
    const playerDistance = distance(enemy, this.player);
    if (enemy.acidWindup > 0) {
      enemy.acidWindup += dt * attackSpeed;
      enemy.acidAimAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      if (enemy.acidWindup >= BALANCE.boss.acidTelegraph) {
        enemy.acidWindup = 0;
        enemy.acidCooldown = BALANCE.boss.acidAttackInterval;
        this.fireBossAcid(enemy);
      }
    } else if (enemy.acidCooldown <= 0 && playerDistance <= BALANCE.boss.acidMaximumRange) {
      enemy.acidWindup = dt * attackSpeed;
      enemy.acidAimAngle = Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x);
      this.burst(enemy.x, enemy.y, "#b8ff3d", 6, "ACID");
    }
    if (!enemy.bossHalfSummoned && enemy.health <= enemy.maxHealth * 0.5) {
      enemy.bossHalfSummoned = true;
      enemy.bossSmashWindup = Number.EPSILON;
    }
    if (enemy.bossSmashWindup > 0) {
      enemy.bossSmashWindup += dt * attackSpeed;
    }
    if (enemy.bossSmashWindup >= BALANCE.boss.slam.chargeDuration) {
      enemy.bossSmashWindup = 0;
      for (let index = 0; index < BALANCE.boss.slam.reinforcementCount; index += 1) {
        this.spawnEnemy(enemy, "basic", enemy.id);
      }
      enemy.bossSlamWave = BALANCE.boss.slam.waveDuration;
      const playerEdgeDistance = Math.max(0, distance(enemy, this.player) - this.player.radius);
      if (playerEdgeDistance <= BALANCE.boss.slam.radius) {
        const damage = this.applyIncomingDamage(
          this.player,
          BALANCE.boss.slam.playerDamage
            * (enemy.damage / Math.max(1, ENEMY_REGISTRY[enemy.kind].base.damage)),
          "boss",
          "enemy",
        );
        this.player.hurtFlash = 0.3;
        this.burst(this.player.x, this.player.y, "#ff6b55", 10, `-${Math.round(damage)}`);
      }
      if (this.flagPresent) {
        const flagEdgeDistance = Math.max(0, distance(enemy, this.flag) - this.flag.radius);
        if (flagEdgeDistance <= BALANCE.boss.slam.radius) {
          this.applyIncomingDamage(
            this.flag,
            BALANCE.boss.slam.flagDamage
              * (enemy.damage / Math.max(1, ENEMY_REGISTRY[enemy.kind].base.damage)),
            "boss",
            "enemy",
          );
          this.flag.hurtFlash = 0.3;
          emitAudioCue({ cue: "flag-damaged" });
        }
      }
      for (const structure of this.structures) {
        if (!this.isOwnedByPlayer(structure, this.player.id)) continue;
        const edgeDistance = Math.max(0, distance(enemy, structure) - structure.radius);
        if (edgeDistance <= BALANCE.boss.slam.radius) {
          this.applyIncomingDamage(
            structure,
            BALANCE.boss.slam.structureDamage
              * (enemy.structureDamage / Math.max(1, ENEMY_REGISTRY[enemy.kind].base.structureDamage)),
            "boss",
            "enemy",
          );
          structure.flash = 0.3;
          emitAudioCue({ cue: "structure-damaged", position: { x: structure.x, y: structure.y } });
        }
      }
      this.areaEffects.push({
        kind: "boss-slam",
        x: enemy.x,
        y: enemy.y,
        radius: BALANCE.boss.slam.radius,
        remaining: BALANCE.boss.slam.waveDuration,
        duration: BALANCE.boss.slam.waveDuration,
      });
      this.burst(enemy.x, enemy.y, "#ff6b55", 28, "GROUND SLAM");
      this.shake = 14;
      emitAudioCue({ cue: "breaker-smash", position: { x: enemy.x, y: enemy.y } });
    }
  }

  private updateFrostWarden(enemy: Enemy, dt: number): void {
    if (!this.flagPresent) return;
    enemy.targetId = "flag";
    if (distance(enemy, this.player) > BALANCE.snowyEnemies.frostWarden.icicle.activationRadius) return;
    enemy.icicleCooldown = Math.max(
      0,
      (enemy.icicleCooldown ?? 0) - dt * (enemy.attackSpeedMultiplier ?? 1),
    );
    if (enemy.icicleCooldown > 0) return;
    enemy.icicleCooldown = BALANCE.snowyEnemies.frostWarden.icicle.cooldown;
    this.createIcicleAttack(enemy);
  }

  private createIcicleAttack(enemy: Enemy): void {
    const config = BALANCE.snowyEnemies.frostWarden.icicle;
    const serial = enemy.icicleAttackSerial ?? 0;
    enemy.icicleAttackSerial = serial + 1;
    const rng = new SeededRng(`${this.seed}:frost-warden:icicles:${enemy.id}:${serial}`);
    const baseAngle = rng.range(0, Math.PI * 2);
    for (let index = 0; index < config.count; index += 1) {
      const placementAngle = baseAngle + index / config.count * Math.PI * 2 + rng.range(-0.38, 0.38);
      const placementRadius = rng.range(config.placementMinimumRadius, config.placementSpread);
      this.icicleStrikes.push({
        id: this.nextId++,
        x: Math.max(config.radius, Math.min(BALANCE.mapSize - config.radius,
          this.player.x + Math.cos(placementAngle) * placementRadius)),
        y: Math.max(config.radius, Math.min(BALANCE.mapSize - config.radius,
          this.player.y + Math.sin(placementAngle) * placementRadius)),
        radius: config.radius,
        angle: rng.range(-0.22, 0.22),
        warningRemaining: config.warningDuration,
        warningDuration: config.warningDuration,
        eruptionRemaining: config.eruptionDuration,
        eruptionDuration: config.eruptionDuration,
      });
    }
    this.icicleStrikes.push({
      id: this.nextId++,
      x: this.player.x,
      y: this.player.y,
      radius: config.radius,
      angle: rng.range(-0.22, 0.22),
      warningRemaining: config.warningDuration,
      warningDuration: config.warningDuration,
      eruptionRemaining: config.eruptionDuration,
      eruptionDuration: config.eruptionDuration,
    });
  }

  private updateIcicleStrikes(dt: number): void {
    const survivors: IcicleStrike[] = [];
    for (const strike of this.icicleStrikes) {
      if (strike.warningRemaining > 0) {
        strike.warningRemaining = Math.max(0, strike.warningRemaining - dt);
        if (strike.warningRemaining === 0) this.resolveIcicleStrike(strike);
        survivors.push(strike);
        continue;
      }
      strike.eruptionRemaining = Math.max(0, strike.eruptionRemaining - dt);
      if (strike.eruptionRemaining > 0) survivors.push(strike);
    }
    this.icicleStrikes = survivors;
  }

  private resolveIcicleStrike(strike: IcicleStrike): void {
    const config = BALANCE.snowyEnemies.frostWarden.icicle;
    if (distance(strike, this.player) <= strike.radius + this.player.radius) {
      const damage = this.applyIncomingDamage(
        this.player,
        config.damage * this.getChallengeModifiers().enemyDamageMultiplier,
        "frost-warden",
        "frost-warden",
      );
      this.player.hurtFlash = 0.3;
      this.applySlowStatus(this.player, config.slowDuration);
      emitAudioCue({ cue: "player-hurt", position: { x: this.player.x, y: this.player.y } });
      this.burst(
        this.player.x,
        this.player.y,
        BALANCE.snowyEnemies.frostWarden.breakColor,
        8,
        `-${Math.round(damage)}`,
        BALANCE.snowyEnemies.slow.popupTextColor,
      );
    }
    for (const structure of this.structures) {
      if (distance(strike, structure) > strike.radius + structure.radius) continue;
      this.applyIncomingDamage(
        structure,
        config.structureDamage * this.getChallengeModifiers().enemyDamageMultiplier,
        "frost-warden",
        "frost-warden",
      );
      structure.flash = 0.28;
      if (structure.kind === "turret") this.applySlowStatus(structure, config.slowDuration);
      emitAudioCue({ cue: "structure-damaged", position: { x: structure.x, y: structure.y } });
    }
    this.iceShardBurst(strike.x, strike.y, 22);
    this.shake = Math.max(this.shake, 9);
    emitAudioCue({ cue: "ice-shatter", position: { x: strike.x, y: strike.y } });
  }

  private fireBossAcid(enemy: Enemy): void {
    let moveX = 0;
    let moveY = 0;
    if (this.input.keys.has("KeyA")) moveX -= 1;
    if (this.input.keys.has("KeyD")) moveX += 1;
    if (this.input.keys.has("KeyW")) moveY -= 1;
    if (this.input.keys.has("KeyS")) moveY += 1;
    const movementLength = Math.hypot(moveX, moveY) || 1;
    const predictionDistance = BALANCE.player.speed * BALANCE.boss.acidPrediction;
    const predicted = {
      x: this.player.x + moveX / movementLength * predictionDistance,
      y: this.player.y + moveY / movementLength * predictionDistance,
    };
    const angle = Math.atan2(predicted.y - enemy.y, predicted.x - enemy.x);
    enemy.acidAimAngle = angle;
    this.projectiles.push({
      id: this.nextId++,
      owner: "boss-acid",
      ownerPlayerId: null,
      damageSource: "boss-acid",
      x: enemy.x + Math.cos(angle) * (enemy.radius + 10),
      y: enemy.y + Math.sin(angle) * (enemy.radius + 10),
      previousX: enemy.x,
      previousY: enemy.y,
      vx: Math.cos(angle) * BALANCE.boss.acidSpeed,
      vy: Math.sin(angle) * BALANCE.boss.acidSpeed,
      radius: BALANCE.boss.acidRadius,
      damage: BALANCE.boss.acidDamage
        * (enemy.damage / Math.max(1, ENEMY_REGISTRY.boss.base.damage)),
      rangeLeft: BALANCE.boss.acidRange,
      lifetime: BALANCE.boss.acidLifetime,
      hitIds: new Set(),
      color: "#b8ff3d",
    });
    this.burst(enemy.x + Math.cos(angle) * enemy.radius, enemy.y + Math.sin(angle) * enemy.radius, "#d9ff64", 10);
    emitAudioCue({ cue: "boss-acid-spit", position: { x: enemy.x, y: enemy.y } });
  }

  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];
    for (const projectile of this.projectiles) {
      projectile.previousX = projectile.x;
      projectile.previousY = projectile.y;
      const dx = projectile.vx * dt;
      const dy = projectile.vy * dt;
      projectile.x += dx;
      projectile.y += dy;
      projectile.rangeLeft -= Math.hypot(dx, dy);
      projectile.lifetime -= dt;
      if (!this.isInsideTutorialArena(projectile.x, projectile.y, projectile.radius)) continue;
      if (projectile.owner === "enemy-arrow" || projectile.owner === "enemy-acid") {
        const piercing = projectile.owner === "enemy-acid";
        const projectileEnemyKind: EnemyKind = projectile.sourceEnemyKind
          ?? (projectile.owner === "enemy-arrow" ? "archer" : "acidslinger");
        const projectileDamageSource: DamageSource = projectile.damageSource
          ?? (projectile.owner === "enemy-arrow" ? "enemy-arrow" : "enemy-acid");
        let impacted = false;
        const accepts = (id: number | "player" | "flag"): boolean =>
          piercing || projectile.intendedTargetId === id;
        if (accepts("player") && !projectile.hitIds.has("player")
          && segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, this.player)) {
          projectile.hitIds.add("player");
          const damage = this.applyIncomingDamage(
            this.player,
            projectile.damage,
            projectileEnemyKind,
            projectileDamageSource,
          );
          this.player.hurtFlash = 0.25;
          impacted = true;
          const playerStatusEffect = projectile.statusEffect?.targets.includes("player")
            ? projectile.statusEffect
            : undefined;
          if (playerStatusEffect?.kind === "slow") {
            this.applySlowStatus(
              this.player,
              playerStatusEffect.duration,
              playerStatusEffect.popupTextColor,
            );
          }
          emitAudioCue({ cue: "player-hurt", position: { x: this.player.x, y: this.player.y } });
          this.burst(
            this.player.x,
            this.player.y,
            projectile.color,
            10,
            `-${Math.round(damage)}`,
            playerStatusEffect?.popupTextColor ?? projectile.color,
          );
        }
        if (this.flagPresent && accepts("flag") && !projectile.hitIds.has("flag")
          && segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, this.flag)) {
          projectile.hitIds.add("flag");
          this.applyIncomingDamage(
            this.flag,
            projectile.damage,
            projectileEnemyKind,
            projectileDamageSource,
          );
          this.flag.hurtFlash = 0.25;
          impacted = true;
          emitAudioCue({ cue: "flag-damaged" });
        }
        for (const structure of this.structures) {
          if (!accepts(structure.id) || projectile.hitIds.has(structure.id)) continue;
          if (!segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, structure)) continue;
          projectile.hitIds.add(structure.id);
          this.applyIncomingDamage(
            structure,
            projectile.damage,
            projectileEnemyKind,
            projectileDamageSource,
          );
          structure.flash = 0.22;
          impacted = true;
          if (projectile.statusEffect?.kind === "slow"
            && structure.kind === "turret"
            && projectile.statusEffect.targets.includes("turret")) {
            this.applySlowStatus(
              structure,
              projectile.statusEffect.duration,
              projectile.statusEffect.popupTextColor,
            );
          }
          this.burst(structure.x, structure.y, projectile.color, 8);
        }
        if (impacted) {
          const projectileDefinition = ENEMY_REGISTRY[projectileEnemyKind];
          emitAudioCue({
            cue: (projectileDefinition.audio.impact ?? "structure-damaged") as import("./audio").SoundId,
            position: { x: projectile.x, y: projectile.y },
          });
        }
        if (projectile.owner === "enemy-acid"
          && Math.floor(projectile.lifetime * 16) !== Math.floor((projectile.lifetime + dt) * 16)) {
          this.particles.push({ x: projectile.x, y: projectile.y, vx: this.rng.range(-8, 8), vy: this.rng.range(-8, 8), life: 0.28, maxLife: 0.28, radius: this.rng.range(2, 5), color: projectile.color });
        }
        const inWorld = projectile.x >= -projectile.radius && projectile.y >= -projectile.radius
          && projectile.x <= BALANCE.mapSize + projectile.radius && projectile.y <= BALANCE.mapSize + projectile.radius;
        if (impacted && projectile.impactBurst) {
          this.burst(
            projectile.x,
            projectile.y,
            projectile.impactBurst.color,
            projectile.impactBurst.count,
          );
        }
        if ((!impacted || piercing) && projectile.rangeLeft > 0 && projectile.lifetime > 0 && inWorld) survivors.push(projectile);
        else if (projectile.owner === "enemy-acid") this.burst(projectile.x, projectile.y, projectile.color, 12, "SPLASH");
        continue;
      }
      if (projectile.owner === "boss-acid") {
        if (Math.floor(projectile.lifetime * 18) !== Math.floor((projectile.lifetime + dt) * 18)) {
          this.particles.push({
            x: projectile.x - dx * 0.35,
            y: projectile.y - dy * 0.35,
            vx: this.rng.range(-16, 16),
            vy: this.rng.range(-16, 16),
            life: 0.32,
            maxLife: 0.32,
            radius: this.rng.range(3, 6),
            color: this.rng.next() > 0.5 ? "#b8ff3d" : "#65d82d",
          });
        }
        if (!projectile.hitIds.has("player")
          && segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, this.player)) {
          const wasFull = this.player.health >= this.player.maxHealth;
          projectile.hitIds.add("player");
          const damage = this.applyIncomingDamage(this.player, projectile.damage, "boss", "boss-acid");
          this.player.hurtFlash = 0.25;
          emitAudioCue({ cue: "player-hurt", position: { x: this.player.x, y: this.player.y } });
          this.burst(this.player.x, this.player.y, "#b8ff3d", 12, `-${Math.round(damage)}`);
          if (wasFull && !this.playerDamageWarned) {
            this.playerDamageWarned = true;
            const disabled = this.getChallengeModifiers().disablesPlayerHealing;
            this.notify(disabled ? "You are damaged! Healing is disabled." : "You are damaged! Your flag heals you.", true);
          }
        }
        for (const structure of this.structures) {
          if (projectile.hitIds.has(structure.id)) continue;
          if (!segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, structure)) continue;
          projectile.hitIds.add(structure.id);
          this.applyIncomingDamage(structure, projectile.damage, "boss", "boss-acid");
          structure.flash = 0.22;
          emitAudioCue({ cue: "structure-damaged", position: { x: structure.x, y: structure.y } });
          this.burst(structure.x, structure.y, "#9be739", 8);
        }
        const inWorld = projectile.x >= -projectile.radius && projectile.y >= -projectile.radius
          && projectile.x <= BALANCE.mapSize + projectile.radius
          && projectile.y <= BALANCE.mapSize + projectile.radius;
        if (projectile.rangeLeft > 0 && projectile.lifetime > 0 && inWorld) survivors.push(projectile);
        else this.burst(projectile.x, projectile.y, "#b8ff3d", 14, "SPLASH");
        continue;
      }
      let hit = false;
      for (const enemy of this.enemyHash.query(projectile.x, projectile.y, Math.hypot(dx, dy) + 60)) {
        if (!segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, enemy)) continue;
        this.damageEnemy(
          enemy,
          projectile.damage,
          projectile.color,
          projectile.damageSource ?? (projectile.owner === "player" ? "player-bow" : "turret"),
          projectile.ownerPlayerId ?? (projectile.owner === "player" ? this.player.id : null),
        );
        this.emitArrowImpact(projectile);
        hit = true;
        break;
      }
      if (!hit) {
        for (const item of this.obstacleHash.query(projectile.x, projectile.y, Math.hypot(dx, dy) + 70)) {
          if ("tier" in item) continue;
          const node = item;
          if (segmentCircle(projectile.previousX, projectile.previousY, projectile.x, projectile.y, node)) {
            this.burst(projectile.x, projectile.y, "#c7c1aa", 3);
            this.emitArrowImpact(projectile);
            hit = true;
            break;
          }
        }
      }
      if (!hit && projectile.rangeLeft > 0 && projectile.lifetime > 0) survivors.push(projectile);
    }
    this.projectiles = survivors;
  }

  private emitArrowImpact(projectile: Projectile): void {
    if (projectile.owner === "boss-acid") return;
    emitAudioCue({
      cue: "arrow-impact",
      position: { x: projectile.x, y: projectile.y },
    });
  }

  private damageEnemy(
    enemy: Enemy,
    amount: number,
    color: string,
    source: import("./types").DamageSource,
    ownerPlayerId: PlayerId | null,
  ): void {
    enemy.lastDamageSource = source;
    enemy.lastHitByPlayerId = ownerPlayerId;
    const healthBefore = Math.max(0, enemy.health);
    const appliedDamage = this.routeEnemyDamage(enemy, amount, source);
    if (enemy.kind === "boss"
      && !enemy.bossHalfSummoned
      && healthBefore > enemy.maxHealth * 0.5
      && enemy.health <= enemy.maxHealth * 0.5) {
      enemy.bossHalfSummoned = true;
      enemy.bossSmashWindup = Number.EPSILON;
    }
    this.recordOutgoingDamage(source, appliedDamage);
    enemy.flash = 0.18;
    // No hurt sound, too distracting, not necessary
    //emitAudioCue({ cue: "zombie-hurt", position: { x: enemy.x, y: enemy.y } });
    const displayedDamage = ENEMY_REGISTRY[enemy.kind].armor
      ? appliedDamage
      : amount;
    this.burst(enemy.x, enemy.y, color, 6, `-${Math.round(displayedDamage)}`);
    if (enemy.health <= 0) {
      if (healthBefore > 0) this.recordEnemyKill(enemy, source);
      enemy.deathReason = source === "sunlight" ? "sunlight" : "combat";
      const definition = ENEMY_REGISTRY[enemy.kind];
      if (!enemy.deathCounted && definition.countsForKills && enemy.countsTowardWave !== false) {
        enemy.deathCounted = true;
        this.stats.zombiesDefeated += 1;
        if (ownerPlayerId === this.player.id && (source === "player-melee" || source === "player-bow")) {
          this.directPlayerKills[enemy.kind] += 1;
          if (this.nightPerformance?.waveEnemyIds.has(enemy.id)) {
            this.nightPerformance.personalWaveZombieKills += 1;
          }
        }
      }
      this.burst(enemy.x, enemy.y, "#8fc75d", this.isBossEnemyKind(enemy.kind) ? 40 : 14, this.isBossEnemyKind(enemy.kind) ? "BOSS DOWN" : undefined);
    }
  }

  private routeEnemyDamage(enemy: Enemy, requestedAmount: number, source: DamageSource): number {
    let remaining = Math.max(0, requestedAmount);
    let applied = 0;
    const armorConfig = ENEMY_REGISTRY[enemy.kind].armor;
    if (armorConfig && (enemy.armor ?? 0) > 0) {
      if (source === "player-bow" || source === "turret") {
        remaining *= 1 - armorConfig.projectileResistance;
      }
      const armorDamage = Math.min(enemy.armor ?? 0, remaining);
      enemy.armor = Math.max(0, (enemy.armor ?? 0) - armorDamage);
      remaining -= armorDamage;
      applied += armorDamage;
      if (enemy.armor <= 0) {
        this.shatterIceArmor(enemy);
      }
    }
    if (remaining > 0) {
      const healthBefore = Math.max(0, enemy.health);
      enemy.health -= remaining;
      applied += Math.min(healthBefore, remaining);
    }
    return applied;
  }

  private shatterIceArmor(enemy: Enemy): void {
    const armorConfig = ENEMY_REGISTRY[enemy.kind].armor;
    if (!armorConfig) return;
    this.iceShardBurst(
      enemy.x,
      enemy.y,
      armorConfig.breakShardCount,
      armorConfig.breakText,
    );
    emitAudioCue({ cue: "ice-shatter", position: { x: enemy.x, y: enemy.y } });
    this.shake = Math.max(this.shake, armorConfig.breakShake);
    if (enemy.kind === "frost-warden") {
      this.triggerFrostSlam(enemy);
    }
  }

  private triggerFrostSlam(enemy: Enemy): void {
    const config = BALANCE.snowyEnemies.frostWarden.slam;
    if (distance(enemy, this.player) <= config.radius + this.player.radius) {
      this.applySlowStatus(this.player, config.slowDuration);
    }
    for (const structure of this.structures) {
      if (structure.kind !== "turret") continue;
      if (distance(enemy, structure) > config.radius + structure.radius) continue;
      this.applySlowStatus(structure, config.slowDuration);
    }
    this.areaEffects.push({
      kind: "frost-slam",
      x: enemy.x,
      y: enemy.y,
      radius: config.radius,
      remaining: config.waveDuration,
      duration: config.waveDuration,
    });
    this.burst(
      enemy.x,
      enemy.y,
      BALANCE.snowyEnemies.frostWarden.breakColor,
      30,
      "FROST SLAM",
      BALANCE.snowyEnemies.slow.popupTextColor,
      -enemy.radius - 58,
    );
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.96;
      particle.vy *= 0.96;
      particle.life -= dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const effect of this.areaEffects) effect.remaining -= dt;
    this.areaEffects = this.areaEffects.filter((effect) => effect.remaining > 0);
    for (const node of this.world.resources) node.hitFlash = Math.max(0, node.hitFlash - dt);
  }

  private updateHealing(dt: number): void {
    const disabled = this.getChallengeModifiers().disablesPlayerHealing;
    const canHeal = this.flagPresent
      && !disabled
      && this.player.health > 0
      && distance(this.player, this.flag) <= BALANCE.flagProtectedRadius
      && this.player.health < this.player.maxHealth;
    if (!canHeal) {
      this.healingActive = false;
      return;
    }
    const before = this.player.health;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + BALANCE.player.healRate * dt);
    if (!this.healingActive && this.player.health > before) {
      this.healingActive = true;
      emitAudioCue({ cue: "player-heal", position: { x: this.player.x, y: this.player.y } });
    }
    if (this.tutorialMode && this.player.health > before) this.recordTutorialEvent("healing-started");
    if (Math.floor(this.phaseElapsed * 2) !== Math.floor((this.phaseElapsed - dt) * 2)) {
      this.burst(this.player.x, this.player.y, "#74f3a5", 2, "+");
    }
  }

  private syncSpatialAudio(active: boolean): void {
    emitAudioSpatialState({
      listener: { x: this.player.x, y: this.player.y },
      portals: this.portals.map((portal) => ({ id: portal.id, x: portal.x, y: portal.y })),
      active: active && (this.phase === "day" || this.phase === "night"),
    });
  }

  private beginNight(): void {
    this.phase = "night";
    this.combatMode = true;
    this.phaseElapsed = 0;
    this.timer = BALANCE.nightDuration;
    this.phaseTransitionImpact = 0.55;
    this.selectedSlot = 2;
    this.nightWaveScheduled = true;
    this.bossSpawnedThisNight = false;
    this.nightPerformance = {
      night: this.night,
      totalIncomingDamage: 0,
      flagDamage: 0,
      zombiesEnteringFlagRadius: 0,
      playerDamageTaken: 0,
      totalZombiesSpawned: 0,
      waveEnemyIds: new Set(),
      personalWaveZombieKills: 0,
      damagedStructureIds: new Set(),
      destroyedStructureIds: new Set(),
      structureValues: new Map(this.structures.map((structure) => [
        structure.id,
        structurePointValue(structure.kind, structure.tier),
      ])),
      flagRadiusEnemyIds: new Set(),
      populationCategoryByEnemyId: new Map(),
      population: {
        spawned: { scheduled: {}, boss: {}, summons: {}, children: {} },
        killed: { scheduled: {}, boss: {}, summons: {}, children: {} },
      },
      bossKillTimeSeconds: null,
    };
    for (const enemy of this.enemies) enemy.burning = false;
    const difficulty = BALANCE.difficulty[this.difficulty];
    const challengeModifiers = this.getChallengeModifiers();
    this.recalculateStructureScore();
    this.adaptiveState = adaptiveDifficulty(
      this.structureScore,
      this.night,
      this.profileManager?.profile.playerLevel ?? 1,
      this.night > 1 ? [this.autoCorrectiveDelta] : [],
      this.getAdaptivePowerInput(),
    );
    const baseBudget = this.runMode === "endless"
      ? endlessWaveThreatBudget(this.night)
      : baseWaveThreatBudget(this.night);
    const total = Math.round(
      (baseBudget + this.mutations.waveSize)
        * difficulty.spawnCount
        * this.adaptiveState.multiplier
        * challengeModifiers.ordinaryZombieCountMultiplier,
    );
    this.waveSchedule = this.buildWaveSchedule(total);
    this.waveScheduleCursor = 0;
    const scheduledTotal = this.waveSchedule.length;
    const roster = this.waveSchedule.reduce<Partial<Record<EnemyKind, number>>>((counts, kind) => {
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {});
    const nightLog: NightDifficultyLog = {
      night: this.night,
      status: "partial",
      executiveSummary: "",
      adaptive: { ...this.adaptiveState },
      correctiveInput: {
        sourceNight: this.lastNightPerformance?.night ?? null,
        result: { ...this.performanceDifficulty },
      },
      wave: {
        baseBudget,
        mutationBonus: this.mutations.waveSize,
        selectedDifficultyMultiplier: difficulty.spawnCount,
        adaptiveMultiplier: this.adaptiveState.multiplier,
        challengeMultiplier: challengeModifiers.ordinaryZombieCountMultiplier,
        requestedThreatBudget: total,
        scheduledEnemyCount: scheduledTotal,
        scheduledThreat: this.waveSchedule.reduce(
          (sum, kind) => sum + ENEMY_REGISTRY[kind].threat,
          0,
        ),
        roster,
      },
      analysis: {
        structureInventory: { start: this.structureInventory() },
        activity: this.cyclePlaytestActivity,
        population: this.nightPerformance.population,
        bossKillTimeSeconds: null,
      },
    };
    nightLog.executiveSummary = summarizeNight(nightLog);
    this.devDifficultyLogs.push(nightLog);
    const perPortal = Math.floor(scheduledTotal / this.portals.length);
    let remainder = scheduledTotal % this.portals.length;
    for (const portal of this.portals) {
      portal.assignedSpawns = perPortal + (remainder-- > 0 ? 1 : 0);
      portal.spawned = 0;
      portal.spawnCooldown = 0.2 + this.rng.range(0, 0.6);
    }
    this.notify(this.isBossNight()
      ? `Night ${this.night}: boss arrives in ${BALANCE.endless.bossSpawnDelay} seconds`
      : `Night ${this.night} has begun`);
    emitAudioCue({ cue: "night-start" });
    this.syncSpatialAudio(true);
    this.markUi(true);
  }

  canUseFortPulse(): boolean {
    return this.runMode === "endless"
      && this.phase === "night"
      && this.fortPulseUsedNight !== this.night
      && canAfford(this.resources, BALANCE.endless.fortPulse.cost);
  }

  useFortPulse(): void {
    if (!this.canUseFortPulse()) {
      this.notify(this.fortPulseUsedNight === this.night
        ? "Fort Pulse already used this night"
        : "Fort Pulse requires 24 gold and 8 diamond");
      return;
    }
    spend(this.resources, BALANCE.endless.fortPulse.cost);
    this.fortPulseUsedNight = this.night;
    let hitCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || enemy.kind === "basic" || this.isBossEnemyKind(enemy.kind)
        || distance(enemy, this.player) > BALANCE.endless.fortPulse.radius) continue;
      const damage = BALANCE.endless.fortPulse.baseDamage
        + enemy.maxHealth * BALANCE.endless.fortPulse.maximumHealthDamage;
      this.damageEnemy(enemy, damage, "#57e5ef", "player-melee", this.player.id);
      hitCount += 1;
    }
    this.burst(this.player.x, this.player.y, "#57e5ef", 34, "FORT PULSE");
    this.notify(hitCount > 0 ? `Fort Pulse hit ${hitCount} special enemies` : "Fort Pulse discharged");
    this.shake = Math.max(this.shake, 8);
    this.markUi(true);
  }

  private beginDawn(): void {
    this.finalizeNightPerformance();
    this.phase = "dawn";
    this.syncSpatialAudio(false);
    this.nightWaveScheduled = false;
    this.phaseElapsed = 0;
    this.phaseTransitionImpact = 0.55;
    this.stats.nightsSurvived = Math.max(0, this.night - this.runStartNight + 1);
    this.platform?.reportProgress(Math.min(90, this.night * 10));
    if (
      !this.hasChallenge("permanent-player-damage")
      && !this.getChallengeModifiers().disablesDawnPlayerHealing
    ) {
      this.player.health = this.player.maxHealth;
    }
    for (const node of this.world.resources) if (!node.destroyed) node.health = node.maxHealth;
    this.dawnScreen = availableUnlocks(this.unlocks).length > 0 ? 0 : 1;
    this.dawnPicked = new Set();
    this.choices = generateChoiceOfferings(
      this.seed,
      this.night,
      this.dawnScreen,
      this.unlocks,
      this.upgrades,
      this.mutations,
      this.dawnPicked,
      0,
      this.disabledDawnBenefits(),
      this.enemyRoster,
      this.runMode === "endless"
        ? endlessRosterAdditions(
          this.seed,
          this.enemyRoster,
          this.night,
          BALANCE.endless.rosterAdditionInterval,
        )
        : [],
    );
    this.notify("Dawn restored every resource node");
    emitAudioCue({ cue: "dawn-start" });
    this.markUi(true);
  }

  private beginNextDay(): void {
    this.night += 1;
    this.phase = "day";
    this.phaseElapsed = 0;
    this.phaseTransitionImpact = 0.55;
    for (const structure of this.structures) structure.harvesterHitResourceIds.clear();
    this.timer = this.getDayDuration();
    this.combatMode = this.enemies.some((enemy) => enemy.health > 0);
    if (!this.combatMode) this.selectedSlot = 1;
    else if (this.selectedSlot > 2) this.selectedSlot = 1;
    this.spawnPortals();
    this.igniteOrdinaryZombies();
    this.notify(`Day ${this.night}: build before the count reaches zero`);
    this.syncSpatialAudio(true);
    this.markUi(true);
  }

  private beginNextDayWithWarning(): void {
    const nextNight = this.night + 1;
    const introduced = this.getRosterMilestones()
      .find((milestone) => milestone.night === nextNight && !this.isBossEnemyKind(milestone.enemy))?.enemy;
    if (introduced) {
      this.enemyWarning = introduced;
      this.choices = [];
      this.markUi(true);
      return;
    }
    this.beginNextDay();
  }

  private igniteOrdinaryZombies(): void {
    for (const enemy of this.enemies) {
      if (this.isBossEnemyKind(enemy.kind) || enemy.burning) continue;
      enemy.burning = true;
      enemy.sunlightExposure = 0;
      enemy.sunlightEffectCooldown = 0;
      enemy.pathCooldown = 0;
      this.burst(enemy.x, enemy.y, "#ffad3d", 8, "SUNLIGHT");
    }
  }

  private spawnPortals(playSpawnSound = true): void {
    const baseCount = this.night >= 7 ? 4 : this.night >= 4 ? 3 : 2;
    const count = Math.max(
      1,
      Math.round(baseCount * this.getChallengeModifiers().portalCountMultiplier),
    );
    this.portals = [];
    for (let i = 0; i < count; i += 1) {
      const position = this.findPortalPosition(i);
      this.portals.push({
        id: this.nextId++,
        ...position,
        radius: BALANCE.portal.radius,
        health: BALANCE.portal.health,
        maxHealth: BALANCE.portal.health,
        assignedSpawns: 0,
        spawned: 0,
        spawnCooldown: 0,
        flash: 0,
      });
    }
    const first = this.portals[0];
    if (playSpawnSound && first) {
      emitAudioCue({ cue: "portal-spawn", position: { x: first.x, y: first.y } });
    }
  }

  private findPortalPosition(index: number, ignore?: Portal): Vec2 {
    const portalRng = new SeededRng(`${this.seed}:portals:${this.night}:${index}:${ignore ? this.nextId : 0}`);
    const isValid = (candidate: Vec2): boolean => {
      const circle = { ...candidate, radius: BALANCE.portal.noBuildRadius };
      if (distance(candidate, this.player) < 650) return false;
      if (distance(candidate, this.flag) < BALANCE.flagGenerationRadius) return false;
      if (this.world.resources.some((node) => overlaps(circle, node, 12))) return false;
      if (this.structures.some((item) => overlaps(circle, item, 12))) return false;
      if (this.portals.some((item) => item !== ignore
        && distance(circle, item) < BALANCE.portal.noBuildRadius * 2)) return false;
      return true;
    };
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const angle = portalRng.range(0, Math.PI * 2);
      const d = portalRng.range(BALANCE.portal.edgeMin, BALANCE.portal.edgeMax);
      const candidate = {
        x: Math.max(BALANCE.portal.margin, Math.min(BALANCE.mapSize - BALANCE.portal.margin, center + Math.cos(angle) * d)),
        y: Math.max(BALANCE.portal.margin, Math.min(BALANCE.mapSize - BALANCE.portal.margin, center + Math.sin(angle) * d)),
      };
      if (isValid(candidate)) return candidate;
    }
    for (let radius = BALANCE.portal.edgeMax; radius >= BALANCE.portal.edgeMin; radius -= 48) {
      for (let step = 0; step < 96; step += 1) {
        const angle = ((index * 17 + step) / 96) * Math.PI * 2;
        const candidate = {
          x: center + Math.cos(angle) * radius,
          y: center + Math.sin(angle) * radius,
        };
        if (isValid(candidate)) return candidate;
      }
    }
    if (ignore) return { x: ignore.x, y: ignore.y };
    throw new Error("Unable to place a portal outside all restricted zones.");
  }

  private relocatePortal(portal: Portal): void {
    const position = this.findPortalPosition(portal.id, portal);
    emitAudioCue({ cue: "portal-destroyed", position: { x: portal.x, y: portal.y } });
    this.burst(portal.x, portal.y, "#a77cff", 24, "RELOCATING");
    portal.x = position.x;
    portal.y = position.y;
    portal.health = portal.maxHealth;
    this.burst(portal.x, portal.y, "#a77cff", 24, "PORTAL MOVED");
    emitAudioCue({ cue: "portal-spawn", position: { x: portal.x, y: portal.y }, delayMs: 120 });
    this.notify("Portal relocated. Wave size unchanged.");
    this.syncSpatialAudio(true);
  }

  getBestGlove(): Tier {
    return this.unlocks.gloves.reduce((best, tier) =>
      BALANCE.tierIndex[tier] > BALANCE.tierIndex[best] ? tier : best, "wood" as Tier);
  }

  private structureMaxHealth(
    kind: StructureKind,
    tier: Tier,
    ownerId: PlayerId = this.player.id,
  ): number {
    const base = BALANCE.structure.health[kind][BALANCE.tierIndex[tier]] ?? 100;
    return resolveEffectiveStat({
      base,
      permanent: this.getPermanentPercent("structureHealth", ownerId),
      challenge: this.getChallengeModifiers().structureHealthMultiplier - 1,
      temporary: this.upgrades.structureDurability,
    });
  }

  private rebuildSpatial(): void {
    this.enemyHash.clear();
    this.obstacleHash.clear();
    for (const enemy of this.enemies) this.enemyHash.insert(enemy);
    for (const node of this.world.resources) if (!node.destroyed) this.obstacleHash.insert(node);
    for (const structure of this.structures) this.obstacleHash.insert(structure);
  }

  private burst(
    x: number,
    y: number,
    color: string,
    count: number,
    text?: string,
    textColor = color,
    textOffsetY = -24,
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(25, 120);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(0.35, 0.75),
        maxLife: 0.75,
        radius: this.rng.range(2, 6),
        color,
      });
    }
    if (text) {
      const resolvedTextColor = biomePopupColor(
        textColor,
        this.tutorialMode
          ? undefined
          : this.getCampaignTier().biome.popupContrast,
      );
      this.particles.push({
        x, y: y + textOffsetY, vx: 0, vy: -38, life: 0.9, maxLife: 0.9, radius: 0,
        color: resolvedTextColor, text,
      });
    }
  }

  private iceShardBurst(x: number, y: number, count: number, text?: string): void {
    for (let index = 0; index < count; index += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(90, 260);
      const life = this.rng.range(0.48, 0.95);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        radius: this.rng.range(3, 8),
        color: this.rng.next() < 0.45 ? "#ffffff" : "#b9f5ff",
        shape: "shard",
      });
    }
    if (text) {
      this.particles.push({
        x,
        y: y - 30,
        vx: 0,
        vy: -42,
        life: 1,
        maxLife: 1,
        radius: 0,
        color: BALANCE.snowyEnemies.slow.popupTextColor,
        text,
      });
    }
  }

  private floatWallet(x: number, y: number, wallet: ResourceWallet, prefix: "+" | "-"): void {
    let offset = 0;
    for (const resource of RESOURCE_ORDER) {
      const amount = wallet[resource];
      if (amount <= 0) continue;
      this.floatResource(x, y + offset, resource, `${prefix}${amount}`);
      offset += 15;
    }
  }

  private floatResource(x: number, y: number, resource: keyof ResourceWallet, text: string): void {
    const color = biomePopupColor(
      BALANCE.tierColors[resource],
      this.tutorialMode
        ? undefined
        : this.getCampaignTier().biome.popupContrast,
    );
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -34,
      life: 1.1,
      maxLife: 1.1,
      radius: 0,
      color,
      text,
      resource,
    });
  }

  private notify(message: string, critical = false): void {
    if (message === this.toast && this.toastTime > 0) return;
    if (this.toastQueue.some((queued) => queued.message === message)) return;
    if (this.toastTime > 0) this.toastQueue.push({ message, critical });
    else {
      this.toast = message;
      this.toastCritical = critical;
      this.toastTime = critical ? BALANCE.ui.criticalMessageDuration : BALANCE.ui.messageDuration;
    }
  }

  private endRun(victory: boolean, reason: string): void {
    if (this.phase === "victory" || this.phase === "defeat") return;
    if (this.nightPerformance) this.finalizeNightPerformance(victory ? "complete" : "partial");
    this.phase = victory ? "victory" : "defeat";
    this.shake = 0;
    this.syncSpatialAudio(false);
    if (!victory && reason === "You fell to the horde.") {
      emitAudioCue({ cue: "player-death", position: { x: this.player.x, y: this.player.y } });
    }
    this.defeatReason = reason;
    if (victory && this.runMode === "campaign") this.stats.nightsSurvived = 10;
    this.recalculateStructureScore();
    if (this.runSettlementId && this.profileManager) {
      const xp = calculateXpRewards({
        directPlayerKills: this.directPlayerKills,
        nightsSurvived: this.stats.nightsSurvived,
        victory,
        effectiveDifficultyMultiplier: this.adaptiveState.multiplier,
        challengeIds: [...this.activeChallenges],
        selectedDifficulty: this.difficulty,
      });
      const coins = settleCoinInvestment(this.runInvestment, this.stats.nightsSurvived);
      this.lastSettlement = this.profileManager.settleRun(
        this.runSettlementId,
        xp,
        coins,
        {
          nightsSurvived: this.stats.nightsSurvived,
          victory,
          structureScore: this.structureScore,
          campaignTierId: this.runMode === "campaign" ? this.activeCampaignTierId : undefined,
        },
      );
    }
    const record: RunRecord = {
      ...this.stats,
      seed: this.seed,
      difficulty: this.difficulty,
      mode: this.runMode,
      campaignTierId: this.activeCampaignTierId,
      challengeIds: [...this.activeChallenges],
      victory,
      date: new Date().toISOString(),
    };
    this.records.unshift(record);
    this.records = this.records.slice(0, 10);
    if (this.profileManager) this.profileManager.saveRunRecords(this.records);
    else browserStorage()?.setItem("countdown-forest-records", JSON.stringify(this.records));
    this.platform?.reportProgress(victory ? 100 : Math.min(90, this.stats.nightsSurvived * 10));
    if (victory) this.platform?.happytime();
    this.platform?.clearGameContext();
    finishRunDifficultyLog({
      schema: "flagfort-dev-run-v2",
      seed: this.seed,
      difficulty: this.difficulty,
      mode: this.runMode,
      startedAt: this.runTelemetryStartedAt,
      endedAt: new Date().toISOString(),
      victory,
      nights: this.devDifficultyLogs,
      final: {
        structureInventory: this.structureInventory(),
        resourcesUnspent: { ...this.resources },
        activity: this.runPlaytestActivity,
        loadout: this.playtestLoadout(),
      },
    });
    this.markUi(true);
  }

  private loadRecords(): void {
    if (this.profileManager) {
      this.records = [...this.profileManager.profile.recentRuns];
      return;
    }
    try {
      const saved = browserStorage()?.getItem("countdown-forest-records");
      if (saved) this.records = JSON.parse(saved) as RunRecord[];
    } catch {
      this.records = [];
    }
  }

  screenToWorld(point: Vec2): Vec2 {
    return {
      x: point.x + this.camera.x - BALANCE.logicalWidth / 2,
      y: point.y + this.camera.y - BALANCE.logicalHeight / 2,
    };
  }

  getSelectedAction(): ActionKind {
    return this.getActionBarActions()[this.selectedSlot - 1] ?? "fists";
  }

  private getActionBarActions(): readonly ActionKind[] {
    return actionBarActions(this.combatMode);
  }

  isCombatMode(): boolean {
    return this.combatMode;
  }

  getTierCost(kind: StructureKind, tier: Tier): ResourceWallet {
    const preview = this.buildPreview;
    const multiplier = this.getChallengeModifiers().constructionCostMultiplier;
    if (preview?.kind === kind && preview.tier === tier && preview.upgrading) {
      return scaleCost(
        upgradeCost(kind, preview.upgrading.tier, tier, this.upgrades.costReduction),
        multiplier,
      );
    }
    return scaleCost(cumulativeCost(kind, tier, this.upgrades.costReduction), multiplier);
  }

  getTurretRange(tier: Tier, ownerId: PlayerId = this.player.id): number {
    return resolveEffectiveStat({
      base: BALANCE.structure.turretRange[BALANCE.tierIndex[tier]] ?? 300,
      permanent: this.getPermanentPercent("turretRange", ownerId),
      temporary: this.upgrades.turretRange,
    });
  }

  getPermanentPercent(id: PermanentUpgradeId, ownerId: PlayerId = this.player.id): number {
    if (!this.profileManager || ownerId !== LOCAL_PLAYER_ID) return 0;
    return permanentUpgradePercent(this.profileManager.profile.permanentUpgrades[id]);
  }

  getEquippedSword() {
    if (!this.combatMode) return null;
    const item = this.profileManager?.profile.equipment.sword;
    return swordStats(item?.tier ?? null, item?.equipped ?? false);
  }

  getEquippedSwordTier(): Tier | null {
    if (!this.combatMode) return null;
    const item = this.profileManager?.profile.equipment.sword;
    return item?.equipped ? item.tier : null;
  }

  isSwordActive(): boolean {
    return Boolean(
      this.getEquippedSword()
      && this.getSelectedAction() === "fists"
      && this.player.cooldown > 0,
    );
  }

  getMeleeSwingProgress(): number | null {
    if (this.player.cooldown <= 0 || this.meleeSwingDuration <= 0) return null;
    const visualDuration = Math.min(0.48, this.meleeSwingDuration * 0.78);
    return Math.max(0, Math.min(1, this.meleeSwingElapsed / visualDuration));
  }

  getCapacity(kind: "turret" | "harvester"): { current: number; maximum: number } {
    return {
      current: this.structures.filter((structure) => structure.kind === kind && structure.health > 0).length,
      maximum: Math.min(
        BALANCE.structure.maximumCapacity[kind],
        BALANCE.structure.startingCapacity[kind] + this.upgrades[`${kind}Capacity`],
      ),
    };
  }

  getActiveRoster(night = this.night) {
    return activeRosterEnemies(
      this.seed,
      this.enemyRoster,
      night,
      this.runMode === "endless",
      BALANCE.endless.rosterAdditionInterval,
    );
  }

  getRosterMilestones(): Array<{ night: number; enemy: EnemyKind; label: string }> {
    const campaign = rosterMilestones(this.enemyRoster, this.getCampaignTier().boss);
    if (this.runMode !== "endless") return campaign;
    return [
      ...campaign,
      ...endlessRosterMilestones(
        this.seed,
        this.enemyRoster,
        BALANCE.endless.rosterAdditionInterval,
      ),
    ];
  }

  isUpgradeSelectionExhausted(): boolean {
    return this.phase === "dawn"
      && !this.enemyWarning
      && this.choices.length === 0
      && availableUpgradeKeys(this.upgrades, this.dawnPicked, this.disabledDawnBenefits()).length === 0;
  }

  continueWithoutUpgrade(): void {
    if (!this.isUpgradeSelectionExhausted()) return;
    this.beginNextDayWithWarning();
  }

  endRunAtUpgradeCap(): void {
    if (!this.isUpgradeSelectionExhausted()) return;
    this.endRun(true, "Run completed after reaching every upgrade cap.");
  }

  isBossNight(): boolean {
    return this.night === 10 || (this.night > 10 && (this.night - 10) % 5 === 0);
  }

  getPhaseDuration(): number {
    return this.phase === "night" ? BALANCE.nightDuration : this.getDayDuration();
  }

  hasChallenge(id: string): boolean {
    return this.activeChallenges.has(id);
  }

  getChallengeModifiers(): ChallengeModifiers {
    return resolveChallengeModifiers(this.activeChallenges);
  }

  private disabledDawnBenefits(): ReadonlySet<string> {
    return this.getChallengeModifiers().disablesFlagHealthUpgrades
      ? new Set(["flagHealth"])
      : new Set();
  }

  private getDayDuration(): number {
    return Math.round(
      BALANCE.dayDuration * this.getChallengeModifiers().dayDurationMultiplier,
    );
  }

  private mitigateIncomingDamage(damage: number): number {
    const helmet = this.profileManager?.profile.equipment.helmet;
    return mitigatePlayerDamage(damage, helmet?.tier ?? null, helmet?.equipped ?? false);
  }

  private trackFlagRadiusEntries(): void {
    const tracker = this.nightPerformance;
    if (!tracker || this.phase !== "night" || !this.flagPresent) return;
    for (const enemy of this.enemies) {
      if (enemy.health <= 0 || tracker.flagRadiusEnemyIds.has(enemy.id)) continue;
      if (distance(enemy, this.flag) - enemy.radius > BALANCE.flagProtectedRadius) continue;
      tracker.flagRadiusEnemyIds.add(enemy.id);
      tracker.zombiesEnteringFlagRadius += 1;
    }
  }

  private applyIncomingDamage(
    target: Player | Flag | Structure,
    rawDamage: number,
    enemyKind?: EnemyKind,
    source: DamageSource = "enemy",
  ): number {
    const damage = target === this.player ? this.mitigateIncomingDamage(rawDamage) : Math.max(0, rawDamage);
    const before = Math.max(0, target.health);
    target.health -= damage;
    const applied = Math.min(before, damage);
    const tracker = this.nightPerformance;
    if (!tracker || this.phase !== "night" || applied <= 0) return damage;
    tracker.totalIncomingDamage += applied;
    this.recordIncomingDamage(source, enemyKind, target, applied);
    if (target === this.player) tracker.playerDamageTaken += applied;
    else if (target === this.flag) tracker.flagDamage += applied;
    else if ("kind" in target && "tier" in target) {
      tracker.damagedStructureIds.add(target.id);
      tracker.structureValues.set(target.id, structurePointValue(target.kind, target.tier));
      if (before > 0 && target.health <= 0) {
        tracker.destroyedStructureIds.add(target.id);
        this.recordStructureActivity("destroyed", target.kind, target.tier);
      }
    }
    return damage;
  }

  private finalizeNightPerformance(status: "complete" | "partial" = "complete"): void {
    const tracker = this.nightPerformance;
    if (!tracker) return;
    const valueOf = (ids: ReadonlySet<number>): number => [...ids]
      .reduce((sum, id) => sum + (tracker.structureValues.get(id) ?? 0), 0);
    this.lastNightPerformance = {
      night: tracker.night,
      totalIncomingDamage: tracker.totalIncomingDamage,
      damagedStructureCount: tracker.damagedStructureIds.size,
      damagedStructureValue: valueOf(tracker.damagedStructureIds),
      destroyedStructureCount: tracker.destroyedStructureIds.size,
      destroyedStructureValue: valueOf(tracker.destroyedStructureIds),
      flagDamage: tracker.flagDamage,
      flagMaximumHealth: this.flag.maxHealth,
      zombiesEnteringFlagRadius: tracker.zombiesEnteringFlagRadius,
      personalZombieKills: tracker.personalWaveZombieKills,
      playerDamageTaken: tracker.playerDamageTaken,
      playerMaximumHealth: this.player.maxHealth,
      totalZombieKills: Math.max(0, tracker.totalZombiesSpawned
        - this.enemies.filter((enemy) =>
          enemy.health > 0 && tracker.waveEnemyIds.has(enemy.id)).length),
      totalZombiesSpawned: tracker.totalZombiesSpawned,
      survivingZombiesAtDawn: this.enemies
        .filter((enemy) => enemy.health > 0 && tracker.waveEnemyIds.has(enemy.id)).length,
    };
    this.performanceDifficulty = performanceDifficultyDelta(this.lastNightPerformance);
    this.autoCorrectiveDelta = this.performanceDifficulty.delta;
    const nightLog = this.devDifficultyLogs.find((entry) => entry.night === tracker.night);
    if (nightLog) {
      nightLog.status = status;
      nightLog.outcome = {
        ...this.lastNightPerformance,
        correctiveForNextNight: { ...this.performanceDifficulty },
      };
      nightLog.analysis.structureInventory.end = this.structureInventory();
      nightLog.analysis.resourcesUnspent = { ...this.resources };
      nightLog.analysis.bossKillTimeSeconds = tracker.bossKillTimeSeconds;
      nightLog.executiveSummary = summarizeNight(nightLog);
    }
    this.nightPerformance = null;
    this.cyclePlaytestActivity = emptyPlaytestActivity();
  }

  private trackPlaytestTime(dt: number): void {
    let category: keyof PlaytestActivityLog["timeSeconds"] | null = null;
    if (this.phase === "night") category = "fighting";
    else {
      const action = this.getSelectedAction();
      if (action === "fists" && this.input.mouseDown) category = "gathering";
      else if (action === "tool" && this.input.mouseDown) category = "repairing";
      else if (this.input.mouseDown && STRUCTURE_ORDER.includes(action as StructureKind)) category = "building";
    }
    if (!category) return;
    this.cyclePlaytestActivity.timeSeconds[category] += dt;
    this.runPlaytestActivity.timeSeconds[category] += dt;
  }

  private incrementStructureTally(
    tally: StructureTally,
    kind: StructureKind,
    tier: Tier,
  ): void {
    const byTier = tally[kind] ??= {};
    byTier[tier] = (byTier[tier] ?? 0) + 1;
  }

  private recordStructureActivity(
    action: keyof PlaytestActivityLog["structures"],
    kind: StructureKind,
    tier: Tier,
  ): void {
    this.incrementStructureTally(this.cyclePlaytestActivity.structures[action], kind, tier);
    this.incrementStructureTally(this.runPlaytestActivity.structures[action], kind, tier);
  }

  private recordResources(
    action: keyof PlaytestActivityLog["resources"],
    wallet: ResourceWallet,
  ): void {
    for (const kind of RESOURCE_ORDER) {
      this.cyclePlaytestActivity.resources[action][kind] += wallet[kind];
      this.runPlaytestActivity.resources[action][kind] += wallet[kind];
    }
  }

  private spendResources(cost: ResourceWallet): void {
    spend(this.resources, cost);
    this.recordResources("spent", cost);
  }

  private incrementDamageTally(
    tally: PlaytestActivityLog["outgoingDamageBySource"],
    source: DamageSource,
    amount: number,
  ): void {
    if (amount <= 0) return;
    tally[source] = (tally[source] ?? 0) + amount;
  }

  private recordOutgoingDamage(source: DamageSource, amount: number): void {
    this.incrementDamageTally(this.cyclePlaytestActivity.outgoingDamageBySource, source, amount);
    this.incrementDamageTally(this.runPlaytestActivity.outgoingDamageBySource, source, amount);
  }

  private recordIncomingDamage(
    source: DamageSource,
    enemyKind: EnemyKind | undefined,
    target: Player | Flag | Structure,
    amount: number,
  ): void {
    for (const activity of [this.cyclePlaytestActivity, this.runPlaytestActivity]) {
      this.incrementDamageTally(activity.incomingDamageBySource, source, amount);
      if (!enemyKind) continue;
      const targets = activity.enemyDamageByKindAndTarget[enemyKind] ??= {};
      if (target === this.player) targets.player = (targets.player ?? 0) + amount;
      else if (target === this.flag) targets.flag = (targets.flag ?? 0) + amount;
      else if ("kind" in target && "tier" in target) {
        const structures = targets.structures ??= {};
        structures[target.kind] = (structures[target.kind] ?? 0) + amount;
      }
    }
  }

  private incrementEnemyTally(
    tally: Partial<Record<EnemyKind, number>>,
    kind: EnemyKind,
  ): void {
    tally[kind] = (tally[kind] ?? 0) + 1;
  }

  private recordEnemyKill(enemy: Enemy, source: DamageSource): void {
    if (enemy.countsTowardWave === false) return;
    for (const activity of [this.cyclePlaytestActivity, this.runPlaytestActivity]) {
      this.incrementDamageTally(activity.killsBySource, source, 1);
    }
    const tracker = this.nightPerformance;
    if (!tracker) return;
    const category = tracker.populationCategoryByEnemyId.get(enemy.id);
    if (category) this.incrementEnemyTally(tracker.population.killed[category], enemy.kind);
    if (this.isBossEnemyKind(enemy.kind) && tracker.bossKillTimeSeconds === null) {
      tracker.bossKillTimeSeconds = this.phaseElapsed;
    }
  }

  private structureInventory(): StructureTally {
    const inventory: StructureTally = {};
    for (const structure of this.structures) {
      if (structure.health <= 0 || !this.isOwnedByPlayer(structure, this.player.id)) continue;
      this.incrementStructureTally(inventory, structure.kind, structure.tier);
    }
    return inventory;
  }

  private playtestLoadout(): RunLoadoutLog {
    const profile = this.profileManager?.profile;
    const equipment = Object.fromEntries(EQUIPMENT_ORDER.map((kind) => {
      const item = profile?.equipment[kind];
      return [kind, { tier: item?.tier ?? null, equipped: item?.equipped ?? false }];
    }));
    return {
      playerLevel: profile?.playerLevel ?? 1,
      permanentUpgrades: { ...(profile?.permanentUpgrades ?? {}) },
      equipment,
      temporaryUpgrades: { ...this.upgrades },
      mutations: { ...this.mutations },
    };
  }

  private createSettlementId(): string {
    const values = new Uint32Array(2);
    if (typeof crypto !== "undefined") crypto.getRandomValues(values);
    else {
      values[0] = Date.now() >>> 0;
      values[1] = Math.floor(performance.now() * 1000) >>> 0;
    }
    return `${Date.now().toString(36)}-${values[0]?.toString(36)}-${values[1]?.toString(36)}`;
  }

  private recalculateStructureScore(): void {
    this.structureScore = this.structures
      .filter((structure) =>
        structure.health > 0
        && this.isOwnedByPlayer(structure, this.player.id))
      .reduce((total, structure) => total + structurePointValue(structure.kind, structure.tier), 0);
  }

  private getAdaptivePowerInput(): AdaptivePowerInput {
    const turrets = this.structures.filter((structure) =>
      structure.kind === "turret"
        && structure.health > 0
        && this.isOwnedByPlayer(structure, this.player.id));
    const turretDps = turrets.reduce((total, turret) => {
      const tierIndex = BALANCE.tierIndex[turret.tier];
      const damage = resolveEffectiveStat({
        base: BALANCE.structure.turretDamage[tierIndex] ?? 8,
        permanent: this.getPermanentPercent("turretDamage", turret.ownerId ?? this.player.id),
        temporary: this.upgrades.turretDamage,
      });
      const cooldown = Math.max(0.16, resolveActionCooldown(
        BALANCE.structure.turretRate[tierIndex] ?? 1,
        {
          permanent: this.getPermanentPercent("turretRate", turret.ownerId ?? this.player.id),
          temporary: this.upgrades.turretRate,
        },
      ));
      return total + damage / cooldown;
    }, 0);
    const maximumRange = turrets.reduce(
      (range, turret) => Math.max(range, this.getTurretRange(turret.tier, turret.ownerId ?? this.player.id)),
      0,
    );
    return {
      turretDps,
      turretCoverageRatio: maximumRange / Math.max(1, BALANCE.portal.edgeMin),
      upgrades: { ...this.upgrades },
    };
  }

  getAdaptiveThreat(): AdaptiveDifficulty {
    return this.phase === "day"
      ? adaptiveDifficulty(
        this.structureScore,
        this.night,
        this.profileManager?.profile.playerLevel ?? 1,
        this.night > 1 ? [this.autoCorrectiveDelta] : [],
        this.getAdaptivePowerInput(),
      )
      : this.adaptiveState;
  }

  getRecyclingRate(): number {
    const item = this.profileManager?.profile.equipment.mallet;
    return recyclingRate(item?.tier ?? null, item?.equipped ?? false);
  }

  private isOwnedByPlayer(structure: Structure, playerId: PlayerId): boolean {
    return (structure.ownerId ?? LOCAL_PLAYER_ID) === playerId;
  }

  private structureInvestment(structure: Structure): ResourceWallet {
    if (structure.investedResources) return { ...structure.investedResources };
    return scaleCost(
      cumulativeCost(structure.kind, structure.tier, this.upgrades.costReduction),
      this.getChallengeModifiers().constructionCostMultiplier,
    );
  }

  private isCapacityReached(kind: StructureKind): boolean {
    if (kind !== "turret" && kind !== "harvester") return false;
    const capacity = this.getCapacity(kind);
    return capacity.current >= capacity.maximum;
  }

  private completeBossNight(): void {
    if (this.phase !== "night") return;
    this.notify("Boss and horde defeated", true);
    emitAudioCue({ cue: "wave-cleared" });
    if (this.runMode === "endless") {
      this.beginDawn();
      return;
    }
    this.phase = "day";
    this.phaseElapsed = 0;
    this.igniteOrdinaryZombies();
    this.endRun(true, "");
  }

  copySeed(): void {
    void navigator.clipboard.writeText(this.seed);
    this.notify("Seed copied");
  }
}
