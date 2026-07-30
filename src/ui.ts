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

const labels: Record<StructureKind, string> = {
  wall: "Wall",
  spikes: "Spikes",
  door: "Door",
  harvester: "Harvester",
  turret: "Turret",
};

const enemyInfo: Record<EnemyKind, { title: string; text: string; tell: string }> = {
  basic: { title: "Basic Zombie", text: "A steady attacker focused on the flag.", tell: "Green body" },
  runner: { title: "Runner", text: "Fast movement and quick attacks, but lower health.", tell: "Small bright-green body" },
  breaker: { title: "Breaker", text: "Slow, armored, and brutal against structures.", tell: "Dark body and helmet" },
  jumper: { title: "Jumper", text: "Telegraphs a hop over one constructed barrier.", tell: "Green jump burst" },
  summoner: { title: "Summoner", text: "Creates basic zombies, up to three living summons.", tell: "Purple summoning ring" },
  boss: { title: "The Last Count", text: "Smashes structures and summons at half health.", tell: "Ten health segments" },
};

type MenuPanel = "controls" | "settings" | "challenges" | "credits" | null;
type TutorialOrigin = "menu";

export class Ui {
  private difficulty: Difficulty = "normal";
  private openTierPanel: StructureKind | null = null;
  private tutorialOpen = false;
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

  constructor(
    private readonly game: Game,
    private readonly hud: HTMLElement,
    private readonly overlay: HTMLElement,
    private readonly toastLayer: HTMLElement,
  ) {
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
    ].join("|");
    if (!force && key === this.lastOverlayKey) return;
    this.lastOverlayKey = key;
    if (this.tutorialOpen) this.overlay.innerHTML = this.tutorialMarkup();
    else if (this.game.skipNightConfirmation) this.overlay.innerHTML = this.skipNightMarkup();
    else if (this.game.phase === "menu") this.overlay.innerHTML = this.menuMarkup();
    else if (this.game.phase === "paused") this.overlay.innerHTML = this.pauseMarkup();
    else if (this.game.phase === "dawn") this.overlay.innerHTML = this.dawnMarkup();
    else if (this.game.phase === "victory" || this.game.phase === "defeat") this.overlay.innerHTML = this.resultMarkup();
    else this.overlay.innerHTML = "";
  }

  private menuMarkup(): string {
    const recent = this.game.records[0];
    const challengeModifiers = resolveChallengeModifiers(this.selectedChallenges);
    const daySeconds = Math.round(BALANCE.dayDuration * challengeModifiers.dayDurationMultiplier);
    return `
      <section class="screen menu-screen">
        <main class="menu-card">
          <p class="eyebrow">GMTK 2026 · COUNT DOWN</p>
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
            <button data-action="controls">${gameSymbol("fists")}<span>Controls</span></button>
            <button data-action="challenges">${icon("settings")}<span>Challenges${this.selectedChallenges.size ? ` (${this.selectedChallenges.size})` : ""}</span></button>
            <button data-action="settings">${icon("settings")}<span>Settings</span></button>
            <button data-action="credits">${icon("info", "info-symbol")}<span>Credits</span></button>
            <button data-action="fullscreen">${icon("maximize")}<span>Fullscreen</span></button>
          </nav>
          <footer>
          <span>${daySeconds}s DAY · ${BALANCE.nightDuration}s NIGHT · 10 NIGHTS${this.selectedChallenges.size ? ` · ${this.selectedChallenges.size} CHALLENGES` : ""}</span>
            <span>v1.2.0</span>
          ${recent ? `<span class="last-run">${recent.victory ? "Victory" : "Defeat"} · ${recent.nightsSurvived}/10${recent.challengeIds?.length ? ` · ${recent.challengeIds.length} challenges` : ""}</span>` : ""}
          </footer>
        </main>
        ${this.menuPanel ? this.menuPanelMarkup() : ""}
      </section>`;
  }

  private menuPanelMarkup(): string {
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
            <span>${audio.muted ? icon("close") : buildBarIcon("selected-tier")}<b>Mute all audio</b></span><em>${audio.muted ? "ON" : "OFF"}</em>
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
    return `<section class="screen modal-screen"><div class="modal pause-card">
      <p class="eyebrow">COUNT FROZEN</p><h2>Paused</h2>
      <button class="primary wide" data-action="resume">${icon("play")} Resume</button>
      <button class="ghost wide" data-action="menu">Main menu</button>
    </div></section>`;
  }

  private skipNightMarkup(): string {
    return `<section class="screen modal-screen skip-night-screen"><div class="modal compact">
      <p class="eyebrow">END DAY EARLY</p>
      <h2>Skip to Night?</h2>
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
      <div class="tutorial-guide-card" data-highlight="${task.highlight}">
        <button class="tutorial-exit" data-action="tutorial-exit" aria-label="Exit tutorial">${icon("close")}</button>
        <header><span>TRAINING ${this.game.tutorialSection + 1} / ${TUTORIAL_SECTIONS.length}</span><b>${section.title}</b></header>
        <div class="tutorial-progress">${TUTORIAL_SECTIONS.map((_, index) =>
          `<i class="${index === this.game.tutorialSection ? "current" : index < this.game.tutorialSection ? "done" : ""}"></i>`).join("")}</div>
        <p>${this.game.tutorialSectionComplete ? section.summary : task.instructions}</p>
        ${this.game.tutorialSectionComplete ? `<footer>
          <button class="ghost" data-action="tutorial-replay">${icon("restart")} Replay Section</button>
          <button class="primary" data-action="tutorial-next-section">${finalSection ? "Back to Main Menu" : `Next Section ${icon("arrow-right")}`}</button>
        </footer>` : `<small>Complete the highlighted action to continue.</small>`}
      </div>
    </section>`;
  }

  private dawnMarkup(): string {
    if (this.game.enemyWarning) {
      const info = enemyInfo[this.game.enemyWarning];
      return `<section class="screen modal-screen danger-screen"><div class="modal warning-card">
        <p class="eyebrow">NEW THREAT · NIGHT ${this.game.night + 1}</p>
        <img class="threat-symbol" data-zombie-portrait="${this.game.enemyWarning}" src="${ASSETS.enemies[this.game.enemyWarning]}" alt="" aria-hidden="true"><h2>${info.title}</h2>
        <p>${info.text}</p><span class="tell">${info.tell}</span>
        <button class="primary wide" data-action="dismiss-warning">${icon("play")} Begin day ${this.game.night + 1}</button>
      </div></section>`;
    }
    const heading = this.dawnHeading();
    if (this.game.rerollConfirmation) {
      const cost = this.game.getRerollCost();
      return `<section class="screen modal-screen reroll-screen"><div class="modal reroll-card">
        <p class="eyebrow">CONFIRM RUN-WIDE REROLL</p><h2>Spend half of every resource?</h2>
        <p>All four totals are affected. The discarded cards cannot be selected afterward.</p>
        <div class="reroll-shared-cost">${costIcons(cost, "-", this.game.resources)}</div>
        <p class="reroll-count">Used ${this.game.rerollsUsed} of ${BALANCE.reroll.limit} · ${BALANCE.reroll.limit - this.game.rerollsUsed} remaining</p>
        <div class="reroll-actions"><button class="ghost" data-action="cancel-reroll">Keep cards</button><button class="primary" data-action="confirm-reroll">Confirm reroll</button></div>
      </div></section>`;
    }
    return `<section class="screen dawn-screen"><div class="dawn-panel">
      <header><p class="eyebrow">DAWN ${this.game.night} · COUNT FROZEN</p><h2>${heading}</h2><span>Each benefit empowers the horde.</span>
      </header>
        <div class="choice-viewport"><div class="choice-track" style="--card-transition-duration:${BALANCE.ui.cardTransitionDuration}ms;--card-transition-easing:${BALANCE.ui.cardTransitionEasing}"><div class="choice-set choice-pairs">${this.game.choices.map((choice, index) => this.choicePair(choice, index)).join("")}</div></div></div>
      <div class="reroll-dock"><p>Rerolls remaining <strong>${BALANCE.reroll.limit - this.game.rerollsUsed}/${BALANCE.reroll.limit}</strong></p>
      <button class="reroll-button" data-action="reroll" ${this.game.rerollsUsed >= BALANCE.reroll.limit ? "disabled" : ""}>${icon("shuffle")} Reroll choices <span>Costs half of every owned resource</span></button></div>
    </div></section>`;
  }

  private choicePair(choice: Choice, index: number): string {
    return `<button class="choice-pair" data-choice="${index}" aria-label="${choice.name} and ${choice.mutationName}">
      <article class="benefit-card"><span class="card-art">${this.choiceIcon(choice)}</span><small>${choice.kind}</small><h3>${choice.name}</h3><p>${choice.description}</p></article>
      <span class="choice-connector"><i></i><b>AND</b><i></i></span>
      <article class="mutation-card"><span class="card-art mutation-art">${this.mutationIcon(choice)}</span><small>mutation</small><h3>${choice.mutationName}</h3><p>${choice.mutationDescription}</p></article>
      <span class="pair-select">${buildBarIcon("selected-tier")} Apply both</span>
    </button>`;
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
    return `<section class="screen result-screen ${victory ? "won" : "lost"}"><div class="result-card">
      <p class="eyebrow">${victory ? "FINAL COUNT CLEARED" : "COUNT ENDED"}</p>
      <h2>${victory ? "Forest defended" : "Run defeated"}</h2>
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
    this.playUiActivation(target.dataset.action);
    switch (target.dataset.action) {
      case "start": {
        const input = this.overlay.querySelector<HTMLInputElement>("#seed-input");
        this.seedDraft = input?.value ?? this.seedDraft;
        this.game.startRun(this.difficulty, this.seedDraft, [...this.selectedChallenges]);
        break;
      }
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
        this.finishTutorial(false);
        break;
      case "controls":
      case "settings":
      case "challenges":
      case "credits":
        this.menuPanel = target.dataset.action as Exclude<MenuPanel, null>;
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
        this.game.restart(true);
        break;
      case "restart-new":
        this.game.restart(false);
        break;
      case "menu":
        this.game.modalLock = false;
        this.tutorialOpen = false;
        this.game.returnToMenu();
        break;
    }
    this.invalidate();
    this.render(true);
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
    if (this.game.skipNightConfirmation && event.code === "Escape") {
      this.game.cancelSkipNight();
      event.preventDefault();
      this.invalidate();
      this.render(true);
      return;
    }
    if (this.tutorialOpen) {
      if (event.code === "Escape") {
        this.finishTutorial(false);
        event.preventDefault();
      }
    }
  }

  private playUiActivation(action?: string): void {
    if (!action || action === "pause" || action === "resume") return;
    const confirmActions = new Set([
      "start",
      "confirm-reroll",
      "confirm-skip-night",
      "dismiss-warning",
      "restart-same",
      "restart-new",
    ]);
    const cancelActions = new Set([
      "close-panel",
      "cancel-reroll",
      "cancel-skip-night",
      "menu",
      "tutorial-exit",
    ]);
    if (confirmActions.has(action)) audioManager.play("ui-confirm");
    else if (cancelActions.has(action)) audioManager.play("ui-cancel");
    else audioManager.play("ui-click");
  }

  private openTutorial(origin: TutorialOrigin): void {
    this.tutorialOrigin = origin;
    this.game.startTutorial();
    this.tutorialOpen = true;
    this.invalidate();
  }

  private finishTutorial(remember: boolean): void {
    if (remember) this.writePreference(BALANCE.ui.tutorialPreferenceKey, true);
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
