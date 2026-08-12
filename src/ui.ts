import { BALANCE, RESOURCE_ORDER, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { BUILD_ACTION_BAR, COMBAT_ACTION_BAR, type ActionBarAction } from "./action-bar";
import { generateSeed } from "./rng";
import type { Game } from "./game";
import { canAfford } from "./rules";
import { browserStorage } from "./storage";
import { buildBarIcon, costIcons, gameSymbol, icon, resourceIcon } from "./ui-icons";
import { CARD_DEFINITIONS, TUTORIAL_SECTIONS } from "./content";
import { CHALLENGES, challengeXpBonusPercent, resolveChallengeModifiers } from "./challenges";
import { challengeIcon } from "./challenge-icons";
import { audioManager, type AudioVolumeChannel } from "./audio";
import { ASSETS } from "./assets";
import { ENEMY_REGISTRY } from "./enemy-registry";
import type { ActionKind, CampaignTierId, Choice, Difficulty, EnemyKind, StructureKind, Tier, Upgrades } from "./types";
import {
  CAMPAIGN_TIERS,
  campaignTier,
  campaignUnlockRequirementText,
  highestUnlockedCampaignTierId,
  isCampaignTierUnlocked,
  type CampaignReward,
} from "./campaign";
import {
  EQUIPMENT_ORDER,
  EQUIPMENT_TIER_ORDER,
  META_BALANCE,
  PERMANENT_UPGRADES,
  permanentUpgradeCost,
  permanentUpgradePercent,
  type EquipmentKind,
  type EyeStyle,
  type PermanentUpgradeId,
} from "./meta-balance";
import {
  effectiveEquipmentStats,
  equipmentStatDefinitions,
  equipmentUpgradePrice,
  nextEquipmentTier,
  type EquipmentState,
  type EquipmentStatDefinition,
} from "./equipment";
import {
  canAffordAnyEquipment,
  canAffordAnyPermanentUpgrade,
  levelProgress,
  type DailyRewardStatus,
} from "./profile";

const labels: Record<StructureKind, string> = {
  wall: "Wall",
  spikes: "Spikes",
  door: "Door",
  harvester: "Harvester",
  turret: "Turret",
};

function coinAmount(value: number, prefix = ""): string {
  const signedValue = `${prefix}${value}`;
  const spokenPrefix = prefix === "+" ? "plus " : prefix === "-" ? "minus " : "";
  return `<span class="coin-amount" aria-label="${spokenPrefix}${Math.abs(value)} Coins" title="Coins"><span aria-hidden="true">${signedValue}<em>¢</em></span></span>`;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const CLOCK_PROXIMITY_FADE_RADIUS = 96;
const CLOCK_MINIMUM_OPACITY = 0.14;

const UPGRADE_PERMANENT_IDS: Partial<Record<keyof Upgrades, PermanentUpgradeId>> = {
  bowDamage: "bowDamage",
  bowRate: "bowRate",
  punchDamage: "punchDamage",
  moveSpeed: "moveSpeed",
  harvestRate: "harvestRate",
  structureDurability: "structureHealth",
  turretDamage: "turretDamage",
  turretRate: "turretRate",
  turretRange: "turretRange",
  harvesterSpeed: "harvesterSpeed",
};

const UPGRADE_LABELS: Record<keyof Upgrades, string> = {
  moveSpeed: "movement speed",
  maxHealth: "max health",
  punchRate: "punch speed",
  punchDamage: "punch damage",
  bowRate: "bow speed",
  bowDamage: "bow damage",
  harvestRate: "harvest speed",
  repairEfficiency: "repair efficiency",
  structureDurability: "structure durability",
  costReduction: "structure cost reduction",
  turretDamage: "turret damage",
  turretRate: "turret speed",
  turretRange: "turret range",
  harvesterSpeed: "harvester speed",
  flagHealth: "flag health",
  turretCapacity: "turret capacity",
  harvesterCapacity: "harvester capacity",
};

const PERCENT_UPGRADE_IDS = new Set<keyof Upgrades>([
  "moveSpeed", "punchRate", "bowRate", "harvestRate", "repairEfficiency",
  "structureDurability", "costReduction", "turretDamage", "turretRate",
  "turretRange", "harvesterSpeed",
]);

const UPGRADE_BASE_VALUES: Partial<Record<keyof Upgrades, number>> = {
  maxHealth: BALANCE.player.maxHealth,
  punchDamage: BALANCE.player.punchDamage,
  bowDamage: BALANCE.bow.damage,
  flagHealth: BALANCE.flag.health,
  turretCapacity: BALANCE.structure.startingCapacity.turret,
  harvesterCapacity: BALANCE.structure.startingCapacity.harvester,
};

const enemyInfo = Object.fromEntries(Object.values(ENEMY_REGISTRY).map((entry) => [entry.id, {
  title: entry.displayName, text: entry.description, tell: entry.tell,
}])) as Record<EnemyKind, { title: string; text: string; tell: string }>;

type MenuPanel = "controls" | "settings" | "challenges" | "credits" | "profile" | "upgrades" | "shop" | null;
type TutorialOrigin = "menu";

export class Ui {
  private difficulty: Difficulty = "normal";
  private openTierPanel: StructureKind | null = null;
  private tutorialOpen = false;
  private tutorialExitConfirmation = false;
  private runExitConfirmation = false;
  private tutorialOrigin: TutorialOrigin = "menu";
  private menuPanel: MenuPanel = null;
  private lastOverlayKey = "";
  private hudStructureKey = "";
  private lastToastKey = "";
  private lastSelectedSlot = 1;
  private lastRenderAt = 0;
  private choiceAnimating = false;
  private lastClockSecond = -1;
  private seedDraft = "";
  private selectedChallenges = new Set<string>();
  private investmentOpen = false;
  private campaignOpen = false;
  private selectedCampaignTierId: CampaignTierId = "forest";
  private investmentDraft = 0;
  private profileColorDraft: string;
  private profileEyeDraft: EyeStyle;
  private dailyRewardVisible: boolean;

  constructor(
    private readonly game: Game,
    private readonly hud: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly toastLayer: HTMLElement,
    initialDailyReward: DailyRewardStatus = {
      available: false,
      day: 1,
      amount: 10,
      today: "",
      lastClaimDate: null,
      streak: 0,
      reset: false,
    },
  ) {
    this.profileColorDraft = game.profileManager?.profile.playerColor
      ?? META_BALANCE.customization.colors[0];
    this.profileEyeDraft = game.profileManager?.profile.eyeStyle ?? "round";
    this.dailyRewardVisible = initialDailyReward.available;
    overlay.addEventListener("click", (event) => this.handleOverlayClick(event));
    overlay.addEventListener("input", (event) => {
      const input = (event.target as HTMLElement).closest<HTMLInputElement>("#seed-input");
      if (input) this.seedDraft = input.value;
      const volume = (event.target as HTMLElement).closest<HTMLInputElement>("[data-audio-volume]");
      if (volume) {
        audioManager.setVolume(
          volume.dataset.audioVolume as AudioVolumeChannel,
          Number(volume.value) / 100,
        );
        const output = volume.parentElement?.querySelector<HTMLOutputElement>("output");
        if (output) output.value = `${volume.value}%`;
      }
      const investment = (event.target as HTMLElement).closest<HTMLInputElement>("[data-investment]");
      if (investment) {
        const minimum = Number(investment.min) || 0;
        const maximum = Number(investment.max) || 0;
        this.investmentDraft = Math.max(minimum, Math.min(maximum, Math.round(Number(investment.value))));
        investment.value = `${this.investmentDraft}`;
        investment.setAttribute("aria-valuenow", `${this.investmentDraft}`);
        const output = investment.parentElement?.querySelector<HTMLOutputElement>("output");
        if (output) output.innerHTML = coinAmount(this.investmentDraft);
        this.patchInvestmentPreview();
      }
    });
    hud.addEventListener("click", (event) => this.handleHudClick(event));
    for (const layer of [overlay, hud]) {
      layer.addEventListener("pointerover", (event) => {
        const interactive = (event.target as HTMLElement)
          .closest<HTMLElement>("button:not(:disabled),input:not(:disabled)");
        if (!interactive) return;
        const previous = event.relatedTarget as Node | null;
        if (previous && interactive.contains(previous)) return;
        audioManager.play("ui-hover");
      }, { capture: true });
      layer.addEventListener("pointerdown", (event) => {
        if ((event.target as HTMLElement).closest("button:disabled,[aria-disabled='true']")) {
          audioManager.play("ui-invalid");
        }
        if ((event.target as HTMLElement).closest("button,input")) {
          event.stopPropagation();
          this.game.input.releasePointer();
        }
      }, { capture: true });
    }
    window.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  render(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastRenderAt < 70) return;
    this.lastRenderAt = now;
    this.syncKeyboardSelection();
    this.renderOverlay(force);
    this.renderHud(force);
    this.renderToast();
  }

  private syncKeyboardSelection(): void {
    if (this.game.selectedSlot === this.lastSelectedSlot) return;
    this.lastSelectedSlot = this.game.selectedSlot;
    const action = this.game.getSelectedAction();
    const structure = this.asStructure(action);
    this.openTierPanel = structure;
    this.hudStructureKey = "";
  }

  private renderOverlay(force: boolean): void {
    if (this.choiceAnimating) return;
    const key = this.overlayKey();
    if (!force && key === this.lastOverlayKey) return;
    this.lastOverlayKey = key;
    if (this.tutorialOpen) this.overlay.innerHTML = this.tutorialMarkup();
    else if (this.game.skipNightConfirmation) this.overlay.innerHTML = this.skipNightMarkup();
    else if (this.investmentOpen) this.overlay.innerHTML = this.investmentMarkup();
    else if (this.game.phase === "menu") this.overlay.innerHTML = this.menuMarkup();
    else if (this.game.phase === "paused") {
      this.overlay.innerHTML = this.runExitConfirmation
        ? this.runExitConfirmationMarkup()
        : this.pauseMarkup();
    }
    else if (this.game.phase === "dawn") this.overlay.innerHTML = this.dawnMarkup();
    else if (this.game.phase === "victory" || this.game.phase === "defeat") this.overlay.innerHTML = this.resultMarkup();
    else this.overlay.innerHTML = "";
    this.decorateMenuPanel();
    this.syncCampaignLadderScroll();
    if (this.tutorialOpen && !this.tutorialExitConfirmation) {
      this.overlay.querySelector<HTMLElement>(".tutorial-guide-card")?.focus();
    } else if (this.dailyRewardVisible && this.game.phase === "menu") {
      this.focusDialog(".daily-rewards-modal");
    } else if (this.campaignOpen && this.game.phase === "menu") {
      this.focusDialog(".campaign-ladder-modal");
    } else if (this.game.phase === "paused" && !this.runExitConfirmation) {
      this.focusDialog(".pause-card");
    } else if (this.game.enemyWarning) {
      this.focusDialog(".warning-card");
    } else if (this.game.phase === "dawn") {
      this.overlay.querySelector<HTMLElement>(".dawn-panel")?.focus();
    } else if (this.game.phase === "victory" || this.game.phase === "defeat") {
      this.overlay.querySelector<HTMLElement>(".result-card")?.focus();
    }
  }

  private syncCampaignLadderScroll(): void {
    if (!this.campaignOpen) return;
    const viewport = this.overlay.querySelector<HTMLElement>(".campaign-ladder-viewport");
    const selected = this.overlay.querySelector<HTMLElement>(".campaign-tier-node.selected");
    if (!viewport || !selected) return;
    const selectedTop = selected.offsetTop;
    const selectedBottom = selectedTop + selected.offsetHeight;
    if (selectedTop < viewport.scrollTop) viewport.scrollTop = Math.max(0, selectedTop - 8);
    else if (selectedBottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = Math.max(0, selectedBottom - viewport.clientHeight + 8);
    }
  }

  private overlayKey(): string {
    return [
      this.game.phase,
      this.difficulty,
      this.tutorialOpen,
      this.tutorialExitConfirmation,
      this.runExitConfirmation,
      this.game.tutorialSection,
      this.game.tutorialTask,
      this.game.tutorialSectionComplete,
      this.tutorialOrigin,
      this.menuPanel,
      this.game.dawnScreen,
      this.game.enemyWarning,
      this.game.choices.map((choice) => `${choice.id}:${choice.mutationId}`).join(","),
      this.choiceAnimating,
      this.game.rerollConfirmation,
      this.game.rerollsUsed,
      this.game.skipNightConfirmation,
      this.investmentOpen,
      this.campaignOpen,
      this.selectedCampaignTierId,
      this.investmentDraft,
      this.dailyRewardVisible,
      this.game.profileManager
        ? JSON.stringify(this.game.profileManager.profile)
        : "",
      this.game.platform?.user?.id ?? "guest",
    ].join("|");
  }

  private decorateMenuPanel(): void {
    if (!this.menuPanel) return;
    const dialog = this.overlay.querySelector<HTMLElement>(".menu-modal");
    if (!dialog) return;
    const title = dialog.querySelector<HTMLElement>("h2");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    if (title) {
      title.id = "menu-panel-title";
      dialog.setAttribute("aria-labelledby", title.id);
    }
  }

  private menuMarkup(): string {
    const recent = this.game.records[0];
    const challengeModifiers = resolveChallengeModifiers(this.selectedChallenges);
    const daySeconds = Math.round(BALANCE.dayDuration * challengeModifiers.dayDurationMultiplier);
    const challengeBonus = challengeXpBonusPercent(this.selectedChallenges);
    const profile = this.game.profileManager?.profile;
    const upgradeAvailable = profile ? canAffordAnyPermanentUpgrade(profile) : false;
    const equipmentAvailable = profile ? canAffordAnyEquipment(profile) : false;
    return `
      <section class="screen menu-screen">
        ${this.profileChipMarkup()}
        <nav class="meta-actions" aria-label="Progression and equipment">
          <button class="progression-action" data-action="upgrades" aria-label="Upgrades. Spend XP${upgradeAvailable ? ". Upgrade available" : ""}"><img src="${ASSETS.ui["upgrade-node"]}" alt="" aria-hidden="true"><span><b>Upgrades</b><small>Spend XP</small></span>${this.purchaseBadgeMarkup(upgradeAvailable)}</button>
          <button data-action="shop" aria-label="Shop. Manage gear${equipmentAvailable ? ". Purchase available" : ""}"><img src="${META_BALANCE.assets.equipment.sword.wood}" alt="" aria-hidden="true"><span><b>Shop</b><small>Manage gear</small></span>${this.purchaseBadgeMarkup(equipmentAvailable)}</button>
        </nav>
        <main class="menu-card">
          <h1>FLAG <span>FORT</span></h1>
          <p class="menu-copy">Build by day. Hold through ten nights.</p>
          <div class="difficulty-picker" role="group" aria-label="Difficulty">
            ${(["easy", "normal", "hard", "extreme"] as Difficulty[]).map((difficulty) => `
              <button class="difficulty ${this.difficulty === difficulty ? "selected" : ""}" data-difficulty="${difficulty}" aria-pressed="${this.difficulty === difficulty}">
                <strong>${BALANCE.difficulty[difficulty].label}</strong>
                <small class="difficulty-xp">${Math.round(BALANCE.difficulty[difficulty].xpMultiplier * 100)}% XP</small>
                <span class="tooltip">${this.difficultyText(difficulty)}</span>
              </button>`).join("")}
          </div>
          <div class="seed-row">
            <label class="seed-box"><span>SEED</span><input id="seed-input" maxlength="48" autocomplete="off" spellcheck="false" placeholder="Random seed" value="${this.escapeAttribute(this.seedDraft)}"></label>
            <button class="icon-button seed-random" data-action="random-seed" aria-label="Randomize seed">${icon("shuffle")}<span class="tooltip">Randomize seed</span></button>
          </div>
      <button class="primary start-button tutorial-start-button" data-action="tutorial-menu">${icon("book")}<span>Tutorial</span></button>
      <div class="play-mode-grid" aria-label="Play modes">
        <article class="play-mode-card campaign-mode-card">
          <img src="./images/campaign/campaign-mode.svg" alt="" aria-hidden="true">
          <div><small>PLAY MODE</small><h2>Single-Player Campaign</h2><p>Climb the XP ladder, unlock new biomes, and conquer a unique boss in every tier.</p></div>
          <button class="primary" data-action="open-campaign">${icon("play")} Play Campaign</button>
        </article>
        <article class="play-mode-card multiplayer-mode-card" aria-disabled="true">
          <span class="coming-soon-badge">COMING SOON!</span>
          <img src="./images/campaign/multiplayer-mode.svg" alt="" aria-hidden="true">
          <div><small>PLAY MODE</small><h2>Multiplayer</h2><p>Raise the standard alongside other defenders in a future update.</p></div>
          <button class="primary" disabled aria-disabled="true">${icon("play")} Play Multiplayer</button>
        </article>
      </div>
      <nav class="menu-actions" aria-label="Game options">
            <button data-action="controls">${icon("gamepad-2")}<span>Controls</span><span class="tooltip">Controls</span></button>
            <button data-action="challenges">${icon("trophy")}<span>Challenges${this.selectedChallenges.size ? ` (${this.selectedChallenges.size})` : ""}</span><span class="tooltip">Challenges</span></button>
            <button data-action="settings">${icon("sliders-horizontal")}<span>Settings</span><span class="tooltip">Settings</span></button>
            <button data-action="credits">${icon("info", "info-symbol")}<span>Credits</span></button>
            <button data-action="fullscreen">${icon("maximize")}<span>Fullscreen</span></button>
          </nav>
          <footer>
          <span>${daySeconds}s DAY · ${BALANCE.nightDuration}s NIGHT · 10 NIGHTS${this.selectedChallenges.size ? ` · ${this.selectedChallenges.size} CHALLENGES · +${challengeBonus}% VICTORY XP` : ""}</span>
            <span>v1.3.0</span>
          ${recent ? `<span class="last-run">${recent.victory ? "Victory" : "Defeat"} · ${recent.mode === "endless" ? `${recent.nightsSurvived} Endless nights` : `${recent.nightsSurvived}/10`}${recent.challengeIds?.length ? ` · ${recent.challengeIds.length} challenges` : ""}</span>` : ""}
          </footer>
        </main>
        ${this.dailyRewardSummaryMarkup()}
        ${this.dailyRewardVisible ? this.dailyRewardModalMarkup() : ""}
        ${this.campaignOpen ? this.campaignLadderMarkup() : ""}
        ${this.menuPanel ? this.menuPanelMarkup() : ""}
      </section>`;
  }

  private campaignProgress() {
    const profile = this.game.profileManager?.profile;
    return {
      level: profile?.playerLevel ?? 1,
      defeatedTierIds: profile?.campaign.defeatedTierIds ?? [],
    };
  }

  private rewardMarkup(reward: CampaignReward): string {
    if (reward.kind === "coins") return `${coinAmount(reward.amount)} Coins`;
    return reward.label;
  }

  private campaignLadderMarkup(): string {
    const progress = this.campaignProgress();
    const profile = this.game.profileManager?.profile;
    const claimed = new Set(profile?.campaign.claimedRewardIds ?? []);
    const selected = campaignTier(this.selectedCampaignTierId);
    const selectedUnlocked = isCampaignTierUnlocked(selected, progress);
    const tiers = [...CAMPAIGN_TIERS].reverse().map((tier) => {
      const unlocked = isCampaignTierUnlocked(tier, progress);
      const defeated = progress.defeatedTierIds.includes(tier.id);
      const active = tier.id === selected.id;
      const requirements = campaignUnlockRequirementText(tier, progress);
      return `<article class="campaign-tier-node ${unlocked ? "unlocked" : "locked"} ${defeated ? "defeated" : ""} ${active ? "selected" : ""}" style="--tier-accent:${tier.accent}">
        <button data-action="select-campaign-tier" data-campaign-tier="${tier.id}" aria-pressed="${active}" aria-label="${tier.name}${unlocked ? " unlocked" : " locked"}">
          <img class="tier-backdrop" src="${tier.backdrop}" alt="">
          <span class="tier-medallion"><img src="${tier.icon}" alt=""></span>
          <span class="tier-node-copy"><small>TIER ${tier.order + 1}</small><b>${tier.name}</b><em>${tier.subtitle}</em></span>
          <span class="tier-state">${defeated ? "CLEARED" : unlocked ? "READY" : `LEVEL ${tier.unlock.level}`}</span>
        </button>
        <div class="tier-details">
          <p>${tier.description}</p>
          <div class="tier-requirements">${requirements.map((requirement) => `<span class="${requirement.startsWith("Complete") ? "met" : "unmet"}">${requirement}</span>`).join("")}</div>
          <div class="tier-enemies"><strong>Tier threats</strong>${tier.specialEnemies.length
            ? tier.specialEnemies.map((kind) => `<span><img src="${ASSETS.enemies[kind]}" alt=""><b>${ENEMY_REGISTRY[kind].displayName}</b><small>Night ${ENEMY_REGISTRY[kind].introductionNight}</small></span>`).join("")
            : `<span><img src="${ASSETS.enemies.basic}" alt=""><b>Classic Horde</b><small>Base roster</small></span>`}
            <span class="boss"><img src="${ASSETS.enemies[tier.boss]}" alt=""><b>${ENEMY_REGISTRY[tier.boss].displayName}</b><small>Boss</small></span>
          </div>
          <div class="tier-milestones">${tier.milestones.map((milestone) => `<span class="${claimed.has(milestone.id) ? "claimed" : progress.level >= milestone.level ? "earned" : ""}"><small>LEVEL ${milestone.level}</small>${this.rewardMarkup(milestone.reward)}</span>`).join("")}</div>
        </div>
      </article>`;
    }).join("");
    return `<section class="screen modal-screen campaign-ladder-screen"><div class="campaign-ladder-modal" role="dialog" aria-modal="true" aria-labelledby="campaign-ladder-title">
      <header><div><p class="eyebrow">SINGLE-PLAYER CAMPAIGN</p><h2 id="campaign-ladder-title">Raise Your Standard</h2><p>Climb with XP, claim rewards, and clear each tier to unlock the next.</p></div><span class="campaign-level">LEVEL <b>${progress.level}</b></span><button class="icon-button" data-action="close-campaign" aria-label="Close">${icon("close")}</button></header>
      <div class="campaign-ladder-viewport"><div class="campaign-ladder-rail">${tiers}</div></div>
      <footer><div><small>SELECTED TIER</small><b>${selected.name}</b><span>${selectedUnlocked ? "Ready to defend" : "Complete every requirement to unlock"}</span></div>
        <button class="primary" data-action="start-campaign-tier" ${selectedUnlocked ? "" : "disabled"}>${icon("play")} ${selectedUnlocked ? `Play ${selected.name}` : "Tier Locked"}</button></footer>
    </div></section>`;
  }

  private profileChipMarkup(): string {
    const manager = this.game.profileManager;
    if (!manager) return "";
    const profile = manager.profile;
    const progress = levelProgress(profile.lifetimeXp);
    const user = this.game.platform?.user;
    const avatar = user?.profilePictureUrl
      ? `<img src="${this.escapeAttribute(user.profilePictureUrl)}" alt="">`
      : `<span class="guest-avatar" style="--player-color:${profile.playerColor};--body-asset:url('${META_BALANCE.assets.player.body}')">
          <i></i><img src="${META_BALANCE.assets.player.bodyDetails}" alt=""><img src="${META_BALANCE.assets.player.eyes[profile.eyeStyle]}" alt="">
        </span>`;
    return `<button class="profile-chip" data-action="profile" aria-label="Open player profile">
      ${avatar}
      <span class="profile-chip-copy"><b>${user?.username ?? "Guest Defender"}</b>
        <small>Level ${progress.level} · ${progress.current}/${progress.required} XP</small>
        <i style="--profile-xp:${progress.ratio * 100}%"></i>
      </span>
      <strong>${coinAmount(profile.coins)}</strong>
    </button>`;
  }

  private dailyRewardSummaryMarkup(): string {
    const manager = this.game.profileManager;
    if (!manager) return "";
    const status = manager.getDailyRewardStatus();
    const tiers = META_BALANCE.dailyRewards.coinsByDay.map((amount, index) => {
      const day = index + 1;
      const current = day === status.day;
      const claimed = !status.reset && day <= status.streak;
      const state = claimed ? current ? "claimed today" : "claimed" : current ? "current" : "upcoming";
      const classes = `${claimed ? "claimed " : ""}${current ? "current" : claimed ? "" : "upcoming"}`;
      return `<i class="${classes}" aria-label="Day ${day}: ${amount} Coins, ${state}">${claimed ? icon("daily-claimed") : `<b>${day}</b>`}</i>`;
    }).join("");
    return `<button class="daily-rewards-summary ${status.available ? "available" : ""}"
      data-action="open-daily" aria-label="Open Daily Rewards${status.available ? `. Day ${status.day} reward available` : ""}">
      <span class="daily-summary-heading">${icon("calendar")}<b>Daily Rewards</b><small>${status.available
        ? `Day ${status.day} ready · ${status.amount}¢`
        : `Day ${status.day} claimed · next Daily tomorrow`}</small></span>
      <span class="daily-summary-sequence">${tiers}</span>
      <strong>${status.available ? "CLAIM" : `${status.streak} DAY`}</strong>
    </button>`;
  }

  private dailyRewardModalMarkup(): string {
    const manager = this.game.profileManager;
    if (!manager) return "";
    const status = manager.getDailyRewardStatus();
    const tiers = META_BALANCE.dailyRewards.coinsByDay.map((amount, index) => {
      const day = index + 1;
      const current = day === status.day;
      const claimed = !status.reset && day <= status.streak;
      const state = claimed ? current ? "claimed today" : "claimed" : current ? "current" : "upcoming";
      const classes = `${claimed ? "claimed " : ""}${current ? "current" : claimed ? "" : "upcoming"}`;
      return `<li class="${classes}"><span>${claimed ? icon("daily-claimed") : `<b>${day}</b>`}</span>
        <small>DAY ${day}</small><strong>${amount}<em>¢</em></strong><i>${state}</i></li>`;
    }).join("");
    return `<div class="menu-modal daily-modal-shell"><div class="modal daily-rewards-modal" role="dialog" aria-modal="true" aria-labelledby="daily-reward-title">
      <button class="modal-close" data-action="dismiss-daily" aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">DAILY SUPPLIES</p><h2 id="daily-reward-title">Daily Rewards</h2>
      <p>Claim one Daily reward per calendar day. Miss a day and the next Daily returns to Day 1. Day 7 repeats while the Daily streak continues.</p>
      ${status.reset ? `<p class="daily-reset-note">${icon("restart")} A missed day reset Daily rewards to Day 1.</p>` : ""}
      <ol class="daily-tier-grid">${tiers}</ol>
      <p class="daily-boundary">${status.available
        ? `Day ${status.day} is ready now.`
        : "The next Daily reward becomes available tomorrow."}</p>
      <button class="primary wide" data-action="${status.available ? "claim-daily" : "dismiss-daily"}">
        ${status.available ? `Claim Day ${status.day} · ${coinAmount(status.amount)}` : "Done"}
      </button>
    </div></div>`;
  }

  private menuPanelMarkup(): string {
    if (this.menuPanel === "profile") return this.profileModalMarkup();
    if (this.menuPanel === "upgrades") return this.upgradesModalMarkup();
    if (this.menuPanel === "shop") return this.shopModalMarkup();
    if (this.menuPanel === "controls") {
      return `<div class="menu-modal"><div class="modal compact">
        <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
        <p class="eyebrow">CONTROLS</p><h2>Quick field guide</h2>
        <div class="control-list">
          <span><kbd>WASD</kbd><b>Move</b></span><span>${icon("mouse", "mouse-glyph")}<b>Aim and act</b></span>
          <span><kbd>1-8</kbd><b>Select action</b></span><span><kbd>ESC</kbd><b>Pause</b></span>
        </div>
        <button class="secondary wide" data-action="tutorial-menu">${icon("book")} Full tutorial</button>
      </div></div>`;
    }
    if (this.menuPanel === "settings") {
      return `<div class="menu-modal"><div class="modal compact">
        <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
        ${this.settingsMarkup()}
        <button class="secondary wide" data-action="tutorial-menu">${icon("book")} Show tutorial again</button>
      </div></div>`;
    }
    if (this.menuPanel === "challenges") {
      const bonus = challengeXpBonusPercent(this.selectedChallenges);
      const selectedChallenges = CHALLENGES.filter((challenge) => this.selectedChallenges.has(challenge.id));
      return `<div class="menu-modal"><div class="modal challenge-modal">
        <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
        <p class="eyebrow">OPTIONAL CHALLENGES</p><h2>Choose any combination</h2>
        <p>Every selected rule stacks independently and remains deterministic for the run seed.</p>
        <details class="challenge-summary"><summary>${selectedChallenges.length} selected · +${bonus}% campaign victory XP</summary>
          <p>${selectedChallenges.length ? selectedChallenges.map((challenge) => `${challenge.title} (+${challenge.xpBonusPercent}%)`).join(" · ") : "Select challenges to add their XP percentages together."}</p>
        </details>
        <div class="challenge-grid">${CHALLENGES.map((challenge) => {
          const selected = this.selectedChallenges.has(challenge.id);
          return `<label class="challenge-card ${selected ? "selected" : ""}">
            <input type="checkbox" data-challenge="${challenge.id}" ${selected ? "checked" : ""}
              aria-label="${challenge.title}">
            <span class="challenge-card-icon">${challengeIcon(challenge.icon)}</span>
            <span class="challenge-card-copy"><strong>${challenge.title}</strong><small>${challenge.description}</small><em>+${challenge.xpBonusPercent}% victory XP</em></span>
          </label>`;
        }).join("")}</div>
        <button class="primary wide" data-action="close-panel">Done</button>
      </div></div>`;
    }
    return `<div class="menu-modal"><div class="modal compact">
      <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">CREDITS</p><h2>Made from shapes</h2>
      <p>Game design, code, and editable SVG artwork are original.</p>
      <p>Generic interface icons use Lucide Icons under the ISC License.</p>
      <p>Sound effects include CC0 audio by Kenney and royalty-free selections from the Sonniss GDC Game Audio Bundle Part 9.</p>
      <p>No generative-AI audio is used. Full source paths, packs, licenses, and modifications are recorded in the bundled audio attribution manifest.</p>
      </div></div>`;
  }

  private profileModalMarkup(): string {
    const manager = this.game.profileManager;
    if (!manager) return "";
    const profile = manager.profile;
    const progress = levelProgress(profile.lifetimeXp);
    const user = this.game.platform?.user;
    const helmet = profile.equipment.helmet;
    const upgradeLevels = PERMANENT_UPGRADES.reduce(
      (total, upgrade) => total + profile.permanentUpgrades[upgrade.id],
      0,
    );
    const upgradeMaximum = PERMANENT_UPGRADES.length
      * META_BALANCE.permanentUpgrade.maximumLevel;
    const equipmentLevels = EQUIPMENT_ORDER.reduce((total, kind) => {
      const tier = profile.equipment[kind].tier;
      return total + (tier ? EQUIPMENT_TIER_ORDER.indexOf(tier) + 1 : 0);
    }, 0);
    const equipmentMaximum = EQUIPMENT_ORDER.length * EQUIPMENT_TIER_ORDER.length;
    return `<div class="menu-modal"><div class="modal profile-modal">
      <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
      <header><p class="eyebrow">DEFENDER PROFILE</p><h2>${user?.username ?? "Guest Defender"}</h2>
        <p>${user ? "CrazyGames progress is synced through your account." : "Guest progress is saved through CrazyGames Data."}</p>
      </header>
      <div class="profile-layout">
        <section class="character-workbench">
          <div class="character-preview" style="--player-color:${this.profileColorDraft};--body-asset:url('${META_BALANCE.assets.player.body}')">
            <i class="preview-body"></i>
            <img class="preview-details" src="${META_BALANCE.assets.player.bodyDetails}" alt="">
            <img class="preview-eyes" src="${META_BALANCE.assets.player.eyes[this.profileEyeDraft]}" alt="">
            ${helmet.equipped && helmet.tier ? `<img class="preview-helmet" src="${META_BALANCE.assets.equipment.helmet[helmet.tier]}" alt="">` : ""}
          </div>
          <div class="customization-group"><b>Player color</b><div class="swatch-row">
            ${META_BALANCE.customization.colors.map((color) => `<button data-action="pick-color" data-color="${color}"
              class="${color === this.profileColorDraft ? "selected" : ""}" style="--swatch:${color}" aria-label="Use ${color}"></button>`).join("")}
          </div></div>
          <div class="customization-group"><b>Eye style</b><div class="eye-style-row">
            ${META_BALANCE.customization.eyeStyles.map((style) => `<button data-action="pick-eyes" data-eye-style="${style}"
              class="${style === this.profileEyeDraft ? "selected" : ""}"><img src="${META_BALANCE.assets.player.eyes[style]}" alt=""><span>${style}</span></button>`).join("")}
          </div></div>
          <button class="primary wide" data-action="save-customization">Save appearance</button>
        </section>
        <section class="profile-ledger">
          <div class="profile-level-banner">
            <span class="level-medallion"><small>LEVEL</small><strong>${progress.level}</strong></span>
            <span class="level-journey"><b>${progress.current} / ${progress.required} XP</b><small>to next level</small>
              <i class="profile-progress-track"><em style="--profile-xp:${progress.ratio * 100}%"></em></i>
            </span>
          </div>
          <div class="profile-currencies">
            <span>${icon("trophy")}<b>${profile.lifetimeXp}</b><small>Lifetime XP</small></span>
            <span class="progression-currency">${icon("upgrade-node")}<b>${profile.spendableXp}</b><small>Spendable XP</small></span>
            <span>${coinAmount(profile.coins)}<small>Balance</small></span>
          </div>
          <div class="profile-progression">
            <article><header><span>${icon("upgrade-node")} Permanent upgrades</span><b>${upgradeLevels}/${upgradeMaximum}</b></header>
              <i><em style="--progress:${upgradeMaximum ? upgradeLevels / upgradeMaximum * 100 : 0}%"></em></i>
              <small>${Math.round(upgradeLevels / Math.max(1, upgradeMaximum) * 100)}% of upgrade levels owned</small>
            </article>
            <article><header><span>${icon("settings")} Equipment collection</span><b>${equipmentLevels}/${equipmentMaximum}</b></header>
              <i><em style="--progress:${equipmentMaximum ? equipmentLevels / equipmentMaximum * 100 : 0}%"></em></i>
              <small>${EQUIPMENT_ORDER.filter((kind) => profile.equipment[kind].tier).length} of ${EQUIPMENT_ORDER.length} equipment types unlocked</small>
            </article>
          </div>
          <div class="profile-stat-grid">
            <span>${icon("timer")}<b>${profile.progress.totalNightsSurvived}</b><small>Total nights survived</small></span>
            <span>${icon("trophy")}<b>${profile.progress.campaignWins}</b><small>Campaign victories</small></span>
            <span>${icon("restart")}<b>${profile.progress.totalRuns}</b><small>Settled runs</small></span>
          </div>
          ${!user && this.game.platform?.userAccountAvailable
            ? `<button class="secondary wide" data-action="crazygames-login">Sign in with CrazyGames</button>`
            : ""}
          <small class="profile-save-note">Lifetime XP determines level. Spending XP never lowers it.</small>
        </section>
      </div>
    </div></div>`;
  }

  private upgradesModalMarkup(): string {
    const profile = this.game.profileManager?.profile;
    if (!profile) return "";
    const themes = [...new Set(PERMANENT_UPGRADES.map((upgrade) => upgrade.theme))];
    return `<div class="menu-modal"><div class="modal progression-modal">
      <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
      <header><p class="eyebrow">PERMANENT UPGRADES</p><h2>Build the defender</h2>
        <p>Permanent bonuses modify run bases first. Temporary cards add their normal benefits afterward.</p>
        <strong class="currency-pill">${profile.spendableXp} XP available</strong>
      </header>
      <div class="upgrade-tree">${themes.map((theme) => `<section class="upgrade-theme">
        <h3>${theme}</h3>
        ${PERMANENT_UPGRADES.filter((upgrade) => upgrade.theme === theme).map((upgrade) => {
          const level = profile.permanentUpgrades[upgrade.id];
          return `<div class="upgrade-row">
            <span class="upgrade-label"><img src="${upgrade.icon}" alt=""><span><b>${upgrade.title}</b><small>${upgrade.description}</small></span></span>
            <div class="upgrade-path" role="group" aria-label="${upgrade.title} levels">
              <span class="upgrade-base"><img src="${ASSETS.ui["upgrade-node"]}" alt=""><em>BASE</em></span>
              ${Array.from({ length: META_BALANCE.permanentUpgrade.maximumLevel }, (_, index) => {
                const nodeLevel = index + 1;
                const purchased = nodeLevel <= level;
                const next = nodeLevel === level + 1;
                const cost = permanentUpgradeCost(nodeLevel);
                return `<button data-action="buy-upgrade" data-upgrade="${upgrade.id}" data-level="${nodeLevel}"
                  class="${purchased ? "purchased" : next ? "available" : "locked"}"
                  ${next && profile.spendableXp >= cost ? "" : "disabled"}
                  aria-label="${upgrade.title} level ${nodeLevel}">
                  <b>+${nodeLevel * 10}%</b><small>${purchased ? "OWNED" : `${cost} XP`}</small>
                </button>`;
              }).join("")}
            </div>
          </div>`;
        }).join("")}
      </section>`).join("")}</div>
    </div></div>`;
  }

  private purchaseBadgeMarkup(available: boolean): string {
    return available
      ? '<i class="purchase-badge" aria-hidden="true">!</i>'
      : "";
  }

  private equipmentEffectMarkup(kind: EquipmentKind, item: EquipmentState): string {
    const stats = equipmentStatDefinitions(kind);
    const meleeBonus = kind === "sword"
      ? permanentUpgradePercent(this.game.profileManager?.profile.permanentUpgrades.punchDamage ?? 0)
      : 0;
    const effective = effectiveEquipmentStats(kind, item.tier, item.equipped, meleeBonus);
    const currentTier = item.tier && item.equipped ? item.tier : null;
    const currentLabel = currentTier ? `${currentTier} equipped` : "unequipped base";
    const currentStats = stats.map((stat) => `
      <span><small>${stat.label}</small><b>${this.formatEquipmentValue(effective[stat.id] ?? stat.unequipped, stat)}</b></span>`).join("");
    const baseStatus = currentTier ? "UNEQUIPPED BASE" : "CURRENT · UNEQUIPPED BASE";
    const base = this.equipmentTierStatMarkup("Base", baseStatus, stats, null);
    const ownedIndex = item.tier ? EQUIPMENT_TIER_ORDER.indexOf(item.tier) : -1;
    const next = nextEquipmentTier(item.tier);
    const tiers = EQUIPMENT_TIER_ORDER.map((tier, index) => {
      const status = tier === currentTier
        ? "CURRENT · EQUIPPED"
        : index <= ownedIndex
          ? "OWNED"
          : tier === next
            ? "NEXT"
            : "LOCKED";
      return this.equipmentTierStatMarkup(tier, status, stats, tier);
    }).join("");
    const permanentNote = kind === "sword" && meleeBonus > 0
      ? `<small class="equipment-effect-note">Current damage includes the owned +${Math.round(meleeBonus * 100)}% permanent melee bonus.</small>`
      : "";
    return `<section class="equipment-effect" aria-label="${currentLabel} equipment statistics">
      <header><span>CONFIGURED STATS</span><strong>Current: ${currentLabel}</strong></header>
      <div class="equipment-current-stats"><em>CURRENT EFFECTIVE</em>${currentStats}</div>
      <div class="equipment-tier-stats">${base}${tiers}</div>
      ${permanentNote}
    </section>`;
  }

  private equipmentTierStatMarkup(
    label: string,
    status: string,
    stats: readonly EquipmentStatDefinition[],
    tier: Tier | null,
  ): string {
    const values = stats.map((stat) => {
      const value = tier ? stat.tiers[tier] : stat.unequipped;
      return `<span><small>${stat.label}</small><b>${this.formatEquipmentValue(value, stat)}</b></span>`;
    }).join("");
    return `<div class="equipment-tier-stat" data-tier-state="${status.toLowerCase().replaceAll(" · ", "-")}">
      <header><strong>${label}</strong><em>${status}</em></header><div>${values}</div>
    </div>`;
  }

  private formatEquipmentValue(value: number, stat: EquipmentStatDefinition): string {
    const compact = (number: number): string => `${Number(number.toFixed(2))}`;
    if (stat.unit === "percent") return `${compact(value * 100)}%`;
    if (stat.unit === "damage") return compact(value);
    if (stat.unit === "seconds") return `${compact(value)}s`;
    if (stat.unit === "pixels") return `${compact(value)} px`;
    if (stat.unit === "radians") return `${compact(value)} rad`;
    return compact(value);
  }

  private shopModalMarkup(): string {
    const profile = this.game.profileManager?.profile;
    if (!profile) return "";
    const copy: Record<EquipmentKind, { title: string; text: string }> = {
      helmet: { title: "Helmet", text: "Reduces player damage." },
      wrench: { title: "Lucky Wrench", text: "Grants a chance for a structure repair to be free." },
      sword: { title: "Sword", text: "Replaces fists during nighttime with a sweeping cleave." },
      mallet: { title: "Salvage Mallet", text: "Increases return from recycling owned structures." },
    };
    return `<div class="menu-modal"><div class="modal shop-modal">
      <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
      <header><p class="eyebrow">FORT SUPPLY SHOP</p><h2>Equipment workshop</h2>
        <p>Unlock Wood, then improve the same item through Stone, Gold, and Diamond.</p>
        <strong class="currency-pill coin">${coinAmount(profile.coins)}</strong>
      </header>
      <div class="shop-grid">${EQUIPMENT_ORDER.map((kind) => {
        const item = profile.equipment[kind];
        const next = nextEquipmentTier(item.tier);
        const price = equipmentUpgradePrice(item.tier);
        const shownTier = item.tier ?? "wood";
        return `<article class="shop-item" data-equipment-item="${kind}">
          <div class="shop-art"><img src="${META_BALANCE.assets.equipment[kind][shownTier]}" alt=""></div>
          <p class="eyebrow">${item.tier ? `${item.tier.toUpperCase()} TIER` : "LOCKED"}</p>
          <h3>${copy[kind].title}</h3><p>${copy[kind].text}</p>
          ${this.equipmentEffectMarkup(kind, item)}
          <div class="tier-track">${EQUIPMENT_TIER_ORDER.map((tier) => `<i class="${item.tier && EQUIPMENT_TIER_ORDER.indexOf(tier) <= EQUIPMENT_TIER_ORDER.indexOf(item.tier) ? "owned" : ""}" title="${tier}"></i>`).join("")}</div>
          ${next && price !== null ? `<button class="primary wide" data-action="buy-equipment" data-equipment="${kind}" ${profile.coins - price < META_BALANCE.coinSafetyMinimum ? "disabled" : ""}>
            ${item.tier ? `Upgrade to ${next}` : "Unlock Wood"} · ${coinAmount(price)}
          </button>` : `<button class="primary wide" disabled>Diamond maximum</button>`}
          ${item.tier ? `<button class="secondary wide" data-action="toggle-equipment" data-equipment="${kind}">${item.equipped ? "Equipped · Unequip" : "Equip"}</button>` : ""}
        </article>`;
      }).join("")}</div>
    </div></div>`;
  }

  private investmentMarkup(): string {
    const coins = this.game.profileManager?.profile.coins ?? 0;
    const maximum = Math.min(META_BALANCE.investment.maximum, coins);
    this.investmentDraft = Math.min(maximum, this.investmentDraft);
    return `<section class="screen modal-screen investment-screen"><div class="modal investment-modal" role="dialog" aria-modal="true" aria-labelledby="investment-title">
      <button class="modal-close" data-action="cancel-investment" aria-label="Close">${icon("close")}</button>
      <p class="eyebrow">OPTIONAL RUN INVESTMENT</p><h2 id="investment-title">Back your defense</h2>
      <p>No investment is required. Your <em class="coin-symbol" aria-label="Coins">¢</em> stake is deducted once and settled once.</p>
      <label class="investment-control"><span><b>Investment</b><output>${coinAmount(this.investmentDraft)}</output></span>
        <input type="range" min="0" max="${maximum}" step="1" value="${this.investmentDraft}" data-investment
          aria-label="Run investment in whole coins" aria-valuemin="0" aria-valuemax="${maximum}" aria-valuenow="${this.investmentDraft}">
        <small>Available ${coinAmount(coins)} · Maximum ${coinAmount(maximum)}</small>
      </label>
      <div class="investment-preview" data-investment-preview>${this.investmentPreviewMarkup(this.investmentDraft)}</div>
      <div class="investment-table">
        <span><b>0 nights</b>Lose 100%</span><span><b>Night 1</b>Return 20%</span>
        <span><b>Night 5</b>Return 100%</span><span><b>Night 6</b>Return 120%</span>
        <span><b>Night 10</b>Return 200%</span>
      </div>
      <div class="result-actions"><button class="ghost" data-action="cancel-investment">Back</button>
        <button class="primary" data-action="confirm-investment">${icon("play")} Start with ${coinAmount(this.investmentDraft)}</button></div>
    </div></section>`;
  }

  private investmentPreviewMarkup(amount: number): string {
    return `<span><small>Night 5 return</small><b>${coinAmount(amount)}</b></span>
      <span><small>Night 10 return</small><b>${coinAmount(amount * 2)}</b></span>
      <span><small>Possible profit</small><b>${coinAmount(amount, "+")}</b></span>`;
  }

  private patchInvestmentPreview(): void {
    const preview = this.overlay.querySelector<HTMLElement>("[data-investment-preview]");
    if (preview) preview.innerHTML = this.investmentPreviewMarkup(this.investmentDraft);
    const start = this.overlay.querySelector<HTMLButtonElement>("[data-action='confirm-investment']");
    if (start) start.innerHTML = `${icon("play")} Start with ${coinAmount(this.investmentDraft)}`;
  }

  private volumeControl(
    channel: AudioVolumeChannel,
    label: string,
    value: number,
  ): string {
    const percent = Math.round(value * 100);
    return `<label class="volume-control">
      <span>${label}</span>
      <input type="range" min="0" max="100" step="1" value="${percent}" data-audio-volume="${channel}" aria-label="${label} volume">
      <output>${percent}%</output>
    </label>`;
  }

  private settingsMarkup(titleId = "settings-title"): string {
    const audio = audioManager.getSettings();
    return `<p class="eyebrow">SETTINGS</p><h2 id="${titleId}">Audio</h2>
      <div class="audio-settings">
        ${this.volumeControl("master", "Master", audio.master)}
        ${this.volumeControl("effects", "Effects", audio.effects)}
        ${this.volumeControl("ambience", "Ambience", audio.ambience)}
        ${this.volumeControl("music", "Music", audio.music)}
        ${this.volumeControl("countdown", "Final countdown", audio.countdown)}
        <button class="setting-toggle ${audio.muted ? "active" : ""}" data-action="audio-mute" aria-pressed="${audio.muted}">
          <span>${audio.muted ? buildBarIcon("selected-tier") : icon("close")}<b>Mute all audio</b></span><em>${audio.muted ? "ON" : "OFF"}</em>
        </button>
      </div>`;
  }

  private difficultyText(difficulty: Difficulty): string {
    if (difficulty === "easy") return "More flag health and a gentler horde";
    if (difficulty === "normal") return "The intended challenge";
    if (difficulty === "hard") return "Tougher, faster, larger waves with an increased XP reward";
    return "Intentionally extreme with the largest XP reward";
  }

  private pauseMarkup(): string {
    if (this.menuPanel === "settings") {
      return `<section class="screen modal-screen"><div class="modal compact pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-settings-title">
        <button class="modal-close" data-action="close-panel" aria-label="Back to pause menu">${icon("arrow-left")}</button>
        ${this.settingsMarkup("pause-settings-title")}
      </div></section>`;
    }
    return `<section class="screen modal-screen"><div class="modal pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <h2 id="pause-title">Pause</h2>
      <button class="primary wide" data-action="resume">${icon("play")} Resume</button>
      <button class="secondary wide" data-action="settings">${icon("sliders-horizontal")} Settings</button>
      <button class="ghost wide" data-action="request-run-exit">End run</button>
    </div></section>`;
  }

  private runExitConfirmationMarkup(): string {
    return `<section class="screen modal-screen run-exit-screen"><div class="modal compact run-exit-modal" role="dialog" aria-modal="true" aria-labelledby="run-exit-title">
      <p class="eyebrow">ABANDON DEFENSE</p>
      <h2 id="run-exit-title">End this run?</h2>
      <p>Your progress will be settled now, and this run cannot be resumed.</p>
      <div class="reroll-actions">
        <button class="ghost" data-action="cancel-run-exit">Keep playing</button>
        <button class="primary" data-action="confirm-run-exit">End run</button>
      </div>
    </div></section>`;
  }

  private skipNightMarkup(): string {
    return `<section class="screen modal-screen skip-night-screen"><div class="modal compact skip-night-modal" role="dialog" aria-modal="true" aria-labelledby="skip-night-title">
      <p class="eyebrow">END DAY EARLY</p>
      <h2 id="skip-night-title">Skip to Night?</h2>
      <p>The remaining daytime will be lost. Skipping grants no resources, score, or other reward.</p>
      <div class="reroll-actions">
        <button class="ghost" data-action="cancel-skip-night">Cancel</button>
        <button class="primary" data-action="confirm-skip-night">${icon("skip")} Skip to Night</button>
      </div>
    </div></section>`;
  }

  private tutorialMarkup(): string {
    const section = TUTORIAL_SECTIONS[this.game.tutorialSection] ?? TUTORIAL_SECTIONS[0]!;
    const task = section.tasks[this.game.tutorialTask] ?? section.tasks.at(-1)!;
    const finalSection = this.game.tutorialSection === TUTORIAL_SECTIONS.length - 1;
    return `<section class="screen tutorial-screen interactive">
      <div class="tutorial-guide-card" data-highlight="${task.highlight}" role="region" aria-live="polite" aria-atomic="true" aria-labelledby="tutorial-guide-title" tabindex="-1">
        <button class="tutorial-exit" data-action="tutorial-exit" aria-label="Exit tutorial">${icon("close")}</button>
        <header><span>TRAINING ${this.game.tutorialSection + 1} / ${TUTORIAL_SECTIONS.length}</span><b id="tutorial-guide-title">${section.title}</b></header>
        <div class="tutorial-progress">${TUTORIAL_SECTIONS.map((_, index) =>
          `<i class="${index === this.game.tutorialSection ? "current" : index < this.game.tutorialSection ? "done" : ""}"></i>`).join("")}</div>
        <p>${this.game.tutorialSectionComplete ? section.summary : task.instructions}</p>
        ${this.game.tutorialSectionComplete ? `<footer>
          <button class="ghost" data-action="tutorial-replay">${icon("restart")} Replay Section</button>
          <button class="primary" data-action="tutorial-next-section">${finalSection ? "Back to Main Menu" : `Next Section ${icon("arrow-right")}`}</button>
        </footer>` : `<small>Complete the highlighted action to continue.</small>`}
      </div>
    </section>${this.tutorialExitConfirmation ? this.tutorialExitConfirmationMarkup() : ""}`;
  }

  private tutorialExitConfirmationMarkup(): string {
    return `<section class="screen modal-screen tutorial-exit-screen"><div class="modal compact tutorial-exit-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-exit-title">
      <p class="eyebrow">LEAVE TRAINING</p>
      <h2 id="tutorial-exit-title">Exit Tutorial?</h2>
      <p>Your current training section progress will be lost.</p>
      <div class="reroll-actions">
        <button class="ghost" data-action="cancel-tutorial-exit">Keep Training</button>
        <button class="primary" data-action="confirm-tutorial-exit">Exit Tutorial</button>
      </div>
    </div></section>`;
  }

  private dawnMarkup(): string {
    if (this.game.enemyWarning) {
      const info = enemyInfo[this.game.enemyWarning];
      return `<section class="screen modal-screen danger-screen"><div class="modal warning-card" role="dialog" aria-modal="true" aria-labelledby="threat-warning-title">
        <p class="eyebrow">NEW THREAT · NIGHT ${this.game.night + 1}</p>
        <img class="threat-symbol" data-zombie-portrait="${this.game.enemyWarning}" src="${ASSETS.enemies[this.game.enemyWarning]}" alt="" aria-hidden="true"><h2 id="threat-warning-title">${info.title}</h2>
        <p>${info.text}</p><span class="tell">${info.tell}</span>
        <button class="primary wide" data-action="dismiss-warning">${icon("play")} Begin day ${this.game.night + 1}</button>
      </div></section>`;
    }
    const heading = this.dawnHeading();
    if (this.game.rerollConfirmation) {
      const cost = this.game.getRerollCost();
      return `<section class="screen modal-screen reroll-screen"><div class="modal reroll-card" role="dialog" aria-modal="true" aria-labelledby="reroll-title">
        <p class="eyebrow">CONFIRM RUN-WIDE REROLL</p><h2 id="reroll-title">Spend half of every resource?</h2>
        <p>All four totals are affected. The discarded cards cannot be selected afterward.</p>
        <div class="reroll-shared-cost">${costIcons(cost, "-", this.game.resources)}</div>
        <p class="reroll-count">Used ${this.game.rerollsUsed} of ${BALANCE.reroll.limit} · ${BALANCE.reroll.limit - this.game.rerollsUsed} remaining</p>
        <div class="reroll-actions"><button class="ghost" data-action="cancel-reroll">Keep cards</button><button class="primary" data-action="confirm-reroll">Confirm reroll</button></div>
      </div></section>`;
    }
    if (this.game.isUpgradeSelectionExhausted()) {
      return `<section class="screen dawn-screen"><div class="dawn-panel upgrade-cap-panel" role="region" aria-labelledby="upgrade-cap-title" tabindex="-1">
        <header><p class="eyebrow">DAWN ${this.game.night} · PROGRESSION COMPLETE</p><h2 id="upgrade-cap-title">Every available upgrade is maximized</h2>
          <span>Your fort cannot gain any more run upgrades. Choose how this run continues.</span></header>
        <div class="upgrade-cap-actions">
          <button class="ghost" data-action="end-maxed-run">End run and collect rewards</button>
          <button class="primary" data-action="continue-maxed-run">Continue without upgrades</button>
        </div>
      </div></section>`;
    }
    return `<section class="screen dawn-screen"><div class="dawn-panel" role="region" aria-labelledby="dawn-title" tabindex="-1">
      <header><p class="eyebrow">DAWN ${this.game.night} · COUNT FROZEN</p><h2 id="dawn-title">${heading}</h2><span>Each benefit empowers the horde.</span>
      </header>
        <div class="choice-viewport"><div class="choice-track" style="--card-transition-duration:${BALANCE.ui.cardTransitionDuration}ms;--card-transition-easing:${BALANCE.ui.cardTransitionEasing}"><div class="choice-set choice-pairs">${this.game.choices.map((choice, index) => this.choicePair(choice, index)).join("")}</div></div></div>
      <div class="reroll-dock"><p>Rerolls remaining <strong>${BALANCE.reroll.limit - this.game.rerollsUsed}/${BALANCE.reroll.limit}</strong></p>
      <button class="reroll-button" data-action="reroll" ${this.game.rerollsUsed >= BALANCE.reroll.limit ? "disabled" : ""}>${icon("shuffle")} Reroll choices <span>Costs half of every owned resource</span></button></div>
    </div></section>`;
  }

  private choicePair(choice: Choice, index: number): string {
    return `<button class="choice-pair" data-choice="${index}" aria-label="${choice.name} and ${choice.mutationName}">
      <article class="benefit-card"><span class="card-art">${this.choiceIcon(choice)}</span><small>${choice.kind}</small><h3>${choice.name}</h3><p class="${choice.kind === "upgrade" ? "upgrade-card-copy" : ""}">${this.choiceDescription(choice)}</p></article>
      <span class="choice-connector"><i></i><b>AND</b><i></i></span>
      <article class="mutation-card"><span class="card-art mutation-art">${this.mutationIcon(choice)}</span><small>mutation</small><h3>${choice.mutationName}</h3><p>${choice.mutationDescription}</p></article>
      <span class="pair-select">${buildBarIcon("selected-tier")} Apply both</span>
    </button>`;
  }

  private choiceDescription(choice: Choice): string {
    if (choice.kind !== "upgrade") return choice.description;
    const id = choice.id as keyof Upgrades;
    const amount = BALANCE.upgrades[id].amount;
    const permanentId = UPGRADE_PERMANENT_IDS[id];
    const permanent = permanentId
      ? permanentUpgradePercent(this.game.profileManager?.profile.permanentUpgrades[permanentId] ?? 0)
      : 0;
    const temporary = this.game.upgrades[id];
    const compact = (value: number): string => `${Number(value.toFixed(2))}`;
    let summary: string;
    let current: number;
    let upgraded: number;
    let suffix = "";
    if (PERCENT_UPGRADE_IDS.has(id)) {
      summary = `+${compact(amount * 100)}% ${UPGRADE_LABELS[id]}`;
      current = (permanent + temporary) * 100;
      upgraded = current + amount * 100;
      suffix = "%";
    } else {
      summary = `+${compact(amount)} ${UPGRADE_LABELS[id]}`;
      const base = UPGRADE_BASE_VALUES[id] ?? 0;
      current = base * (1 + permanent) + temporary;
      upgraded = current + amount;
    }
    return `<span class="upgrade-summary">${summary}</span><span class="upgrade-comparison">${compact(current)}${suffix} -&gt; ${compact(upgraded)}${suffix}</span>`;
  }

  private dawnHeading(): string {
    return this.game.dawnScreen === 0
      ? "Choose an unlock"
      : `Choose upgrade ${this.game.dawnScreen} of 2`;
  }

  private choiceIcon(choice: Choice): string {
    const definition = CARD_DEFINITIONS.find(
      (card) => card.category !== "mutation" && card.id === choice.id,
    );
    if (!definition) throw new Error(`Missing benefit card illustration: ${choice.id}`);
    return `<img src="${definition.illustration}" alt="">`;
  }

  private mutationIcon(choice: Choice): string {
    if (choice.mutationTargetKinds?.length === 1) {
      return `<img src="${ASSETS.enemies[choice.mutationTargetKinds[0]!]}" alt="">`;
    }
    const definition = CARD_DEFINITIONS.find(
      (card) => card.category === "mutation" && card.id === choice.mutationId,
    );
    if (!definition) throw new Error(`Missing mutation card illustration: ${choice.mutationId}`);
    return `<img src="${definition.illustration}" alt="">`;
  }

  private challengeRewardDetails(): string {
    const selected = CHALLENGES.filter((challenge) => this.game.activeChallenges.has(challenge.id));
    return `${selected.map((challenge) => `${challenge.title} +${challenge.xpBonusPercent}%`).join(", ")}. Combined +${challengeXpBonusPercent(this.game.activeChallenges)}%.`;
  }

  private resultMarkup(): string {
    const victory = this.game.phase === "victory";
    const minutes = Math.floor(this.game.stats.elapsed / 60);
    const seconds = Math.floor(this.game.stats.elapsed % 60).toString().padStart(2, "0");
    const settlement = this.game.lastSettlement;
    if (settlement) {
      const previous = levelProgress(settlement.previousLifetimeXp);
      const next = levelProgress(settlement.newLifetimeXp);
      const profitOrLoss = settlement.coins.profitOrLoss;
      const adaptiveXp = settlement.xp.adaptiveDifficulty ?? settlement.xp.difficulty;
      const difficultyAdjustment = settlement.xp.difficultyAdjustment ?? 0;
      const difficultyPercent = settlement.xp.difficultyPercent ?? 100;
      const xpSubtotal = settlement.xp.subtotal ?? settlement.xp.total - difficultyAdjustment;
      const investmentOutcome = profitOrLoss > 0
        ? { className: "positive", label: "PROFIT", sign: "+" }
        : profitOrLoss < 0
          ? { className: "negative", label: "LOSS", sign: "-" }
          : { className: "neutral", label: "BREAK EVEN", sign: "=" };
      const categories = [
        ["Nights Survived", settlement.xp.nights],
        ["Personal Kills", settlement.xp.personalKills],
        ["Adaptive Difficulty Bonus", adaptiveXp],
        ...(settlement.xp.victory > 0 ? [["Victory Bonus", settlement.xp.victory] as const] : []),
        ...(settlement.xp.challenge > 0 ? [["Challenge Bonus", settlement.xp.challenge] as const] : []),
      ] as const;
      const unlockedTierId = settlement.newlyUnlockedTierIds?.at(-1);
      const unlockedTier = unlockedTierId ? campaignTier(unlockedTierId) : null;
      const campaignRewards = settlement.grantedCampaignRewards ?? [];
      return `<section class="screen result-screen ${victory ? "won" : "lost"}"><div class="result-card reward-result-card" role="region" aria-labelledby="result-title" tabindex="-1">
        <p class="eyebrow">${victory ? "FINAL COUNT CLEARED" : "COUNT ENDED"}</p>
        <h2 id="result-title">${victory ? `${this.game.getCampaignTier().name} defended` : "Run settled"}</h2>
        ${this.game.defeatReason ? `<p class="result-reason">${this.game.defeatReason}</p>` : ""}
        ${unlockedTier ? `<aside class="tier-unlock-celebration" style="--tier-accent:${unlockedTier.accent}" aria-live="assertive">
          <span class="unlock-rays" aria-hidden="true"></span><span class="unlock-burst" aria-hidden="true"></span>
          <p>NEW CAMPAIGN TIER</p><img src="${unlockedTier.icon}" alt=""><h3>${unlockedTier.name}</h3><strong>UNLOCKED!</strong>
          <small>${unlockedTier.subtitle} is ready to play</small>
        </aside>` : ""}
        ${campaignRewards.length ? `<div class="campaign-rewards-earned"><strong>LADDER REWARDS CLAIMED</strong>${campaignRewards.map((milestone) => `<span>${this.rewardMarkup(milestone.reward)}</span>`).join("")}</div>` : ""}
        <div class="reward-body"><div class="reward-list"><div class="reward-categories">${categories.map(([label, value], index) => `<div class="reward-line" style="--reveal-index:${index}">
          <span ${label === "Challenge Bonus" ? `title="${this.escapeAttribute(this.challengeRewardDetails())}"` : ""}>${label}</span><b>+${value} XP</b></div>`).join("")}</div>
        <button class="reward-skip" data-action="reveal-rewards">Show totals now</button>
        </div><div class="reward-summary">
        <section class="difficulty-xp-adjustment ${difficultyAdjustment < 0 ? "penalty" : "bonus"}" style="--reveal-index:6">
          <span><b>${BALANCE.difficulty[this.game.difficulty].label} Difficulty</b><small>${difficultyPercent}% applied once to ${xpSubtotal} XP</small></span>
          <strong>${difficultyAdjustment >= 0 ? "+" : ""}${difficultyAdjustment} XP</strong>
        </section>
        <section class="reward-total" style="--reveal-index:7"><span>FINAL XP TOTAL</span><strong>+${settlement.xp.total} XP</strong></section>
        <div class="level-transition" style="--reveal-index:8">
          <span><small>Before</small><b>Level ${previous.level}</b><em>${previous.current}/${previous.required} XP</em></span>
          <i>${icon("arrow-right")}</i>
          <span><small>After</small><b>Level ${next.level}</b><em>${next.current}/${next.required} XP</em></span>
          ${settlement.newLevel > settlement.previousLevel ? `<strong>LEVEL UP ×${settlement.newLevel - settlement.previousLevel}</strong>` : ""}
        </div>
        <div class="coin-settlement ${investmentOutcome.className}" style="--reveal-index:9" aria-label="Investment outcome">
          <span><small>Invested</small><b>${coinAmount(settlement.coins.investment)}</b></span>
          <i class="settlement-arrow" aria-hidden="true">${icon("arrow-right")}</i>
          <span><small>Returned</small><b>${coinAmount(settlement.coins.totalReturn)}</b></span>
          <strong class="settlement-outcome"><small>${investmentOutcome.label}</small><b>${investmentOutcome.sign}${coinAmount(Math.abs(profitOrLoss))}</b></strong>
          <span><small>Balance</small><b>${coinAmount(settlement.newCoins)}</b></span>
          <button class="settlement-help" aria-label="Investment rules" title="The return is based on completed nights. Investment is deducted once at run start and settled once at run end.">${icon("info")}</button>
        </div>
        <div class="result-actions" style="--reveal-index:9">${victory && this.game.runMode === "campaign" ? `<button class="primary endless-continue" data-action="continue-endless">${icon("arrow-right")} Continue Endless</button>` : ""}
          <button class="${victory ? "secondary" : "primary"}" data-action="restart-same">${icon("restart")} Same seed</button>
          <button class="secondary" data-action="restart-new">${icon("shuffle")} New seed</button><button class="ghost" data-action="menu">Main menu</button></div>
        </div></div>
      </div></section>`;
    }
    return `<section class="screen result-screen ${victory ? "won" : "lost"}"><div class="result-card" role="region" aria-labelledby="result-title" tabindex="-1">
      <p class="eyebrow">${victory ? "FINAL COUNT CLEARED" : "COUNT ENDED"}</p>
      <h2 id="result-title">${victory ? `${this.game.getCampaignTier().name} defended` : "Run defeated"}</h2>
      ${this.game.defeatReason ? `<p class="result-reason">${this.game.defeatReason}</p>` : ""}
      <div class="night-result"><strong>${this.game.stats.nightsSurvived}</strong><span>NIGHTS</span></div>
      <div class="record-grid">
        <span><b>${BALANCE.difficulty[this.game.difficulty].label}</b>Difficulty</span><span><b>${minutes}:${seconds}</b>Time</span>
          <span><b>${this.game.stats.resourcesGathered}</b>Gathered</span><span><b>${this.game.stats.structuresBuilt}</b>Built</span>
          <span><b>${this.game.stats.zombiesDefeated}</b>Defeated</span>
          <span><b>${this.game.activeChallenges.size}</b>Challenges</span>
        </div>
      <div class="result-seed"><code>${this.game.seed}</code><button data-action="copy-seed" aria-label="Copy seed">${icon("copy")}</button></div>
      <div class="result-actions"><button class="primary" data-action="restart-same">${icon("restart")} Same seed</button>
      <button class="secondary" data-action="restart-new">${icon("shuffle")} New seed</button><button class="ghost" data-action="menu">Main menu</button></div>
    </div></section>`;
  }

  private renderHud(force: boolean): void {
    const active = (this.game.phase === "day" || this.game.phase === "night")
      && (!this.tutorialOpen || this.game.tutorialMode)
      && !this.game.skipNightConfirmation;
    this.hud.classList.toggle("hidden", !active);
    this.hud.classList.toggle("tutorial-active", this.game.tutorialMode);
    if (!active) return;
    const phaseKey = `${this.game.phase}:${this.game.isCombatMode() ? "combat" : "build"}`;
    const unlockKey = STRUCTURE_ORDER.map((kind) => this.game.unlocks.structures[kind].join(",")).join("|");
    const tierKey = STRUCTURE_ORDER.map((kind) => this.game.selectedTiers[kind]).join(",");
    const structureKey = `${phaseKey}|${this.openTierPanel}|${unlockKey}|${tierKey}`;
    if (force || structureKey !== this.hudStructureKey) {
      this.hudStructureKey = structureKey;
      this.hud.innerHTML = this.hudMarkup();
    }
    this.patchHud();
  }

  private hudMarkup(): string {
    return `
      <div class="player-hud-group">
        <div class="player-status">
          <span class="health-icon">${icon("heart")}</span><div class="health-track"><i data-health-bar></i></div><b data-health-value></b>
          <button class="hud-icon-button" data-action="pause" aria-label="Pause">${icon("pause")}<span class="tooltip">Pause</span></button>
        </div>
        <div class="seed-chip"><b>${this.game.seed}</b><button data-action="copy-seed" aria-label="Copy seed">${icon("copy")}<span class="tooltip">Copy seed</span></button></div>
        ${this.adaptivePressureMarkup()}
      </div>
      <div class="countdown-stack">
        ${this.runProgressMarkup()}
        ${this.game.runMode === "endless" && this.game.phase === "night" ? `<button class="fort-pulse-button" data-action="fort-pulse" ${this.game.canUseFortPulse() ? "" : "disabled"} aria-label="Fort Pulse">
          <span>FORT PULSE</span><small>24 gold + 8 diamond - once per night</small><span class="tooltip">Damage nearby special enemies</span>
        </button>` : ""}
      </div>
      ${this.game.debugAdaptive ? this.adaptiveDebugMarkup() : ""}
      <div class="resource-stack">
        <aside class="resources" aria-label="Resources">${RESOURCE_ORDER.map((resource) =>
          `<div title="${resource}">${resourceIcon(resource, true)}<b data-resource="${resource}">0</b></div>`).join("")}</aside>
        <div class="clock" data-clock-panel><div class="clock-face"><strong data-clock></strong></div><span data-phase-label></span></div>
        ${this.game.phase === "day" && !this.game.isCombatMode() && !this.game.tutorialMode ? `<button class="skip-night-button clock-end-day" data-action="skip-night" aria-label="End Day and skip to night">${icon("sun")}<span class="skip-night-label">End Day</span><span class="tooltip">End the day early with no reward</span></button>` : ""}
      </div>
      ${this.openTierPanel ? this.tierPanelMarkup(this.openTierPanel) : ""}
      <div class="context-readout" data-context></div>
      <div class="bottom-command-deck">
        <div class="toolbar" role="toolbar" aria-label="Actions">
          ${this.actionBarMarkup()}
        </div>
      </div>`;
  }

  private actionBarMarkup(): string {
    const combat = this.game.isCombatMode();
    const actions = combat ? COMBAT_ACTION_BAR : BUILD_ACTION_BAR;
    const actionButtons = actions.map((item, index) => this.actionBarButton(item, index + 1)).join("");
    if (combat) return actionButtons;
    return actionButtons + STRUCTURE_ORDER.map((kind, index) => this.structureButton(kind, index + 4)).join("");
  }

  private actionBarButton(item: ActionBarAction, slot: number): string {
    if (item.icon === "melee") {
      const swordTier = this.game.getEquippedSwordTier();
      const label = swordTier ? "Sword" : item.label;
      const symbol = swordTier
        ? `<img class="equipment-action-icon" src="${META_BALANCE.assets.equipment.sword[swordTier]}" alt="" aria-hidden="true">`
        : gameSymbol("fists", this.game.getBestGlove());
      return this.actionButton(slot, item.action, label, symbol);
    }
    const symbol = item.icon === "nighttime-bow"
      ? buildBarIcon("nighttime-bow")
      : gameSymbol(item.action);
    const disabled = item.action === "tool"
      && !this.game.isCombatMode()
      && this.game.getChallengeModifiers().disablesStructureRepair;
    return this.actionButton(slot, item.action, item.label, symbol, disabled);
  }

  private runProgressMarkup(): string {
    const endless = this.game.night > 10;
    const firstNight = endless ? Math.floor((this.game.night - 1) / 5) * 5 + 1 : 1;
    const count = endless ? 5 : 10;
    const nights = Array.from({ length: count }, (_, index) => firstNight + index);
    const completed = this.game.stats.nightsSurvived;
    const fill = Math.max(0, Math.min(1, (completed - firstNight + 1) / Math.max(1, count - 1)));
    return `<div class="run-progress ${endless ? "endless" : ""}" style="--run-fill:${fill * 100}%"
      role="progressbar" aria-label="Run progress" aria-valuemin="${firstNight}" aria-valuemax="${firstNight + count - 1}" aria-valuenow="${this.game.night}">
      <div class="run-progress-line"><i></i></div>
      ${nights.map((night) => {
        const milestone = this.game.getRosterMilestones().find((item) => item.night === night);
        const boss = night === 10 || (endless && night % 5 === 0);
        const state = night <= completed ? "completed" : night === this.game.night ? "current" : "future";
        const tooltip = milestone?.label ?? (boss ? `Boss Night ${night}` : `Night ${night}`);
        return `<span class="run-node ${state} ${boss ? "boss" : ""}" title="${tooltip}">
          ${milestone ? `<img src="${ASSETS.enemies[milestone.enemy]}" alt="">` : `<b>${night}</b>`}
          ${boss ? `<em>${night === 10 ? "BOSS" : `B${night}`}</em>` : ""}
        </span>`;
      }).join("")}
    </div>`;
  }

  private adaptivePressureState(): { state: "below" | "around" | "above"; label: string; iconName: "pressure-low" | "pressure-normal" | "pressure-high" } {
    const multiplier = this.game.getAdaptiveThreat().multiplier;
    if (multiplier < BALANCE.adaptive.pressureIndicator.belowMaximum) {
      return { state: "below", label: "Below expected", iconName: "pressure-low" };
    }
    if (multiplier > BALANCE.adaptive.pressureIndicator.aboveMinimum) {
      return { state: "above", label: "Above expected", iconName: "pressure-high" };
    }
    return { state: "around", label: "Around expected", iconName: "pressure-normal" };
  }

  private adaptivePressureMarkup(): string {
    if (this.game.tutorialMode) return "";
    const pressure = this.adaptivePressureState();
    return `<div class="adaptive-pressure ${pressure.state}" data-adaptive-pressure="${pressure.state}"
      aria-label="Adaptive pressure: ${pressure.label}" title="Upcoming pressure adapts to your progression and fortification.">
      ${icon(pressure.iconName)}<span>${pressure.label}</span>
    </div>`;
  }

  private actionButton(slot: number, action: ActionKind, label: string, symbol: string, disabled = false): string {
    const unavailable = disabled || !this.game.isTutorialSlotAllowed(slot);
    return `<button class="tool" data-slot="${slot}" data-action-kind="${action}" aria-label="${label}" ${unavailable ? "disabled" : ""}>
      <kbd>${slot}</kbd><span class="tool-symbol">${symbol}</span><span class="tooltip">${label}${unavailable ? " · Unavailable now" : ""}</span>
    </button>`;
  }

  private structureButton(kind: StructureKind, slot: number): string {
    const tier = this.game.selectedTiers[kind];
    const cost = this.game.getTierCost(kind, tier);
    const capacity = kind === "turret" || kind === "harvester" ? this.game.getCapacity(kind) : null;
    const unavailable = this.game.isCombatMode() || !this.game.isTutorialSlotAllowed(slot);
    return `<button class="tool structure-tool" data-slot="${slot}" data-kind="${kind}" aria-label="${labels[kind]}" ${unavailable ? "disabled" : ""}>
      <kbd>${slot}</kbd><span class="tool-symbol">${gameSymbol(kind, tier)}</span><i class="tier-badge ${tier}">${buildBarIcon("material-tier-badge", { tier })}</i>
      ${capacity ? `<span class="capacity-badge" data-capacity="${kind}">${capacity.current}/${capacity.maximum}</span>` : ""}
      <span class="slot-cost" data-slot-cost="${kind}">${costIcons(cost, "", this.game.resources)}</span><span class="tooltip">${labels[kind]} · ${tier}${capacity ? ` · ${capacity.current} of ${capacity.maximum}` : ""}</span>
    </button>`;
  }

  private tierPanelMarkup(kind: StructureKind): string {
    const capacity = kind === "turret" || kind === "harvester" ? this.game.getCapacity(kind) : null;
    return `<aside class="tier-panel" aria-label="${labels[kind]} material tiers"><header>${gameSymbol(kind, this.game.selectedTiers[kind], true)}<span><small>BUILD</small><b>${labels[kind]}${capacity ? ` · ${capacity.current} of ${capacity.maximum}` : ""}</b></span></header>
      ${TIER_ORDER.map((tier) => {
        const unlocked = this.game.unlocks.structures[kind].includes(tier);
        const tutorialAllowed = this.game.isTutorialTierAllowed(kind, tier);
        const available = unlocked && (!this.game.tutorialMode || tutorialAllowed);
        const cost = this.game.getTierCost(kind, tier);
        return `<button data-tier="${tier}" data-kind="${kind}" class="tier-option ${tier} ${available ? "" : "locked"}" ${available ? "" : "disabled"} aria-label="${tier} ${labels[kind]}">
          ${gameSymbol(kind, tier, true)}<span><b>${tier}</b><em data-tier-cost="${kind}:${tier}">${available ? costIcons(cost, "", this.game.resources) : buildBarIcon("locked", { className: "locked-indicator" })}</em></span>
          <i class="selection-mark">${buildBarIcon("selected-tier", { className: "selected-tier-indicator" })}</i><span class="tooltip">${available ? `${tier} ${labels[kind]}` : "Unavailable in this step"}</span>
        </button>`;
      }).join("")}</aside>`;
  }

  private patchHud(): void {
    const clock = Math.max(0, Math.ceil(this.game.timer));
    const healthRatio = Math.max(0, this.game.player.health / this.game.player.maxHealth * 100);
    const healthBar = this.hud.querySelector<HTMLElement>("[data-health-bar]");
    const healthValue = this.hud.querySelector<HTMLElement>("[data-health-value]");
    if (healthBar) healthBar.style.width = `${healthRatio}%`;
    if (healthValue) healthValue.textContent = `${Math.ceil(this.game.player.health)}`;
    this.setText("[data-clock]", `${clock}`);
    this.setText("[data-phase-label]", this.game.isBossNight() && clock === 0
      ? "BOSS"
      : this.game.phase === "night" ? "NIGHT" : "DAY");
    const clockPanel = this.hud.querySelector<HTMLElement>("[data-clock-panel]");
    clockPanel?.style.setProperty("--clock-shake", `${BALANCE.ui.clockShakeStrength}px`);
    clockPanel?.classList.toggle("night", this.game.phase === "night");
    clockPanel?.classList.toggle("urgent", clock <= 10);
    clockPanel?.classList.toggle("overtime", this.game.phase === "night" && clock === 0);
    clockPanel?.classList.toggle("transition-impact", this.game.phaseTransitionImpact > 0);
    this.patchClockProximity(clockPanel);
    if (clock <= 10 && clock !== this.lastClockSecond) {
      clockPanel?.classList.remove("second-impact", "zero-impact");
      void clockPanel?.offsetWidth;
      clockPanel?.classList.add(clock === 0 ? "zero-impact" : "second-impact");
    }
    this.lastClockSecond = clock;
    for (const resource of RESOURCE_ORDER) this.setText(`[data-resource="${resource}"]`, `${this.game.resources[resource]}`);
    const liveThreat = this.game.getAdaptiveThreat();
    const pressure = this.adaptivePressureState();
    const pressureElement = this.hud.querySelector<HTMLElement>("[data-adaptive-pressure]");
    if (pressureElement && pressureElement.dataset.adaptivePressure !== pressure.state) {
      pressureElement.dataset.adaptivePressure = pressure.state;
      pressureElement.className = `adaptive-pressure ${pressure.state}`;
      pressureElement.setAttribute("aria-label", `Adaptive pressure: ${pressure.label}`);
      pressureElement.innerHTML = `${icon(pressure.iconName)}<span>${pressure.label}</span>`;
    }
    this.setText("[data-adaptive-actual]", `${liveThreat.actual}`);
    this.setText("[data-adaptive-expected]", `${liveThreat.expected}`);
    this.setText("[data-adaptive-difference]", `${liveThreat.difference}`);
    this.setText("[data-adaptive-structure]", liveThreat.structureMultiplier.toFixed(3));
    this.setText("[data-adaptive-level]", liveThreat.levelMultiplier.toFixed(3));
    this.setText("[data-adaptive-raw]", liveThreat.rawMultiplier.toFixed(3));
    this.setText("[data-adaptive-clamped]", liveThreat.multiplier.toFixed(3));
    for (const kind of ["turret", "harvester"] as const) {
      const capacity = this.game.getCapacity(kind);
      this.setText(`[data-capacity="${kind}"]`, `${capacity.current}/${capacity.maximum}`);
    }
    for (const button of this.hud.querySelectorAll<HTMLButtonElement>("[data-slot]")) {
      const slot = Number(button.dataset.slot);
      button.classList.toggle("selected", slot === this.game.selectedSlot);
      button.classList.toggle("tutorial-highlight", this.game.tutorialMode && this.game.isTutorialSlotAllowed(slot));
    }
    for (const kind of STRUCTURE_ORDER) {
      const cost = this.game.getTierCost(kind, this.game.selectedTiers[kind]);
      const slotCost = this.hud.querySelector<HTMLElement>(`[data-slot-cost="${kind}"]`);
      if (slotCost) this.setHtml(slotCost, costIcons(cost, "", this.game.resources));
      const button = this.hud.querySelector<HTMLButtonElement>(`[data-kind="${kind}"][data-slot]`);
      button?.classList.toggle("unaffordable", !canAfford(this.game.resources, cost));
      for (const tier of TIER_ORDER) {
        const option = this.hud.querySelector<HTMLButtonElement>(`[data-kind="${kind}"][data-tier="${tier}"]`);
        if (!option) continue;
        const tierCost = this.game.getTierCost(kind, tier);
        option.classList.toggle("selected", this.game.selectedTiers[kind] === tier);
        option.classList.toggle(
          "tutorial-highlight",
          this.game.tutorialMode && this.game.isTutorialTierAllowed(kind, tier),
        );
        option.classList.toggle("unaffordable", !canAfford(this.game.resources, tierCost));
        const costTarget = option.querySelector<HTMLElement>(`[data-tier-cost="${kind}:${tier}"]`);
        if (costTarget && !option.disabled) this.setHtml(costTarget, costIcons(tierCost, "", this.game.resources));
      }
    }
    const context = this.hud.querySelector<HTMLElement>("[data-context]");
    if (context) {
      const preview = this.game.toolPreview;
      if (preview) {
        const wallet = preview.action === "repair" ? preview.cost : preview.refund;
        context.className = `context-readout ${preview.valid && preview.affordable ? "valid" : "invalid"}`;
        this.setHtml(context, `${preview.action === "repair" ? buildBarIcon("repair-wrench") : buildBarIcon("recycle-mallet")}<span>${preview.reason}</span><em>${costIcons(wallet, preview.action === "recycle" ? "+" : "", preview.action === "repair" ? this.game.resources : undefined)}</em>`);
      } else if (this.game.buildPreview?.reason) {
        context.className = "context-readout invalid";
        this.setHtml(context, `<span>${this.game.buildPreview.reason}</span><em>${costIcons(this.game.buildPreview.cost, "", this.game.resources)}</em>`);
      } else if (this.game.buildPreview) {
        const preview = this.game.buildPreview;
        context.className = `context-readout ${preview.affordable ? "valid" : "invalid"}`;
        this.setHtml(context, `<span>${preview.upgrading ? "Upgrade cost" : "Build cost"}</span><em>${costIcons(preview.cost, "", this.game.resources)}</em>`);
      } else {
        context.className = "context-readout";
        this.setHtml(context, "");
      }
    }
  }

  private patchClockProximity(clockPanel: HTMLElement | null): void {
    if (!clockPanel) return;
    const hudRect = this.hud.getBoundingClientRect();
    const clockRect = clockPanel.getBoundingClientRect();
    if (hudRect.width <= 0 || hudRect.height <= 0 || clockRect.width <= 0 || clockRect.height <= 0) {
      clockPanel.style.setProperty("--clock-proximity-opacity", "1");
      return;
    }
    const logicalScaleX = BALANCE.logicalWidth / hudRect.width;
    const logicalScaleY = BALANCE.logicalHeight / hudRect.height;
    const pointerX = this.game.input.mouse.x;
    const pointerY = this.game.input.mouse.y;
    const left = (clockRect.left - hudRect.left) * logicalScaleX;
    const right = (clockRect.right - hudRect.left) * logicalScaleX;
    const top = (clockRect.top - hudRect.top) * logicalScaleY;
    const bottom = (clockRect.bottom - hudRect.top) * logicalScaleY;
    const distanceX = Math.max(left - pointerX, 0, pointerX - right);
    const distanceY = Math.max(top - pointerY, 0, pointerY - bottom);
    const normalizedDistance = Math.min(1, Math.hypot(distanceX, distanceY) / CLOCK_PROXIMITY_FADE_RADIUS);
    const easedDistance = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
    const opacity = CLOCK_MINIMUM_OPACITY + (1 - CLOCK_MINIMUM_OPACITY) * easedDistance;
    clockPanel.style.setProperty("--clock-proximity-opacity", opacity.toFixed(3));
  }

  private setText(selector: string, value: string): void {
    const element = this.hud.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private adaptiveDebugMarkup(): string {
    const threat = this.game.getAdaptiveThreat();
    const performance = this.game.performanceDifficulty;
    const snapshot = this.game.lastNightPerformance;
    return `<aside class="adaptive-debug" aria-label="Adaptive difficulty debug">
      <span>Actual <b data-adaptive-actual>${threat.actual}</b></span>
      <span>Expected <b data-adaptive-expected>${threat.expected}</b></span>
      <span>Difference <b data-adaptive-difference>${threat.difference}</b></span>
      <span>Structure <b data-adaptive-structure>${threat.structureMultiplier.toFixed(3)}</b></span>
      <span>Level ${threat.playerLevel} <b data-adaptive-level>${threat.levelMultiplier.toFixed(3)}</b></span>
      <span>Turret DPS <b>${threat.turretDps.toFixed(1)}/${threat.expectedTurretDps.toFixed(1)}</b></span>
      <span>Coverage <b>${Math.round(threat.turretCoverageRatio * 100)}%</b></span>
      <span>Upgrade progress <b>${Math.round(threat.playerUpgradeFraction * 100)}%</b></span>
      <span>Power <b>+${threat.powerDelta.toFixed(3)}</b></span>
      <span>Corrective <b data-adaptive-corrective>+${this.game.autoCorrectiveDelta.toFixed(3)}</b></span>
      <span>Easy score <b>${performance.easyPerformance.toFixed(3)}</b></span>
      <span>Pressure <b>${performance.pressurePenalty.toFixed(3)}</b></span>
      ${snapshot ? `<span>Night ${snapshot.night} damage <b>${snapshot.totalIncomingDamage.toFixed(1)}</b></span>
        <span>Fort loss <b>${snapshot.destroyedStructureCount}/${snapshot.destroyedStructureValue}</b></span>` : ""}
      <span>Raw <b data-adaptive-raw>${threat.rawMultiplier.toFixed(3)}</b></span>
      <span>Clamped <b data-adaptive-clamped>${threat.multiplier.toFixed(3)}</b></span>
    </aside>`;
  }

  private setHtml(element: HTMLElement, value: string): void {
    if (element.innerHTML !== value) element.innerHTML = value;
  }

  private renderToast(): void {
    const canShow = (this.game.phase === "day" || this.game.phase === "night")
      && (!this.tutorialOpen || this.game.tutorialMode);
    const key = canShow && this.game.toastTime > 0 ? `${this.game.toast}|${this.game.toastCritical}` : "";
    if (key === this.lastToastKey) return;
    this.lastToastKey = key;
    this.toastLayer.innerHTML = key
      ? `<div class="toast ${this.game.toastCritical ? "critical" : ""}">${this.game.toast}</div>`
      : "";
  }

  private handleOverlayClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action],[data-difficulty],[data-choice],[data-challenge]");
    if (!target) return;
    const action = target.dataset.action;
    const panelBeforeAction = this.menuPanel;
    const menuModalScrollTop = this.overlay.querySelector<HTMLElement>(".menu-modal > .modal")?.scrollTop;
    let upgradeFeedbackSelector: string | null = null;
    const difficulty = target.dataset.difficulty as Difficulty | undefined;
    if (difficulty) {
      audioManager.play("ui-click");
      this.difficulty = difficulty;
      for (const button of this.overlay.querySelectorAll<HTMLElement>("[data-difficulty]")) {
        const selected = button.dataset.difficulty === difficulty;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", `${selected}`);
      }
      return;
    }
    const challenge = target.dataset.challenge;
    if (challenge) {
      audioManager.play("ui-click");
      if (this.selectedChallenges.has(challenge)) this.selectedChallenges.delete(challenge);
      else this.selectedChallenges.add(challenge);
      this.invalidate();
      this.render(true);
      return;
    }
    if (target.dataset.choice !== undefined) {
      this.selectChoice(target, Number(target.dataset.choice));
      return;
    }
    this.playUiActivation(action);
    switch (action) {
      case "open-campaign":
        this.dailyRewardVisible = false;
        this.selectedCampaignTierId = highestUnlockedCampaignTierId(this.campaignProgress());
        this.campaignOpen = true;
        break;
      case "close-campaign":
        this.campaignOpen = false;
        break;
      case "select-campaign-tier": {
        const tierId = target.dataset.campaignTier as CampaignTierId | undefined;
        if (tierId && CAMPAIGN_TIERS.some((tier) => tier.id === tierId)) {
          this.selectedCampaignTierId = tierId;
        }
        break;
      }
      case "start-campaign-tier": {
        const tier = campaignTier(this.selectedCampaignTierId);
        if (!isCampaignTierUnlocked(tier, this.campaignProgress())) break;
        const input = this.overlay.querySelector<HTMLInputElement>("#seed-input");
        this.seedDraft = input?.value ?? this.seedDraft;
        this.campaignOpen = false;
        if (this.game.profileManager) {
          this.investmentDraft = 0;
          this.investmentOpen = true;
        } else {
          this.game.startRun(this.difficulty, this.seedDraft, [...this.selectedChallenges], false, {
            campaignTierId: this.selectedCampaignTierId,
          });
        }
        break;
      }
      case "confirm-investment": {
        const started = this.game.startRun(
          this.difficulty,
          this.seedDraft,
          [...this.selectedChallenges],
          false,
          { investment: this.investmentDraft, campaignTierId: this.selectedCampaignTierId },
        );
        if (started) this.investmentOpen = false;
        break;
      }
      case "cancel-investment":
        this.investmentOpen = false;
        break;
      case "random-seed": {
        const input = this.overlay.querySelector<HTMLInputElement>("#seed-input");
        this.seedDraft = generateSeed();
        if (input) input.value = this.seedDraft;
        return;
      }
      case "resume":
        this.game.togglePause();
        break;
      case "pause":
        this.game.togglePause();
        break;
      case "request-run-exit":
        this.runExitConfirmation = true;
        this.game.modalLock = true;
        break;
      case "cancel-run-exit":
        this.runExitConfirmation = false;
        this.game.modalLock = false;
        break;
      case "confirm-run-exit":
        this.runExitConfirmation = false;
        this.game.modalLock = false;
        this.game.endRunVoluntarily();
        break;
      case "tutorial-menu":
        this.openTutorial("menu");
        break;
      case "tutorial-replay":
        this.game.replayTutorialSection();
        break;
      case "tutorial-next-section":
        if (!this.game.advanceTutorialSection()) this.finishTutorial(true);
        break;
      case "tutorial-exit":
        this.requestTutorialExit();
        break;
      case "cancel-tutorial-exit":
        this.cancelTutorialExit();
        break;
      case "confirm-tutorial-exit":
        this.finishTutorial(false);
        break;
      case "controls":
      case "settings":
      case "challenges":
      case "credits":
      case "profile":
      case "upgrades":
      case "shop":
        this.menuPanel = target.dataset.action as Exclude<MenuPanel, null>;
        if (this.menuPanel === "profile" && this.game.profileManager) {
          this.profileColorDraft = this.game.profileManager.profile.playerColor;
          this.profileEyeDraft = this.game.profileManager.profile.eyeStyle;
        }
        break;
      case "close-panel":
        this.menuPanel = null;
        break;
      case "audio-mute":
        audioManager.toggleMuted();
        break;
      case "dismiss-daily":
        this.dailyRewardVisible = false;
        break;
      case "open-daily":
        this.dailyRewardVisible = true;
        break;
      case "claim-daily":
        this.game.profileManager?.claimDailyReward();
        this.dailyRewardVisible = false;
        break;
      case "pick-color":
        if (target.dataset.color) this.profileColorDraft = target.dataset.color;
        break;
      case "pick-eyes":
        if (target.dataset.eyeStyle) this.profileEyeDraft = target.dataset.eyeStyle as EyeStyle;
        break;
      case "save-customization":
        this.game.profileManager?.saveCustomization(this.profileColorDraft, this.profileEyeDraft);
        break;
      case "crazygames-login":
        void this.game.platform?.showAuthPrompt();
        break;
      case "buy-upgrade":
        if (target.dataset.upgrade) {
          const upgrade = target.dataset.upgrade as PermanentUpgradeId;
          const level = target.dataset.level;
          if (this.game.profileManager?.buyPermanentUpgrade(upgrade)) {
            audioManager.play("upgrade-unlock");
            upgradeFeedbackSelector = `[data-action="buy-upgrade"][data-upgrade="${upgrade}"][data-level="${level}"]`;
          }
        }
        break;
      case "buy-equipment":
        if (target.dataset.equipment) {
          const equipment = target.dataset.equipment as EquipmentKind;
          if (this.game.profileManager?.buyEquipment(equipment)) {
            audioManager.play("upgrade-unlock");
            upgradeFeedbackSelector = `[data-equipment-item="${equipment}"]`;
          }
        }
        break;
      case "toggle-equipment":
        if (target.dataset.equipment) {
          this.game.profileManager?.toggleEquipment(target.dataset.equipment as EquipmentKind);
        }
        break;
      case "reveal-rewards":
        target.closest(".reward-result-card")?.classList.add("rewards-revealed");
        return;
      case "fullscreen":
        void this.toggleFullscreen();
        return;
      case "dismiss-warning":
        this.game.dismissEnemyWarning();
        break;
      case "reroll":
        this.game.requestReroll();
        break;
      case "cancel-reroll":
        this.game.cancelReroll();
        break;
      case "confirm-reroll":
        this.animateChoiceReplacement(() => this.game.confirmReroll());
        return;
      case "end-maxed-run":
        this.game.endRunAtUpgradeCap();
        break;
      case "continue-maxed-run":
        this.game.continueWithoutUpgrade();
        break;
      case "skip-night":
        this.game.requestSkipNight();
        break;
      case "cancel-skip-night":
        this.game.cancelSkipNight();
        break;
      case "confirm-skip-night":
        this.game.confirmSkipNight();
        break;
      case "copy-seed":
        this.game.copySeed();
        break;
      case "restart-same":
        this.seedDraft = this.game.seed;
        this.selectedCampaignTierId = this.game.activeCampaignTierId;
        this.game.returnToMenu();
        this.investmentDraft = 0;
        this.investmentOpen = true;
        break;
      case "restart-new":
        this.seedDraft = "";
        this.selectedCampaignTierId = this.game.activeCampaignTierId;
        this.game.returnToMenu();
        this.investmentDraft = 0;
        this.investmentOpen = true;
        break;
      case "continue-endless":
        this.game.continueIntoEndless();
        break;
      case "menu":
        this.game.modalLock = false;
        this.tutorialOpen = false;
        this.campaignOpen = false;
        if (this.game.phase === "paused" && !this.game.tutorialMode) {
          this.game.endRunVoluntarily();
        } else this.game.returnToMenu();
        break;
    }
    this.invalidate();
    this.render(true);
    if (menuModalScrollTop !== undefined && (
      action === "buy-upgrade"
      || action === "buy-equipment"
      || action === "toggle-equipment"
    )) {
      const modal = this.overlay.querySelector<HTMLElement>(".menu-modal > .modal");
      if (modal) modal.scrollTop = menuModalScrollTop;
    }
    if (upgradeFeedbackSelector) {
      const feedbackTarget = this.overlay.querySelector<HTMLElement>(upgradeFeedbackSelector);
      if (feedbackTarget) this.playUpgradeFeedback(feedbackTarget);
    }
    if (this.game.rerollConfirmation && action === "reroll") {
      this.focusDialog(".reroll-card");
    }
    if (action === "cancel-reroll") {
      this.overlay.querySelector<HTMLElement>('[data-action="reroll"]')?.focus();
    }
    if (this.investmentOpen && (
      action === "start-campaign-tier"
      || action === "restart-same"
      || action === "restart-new"
    )) {
      this.focusDialog(".investment-modal");
    } else if (action === "cancel-investment") {
      this.overlay.querySelector<HTMLElement>('[data-action="open-campaign"]')?.focus();
    } else if (action === "resume") {
      this.hud.querySelector<HTMLElement>('[data-action="pause"]')?.focus();
    } else if (action === "cancel-skip-night") {
      this.hud.querySelector<HTMLElement>('[data-action="skip-night"]')?.focus();
    } else if (this.runExitConfirmation && action === "request-run-exit") {
      this.focusDialog(".run-exit-modal");
    } else if (action === "cancel-run-exit") {
      this.overlay.querySelector<HTMLElement>('[data-action="request-run-exit"]')?.focus();
    } else if (this.tutorialExitConfirmation && action === "tutorial-exit") {
      this.focusDialog(".tutorial-exit-modal");
    } else if (action === "cancel-tutorial-exit") {
      this.overlay.querySelector<HTMLElement>('[data-action="tutorial-exit"]')?.focus();
    } else if (action === "close-panel" && panelBeforeAction) {
      this.focusMenuPanelTrigger(panelBeforeAction);
    } else if (
      action === "controls"
      || action === "settings"
      || action === "challenges"
      || action === "credits"
      || action === "profile"
      || action === "upgrades"
      || action === "shop"
    ) {
      this.focusMenuPanel();
    }
  }

  private handleHudClick(event: Event): void {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action],[data-slot],[data-tier]");
    if (!target) return;
    this.game.input.releasePointer();
    if (target.dataset.action === "skip-night" || target.dataset.action === "copy-seed" || target.dataset.action === "fort-pulse") {
      audioManager.play("ui-click");
    }
    if (target.dataset.action === "pause") {
      this.game.togglePause();
    } else if (target.dataset.action === "skip-night") {
      this.game.requestSkipNight();
    } else if (target.dataset.action === "copy-seed") {
      this.game.copySeed();
    } else if (target.dataset.action === "fort-pulse") {
      this.game.useFortPulse();
    } else if (target.dataset.tier && target.dataset.kind) {
      this.game.selectTier(target.dataset.kind as StructureKind, target.dataset.tier as Tier);
      this.openTierPanel = target.dataset.kind as StructureKind;
    } else if (target.dataset.slot) {
      const slot = Number(target.dataset.slot);
      const kind = target.dataset.kind as StructureKind | undefined;
      const wasSelected = this.game.selectedSlot === slot;
      this.game.selectSlot(slot);
      this.lastSelectedSlot = slot;
      if (kind) this.openTierPanel = wasSelected && this.openTierPanel === kind ? null : kind;
      else this.openTierPanel = null;
    }
    this.hudStructureKey = "";
    this.render(true);
    if (target.dataset.action === "skip-night") {
      this.focusDialog(".skip-night-modal");
    }
  }

  private selectChoice(target: HTMLElement, index: number): void {
    if (this.choiceAnimating) return;
    this.choiceAnimating = true;
    const pair = target.closest<HTMLElement>(".choice-pair");
    pair?.classList.add("choosing");
    if (pair) this.addUpgradeSparks(pair);
    const selectionDelay = prefersReducedMotion()
      ? 0
      : BALANCE.ui.cardSelectionDuration;
    window.setTimeout(() => {
      this.choiceAnimating = false;
      this.animateChoiceReplacement(() => this.game.chooseDawn(index), index);
    }, selectionDelay);
  }

  private playUpgradeFeedback(target: HTMLElement): void {
    target.classList.add("upgrade-feedback");
    this.addUpgradeSparks(target);
  }

  private addUpgradeSparks(target: HTMLElement): void {
    for (let i = 0; i < 12; i += 1) {
      const spark = document.createElement("i");
      spark.className = "choice-spark";
      spark.style.setProperty("--spark-x", `${(i % 4) * 28 + 8}%`);
      spark.style.setProperty("--spark-delay", `${(i % 3) * 35}ms`);
      target.append(spark);
    }
  }

  private animateChoiceReplacement(apply: () => void, focusIndex = 0): void {
    if (this.choiceAnimating) return;
    this.choiceAnimating = true;
    const track = this.overlay.querySelector<HTMLElement>(".choice-track");
    const current = track?.querySelector<HTMLElement>(".choice-set");
    apply();
    this.crossfadeDawnTitle();
    const hasIncoming = this.game.phase === "dawn" && !this.game.enemyWarning && this.game.choices.length > 0;
    if (track && current && hasIncoming) {
      const incoming = document.createElement("div");
      incoming.className = "choice-set choice-pairs incoming";
      incoming.innerHTML = this.game.choices.map((choice, index) => this.choicePair(choice, index)).join("");
      track.append(incoming);
      const finish = (): void => {
        incoming.removeEventListener("transitionend", onTransitionEnd);
        current?.remove();
        incoming.classList.remove("incoming");
        track.classList.remove("transitioning");
        this.choiceAnimating = false;
        this.lastOverlayKey = this.overlayKey();
        this.patchDawnHeader();
        incoming.querySelectorAll<HTMLElement>(".choice-pair")[focusIndex]?.focus();
      };
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === incoming && event.propertyName === "transform") finish();
      };
      incoming.addEventListener("transitionend", onTransitionEnd);
      requestAnimationFrame(() => track.classList.add("transitioning"));
      if (prefersReducedMotion()) queueMicrotask(finish);
    } else {
      const finish = (): void => {
        current?.removeEventListener("transitionend", onTransitionEnd);
        this.choiceAnimating = false;
        this.invalidate();
        this.render(true);
      };
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === current && event.propertyName === "transform") finish();
      };
      current?.addEventListener("transitionend", onTransitionEnd);
      requestAnimationFrame(() => current?.classList.add("leaving"));
      if (!current || prefersReducedMotion()) queueMicrotask(finish);
    }
  }

  private crossfadeDawnTitle(): void {
    const title = this.overlay.querySelector<HTMLElement>(".dawn-panel header h2");
    const nextTitle = this.dawnHeading();
    if (!title || title.textContent === nextTitle) return;
    if (prefersReducedMotion()) {
      title.textContent = nextTitle;
      return;
    }
    title.classList.add("title-fading-out");
    window.setTimeout(() => {
      if (!title.isConnected) return;
      title.textContent = nextTitle;
      title.classList.remove("title-fading-out");
      title.classList.add("title-fading-in");
      requestAnimationFrame(() => title.classList.remove("title-fading-in"));
    }, BALANCE.ui.cardTransitionDuration * 0.42);
  }

  private patchDawnHeader(): void {
    const eyebrow = this.overlay.querySelector<HTMLElement>(".dawn-panel header .eyebrow");
    if (eyebrow) eyebrow.textContent = `DAWN ${this.game.night} · COUNT FROZEN`;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.dailyRewardVisible && event.code === "Tab") {
      this.trapDialogFocus(event, ".daily-rewards-modal");
      return;
    }
    if (this.dailyRewardVisible && event.code === "Escape") {
      this.dailyRewardVisible = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.overlay.querySelector<HTMLElement>('[data-action="open-daily"]')?.focus();
      return;
    }
    if (this.game.enemyWarning && event.code === "Tab") {
      this.trapDialogFocus(event, ".warning-card");
      return;
    }
    if (this.game.rerollConfirmation && event.code === "Tab") {
      this.trapDialogFocus(event, ".reroll-card");
      return;
    }
    if (this.runExitConfirmation && event.code === "Tab") {
      this.trapDialogFocus(event, ".run-exit-modal");
      return;
    }
    if (this.game.phase === "paused" && event.code === "Tab") {
      this.trapDialogFocus(event, ".pause-card");
      return;
    }
    if (this.game.skipNightConfirmation && event.code === "Tab") {
      this.trapDialogFocus(event, ".skip-night-modal");
      return;
    }
    if (this.investmentOpen && event.code === "Tab") {
      this.trapDialogFocus(event, ".investment-modal");
      return;
    }
    if (this.campaignOpen && event.code === "Tab") {
      this.trapDialogFocus(event, ".campaign-ladder-modal");
      return;
    }
    if (this.tutorialExitConfirmation && event.code === "Tab") {
      this.trapDialogFocus(event, ".tutorial-exit-modal");
      return;
    }
    if (this.game.phase === "paused" && !this.runExitConfirmation && event.code === "Escape") {
      if (this.menuPanel === "settings") {
        this.menuPanel = null;
        this.game.input.escapePressed = false;
        event.preventDefault();
        this.invalidate();
        this.render(true);
        this.overlay.querySelector<HTMLElement>('[data-action="settings"]')?.focus();
        return;
      }
      this.game.togglePause();
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.hud.querySelector<HTMLElement>('[data-action="pause"]')?.focus();
      return;
    }
    if (this.investmentOpen && event.code === "Escape") {
      this.investmentOpen = false;
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.overlay.querySelector<HTMLElement>('[data-action="open-campaign"]')?.focus();
      return;
    }
    if (this.campaignOpen && event.code === "Escape") {
      this.campaignOpen = false;
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.overlay.querySelector<HTMLElement>('[data-action="open-campaign"]')?.focus();
      return;
    }
    if (this.menuPanel && event.code === "Tab") {
      this.trapMenuPanelFocus(event);
      return;
    }
    if (this.menuPanel && event.code === "Escape") {
      const panel = this.menuPanel;
      this.menuPanel = null;
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.focusMenuPanelTrigger(panel);
      return;
    }
    if (this.game.rerollConfirmation && event.code === "Escape") {
      this.game.cancelReroll();
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.overlay.querySelector<HTMLElement>('[data-action="reroll"]')?.focus();
      return;
    }
    if (this.runExitConfirmation && event.code === "Escape") {
      this.runExitConfirmation = false;
      this.game.modalLock = false;
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.overlay.querySelector<HTMLElement>('[data-action="request-run-exit"]')?.focus();
      return;
    }
    if (this.game.skipNightConfirmation && event.code === "Escape") {
      this.game.cancelSkipNight();
      this.game.input.escapePressed = false;
      event.preventDefault();
      this.invalidate();
      this.render(true);
      this.hud.querySelector<HTMLElement>('[data-action="skip-night"]')?.focus();
      return;
    }
    if (this.tutorialOpen && event.code === "Escape") {
      this.game.input.escapePressed = false;
      const confirmationWasOpen = this.tutorialExitConfirmation;
      if (confirmationWasOpen) this.cancelTutorialExit();
      else this.requestTutorialExit();
      event.preventDefault();
      this.invalidate();
      this.render(true);
      if (confirmationWasOpen) {
        this.overlay.querySelector<HTMLElement>('[data-action="tutorial-exit"]')?.focus();
      } else {
        this.focusDialog(".tutorial-exit-modal");
      }
      return;
    }
  }

  private dialogFocusables(selector: string): HTMLElement[] {
    return [...this.overlay.querySelectorAll<HTMLElement>(
      `${selector} button:not(:disabled),${selector} input:not(:disabled)`,
    )].filter((element) => element.tabIndex >= 0);
  }

  private focusMenuPanel(): void {
    this.focusDialog(".menu-modal");
  }

  private focusDialog(selector: string): void {
    this.dialogFocusables(selector)[0]?.focus();
  }

  private focusMenuPanelTrigger(panel: Exclude<MenuPanel, null>): void {
    this.overlay.querySelector<HTMLElement>(`[data-action="${panel}"]`)?.focus();
  }

  private trapMenuPanelFocus(event: KeyboardEvent): void {
    this.trapDialogFocus(event, ".menu-modal");
  }

  private trapDialogFocus(event: KeyboardEvent, selector: string): void {
    const focusable = this.dialogFocusables(selector);
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (!first || !last) return;
    const active = document.activeElement;
    if (!this.overlay.querySelector(selector)?.contains(active)) {
      first.focus();
      event.preventDefault();
    } else if (event.shiftKey && active === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && active === last) {
      first.focus();
      event.preventDefault();
    }
  }

  private playUiActivation(action?: string): void {
    if (!action || action === "pause" || action === "resume") return;
    const confirmActions = new Set([
      "start-campaign-tier",
      "confirm-reroll",
      "confirm-skip-night",
      "confirm-tutorial-exit",
      "confirm-run-exit",
      "dismiss-warning",
      "restart-same",
      "restart-new",
      "continue-endless",
      "claim-daily",
    ]);
    const cancelActions = new Set([
      "close-panel",
      "cancel-reroll",
      "cancel-skip-night",
      "cancel-tutorial-exit",
      "cancel-run-exit",
      "menu",
      "tutorial-exit",
    ]);
    if (confirmActions.has(action)) audioManager.play("ui-confirm");
    else if (cancelActions.has(action)) audioManager.play("ui-cancel");
    else audioManager.play("ui-click");
  }

  private openTutorial(origin: TutorialOrigin): void {
    this.tutorialOrigin = origin;
    this.tutorialExitConfirmation = false;
    this.game.startTutorial();
    this.tutorialOpen = true;
    this.invalidate();
  }

  private requestTutorialExit(): void {
    this.tutorialExitConfirmation = true;
    this.game.modalLock = true;
    this.game.input.releasePointer();
    this.game.input.escapePressed = false;
  }

  private cancelTutorialExit(): void {
    this.tutorialExitConfirmation = false;
    this.game.modalLock = false;
    this.game.input.escapePressed = false;
  }

  private finishTutorial(remember: boolean): void {
    if (remember) this.writePreference(BALANCE.ui.tutorialPreferenceKey, true);
    this.tutorialExitConfirmation = false;
    this.tutorialOpen = false;
    this.game.modalLock = false;
    this.game.returnToMenu();
    this.invalidate();
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  }

  private writePreference(key: string, value: boolean): void {
    try {
      browserStorage()?.setItem(key, `${value}`);
    } catch {
      // Local preferences are optional when storage is unavailable.
    }
  }

  private asStructure(action: ActionKind): StructureKind | null {
    return STRUCTURE_ORDER.includes(action as StructureKind) ? action as StructureKind : null;
  }

  private escapeAttribute(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  private invalidate(): void {
    this.lastOverlayKey = "";
    this.hudStructureKey = "";
  }
}
