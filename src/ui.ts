import { BALANCE, RESOURCE_ORDER, STRUCTURE_ORDER, TIER_ORDER } from "./config";
import { generateSeed } from "./rng";
import type { Game } from "./game";
import { canAfford } from "./rules";
import { browserStorage } from "./storage";
import { buildBarIcon, costIcons, gameSymbol, icon, resourceIcon } from "./ui-icons";
import { CARD_DEFINITIONS, TUTORIAL_SECTIONS } from "./content";
import { CHALLENGES, resolveChallengeModifiers } from "./challenges";
import { challengeIcon } from "./challenge-icons";
import { audioManager, type AudioVolumeChannel } from "./audio";
import { ASSETS } from "./assets";
import type { ActionKind, Choice, Difficulty, EnemyKind, StructureKind, Tier } from "./types";
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
import { equipmentUpgradePrice, nextEquipmentTier, recyclingRate } from "./equipment";
import { levelProgress, type DailyRewardResult } from "./profile";

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

const enemyInfo: Record<EnemyKind, { title: string; text: string; tell: string }> = {
  basic: { title: "Basic Zombie", text: "A steady attacker focused on the flag.", tell: "Green body" },
  runner: { title: "Runner", text: "Fast movement and quick attacks, but lower health.", tell: "Small bright-green body" },
  breaker: { title: "Breaker", text: "Slow, armored, and brutal against structures.", tell: "Dark body and helmet" },
  jumper: { title: "Jumper", text: "Telegraphs a hop over one constructed barrier.", tell: "Green jump burst" },
  summoner: { title: "Summoner", text: "Creates basic zombies, up to three living summons.", tell: "Purple summoning ring" },
  boss: { title: "The Last Count", text: "Smashes structures and summons at half health.", tell: "Ten health segments" },
};

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
  private investmentDraft = 0;
  private profileColorDraft: string;
  private profileEyeDraft: EyeStyle;
  private dailyRewardVisible: boolean;

  constructor(
    private readonly game: Game,
    private readonly hud: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly toastLayer: HTMLElement,
    private readonly dailyReward: DailyRewardResult = {
      granted: false,
      amount: 0,
      date: "",
    },
  ) {
    this.profileColorDraft = game.profileManager?.profile.playerColor
      ?? META_BALANCE.customization.colors[0];
    this.profileEyeDraft = game.profileManager?.profile.eyeStyle ?? "round";
    this.dailyRewardVisible = dailyReward.granted;
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
        this.investmentDraft = Number(investment.value);
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
    const reduced = this.readPreference(BALANCE.ui.reducedMotionPreferenceKey);
    document.body.classList.toggle("reduce-motion", reduced);
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
    const key = [
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
      this.investmentDraft,
      this.dailyRewardVisible,
      this.game.profileManager
        ? JSON.stringify(this.game.profileManager.profile)
        : "",
      this.game.platform?.user?.id ?? "guest",
    ].join("|");
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
    if (this.tutorialOpen && !this.tutorialExitConfirmation) {
      this.overlay.querySelector<HTMLElement>(".tutorial-guide-card")?.focus();
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
    return `
      <section class="screen menu-screen">
        ${this.profileChipMarkup()}
        <nav class="meta-actions" aria-label="Progression and equipment">
          <button data-action="upgrades"><img src="${ASSETS.ui["upgrade-node"]}" alt="" aria-hidden="true"><span><b>Upgrades</b><small>Spend XP</small></span></button>
          <button data-action="shop"><img src="${META_BALANCE.assets.equipment.sword.wood}" alt="" aria-hidden="true"><span><b>Shop</b><small>Manage gear</small></span></button>
        </nav>
        <main class="menu-card">
          <h1>FLAG <span>FORT</span></h1>
          <p class="menu-copy">Build by day. Hold through ten nights.</p>
          <div class="difficulty-picker" role="group" aria-label="Difficulty">
            ${(["easy", "normal", "hard", "impossible"] as Difficulty[]).map((difficulty) => `
              <button class="difficulty ${this.difficulty === difficulty ? "selected" : ""}" data-difficulty="${difficulty}" aria-pressed="${this.difficulty === difficulty}">
                <strong>${BALANCE.difficulty[difficulty].label}</strong>
                <span class="tooltip">${this.difficultyText(difficulty)}</span>
              </button>`).join("")}
          </div>
          <div class="seed-row">
            <label class="seed-box"><span>SEED</span><input id="seed-input" maxlength="48" autocomplete="off" spellcheck="false" placeholder="Random seed" value="${this.escapeAttribute(this.seedDraft)}"></label>
            <button class="icon-button seed-random" data-action="random-seed" aria-label="Randomize seed">${icon("shuffle")}<span class="tooltip">Randomize seed</span></button>
          </div>
      <button class="primary start-button tutorial-start-button" data-action="tutorial-menu">${icon("book")}<span>Tutorial</span></button>
      <button class="primary start-button" data-action="start">${icon("play")}<span>Start run</span></button>
      <nav class="menu-actions" aria-label="Game options">
            <button data-action="controls">${icon("gamepad-2")}<span>Controls</span><span class="tooltip">Controls</span></button>
            <button data-action="challenges">${icon("trophy")}<span>Challenges${this.selectedChallenges.size ? ` (${this.selectedChallenges.size})` : ""}</span><span class="tooltip">Challenges</span></button>
            <button data-action="settings">${icon("sliders-horizontal")}<span>Settings</span><span class="tooltip">Settings</span></button>
            <button data-action="credits">${icon("info", "info-symbol")}<span>Credits</span></button>
            <button data-action="fullscreen">${icon("maximize")}<span>Fullscreen</span></button>
          </nav>
          <footer>
          <span>${daySeconds}s DAY · ${BALANCE.nightDuration}s NIGHT · 10 NIGHTS${this.selectedChallenges.size ? ` · ${this.selectedChallenges.size} CHALLENGES` : ""}</span>
            <span>v1.3.0</span>
          ${recent ? `<span class="last-run">${recent.victory ? "Victory" : "Defeat"} · ${recent.mode === "endless" ? `${recent.nightsSurvived} Endless nights` : `${recent.nightsSurvived}/10`}${recent.challengeIds?.length ? ` · ${recent.challengeIds.length} challenges` : ""}</span>` : ""}
          </footer>
        </main>
        ${this.dailyRewardVisible ? `<aside class="daily-reward" role="status">
          <span class="daily-coin">${coinAmount(this.dailyReward.amount, "+")}</span>
          <div><b>Daily supply drop</b><small><em aria-hidden="true">¢</em><span class="sr-only">Coins</span> added for ${this.dailyReward.date} UTC</small></div>
          <button data-action="dismiss-daily" aria-label="Dismiss daily reward">${icon("close")}</button>
        </aside>` : ""}
        ${this.menuPanel ? this.menuPanelMarkup() : ""}
      </section>`;
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
      const reduced = document.body.classList.contains("reduce-motion");
      const audio = audioManager.getSettings();
      return `<div class="menu-modal"><div class="modal compact">
        <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
        <p class="eyebrow">SETTINGS</p><h2>Audio &amp; display</h2>
        <div class="audio-settings">
          ${this.volumeControl("master", "Master", audio.master)}
          ${this.volumeControl("effects", "Effects", audio.effects)}
          ${this.volumeControl("ambience", "Ambience", audio.ambience)}
          ${this.volumeControl("music", "Music", audio.music)}
          ${this.volumeControl("countdown", "Final countdown", audio.countdown)}
          <button class="setting-toggle ${audio.muted ? "active" : ""}" data-action="audio-mute" aria-pressed="${audio.muted}">
            <span>${audio.muted ? buildBarIcon("selected-tier") : icon("close")}<b>Mute all audio</b></span><em>${audio.muted ? "ON" : "OFF"}</em>
          </button>
        </div>
        <button class="setting-toggle ${reduced ? "active" : ""}" data-action="reduce-motion" aria-pressed="${reduced}">
          <span>${reduced ? buildBarIcon("selected-tier") : icon("settings")}<b>Reduced motion</b></span><em>${reduced ? "ON" : "OFF"}</em>
        </button>
        <button class="secondary wide" data-action="tutorial-menu">${icon("book")} Show tutorial again</button>
      </div></div>`;
    }
    if (this.menuPanel === "challenges") {
      return `<div class="menu-modal"><div class="modal challenge-modal">
        <button class="modal-close" data-action="close-panel" aria-label="Close">${icon("close")}</button>
        <p class="eyebrow">OPTIONAL CHALLENGES</p><h2>Choose any combination</h2>
        <p>Every selected rule stacks independently and remains deterministic for the run seed.</p>
        <div class="challenge-grid">${CHALLENGES.map((challenge) => {
          const selected = this.selectedChallenges.has(challenge.id);
          return `<label class="challenge-card ${selected ? "selected" : ""}">
            <input type="checkbox" data-challenge="${challenge.id}" ${selected ? "checked" : ""}
              aria-label="${challenge.title}">
            <span class="challenge-card-icon">${challengeIcon(challenge.icon)}</span>
            <span class="challenge-card-copy"><strong>${challenge.title}</strong><small>${challenge.description}</small></span>
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
            <span>${icon("upgrade-node")}<b>${profile.spendableXp}</b><small>Spendable XP</small></span>
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

  private shopModalMarkup(): string {
    const profile = this.game.profileManager?.profile;
    if (!profile) return "";
    const copy: Record<EquipmentKind, { title: string; text: string }> = {
      helmet: { title: "Fort Helmet", text: "Reduces incoming player damage. Diamond protection reaches 50%." },
      wrench: { title: "Lucky Wrench", text: "Can make a completed repair free after the normal cost is verified." },
      sword: { title: "Night Sword", text: "Replaces fists during nighttime melee with a controlled sweeping cleave." },
      mallet: { title: "Salvage Mallet", text: "Raises the exact per-resource return from recycling owned structures." },
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
        const activeRecyclingRate = Math.round(recyclingRate(item.tier, item.equipped) * 100);
        return `<article class="shop-item">
          <div class="shop-art"><img src="${META_BALANCE.assets.equipment[kind][shownTier]}" alt=""></div>
          <p class="eyebrow">${item.tier ? `${item.tier.toUpperCase()} TIER` : "LOCKED"}</p>
          <h3>${copy[kind].title}</h3><p>${copy[kind].text}</p>
          ${kind === "mallet" ? `<div class="equipment-effect" aria-label="Active recycling return ${activeRecyclingRate} percent">
            <span>ACTIVE RETURN</span><strong>${activeRecyclingRate}%</strong>
            <small>Base 25% · Wood 35% · Stone 45% · Gold 60% · Diamond 75%</small>
          </div>` : ""}
          <div class="tier-track">${EQUIPMENT_TIER_ORDER.map((tier) => `<i class="${item.tier && EQUIPMENT_TIER_ORDER.indexOf(tier) <= EQUIPMENT_TIER_ORDER.indexOf(item.tier) ? "owned" : ""}" title="${tier}"></i>`).join("")}</div>
          ${next && price !== null ? `<button class="primary wide" data-action="buy-equipment" data-equipment="${kind}" ${profile.coins < price ? "disabled" : ""}>
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
        <input type="range" min="0" max="${maximum}" step="1" value="${this.investmentDraft}" data-investment>
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

  private difficultyText(difficulty: Difficulty): string {
    if (difficulty === "easy") return "More flag health and a gentler horde";
    if (difficulty === "normal") return "The intended survival challenge";
    if (difficulty === "hard") return "Tougher, faster, larger waves";
    return "An intentionally extreme count";
  }

  private pauseMarkup(): string {
    return `<section class="screen modal-screen"><div class="modal pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <p class="eyebrow">COUNT FROZEN</p><h2 id="pause-title">Paused</h2>
      <button class="primary wide" data-action="resume">${icon("play")} Resume</button>
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
      <article class="benefit-card"><span class="card-art">${this.choiceIcon(choice)}</span><small>${choice.kind}</small><h3>${choice.name}</h3><p>${this.choiceDescription(choice)}</p></article>
      <span class="choice-connector"><i></i><b>AND</b><i></i></span>
      <article class="mutation-card"><span class="card-art mutation-art">${this.mutationIcon(choice)}</span><small>mutation</small><h3>${choice.mutationName}</h3><p>${choice.mutationDescription}</p></article>
      <span class="pair-select">${buildBarIcon("selected-tier")} Apply both</span>
    </button>`;
  }

  private choiceDescription(choice: Choice): string {
    const permanent = this.game.profileManager?.profile.permanentUpgrades[
      choice.id as PermanentUpgradeId
    ];
    if (choice.kind !== "upgrade" || permanent === undefined || permanent <= 0) {
      return choice.description;
    }
    return `${choice.description} Permanent base: +${Math.round(permanentUpgradePercent(permanent) * 100)}%; this temporary benefit is applied afterward.`;
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
    const definition = CARD_DEFINITIONS.find(
      (card) => card.category === "mutation" && card.id === choice.mutationId,
    );
    if (!definition) throw new Error(`Missing mutation card illustration: ${choice.mutationId}`);
    return `<img src="${definition.illustration}" alt="">`;
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
      const investmentOutcome = profitOrLoss > 0
        ? { className: "positive", label: "PROFIT", sign: "+" }
        : profitOrLoss < 0
          ? { className: "negative", label: "LOSS", sign: "-" }
          : { className: "neutral", label: "BREAK EVEN", sign: "=" };
      const categories = [
        ["Surviving structures", settlement.xp.structures],
        ["Personal zombie kills", settlement.xp.personalKills],
        ["Remaining resources", settlement.xp.resources],
        ["Nights survived", settlement.xp.nights],
        ["Difficulty bonus", settlement.xp.difficulty],
        ["Campaign victory", settlement.xp.victory],
      ] as const;
      return `<section class="screen result-screen ${victory ? "won" : "lost"}"><div class="result-card reward-result-card" role="region" aria-labelledby="result-title" tabindex="-1">
        <p class="eyebrow">${victory ? "FINAL COUNT CLEARED" : "COUNT ENDED"}</p>
        <h2 id="result-title">${victory ? "Forest defended" : "Run settled"}</h2>
        ${this.game.defeatReason ? `<p class="result-reason">${this.game.defeatReason}</p>` : ""}
        <div class="reward-body"><div class="reward-list"><div class="reward-categories">${categories.map(([label, value], index) => `<div class="reward-line" style="--reveal-index:${index}">
          <span>${label}</span><b>+${value} XP</b></div>`).join("")}</div>
        <button class="reward-skip" data-action="reveal-rewards">Show totals now</button>
        </div><div class="reward-summary">
        <section class="reward-total" style="--reveal-index:6"><span>TOTAL REWARD</span><strong>+${settlement.xp.total} XP</strong></section>
        <div class="level-transition" style="--reveal-index:7">
          <span><small>Before</small><b>Level ${previous.level}</b><em>${previous.current}/${previous.required} XP</em></span>
          <i>${icon("arrow-right")}</i>
          <span><small>After</small><b>Level ${next.level}</b><em>${next.current}/${next.required} XP</em></span>
          ${settlement.newLevel > settlement.previousLevel ? `<strong>LEVEL UP ×${settlement.newLevel - settlement.previousLevel}</strong>` : ""}
        </div>
        <div class="coin-settlement ${investmentOutcome.className}" style="--reveal-index:8" aria-label="Investment outcome">
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
      <h2 id="result-title">${victory ? "Forest defended" : "Run defeated"}</h2>
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
    const phaseKey = this.game.phase === "night" ? "night" : "day";
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
      <div class="player-status">
        <span class="health-icon">${icon("heart")}</span><div class="health-track"><i data-health-bar></i></div><b data-health-value></b>
        <button class="hud-icon-button" data-action="pause" aria-label="Pause">${icon("pause")}<span class="tooltip">Pause</span></button>
      </div>
      <div class="countdown-stack">
        ${this.runProgressMarkup()}
        <div class="clock" data-clock-panel><div class="clock-face"><strong data-clock></strong></div><small data-night></small><span data-phase-label></span></div>
        ${this.game.phase === "day" && !this.game.tutorialMode ? `<button class="skip-night-button" data-action="skip-night" aria-label="Skip to Night">${icon("skip")}<span>Skip to Night</span><span class="tooltip">End the day early with no reward</span></button>` : ""}
    </div>
      ${this.game.debugAdaptive ? this.adaptiveDebugMarkup() : ""}
      <aside class="resources" aria-label="Resources">${RESOURCE_ORDER.map((resource) =>
        `<div title="${resource}">${resourceIcon(resource, true)}<b data-resource="${resource}">0</b></div>`).join("")}</aside>
      <div class="seed-chip"><b>${this.game.seed}</b><button data-action="copy-seed" aria-label="Copy seed">${icon("copy")}<span class="tooltip">Copy seed</span></button></div>
      ${this.openTierPanel ? this.tierPanelMarkup(this.openTierPanel) : ""}
      <div class="context-readout" data-context></div>
      <div class="toolbar" role="toolbar" aria-label="Actions">
        ${this.actionButton(1, "fists", "Fists", gameSymbol("fists", this.game.getBestGlove()))}
      ${this.actionButton(
        2,
        "tool",
        this.game.phase === "night" ? "Bow" : "Repair",
        this.game.phase === "night" ? buildBarIcon("nighttime-bow") : gameSymbol("tool"),
        this.game.phase === "day" && this.game.getChallengeModifiers().disablesStructureRepair,
      )}
        ${this.actionButton(3, "recycle", "Recycle", gameSymbol("recycle"), this.game.phase === "night")}
        ${STRUCTURE_ORDER.map((kind, index) => this.structureButton(kind, index + 4)).join("")}
      </div>`;
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
        const milestone = BALANCE.nightMilestones.find((item) => item.night === night);
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
    const unavailable = this.game.phase === "night" || !this.game.isTutorialSlotAllowed(slot);
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
    this.setText("[data-night]", `${this.game.night} / 10`);
    this.setText("[data-phase-label]", this.game.isBossNight() && clock === 0
      ? "BOSS"
      : this.game.phase === "night" ? "NIGHT" : "DAY");
    const clockPanel = this.hud.querySelector<HTMLElement>("[data-clock-panel]");
    clockPanel?.style.setProperty("--clock-shake", `${BALANCE.ui.clockShakeStrength}px`);
    clockPanel?.classList.toggle("night", this.game.phase === "night");
    clockPanel?.classList.toggle("urgent", clock <= 10);
    clockPanel?.classList.toggle("overtime", this.game.phase === "night" && clock === 0);
    clockPanel?.classList.toggle("transition-impact", this.game.phaseTransitionImpact > 0);
    if (clock <= 10 && clock !== this.lastClockSecond) {
      clockPanel?.classList.remove("second-impact", "zero-impact");
      void clockPanel?.offsetWidth;
      clockPanel?.classList.add(clock === 0 ? "zero-impact" : "second-impact");
    }
    this.lastClockSecond = clock;
    for (const resource of RESOURCE_ORDER) this.setText(`[data-resource="${resource}"]`, `${this.game.resources[resource]}`);
    const liveThreat = this.game.getAdaptiveThreat();
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

  private setText(selector: string, value: string): void {
    const element = this.hud.querySelector<HTMLElement>(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  private adaptiveDebugMarkup(): string {
    const threat = this.game.getAdaptiveThreat();
    return `<aside class="adaptive-debug" aria-label="Adaptive difficulty debug">
      <span>Actual <b data-adaptive-actual>${threat.actual}</b></span>
      <span>Expected <b data-adaptive-expected>${threat.expected}</b></span>
      <span>Difference <b data-adaptive-difference>${threat.difference}</b></span>
      <span>Structure <b data-adaptive-structure>${threat.structureMultiplier.toFixed(3)}</b></span>
      <span>Level ${threat.playerLevel} <b data-adaptive-level>${threat.levelMultiplier.toFixed(3)}</b></span>
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
      case "start": {
        const input = this.overlay.querySelector<HTMLInputElement>("#seed-input");
        this.seedDraft = input?.value ?? this.seedDraft;
        if (this.game.profileManager) {
          this.investmentDraft = 0;
          this.investmentOpen = true;
        } else {
          this.game.startRun(this.difficulty, this.seedDraft, [...this.selectedChallenges]);
        }
        break;
      }
      case "confirm-investment": {
        const started = this.game.startRun(
          this.difficulty,
          this.seedDraft,
          [...this.selectedChallenges],
          false,
          { investment: this.investmentDraft },
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
      case "reduce-motion":
        this.toggleReducedMotion();
        break;
      case "audio-mute":
        audioManager.toggleMuted();
        break;
      case "dismiss-daily":
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
          this.game.profileManager?.buyPermanentUpgrade(
            target.dataset.upgrade as PermanentUpgradeId,
          );
        }
        break;
      case "buy-equipment":
        if (target.dataset.equipment) {
          this.game.profileManager?.buyEquipment(target.dataset.equipment as EquipmentKind);
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
        this.game.returnToMenu();
        this.investmentDraft = 0;
        this.investmentOpen = true;
        break;
      case "restart-new":
        this.seedDraft = "";
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
        if (this.game.phase === "paused" && !this.game.tutorialMode) {
          this.game.endRunVoluntarily();
        } else this.game.returnToMenu();
        break;
    }
    this.invalidate();
    this.render(true);
    if (this.game.rerollConfirmation && action === "reroll") {
      this.focusDialog(".reroll-card");
    }
    if (action === "cancel-reroll") {
      this.overlay.querySelector<HTMLElement>('[data-action="reroll"]')?.focus();
    }
    if (this.investmentOpen && (
      action === "start"
      || action === "restart-same"
      || action === "restart-new"
    )) {
      this.focusDialog(".investment-modal");
    } else if (action === "cancel-investment") {
      this.overlay.querySelector<HTMLElement>('[data-action="start"]')?.focus();
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
    if (target.dataset.action === "skip-night" || target.dataset.action === "copy-seed") {
      audioManager.play("ui-click");
    }
    if (target.dataset.action === "pause") {
      this.game.togglePause();
    } else if (target.dataset.action === "skip-night") {
      this.game.requestSkipNight();
    } else if (target.dataset.action === "copy-seed") {
      this.game.copySeed();
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
    for (let i = 0; i < 12; i += 1) {
      const spark = document.createElement("i");
      spark.className = "choice-spark";
      spark.style.setProperty("--spark-x", `${(i % 4) * 28 + 8}%`);
      spark.style.setProperty("--spark-delay", `${(i % 3) * 35}ms`);
      pair?.append(spark);
    }
    const selectionDelay = document.body.classList.contains("reduce-motion")
      ? 0
      : BALANCE.ui.cardSelectionDuration;
    window.setTimeout(() => {
      this.choiceAnimating = false;
      this.animateChoiceReplacement(() => this.game.chooseDawn(index));
    }, selectionDelay);
  }

  private animateChoiceReplacement(apply: () => void): void {
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
        this.invalidate();
        this.render(true);
      };
      const onTransitionEnd = (event: TransitionEvent): void => {
        if (event.target === incoming && event.propertyName === "transform") finish();
      };
      incoming.addEventListener("transitionend", onTransitionEnd);
      requestAnimationFrame(() => track.classList.add("transitioning"));
      if (document.body.classList.contains("reduce-motion")) queueMicrotask(finish);
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
      if (!current || document.body.classList.contains("reduce-motion")) queueMicrotask(finish);
    }
  }

  private crossfadeDawnTitle(): void {
    const title = this.overlay.querySelector<HTMLElement>(".dawn-panel header h2");
    const nextTitle = this.dawnHeading();
    if (!title || title.textContent === nextTitle) return;
    if (document.body.classList.contains("reduce-motion")) {
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

  private handleKeydown(event: KeyboardEvent): void {
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
    if (this.tutorialExitConfirmation && event.code === "Tab") {
      this.trapDialogFocus(event, ".tutorial-exit-modal");
      return;
    }
    if (this.game.phase === "paused" && !this.runExitConfirmation && event.code === "Escape") {
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
      this.overlay.querySelector<HTMLElement>('[data-action="start"]')?.focus();
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
      "start",
      "confirm-reroll",
      "confirm-skip-night",
      "confirm-tutorial-exit",
      "confirm-run-exit",
      "dismiss-warning",
      "restart-same",
      "restart-new",
      "continue-endless",
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

  private toggleReducedMotion(): void {
    const reduced = !document.body.classList.contains("reduce-motion");
    document.body.classList.toggle("reduce-motion", reduced);
    this.writePreference(BALANCE.ui.reducedMotionPreferenceKey, reduced);
    this.invalidate();
  }

  private async toggleFullscreen(): Promise<void> {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  }

  private readPreference(key: string): boolean {
    try {
      return browserStorage()?.getItem(key) === "true";
    } catch {
      return false;
    }
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
