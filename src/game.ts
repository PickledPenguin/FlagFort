import { BALANCE, RESOURCE_ORDER, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { resolveChallengeModifiers, type ChallengeModifiers } from "./challenges";
import { emitAudioCue, emitAudioSpatialState } from "./audio";
import { applyUnlock, generateChoiceOfferings } from "./choices";
import { Input } from "./input";
import { NavigationGrid } from "./pathfinding";
import { browserStorage } from "./storage";
import { TUTORIAL_SECTIONS, type TutorialTaskDefinition } from "./content";
import { generateSeed, SeededRng } from "./rng";
import { generateWorld } from "./world";
import {
  addWallet,
  adaptiveDifficulty,
  applyMutation,
  applyUpgrade,
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
  upgradeCost,
  type ResourceWallet,
} from "./rules";
import { distance, overlaps, segmentCircle, SpatialHash } from "./spatial";
import { freeRepairChance, mitigatePlayerDamage, swordStats } from "./equipment";
import { permanentUpgradePercent, type PermanentUpgradeId } from "./meta-balance";
import { resolveCooldown, resolveEffectiveStat } from "./modifiers";
import type { GamePlatform } from "./platform";
import type { ProfileManager, RunSettlementResult } from "./profile";
import { calculateXpRewards, settleCoinInvestment } from "./rewards";
import type {
  ActionKind,
  Choice,
  Difficulty,
  Enemy,
  EnemyKind,
  Flag,
  Particle,
  Phase,
  Player,
  PlayerId,
  Portal,
  Projectile,
  ResourceNode,
  RunRecord,
  RunStats,
  Structure,
  StructureKind,
  Tier,
  Vec2,
  World,
} from "./types";

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
const ACTIONS: ActionKind[] = ["fists", "tool", "recycle", "wall", "spikes", "door", "harvester", "turret"];

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
  seed = "";
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
  directPlayerKills: Record<EnemyKind, number> = {
    basic: 0,
    runner: 0,
    breaker: 0,
    jumper: 0,
    summoner: 0,
    boss: 0,
  };
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
  private nextId = 1000;
  private toastQueue: Array<{ message: string; critical: boolean }> = [];
  private enemyHash = new SpatialHash<Enemy>(180);
  private obstacleHash = new SpatialHash<ResourceNode | Structure>(180);
  private navigationFields = new Map<number, NavigationGrid>();
  private structureRevision = 0;
  private tutorialHarvestedNodeIds = new Set<number>();
  private tutorialDoorStartSide = 0;
  private nightWaveScheduled = false;
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
  private uiDirty = true;
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
    runOptions: { investment?: number; settle?: boolean; settlementId?: string } = {},
  ): boolean {
    this.tutorialMode = false;
    this.flagPresent = true;
    this.difficulty = difficulty;
    this.activeChallenges = new Set(
      challengeIds.map((id) => id === "fifty-percent-days" ? "short-days" : id),
    );
    this.seed = requestedSeed.trim() || generateSeed();
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
    this.rng = new SeededRng(`${this.seed}:gameplay:${difficulty}`);
    this.nextId = 1000;
    const challengeModifiers = this.getChallengeModifiers();
    this.world = generateWorld(this.seed, challengeModifiers.resourceNodeMultiplier);
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
    this.navigationFields.clear();
    this.structureRevision = 0;
    this.nightWaveScheduled = false;
    this.selectedSlot = 1;
    this.selectedTiers = { wall: "wood", spikes: "wood", door: "wood", harvester: "wood", turret: "wood" };
    this.unlocks = createUnlocks();
    this.upgrades = createUpgrades();
    this.mutations = createMutations();
    this.stats = { resourcesGathered: 0, structuresBuilt: 0, zombiesDefeated: 0, elapsed: 0, nightsSurvived: 0 };
    this.directPlayerKills = { basic: 0, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 };
    this.choices = [];
    this.dawnScreen = 0;
    this.dawnPicked = new Set();
    this.enemyWarning = null;
    this.rerollsUsed = 0;
    this.rerollConfirmation = false;
    this.skipNightConfirmation = false;
    this.structureScore = 0;
    this.adaptiveState = adaptiveDifficulty(0, 1);
    this.playerDamageWarned = false;
    this.flagWarningCooldown = 0;
    this.footstepCooldown = 0;
    this.healingActive = false;
    this.audioSpatialCooldown = 0;
    this.defeatReason = "";
    this.toolPreview = null;
    this.spawnPortals(!suppressPortalAudio);
    this.syncSpatialAudio(true);
    this.notify(`Seed ${this.seed}`);
    this.markUi(true);
    return true;
  }

  restart(sameSeed: boolean): void {
    this.startRun(this.difficulty, sameSeed ? this.seed : "", [...this.activeChallenges]);
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
    if (this.phase === "day" || this.phase === "night") {
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
    if (slot < 1 || slot > 8 || !this.isTutorialSlotAllowed(slot)) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    this.selectedSlot = slot;
    emitAudioCue({ cue: "ui-click" });
    const action = ACTIONS[slot - 1];
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
          this.flag.maxHealth = oldFlagMax + BALANCE.upgrades.flagHealth.amount;
        }
      }
    }
    emitAudioCue({ cue: "upgrade-unlock", delayMs: 90 });
    applyMutation(this.mutations, choice.mutationId);
    emitAudioCue({ cue: "card-mutation", delayMs: 220 });
    this.dawnPicked.add(choice.id);
    this.dawnScreen += 1;
    if (this.dawnScreen >= 3) {
      const nextNight = this.night + 1;
      const introduced = (Object.keys(BALANCE.introductionNight) as EnemyKind[])
        .find((kind) => BALANCE.introductionNight[kind] === nextNight && kind !== "boss");
      if (introduced) {
        this.enemyWarning = introduced;
        this.choices = [];
        this.markUi(true);
      } else {
        this.beginNextDay();
      }
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
    spend(this.resources, rerollCost(this.resources));
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
      );
    }
    this.notify(`Reroll ${this.rerollsUsed} of ${BALANCE.reroll.limit}`);
    this.markUi(true);
  }

  getRerollCost(): ResourceWallet {
    return rerollCost(this.resources);
  }

  requestSkipNight(): void {
    if (this.phase !== "day" || this.skipNightConfirmation) return;
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
      this.timer = Math.max(0, this.timer - dt);
    }
    this.phaseElapsed += dt;
    this.footstepCooldown = Math.max(0, this.footstepCooldown - dt);
    this.audioSpatialCooldown = Math.max(0, this.audioSpatialCooldown - dt);
    this.player.cooldown = Math.max(0, this.player.cooldown - dt);
    this.player.toolCooldown = Math.max(0, this.player.toolCooldown - dt);
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
    this.updateStructures(dt);
    this.updatePortals(dt);
    this.updateEnemies(dt);
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

    if (this.phase === "night" && !this.isBossNight() && this.shouldEndNightEarly()) {
      this.notify("All zombies killed", true);
      emitAudioCue({ cue: "wave-cleared" });
      this.beginDawn();
      this.input.endFrame();
      return;
    }

    if (this.tutorialMode) {
      this.player.health = Math.max(1, this.player.health);
      if (this.flagPresent) this.flag.health = Math.max(1, this.flag.health);
    } else if (this.player.health <= 0) this.endRun(false, "You fell to the horde.");
    else if (this.flag.health <= 0) this.endRun(false, "The flag was destroyed.");
    else if (this.timer <= 0) {
      if (this.phase === "day") this.beginNight();
      else if (!this.isBossNight()) this.beginDawn();
      else {
        const bossAlive = this.enemies.some((enemy) => enemy.kind === "boss");
        if (!bossAlive) this.completeBossNight();
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
    const action = ACTIONS[this.selectedSlot - 1];
    if (!action) return;
    if (action === "fists") this.punch();
    else if (action === "tool") {
      if (this.phase === "night") this.shootBow();
      else if (this.input.pressed) this.repair();
    } else if (action === "recycle") {
      if (this.phase === "day" && this.input.pressed) this.recycle();
    } else if (this.phase === "day" && this.input.pressed) {
      this.placeStructure(action);
    }
  }

  private punch(): void {
    const sword = this.getEquippedSword();
    const baseMeleeInterval = Math.max(
      0.16,
      BALANCE.player.punchRate - this.upgrades.punchRate,
    );
    const interval = sword
      ? baseMeleeInterval * sword.cooldownMultiplier
      : baseMeleeInterval;
    if (this.player.cooldown > 0) return;
    this.player.cooldown = interval;
    const currentIndex = BALANCE.punchHands.indexOf(this.player.punchHand);
    this.player.punchHand = BALANCE.punchHands[(currentIndex + 1) % BALANCE.punchHands.length] ?? "right";
    this.player.punchSerial += 1;
    emitAudioCue({
      cue: "player-punch-swing",
      position: { x: this.player.x, y: this.player.y },
    });
    const range = sword?.range ?? BALANCE.player.punchRange;
    const candidates = this.enemyHash.query(this.player.x, this.player.y, range + 40)
      .filter((enemy) => this.inMeleeArc(enemy, range, sword?.arc ?? BALANCE.player.punchArc))
      .sort((a, b) => distance(this.player, a) - distance(this.player, b));
    const targets = candidates.slice(0, sword?.targetLimit ?? 1);
    if (targets.length) {
      for (const enemy of targets) {
        emitAudioCue({ cue: "player-punch-impact", position: { x: enemy.x, y: enemy.y } });
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
      return;
    }
    const portal = this.portals.filter((item) => this.inPunchArc(item)).sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    if (portal) {
      emitAudioCue({ cue: "player-punch-impact", position: { x: portal.x, y: portal.y } });
      portal.health -= BALANCE.glovePortalDamage[this.getBestGlove()];
      portal.flash = 0.16;
      this.burst(portal.x, portal.y, "#9c73ff", 8);
      if (portal.health <= 0) this.relocatePortal(portal);
      return;
    }
    const node = this.obstacleHash.query(this.player.x, this.player.y, BALANCE.player.punchRange + 70)
      .filter((item): item is ResourceNode => !("tier" in item))
      .filter((item) => this.inPunchArc(item))
      .sort((a, b) => distance(this.player, a) - distance(this.player, b))[0];
    if (node) {
      this.player.cooldown = Math.max(0.12, interval - this.upgrades.harvestRate);
      this.harvestNode(node, this.getBestGlove(), 1);
    }
    else this.burst(
      this.player.x + Math.cos(this.player.angle) * 65,
      this.player.y + Math.sin(this.player.angle) * 65,
      "#e8dab9",
      3,
    );
  }

  private inPunchArc(target: { x: number; y: number; radius: number }): boolean {
    return this.inMeleeArc(target, BALANCE.player.punchRange, BALANCE.player.punchArc);
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
    const interval = Math.max(0.15, resolveCooldown(BALANCE.bow.rate, [
      this.getPermanentPercent("bowRate"),
    ]) - this.upgrades.bowRate);
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
    if (!free) spend(this.resources, preview.cost);
    structure.health = structure.maxHealth;
    this.burst(structure.x, structure.y, "#74f3a5", 16, free ? "FREE REPAIR" : "FULL REPAIR");
    if (!free) this.floatWallet(structure.x, structure.y + 30, preview.cost, "-");
    emitAudioCue({ cue: "structure-repair", position: { x: structure.x, y: structure.y } });
    this.recordTutorialEvent(`repaired-${structure.kind}`);
  }

  private recycle(): void {
    const preview = this.toolPreview;
    if (!preview || preview.action !== "recycle" || !preview.valid || !preview.target || preview.target === this.flag) {
      emitAudioCue({ cue: "ui-invalid" });
      return;
    }
    const structure = preview.target as Structure;
    addWallet(this.resources, preview.refund);
    this.structures = this.structures.filter((item) => item !== structure);
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
    const action = ACTIONS[this.selectedSlot - 1];
    if (this.phase !== "day" || (action !== "tool" && action !== "recycle")) {
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
      ? this.structures.filter((item) => distance(mouse, item) <= item.radius + 20)
        .sort((a, b) => distance(mouse, a) - distance(mouse, b))[0] ?? null
      : null;
    if (this.tutorialMode && structure) {
      const requiredKind = this.getTutorialTask()?.completionEvent.split("-").at(-1);
      if (requiredKind && structure.kind !== requiredKind) structure = null;
    }
    if (action === "recycle") {
      const refund = structure
        ? dismantleRefund(
          structure.kind,
          structure.tier,
          this.upgrades.costReduction,
          structure.health,
          structure.maxHealth,
          this.getChallengeModifiers().constructionCostMultiplier,
        )
        : emptyWallet();
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
        reason: structure ? "Recycle for 50%" : inReach ? "Structure required" : "Out of reach",
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
    const action = ACTIONS[this.selectedSlot - 1];
    if (this.phase !== "day" || !action || action === "fists" || action === "tool" || action === "recycle") {
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
    spend(this.resources, cost);
    if (preview.upgrading) {
      const structure = preview.upgrading;
      const ratio = structure.health / structure.maxHealth;
      structure.tier = preview.tier;
      structure.maxHealth = this.structureMaxHealth(
        kind,
        preview.tier,
        structure.ownerId ?? this.player.id,
      );
      structure.health = structure.maxHealth * ratio;
      this.burst(structure.x, structure.y, BALANCE.tierColors[preview.tier], 12, "UPGRADE");
      emitAudioCue({ cue: "structure-upgrade", position: { x: structure.x, y: structure.y } });
      this.recordTutorialEvent(`upgraded-${kind}`);
    } else {
      const maxHealth = this.structureMaxHealth(kind, preview.tier);
      this.structures.push({
        id: this.nextId++,
        ownerId: this.player.id,
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
      structure.cooldown = Math.max(0, structure.cooldown - dt);
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
      resolveCooldown(
        BALANCE.structure.turretRate[tierIndex] ?? 1,
        [this.getPermanentPercent("turretRate", ownerId)],
      ) * (1 - Math.min(0.7, this.upgrades.turretRate)),
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
        this.harvestNode(node, structure.tier, 0.2);
        if (this.tutorialMode) {
          this.tutorialHarvestedNodeIds.add(node.id);
          if (this.tutorialHarvestedNodeIds.size >= 2) this.recordTutorialEvent("harvested-two-nodes");
        }
      }
    }
  }

  private harvestNode(node: ResourceNode, tier: Tier, damageScale: number): void {
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
    this.burst(node.x, node.y, BALANCE.tierColors[node.kind], 4);
    this.floatResource(node.x, node.y - 24, node.kind, `+${amount}`);
    const hitCue = `${node.kind}-hit` as "wood-hit" | "stone-hit" | "gold-hit" | "diamond-hit";
    emitAudioCue({ cue: hitCue, position: { x: node.x, y: node.y } });
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
      const frequencyBoost = 1 + Math.max(0, this.adaptiveState.multiplier - 1)
        * BALANCE.adaptive.spawnFrequencyInfluence;
      const scheduleProgress = Math.min(
        1,
        this.phaseElapsed * frequencyBoost / BALANCE.nightSpawnCutoff,
      );
      const scheduledCount = Math.min(
        portal.assignedSpawns,
        Math.floor(scheduleProgress * portal.assignedSpawns + 1e-6),
      );
      let boundedWork = 0;
      while (portal.spawned < scheduledCount && boundedWork < portal.assignedSpawns) {
        portal.spawned += 1;
        this.spawnEnemy(portal, this.rollEnemyKind());
        boundedWork += 1;
      }
    }
  }

  private shouldEndNightEarly(): boolean {
    if (!this.nightWaveScheduled) return false;
    const scheduledWaveComplete = this.portals.every((portal) => portal.spawned >= portal.assignedSpawns);
    if (!scheduledWaveComplete) return false;
    return !this.enemies.some((enemy) => enemy.health > 0);
  }

  private spawnEnemy(portal: Portal | Vec2, kind: EnemyKind, summonedBy?: number): void {
    const base = BALANCE.enemy[kind];
    const difficulty = BALANCE.difficulty[this.difficulty];
    const challenges = this.getChallengeModifiers();
    // Scaling order: base, selected difficulty, accumulated mutation, then clamped adaptive influence.
    const adaptiveHealth = 1 + (this.adaptiveState.multiplier - 1) * BALANCE.adaptive.healthInfluence;
    const adaptiveDamage = 1 + (this.adaptiveState.multiplier - 1) * BALANCE.adaptive.damageInfluence;
    const health = base.health
      * difficulty.enemyHealth
      * (1 + this.mutations.health)
      * adaptiveHealth
      * challenges.enemyHealthMultiplier;
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
        * difficulty.enemySpeed
        * (1 + this.mutations.speed)
        * challenges.enemySpeedMultiplier,
      damage: base.damage
        * difficulty.enemyDamage
        * (1 + this.mutations.damage)
        * adaptiveDamage
        * challenges.enemyDamageMultiplier,
      structureDamage: base.structureDamage * difficulty.enemyDamage
        * (1 + this.mutations.structureDamage)
        * adaptiveDamage
        * challenges.enemyDamageMultiplier,
      attackRate: base.attackRate / (
        difficulty.attackSpeed
        * (1 + this.mutations.attackSpeed)
        * challenges.enemyAttackSpeedMultiplier
      ),
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
      jumpCooldown: 0,
      jumpTime: 0,
      bossSmashWindup: 0,
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
      routeCommitment: 0,
      routeIncludesStructures: false,
      routeStructureRevision: this.structureRevision,
      jumpElapsed: 0,
      jumpStartX: 0,
      jumpStartY: 0,
      jumpEndX: 0,
      jumpEndY: 0,
    });
    const spawned = this.enemies.at(-1);
    if (spawned) this.constrainToTutorialArena(spawned);
  }

  private rollEnemyKind(): EnemyKind {
    const specialBoost = 1 + Math.max(0, this.adaptiveState.multiplier - 1)
      * BALANCE.adaptive.specialWeightInfluence;
    const eliteMultiplier = this.getChallengeModifiers().specialZombieWeightMultiplier;
    const entries: Array<{ value: EnemyKind; weight: number }> = [
      { value: "basic", weight: BALANCE.baseWeights.basic + this.mutations.basicWeight },
    ];
    if (this.night >= 2) entries.push({ value: "runner", weight: (BALANCE.baseWeights.runner + this.mutations.runnerWeight) * specialBoost * eliteMultiplier });
    if (this.night >= 3) entries.push({ value: "breaker", weight: (BALANCE.baseWeights.breaker + this.mutations.breakerWeight) * specialBoost * eliteMultiplier });
    if (this.night >= 5) entries.push({ value: "jumper", weight: (BALANCE.baseWeights.jumper + this.mutations.jumperWeight) * specialBoost * eliteMultiplier });
    if (this.night >= 7) entries.push({ value: "summoner", weight: (BALANCE.baseWeights.summoner + this.mutations.summonerWeight) * specialBoost * eliteMultiplier });
    return this.rng.weighted(entries);
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
      if (enemy.jumpTime > 0) {
        this.updateJumperAirborne(enemy, dt);
        continue;
      }
      if (enemy.kind === "summoner") this.updateSummoner(enemy, dt);
      if (enemy.kind === "boss") this.updateBoss(enemy, dt);
      if (enemy.scanCooldown <= 0) {
        enemy.scanCooldown = 0.35 + this.rng.range(0, 0.15);
        this.selectEnemyTarget(enemy);
      }
      const target = this.getEnemyTarget(enemy);
      if (!target) {
        enemy.targetId = "flag";
        continue;
      }
      if ("tutorialTarget" in target) {
        enemy.attackWindup = 0;
        continue;
      }
      const reach = enemy.radius + target.radius + 5;
      const targetDistance = distance(enemy, target);
      if (targetDistance <= reach) {
        this.enemyAttack(enemy, target, dt);
        continue;
      }
      enemy.attackWindup = Math.max(0, enemy.attackWindup - dt * 2.5);
      const blockers = this.structures.filter((structure) => {
        return segmentCircle(enemy.x, enemy.y, target.x, target.y, {
          ...structure,
          radius: structure.radius + enemy.radius
            * (enemy.kind === "boss" ? BALANCE.boss.obstaclePathWidth : 0.45),
        });
      });
      const blocker = blockers.sort((a, b) => distance(enemy, a) - distance(enemy, b))[0];
      const blockerReach = enemy.kind === "boss" ? BALANCE.boss.obstacleAttackRange : 9;
      if (enemy.kind === "runner" && enemy.routeIncludesStructures && enemy.path.length > 0) {
        this.moveEnemyToward(enemy, target, dt);
        continue;
      }
      if (blocker && distance(enemy, blocker) <= enemy.radius + blocker.radius + blockerReach) {
        if (enemy.kind === "jumper") {
          if (enemy.jumpCooldown <= 0 && this.tryJumperLeap(enemy, blocker, target)) continue;
          this.moveEnemyToward(enemy, target, dt);
          continue;
        }
        this.enemyAttack(enemy, blocker, dt);
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
      if (!enemy.deathCounted) {
        enemy.deathCounted = true;
        this.stats.zombiesDefeated += 1;
        if (enemy.lastHitByPlayerId === this.player.id
          && (enemy.lastDamageSource === "player-melee" || enemy.lastDamageSource === "player-bow")) {
          this.directPlayerKills[enemy.kind] += 1;
        }
        emitAudioCue({
          cue: enemy.kind === "boss" ? "boss-death" : "zombie-death",
          position: { x: enemy.x, y: enemy.y },
        });
      }
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
      this.structureRevision += 1;
      this.navigationFields.clear();
    }
    this.recalculateStructureScore();
  }

  private updateSunlight(enemy: Enemy, dt: number): void {
    if (!enemy.burning || enemy.kind === "boss") return;
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
    enemy.health -= damagePerSecond * dt;
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
    if (enemy.kind === "boss") {
      enemy.targetId = "flag";
      return;
    }
    const detection = enemy.kind === "jumper" ? 440 : 330;
    const playerInRange = distance(enemy, this.player) <= detection;
    const candidates = this.structures.filter((structure) => distance(enemy, structure) <= detection);
    const turrets = candidates.filter((item) => item.kind === "turret").sort((a, b) => distance(enemy, a) - distance(enemy, b));
    const harvesters = candidates.filter((item) => item.kind === "harvester").sort((a, b) => distance(enemy, a) - distance(enemy, b));
    if (distance(enemy, this.flag) <= detection) enemy.targetId = "flag";
    else if (playerInRange) enemy.targetId = "player";
    else if (turrets[0]) enemy.targetId = turrets[0].id;
    else if (harvesters[0]) enemy.targetId = harvesters[0].id;
    else enemy.targetId = "flag";
  }

  private getEnemyTarget(enemy: Enemy): (Player | Flag | Structure | TutorialTarget) | null {
    if (enemy.targetId === "player") return this.player;
    if (enemy.targetId === "flag") return this.flagPresent ? this.flag : null;
    if (enemy.targetId === "tutorial") return this.tutorialTarget;
    if (typeof enemy.targetId === "number") return this.structures.find((item) => item.id === enemy.targetId) ?? null;
    return null;
  }

  private tryJumperLeap(
    enemy: Enemy,
    blocker: Structure,
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
      this.setJumperRecoveryPath(enemy, blocker, target);
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
      this.burst(enemy.x, enemy.y, "#b7ff8a", 7, "LAND");
    }
  }

  private setJumperRecoveryPath(
    enemy: Enemy,
    blocker: Structure,
    target: Player | Flag | Structure,
  ): void {
    const toward = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    const side = enemy.id % 2 === 0 ? 1 : -1;
    const distanceAround = blocker.radius + enemy.radius + BALANCE.jumper.recoveryDistance;
    enemy.path = [{
      x: blocker.x + Math.cos(toward + side * Math.PI / 2) * distanceAround,
      y: blocker.y + Math.sin(toward + side * Math.PI / 2) * distanceAround,
    }];
    enemy.pathIndex = 0;
    enemy.pathCooldown = BALANCE.jumper.failedRetryDelay;
    enemy.routeCommitment = BALANCE.jumper.failedRetryDelay;
  }

  private enemyAttack(enemy: Enemy, target: Player | Flag | Structure, dt: number): void {
    if (enemy.jumpTime > 0) return;
    if (enemy.cooldown > 0) return;
    enemy.attackWindup += dt
      * 3.4
      * this.getChallengeModifiers().enemyAttackSpeedMultiplier;
    if (enemy.attackWindup < 1) return;
    enemy.attackWindup = 0;
    enemy.cooldown = enemy.attackRate;
    const isStructure = "kind" in target && "tier" in target;
    const rawDamage = isStructure ? enemy.structureDamage : enemy.damage;
    const damage = target === this.player ? this.mitigateIncomingDamage(rawDamage) : rawDamage;
    const playerWasFull = target === this.player && this.player.health >= this.player.maxHealth;
    target.health -= damage;
    if (enemy.kind === "breaker") {
      emitAudioCue({ cue: "breaker-smash", position: { x: enemy.x, y: enemy.y } });
    } else {
      emitAudioCue({ cue: "zombie-attack", position: { x: enemy.x, y: enemy.y } });
    }
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
    if (isStructure && target.kind === "spikes") {
      const index = BALANCE.tierIndex[target.tier];
      this.damageEnemy(
        enemy,
        BALANCE.structure.spikeRetaliation[index] ?? 4,
        "#e5e5e5",
        "spikes",
        target.ownerId ?? this.player.id,
      );
    }
    this.shake = Math.max(this.shake, enemy.kind === "boss" ? 10 : 3);
    this.burst(target.x, target.y, "#ff695f", enemy.kind === "boss" ? 14 : 6, `-${Math.round(damage)}`);
  }

  private moveEnemyToward(enemy: Enemy, target: { x: number; y: number }, dt: number): void {
    const routeInvalidated = enemy.routeIncludesStructures
      && enemy.routeStructureRevision !== this.structureRevision;
    if ((enemy.pathCooldown <= 0 && enemy.routeCommitment <= 0) || routeInvalidated) {
      enemy.pathCooldown = enemy.kind === "runner"
        ? BALANCE.navigation.runnerRepathInterval
        : BALANCE.navigation.repathIntervalMin + this.rng.range(0, BALANCE.navigation.repathIntervalJitter);
      enemy.routeIncludesStructures = false;
      enemy.routeStructureRevision = this.structureRevision;
      if (enemy.kind === "runner") {
        const naturalObstacles = this.world.resources.filter((node) => !node.destroyed);
        const gapRoute = new NavigationGrid([...naturalObstacles, ...this.structures], enemy.radius).find(enemy, target);
        const directDistance = Math.max(1, distance(enemy, target));
        const routeDistance = this.pathLength(enemy, gapRoute);
        if (
          gapRoute.length > 0
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
        const naturalObstacles = enemy.kind === "boss"
          ? []
          : this.world.resources.filter((node) => !node.destroyed);
        navigation = new NavigationGrid(naturalObstacles, radiusKey);
        this.navigationFields.set(radiusKey, navigation);
      }
      enemy.path = navigation.find(enemy, target);
      enemy.pathIndex = 0;
      }
    }
    const waypoint = enemy.path[enemy.pathIndex] ?? target;
    if (distance(enemy, waypoint) < 34 && enemy.pathIndex < enemy.path.length - 1) enemy.pathIndex += 1;
    const active = enemy.path[enemy.pathIndex] ?? target;
    const angle = Math.atan2(active.y - enemy.y, active.x - enemy.x);
    const sunlightMultiplier = enemy.burning && this.phase === "day" ? BALANCE.sunlight.movementMultiplier : 1;
    const speed = enemy.speed * sunlightMultiplier * (enemy.attackWindup > 0 ? 0.2 : 1);
    const beforeX = enemy.x;
    const beforeY = enemy.y;
    enemy.x += Math.cos(angle) * speed * dt;
    enemy.y += Math.sin(angle) * speed * dt;
    this.resolveResourceCollision(enemy);
    const moved = Math.hypot(enemy.x - beforeX, enemy.y - beforeY);
    if (moved < speed * dt * 0.18) enemy.stuckTime += dt;
    else enemy.stuckTime = Math.max(0, enemy.stuckTime - dt * 2);
    if (enemy.stuckTime >= BALANCE.navigation.stuckRepathTime) {
      enemy.stuckTime = 0;
      enemy.pathCooldown = 0;
      enemy.path = [];
      enemy.pathIndex = 0;
    }
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
    if (enemy.kind === "boss") return;
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

  private updateSummoner(enemy: Enemy, dt: number): void {
    enemy.summonCooldown -= dt * this.getChallengeModifiers().enemyAttackSpeedMultiplier;
    if (enemy.summonCooldown > 0) return;
    const living = this.enemies.filter((item) => item.summonedBy === enemy.id && item.health > 0).length;
    if (living >= 3) {
      enemy.summonCooldown = 2;
      return;
    }
    enemy.summonCooldown = 8;
    this.spawnEnemy(enemy, "basic", enemy.id);
    emitAudioCue({ cue: "summoner-cast", position: { x: enemy.x, y: enemy.y } });
    this.burst(enemy.x, enemy.y, "#9d6bff", 14, "SUMMON");
  }

  private updateBoss(enemy: Enemy, dt: number): void {
    if (!this.flagPresent) return;
    enemy.targetId = "flag";
    const attackSpeed = this.getChallengeModifiers().enemyAttackSpeedMultiplier;
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
      for (let i = 0; i < 5; i += 1) this.spawnEnemy(enemy, "basic", enemy.id);
      this.burst(enemy.x, enemy.y, "#ff5c52", 28, "THE HORDE RISES");
      this.shake = 14;
    }
    enemy.summonCooldown -= dt * attackSpeed;
    if (enemy.summonCooldown <= 0 && distance(enemy, this.flag) < 210) {
      enemy.bossSmashWindup += dt * attackSpeed;
    } else if (enemy.bossSmashWindup > 0) {
      enemy.bossSmashWindup = Math.max(0, enemy.bossSmashWindup - dt * 0.5);
    }
    if (enemy.bossSmashWindup >= 1.25) {
      enemy.bossSmashWindup = 0;
      enemy.summonCooldown = 5.5;
      for (const structure of this.structures) {
        if (distance(enemy, structure) < 175
          && segmentCircle(enemy.x, enemy.y, this.flag.x, this.flag.y, {
            ...structure,
            radius: structure.radius + enemy.radius * BALANCE.boss.obstaclePathWidth,
          })) {
          structure.health -= enemy.structureDamage * 0.8;
          structure.flash = 0.3;
          emitAudioCue({ cue: "structure-damaged", position: { x: structure.x, y: structure.y } });
        }
      }
      this.burst(enemy.x, enemy.y, "#ff6b55", 24, "SMASH");
      this.shake = 14;
    }
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
        * this.getChallengeModifiers().enemyDamageMultiplier,
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
          const damage = this.mitigateIncomingDamage(projectile.damage);
          this.player.health -= damage;
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
          structure.health -= projectile.damage;
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
    const wasAlive = enemy.health > 0;
    enemy.lastDamageSource = source;
    enemy.lastHitByPlayerId = ownerPlayerId;
    enemy.health -= amount;
    enemy.flash = 0.18;
    // No hurt sound, too distracting, not necessary
    //emitAudioCue({ cue: "zombie-hurt", position: { x: enemy.x, y: enemy.y } });
    this.burst(enemy.x, enemy.y, color, 6, `-${Math.round(amount)}`);
    if (enemy.health <= 0) {
      if (wasAlive) {
        emitAudioCue({
          cue: enemy.kind === "boss" ? "boss-death" : "zombie-death",
          position: { x: enemy.x, y: enemy.y },
        });
      }
      if (!enemy.deathCounted) {
        this.stats.zombiesDefeated += 1;
        enemy.deathCounted = true;
        if (ownerPlayerId === this.player.id
          && (source === "player-melee" || source === "player-bow")) {
          this.directPlayerKills[enemy.kind] += 1;
        }
      }
      this.burst(enemy.x, enemy.y, "#8fc75d", enemy.kind === "boss" ? 40 : 14, enemy.kind === "boss" ? "BOSS DOWN" : undefined);
      if (enemy.kind === "boss" && this.timer <= 0) this.completeBossNight();
    }
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
    for (const node of this.world.resources) node.hitFlash = Math.max(0, node.hitFlash - dt);
  }

  private updateHealing(dt: number): void {
    const disabled = this.getChallengeModifiers().disablesPlayerHealing;
    const canHeal = this.flagPresent
      && !disabled
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
    this.phaseElapsed = 0;
    this.timer = BALANCE.nightDuration;
    this.phaseTransitionImpact = 0.55;
    this.selectedSlot = 2;
    this.nightWaveScheduled = true;
    for (const enemy of this.enemies) enemy.burning = false;
    const difficulty = BALANCE.difficulty[this.difficulty];
    const challengeModifiers = this.getChallengeModifiers();
    this.recalculateStructureScore();
    this.adaptiveState = adaptiveDifficulty(this.structureScore, this.night);
    const total = Math.round(
      (BALANCE.waveBase + (this.night - 1) * BALANCE.waveGrowth + this.mutations.waveSize)
        * difficulty.spawnCount
        * this.adaptiveState.multiplier
        * challengeModifiers.ordinaryZombieCountMultiplier,
    );
    const perPortal = Math.floor(total / this.portals.length);
    let remainder = total % this.portals.length;
    for (const portal of this.portals) {
      portal.assignedSpawns = perPortal + (remainder-- > 0 ? 1 : 0);
      portal.spawned = 0;
      portal.spawnCooldown = 0.2 + this.rng.range(0, 0.6);
    }
    if (this.isBossNight()) {
      const portal = this.rng.pick(this.portals);
      this.spawnEnemy(portal, "boss");
      emitAudioCue({ cue: "portal-spawn", position: { x: portal.x, y: portal.y } });
      this.notify("BOSS INCOMING", true);
      emitAudioCue({ cue: "boss-roar", position: { x: portal.x, y: portal.y }, delayMs: 90 });
    } else {
      this.notify(`Night ${this.night} has begun`);
    }
    emitAudioCue({ cue: "night-start" });
    this.syncSpatialAudio(true);
    this.markUi(true);
  }

  private beginDawn(): void {
    this.phase = "dawn";
    this.syncSpatialAudio(false);
    this.nightWaveScheduled = false;
    this.phaseElapsed = 0;
    this.phaseTransitionImpact = 0.55;
    this.stats.nightsSurvived = this.night;
    this.platform?.reportProgress(Math.min(90, this.night * 10));
    if (
      !this.hasChallenge("permanent-player-damage")
      && !this.getChallengeModifiers().disablesDawnPlayerHealing
    ) {
      this.player.health = this.player.maxHealth;
    }
    for (const node of this.world.resources) if (!node.destroyed) node.health = node.maxHealth;
    this.dawnScreen = 0;
    this.dawnPicked = new Set();
    this.choices = generateChoiceOfferings(
      this.seed,
      this.night,
      0,
      this.unlocks,
      this.upgrades,
      this.mutations,
      this.dawnPicked,
      0,
      this.disabledDawnBenefits(),
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
    this.selectedSlot = 1;
    this.spawnPortals();
    this.igniteOrdinaryZombies();
    this.notify(`Day ${this.night}: build before the count reaches zero`);
    this.syncSpatialAudio(true);
    this.markUi(true);
  }

  private igniteOrdinaryZombies(): void {
    for (const enemy of this.enemies) {
      if (enemy.kind === "boss" || enemy.burning) continue;
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
      permanent: this.getPermanentPercent("structureHealth", ownerId)
        + (kind === "wall" ? this.getPermanentPercent("wallHealth", ownerId) : 0),
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

  private burst(x: number, y: number, color: string, count: number, text?: string): void {
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
      this.particles.push({ x, y: y - 24, vx: 0, vy: -38, life: 0.9, maxLife: 0.9, radius: 0, color, text });
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
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -34,
      life: 1.1,
      maxLife: 1.1,
      radius: 0,
      color: BALANCE.tierColors[resource],
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
    this.phase = victory ? "victory" : "defeat";
    this.syncSpatialAudio(false);
    if (!victory && reason === "You fell to the horde.") {
      emitAudioCue({ cue: "player-death", position: { x: this.player.x, y: this.player.y } });
    }
    this.defeatReason = reason;
    if (victory) this.stats.nightsSurvived = 10;
    this.recalculateStructureScore();
    if (this.runSettlementId && this.profileManager) {
      const xp = calculateXpRewards({
        survivingStructurePoints: this.structureScore,
        directPlayerKills: this.directPlayerKills,
        remainingResources: this.resources,
        nightsSurvived: this.stats.nightsSurvived,
        victory,
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
        },
      );
    }
    const record: RunRecord = {
      ...this.stats,
      seed: this.seed,
      difficulty: this.difficulty,
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
    return ACTIONS[this.selectedSlot - 1] ?? "fists";
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
    if (this.phase !== "night") return null;
    const item = this.profileManager?.profile.equipment.sword;
    return swordStats(item?.tier ?? null, item?.equipped ?? false);
  }

  isSwordActive(): boolean {
    return Boolean(
      this.getEquippedSword()
      && this.getSelectedAction() === "fists"
      && this.player.cooldown > 0,
    );
  }

  getCapacity(kind: "turret" | "harvester"): { current: number; maximum: number } {
    return {
      current: this.structures.filter((structure) => structure.kind === kind && structure.health > 0).length,
      maximum: BALANCE.structure.startingCapacity[kind] + this.upgrades[`${kind}Capacity`],
    };
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
      .filter((structure) => structure.health > 0)
      .reduce((total, structure) => total + structurePointValue(structure.kind, structure.tier), 0);
  }

  getAdaptiveThreat(): AdaptiveDifficulty {
    return this.phase === "day" ? adaptiveDifficulty(this.structureScore, this.night) : this.adaptiveState;
  }

  private isCapacityReached(kind: StructureKind): boolean {
    if (kind !== "turret" && kind !== "harvester") return false;
    const capacity = this.getCapacity(kind);
    return capacity.current >= capacity.maximum;
  }

  private completeBossNight(): void {
    if (this.phase !== "night") return;
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
