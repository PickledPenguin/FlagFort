// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it, vi } from "vitest";
import { audioManager } from "./audio";
import { BALANCE } from "./config";
import { Game } from "./game";
import { Input } from "./input";
import { ProfileManager } from "./profile";
import { Ui } from "./ui";

interface Harness {
  game: Game;
  hud: HTMLElement;
  input: Input;
  overlay: HTMLElement;
  toast: HTMLElement;
  ui: Ui;
}

function createHarness(configureProfile?: (manager: ProfileManager) => void): Harness {
  const values = new Map<string, string>();
  Object.defineProperty(document.defaultView, "localStorage", {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
  document.body.innerHTML = `
    <canvas id="game-canvas"></canvas>
    <div id="hud"></div>
    <div id="overlay"></div>
    <div id="toast-layer"></div>
  `;
  const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
  const hud = document.querySelector<HTMLElement>("#hud")!;
  const overlay = document.querySelector<HTMLElement>("#overlay")!;
  const toast = document.querySelector<HTMLElement>("#toast-layer")!;
  canvas.setPointerCapture = vi.fn();
  canvas.getBoundingClientRect = () => ({
    bottom: 720,
    height: 720,
    left: 0,
    right: 1280,
    top: 0,
    width: 1280,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const input = new Input(canvas);
  const manager = configureProfile ? new ProfileManager(window.localStorage) : null;
  if (manager && configureProfile) configureProfile(manager);
  const game = new Game(input, manager);
  const ui = new Ui(game, hud, overlay, toast);
  game.startRun("normal", "ui-test-seed", [], false, { settle: false });
  ui.render(true);
  return { game, hud, input, overlay, toast, ui };
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("event-driven HUD interaction", () => {
  it("selects toolbar actions and material tiers with the mouse", () => {
    const { game, hud } = createHarness();
    click(hud.querySelector('[data-slot="4"]')!);
    expect(game.selectedSlot).toBe(4);
    expect(hud.querySelector(".tier-panel")).not.toBeNull();

    click(hud.querySelector('[data-kind="wall"][data-tier="stone"]')!);
    expect(game.selectedTiers.wall).toBe("stone");
    expect(game.selectedSlot).toBe(4);
    expect(hud.querySelector('[data-kind="wall"][data-tier="stone"]')?.classList.contains("selected")).toBe(true);
  });

  it("loads build-bar actions, structures, and tier indicators from the typed SVG registry", () => {
    const { game, hud, ui } = createHarness();
    const href = (selector: string): string | null =>
      hud.querySelector<SVGUseElement>(selector)?.getAttribute("href") ?? null;

    expect(href('[data-slot="1"] use')).toBe("./images/ui/build-bar/actions/fists.svg#icon");
    expect(href('[data-slot="2"] use')).toBe("./images/ui/build-bar/actions/repair-wrench.svg#icon");
    expect(href('[data-slot="3"] use')).toBe("./images/ui/build-bar/actions/recycle-mallet.svg#icon");
    expect(href('[data-kind="wall"] use')).toBe("./images/ui/build-bar/structures/wall.svg#icon");

    click(hud.querySelector('[data-slot="4"]')!);
    expect(href('.tier-option.selected .selection-mark use'))
      .toBe("./images/ui/build-bar/indicators/selected-tier.svg#icon");
    expect(href('.tier-option.locked use[href*="locked.svg"]'))
      .toBe("./images/ui/build-bar/indicators/locked.svg#icon");

    (game as unknown as { beginNight(): void }).beginNight();
    ui.render(true);
    expect(href('[aria-label="Bow"] use'))
      .toBe("./images/ui/build-bar/actions/nighttime-bow.svg#icon");
  });

  it("renders only the combat loadout and ignores unavailable number slots", () => {
    const { game, hud, ui } = createHarness();
    (game as unknown as { beginNight(): void }).beginNight();
    game.selectedSlot = 2;
    ui.render(true);

    expect([...hud.querySelectorAll<HTMLElement>(".toolbar [data-slot]")]
      .map((button) => button.dataset.slot)).toEqual(["1", "2"]);
    game.selectSlot(8);
    expect(game.selectedSlot).toBe(2);
  });

  it("keeps the combat loadout during daytime cleanup and restores build slots afterward", () => {
    const { game, hud, ui } = createHarness();
    game.phase = "day";
    (game as unknown as { combatMode: boolean }).combatMode = true;
    ui.render(true);
    expect([...hud.querySelectorAll<HTMLElement>(".toolbar [data-slot]")]
      .map((button) => button.dataset.slot)).toEqual(["1", "2"]);
    expect(hud.querySelector('[data-action="skip-night"]')).toBeNull();

    (game as unknown as { combatMode: boolean }).combatMode = false;
    ui.render(true);
    expect([...hud.querySelectorAll<HTMLElement>(".toolbar [data-slot]")]
      .map((button) => button.dataset.slot)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(hud.querySelector('[data-action="skip-night"]')).not.toBeNull();
  });

  it("keeps the clock informational and places End Day below the countdown", () => {
    const { hud } = createHarness();
    const clock = hud.querySelector<HTMLElement>("[data-clock-panel]")!;
    const endDay = hud.querySelector<HTMLButtonElement>('[data-action="skip-night"]')!;

    expect(clock.querySelector("[data-night]")).toBeNull();
    expect(clock.textContent).toContain("DAY");
    expect(clock.textContent).not.toContain("1 / 10");
    expect(endDay.parentElement?.classList.contains("resource-stack")).toBe(true);
    expect(endDay.previousElementSibling).toBe(clock);
    expect(endDay.textContent).toContain("End Day");
    expect(endDay.querySelector<HTMLImageElement>("img")?.getAttribute("src")).toBe("./images/ui/sun.svg");
    expect(hud.querySelector('.bottom-command-deck [data-action="skip-night"]')).toBeNull();
    expect(clock.parentElement?.classList.contains("resource-stack")).toBe(true);
    expect(clock.previousElementSibling?.classList.contains("resources")).toBe(true);
    expect(hud.querySelector(".countdown-stack [data-clock-panel]")).toBeNull();
  });

  it("fades the clock continuously as the canvas pointer approaches it", () => {
    const { hud, input, ui } = createHarness();
    const clock = hud.querySelector<HTMLElement>("[data-clock-panel]")!;
    hud.getBoundingClientRect = () => ({
      bottom: 540, height: 540, left: 0, right: 960, top: 0, width: 960, x: 0, y: 0, toJSON: () => ({}),
    });
    clock.getBoundingClientRect = () => ({
      bottom: 129, height: 119, left: 405, right: 555, top: 10, width: 150, x: 405, y: 10, toJSON: () => ({}),
    });
    const patchClock = (ui as unknown as {
      patchClockProximity(clockPanel: HTMLElement): void;
    }).patchClockProximity.bind(ui);

    input.mouse = { x: BALANCE.logicalWidth / 2, y: 96 };
    patchClock(clock);
    expect(clock.style.getPropertyValue("--clock-proximity-opacity")).toBe("0.140");

    input.mouse = { x: BALANCE.logicalWidth / 2, y: 180 };
    patchClock(clock);
    const nearbyOpacity = Number(clock.style.getPropertyValue("--clock-proximity-opacity"));
    expect(nearbyOpacity).toBeGreaterThan(0.14);
    expect(nearbyOpacity).toBeLessThan(1);

    input.mouse = { x: 50, y: 400 };
    patchClock(clock);
    expect(clock.style.getPropertyValue("--clock-proximity-opacity")).toBe("1.000");
  });

  it("shows the equipped sword in combat slot one instead of fists", () => {
    const { game, hud, ui } = createHarness((manager) => {
      manager.profile.equipment.sword = { tier: "gold", equipped: true };
    });
    (game as unknown as { beginNight(): void }).beginNight();
    ui.render(true);

    const sword = hud.querySelector<HTMLImageElement>('[data-slot="1"] .equipment-action-icon');
    expect(hud.querySelector('[data-slot="1"]')?.getAttribute("aria-label")).toBe("Sword");
    expect(sword?.getAttribute("src")).toBe("./images/equipment/sword-gold.svg");
    expect(hud.querySelector('[data-slot="1"] .build-bar-icon-fists')).toBeNull();
  });

  it("keeps toolbar DOM identity stable during continuous HUD patches", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { game, hud, ui } = createHarness();
    const button = hud.querySelector('[data-kind="wall"][data-slot="4"]');
    now.mockReturnValue(100);
    game.timer = 42;
    ui.render();
    now.mockRestore();
    expect(hud.querySelector('[data-kind="wall"][data-slot="4"]')).toBe(button);
    expect(hud.querySelector("[data-clock]")?.textContent).toBe("42");
  });

  it("closes the tier panel for fists, repair, and recycle", () => {
    const { hud } = createHarness();
    for (const slot of ["1", "2", "3"]) {
      click(hud.querySelector('[data-slot="4"]')!);
      expect(hud.querySelector(".tier-panel")).not.toBeNull();
      click(hud.querySelector(`[data-slot="${slot}"]`)!);
      expect(hud.querySelector(".tier-panel")).toBeNull();
    }
  });

  it("synchronizes keyboard-selected slots back to the HUD", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { game, hud, ui } = createHarness();
    game.selectSlot(5);
    now.mockReturnValue(100);
    ui.render();
    now.mockRestore();
    expect(hud.querySelector('[data-slot="5"]')?.classList.contains("selected")).toBe(true);
    expect(hud.querySelector('.tier-panel[aria-label="Spikes material tiers"]')).not.toBeNull();
  });

  it("releases world pointer input before a UI action", () => {
    const { game, hud, input } = createHarness();
    input.mouseDown = true;
    input.pressed = true;
    const before = game.structures.length;
    click(hud.querySelector('[data-slot="4"]')!);
    expect(input.mouseDown).toBe(false);
    expect(input.pressed).toBe(false);
    game.update(0.02);
    expect(game.structures).toHaveLength(before);
  });

  it("preserves a typed seed when menu panels rerender", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    const seed = overlay.querySelector<HTMLInputElement>("#seed-input")!;
    seed.value = 'persistent-"seed"';
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    click(overlay.querySelector('[data-action="settings"]')!);
    expect(overlay.querySelector<HTMLInputElement>("#seed-input")?.value).toBe('persistent-"seed"');
  });

  it("uses Escape to close an open menu panel", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="settings"]')!);
    expect(overlay.querySelector(".menu-modal")).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);

    expect(overlay.querySelector(".menu-modal")).toBeNull();
    expect(game.phase).toBe("menu");
  });

  it("keeps keyboard focus inside menu panels and restores it when closed", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="settings"]')!);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const close = dialog.querySelector<HTMLElement>('[data-action="close-panel"]')!;
    const last = dialog.querySelectorAll<HTMLElement>("button,input").item(
      dialog.querySelectorAll("button,input").length - 1,
    );
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("menu-panel-title");
    expect(document.activeElement).toBe(close);

    last.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(close);

    close.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(last);

    click(close);
    expect(document.activeElement).toBe(overlay.querySelector('[data-action="settings"]'));
  });

  it("keeps the mute toggle icon consistent with its announced state", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    audioManager.setMuted(false);
    ui.render(true);
    click(overlay.querySelector('[data-action="settings"]')!);

    const mute = overlay.querySelector<HTMLElement>('[data-action="audio-mute"]')!;
    expect(mute.getAttribute("aria-pressed")).toBe("false");
    expect(mute.querySelector("em")?.textContent).toBe("OFF");
    expect(mute.querySelector<HTMLImageElement>("img")?.getAttribute("src"))
      .toBe("./images/ui/close.svg");

    click(mute);
    const activeMute = overlay.querySelector<HTMLElement>('[data-action="audio-mute"]')!;
    expect(activeMute.getAttribute("aria-pressed")).toBe("true");
    expect(activeMute.querySelector("em")?.textContent).toBe("ON");
    expect(activeMute.querySelector<SVGUseElement>("use")?.getAttribute("href"))
      .toBe("./images/ui/build-bar/indicators/selected-tier.svg#icon");

    audioManager.setMuted(false);
  });

  it("plays hover audio once on interactive entry, not for movement within the control", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    const play = vi.spyOn(audioManager, "play");
    const settings = overlay.querySelector<HTMLElement>('[data-action="settings"]')!;
    const label = settings.querySelector<HTMLElement>("span")!;
    settings.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    label.dispatchEvent(new MouseEvent("pointerover", {
      bubbles: true,
      relatedTarget: settings,
    }));
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("ui-hover");
    play.mockRestore();
  });

  it("hides gameplay HUD and messages during dawn choices", () => {
    const { game, hud, toast, ui } = createHarness();
    game.toast = "World action feedback";
    game.toastTime = 2;
    game.phase = "dawn";
    ui.render(true);
    expect(hud.classList.contains("hidden")).toBe(true);
    expect(toast.innerHTML).toBe("");
  });

  it("moves focus to a named dawn choice region", () => {
    const { game, overlay, ui } = createHarness();
    game.phase = "dawn";
    game.choices = [
      {
        id: "moveSpeed",
        name: "Fleet Feet",
        description: "Move faster",
        mutationId: "health",
        mutationName: "Thick Skulls",
        mutationDescription: "More enemy health",
        kind: "upgrade",
      },
    ];
    ui.render(true);

    const dawn = overlay.querySelector<HTMLElement>(".dawn-panel")!;
    expect(dawn.getAttribute("role")).toBe("region");
    expect(dawn.getAttribute("aria-labelledby")).toBe("dawn-title");
    expect(dawn.querySelector("h2")?.id).toBe("dawn-title");
    expect(dawn.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(dawn);
  });

  it("uses a biome-neutral transparent dawn overlay", () => {
    const { game, overlay, ui } = createHarness();
    game.phase = "dawn";
    game.choices = [];
    ui.render(true);

    const screen = overlay.querySelector<HTMLElement>(".dawn-screen")!;
    expect(screen.getAttribute("style")).toBeNull();
  });

  it("shows concise upgrade amounts and current-to-upgraded values", () => {
    const { game, overlay, ui } = createHarness((manager) => {
      manager.profile.permanentUpgrades.bowRate = 5;
    });
    game.phase = "dawn";
    game.upgrades.maxHealth = 20;
    game.choices = [
      {
        id: "bowRate", name: "Quick Draw", description: "Long rate explanation",
        mutationId: "health", mutationName: "Thick Skulls", mutationDescription: "More health",
        kind: "upgrade",
      },
      {
        id: "maxHealth", name: "Heartwood", description: "Long health explanation",
        mutationId: "damage", mutationName: "Vicious Claws", mutationDescription: "More damage",
        kind: "upgrade",
      },
    ];

    ui.render(true);

    const cards = overlay.querySelectorAll<HTMLElement>(".benefit-card");
    expect(cards[0]?.querySelector(".upgrade-summary")?.textContent).toBe("+8% bow speed");
    expect(cards[0]?.querySelector(".upgrade-comparison")?.textContent).toBe("50% -> 58%");
    expect(cards[1]?.querySelector(".upgrade-summary")?.textContent).toBe("+20 max health");
    expect(cards[1]?.querySelector(".upgrade-comparison")?.textContent).toBe("120 -> 140");
    expect(cards[0]?.textContent).not.toContain("Long rate explanation");
  });

  it("contains keyboard focus in the new threat warning", () => {
    const { game, overlay, ui } = createHarness();
    game.phase = "dawn";
    game.enemyWarning = "runner";
    ui.render(true);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const begin = dialog?.querySelector<HTMLElement>('[data-action="dismiss-warning"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("threat-warning-title");
    expect(document.activeElement).toBe(begin);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(begin);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(begin);
  });

  it("contains keyboard focus in the reroll dialog and restores it when canceled", () => {
    const { game, overlay, ui } = createHarness();
    game.phase = "dawn";
    game.choices = [
      {
        id: "moveSpeed",
        name: "Fleet Feet",
        description: "Move faster",
        mutationId: "health",
        mutationName: "Thick Skulls",
        mutationDescription: "More enemy health",
        kind: "upgrade",
      },
    ];
    ui.render(true);

    const trigger = overlay.querySelector<HTMLElement>('[data-action="reroll"]')!;
    click(trigger);
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const cancel = dialog.querySelector<HTMLElement>('[data-action="cancel-reroll"]')!;
    const confirm = dialog.querySelector<HTMLElement>('[data-action="confirm-reroll"]')!;

    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("reroll-title");
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(confirm);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(game.rerollConfirmation).toBe(false);
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="reroll"]'),
    );
  });

  it("pauses the day in an accessible Skip to Night confirmation and uses the normal night start", () => {
    const { game, hud, overlay, ui } = createHarness();
    const timer = game.timer;
    click(hud.querySelector('[data-action="skip-night"]')!);
    expect(game.skipNightConfirmation).toBe(true);
    expect(game.modalLock).toBe(true);
    game.update(1);
    expect(game.timer).toBe(timer);
    ui.render(true);
    expect(overlay.textContent).toContain("remaining daytime will be lost");
    click(overlay.querySelector('[data-action="confirm-skip-night"]')!);
    expect(game.phase).toBe("night");
    expect(game.timer).toBe(30);
    expect(game.skipNightConfirmation).toBe(false);
  });

  it("contains keyboard focus in the Skip to Night dialog and restores it when canceled", () => {
    const { hud, overlay } = createHarness();
    const trigger = hud.querySelector<HTMLElement>('[data-action="skip-night"]')!;
    click(trigger);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const cancel = dialog.querySelector<HTMLElement>('[data-action="cancel-skip-night"]')!;
    const confirm = dialog.querySelector<HTMLElement>('[data-action="confirm-skip-night"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("skip-night-title");
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(confirm);

    click(cancel);
    expect(document.activeElement).toBe(
      hud.querySelector('[data-action="skip-night"]'),
    );
  });

  it("keeps outgoing and incoming card sets in one transform track and applies a choice once", () => {
    vi.useFakeTimers();
    const { game, overlay, ui } = createHarness();
    game.phase = "dawn";
    game.choices = [
      {
        id: "moveSpeed",
        name: "Fleet Feet",
        description: "Move faster",
        mutationId: "health",
        mutationName: "Thick Skulls",
        mutationDescription: "More enemy health",
        kind: "upgrade",
      },
      {
        id: "maxHealth",
        name: "Heartwood",
        description: "More health",
        mutationId: "damage",
        mutationName: "Heavy Hands",
        mutationDescription: "More enemy damage",
        kind: "upgrade",
      },
      {
        id: "punchDamage",
        name: "Heavy Hands",
        description: "Punch harder",
        mutationId: "speed",
        mutationName: "Restless Dead",
        mutationDescription: "Faster enemies",
        kind: "upgrade",
      },
    ];
    ui.render(true);
    const choose = vi.spyOn(game, "chooseDawn");
    const first = overlay.querySelector<HTMLElement>('[data-choice="0"]')!;
    click(first);
    click(first);
    expect(choose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(BALANCE.ui.cardSelectionDuration);
    expect(choose).toHaveBeenCalledTimes(1);
    expect(overlay.querySelectorAll(".choice-track")).toHaveLength(1);
    expect(overlay.querySelectorAll(".choice-set")).toHaveLength(2);
    expect(overlay.querySelector(".choice-set.incoming")).not.toBeNull();
    vi.useRealTimers();
  });

  it("does not also pause when Escape cancels the Skip Night confirmation", () => {
    const { game, hud } = createHarness();
    const trigger = hud.querySelector<HTMLElement>('[data-action="skip-night"]')!;
    click(trigger);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(document.activeElement).toBe(
      hud.querySelector('[data-action="skip-night"]'),
    );
    game.update(BALANCE.fixedStep);

    expect(game.skipNightConfirmation).toBe(false);
    expect(game.modalLock).toBe(false);
    expect(game.phase).toBe("day");
  });

  it("contains keyboard focus in the pause dialog and restores it on resume", () => {
    const { game, hud, overlay, ui } = createHarness();
    game.togglePause();
    ui.render(true);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const resume = dialog.querySelector<HTMLElement>('[data-action="resume"]')!;
    const endRun = dialog.querySelector<HTMLElement>('[data-action="request-run-exit"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("pause-title");
    expect(document.activeElement).toBe(resume);

    endRun.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(resume);
    resume.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(endRun);

    click(resume);
    expect(game.phase).toBe("day");
    expect(document.activeElement).toBe(hud.querySelector('[data-action="pause"]'));

    game.togglePause();
    ui.render(true);
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);
    expect(game.phase).toBe("day");
    expect(document.activeElement).toBe(hud.querySelector('[data-action="pause"]'));
  });

  it("opens shared audio settings from pause without exposing the removed motion toggle", () => {
    const { game, overlay, ui } = createHarness();
    game.togglePause();
    ui.render(true);
    click(overlay.querySelector('[data-action="settings"]')!);

    expect(game.phase).toBe("paused");
    expect(overlay.textContent).toContain("Master");
    expect(overlay.textContent).toContain("Final countdown");
    expect(overlay.textContent).not.toContain("Reduced motion");
    expect(overlay.querySelectorAll('[data-audio-volume]')).toHaveLength(5);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    expect(game.phase).toBe("paused");
    expect(overlay.textContent).toContain("Pause");
  });

  it("confirms ending an active run before showing settlement results", () => {
    const { game, overlay, ui } = createHarness();
    game.togglePause();
    ui.render(true);

    expect(overlay.querySelector('[data-action="menu"]')).toBeNull();
    expect(overlay.querySelector('[data-action="request-run-exit"]')?.textContent)
      .toContain("End run");

    click(overlay.querySelector('[data-action="request-run-exit"]')!);
    expect(game.phase).toBe("paused");
    expect(game.modalLock).toBe(true);
    expect(overlay.querySelector('[role="dialog"][aria-modal="true"]')).not.toBeNull();
    expect(overlay.textContent).toContain("cannot be resumed");

    click(overlay.querySelector('[data-action="cancel-run-exit"]')!);
    expect(game.phase).toBe("paused");
    expect(game.modalLock).toBe(false);
    expect(overlay.textContent).toContain("Pause");

    click(overlay.querySelector('[data-action="request-run-exit"]')!);
    click(overlay.querySelector('[data-action="confirm-run-exit"]')!);
    expect(game.phase).toBe("defeat");
    expect(overlay.textContent).toContain("Run ended by player.");
  });

  it("moves focus to a named result region when a run ends", () => {
    const { game, overlay, ui } = createHarness();
    game.phase = "defeat";
    game.defeatReason = "The flag fell.";
    ui.render(true);

    const result = overlay.querySelector<HTMLElement>(".result-card")!;
    const title = result.querySelector<HTMLElement>("h2")!;
    expect(result.getAttribute("role")).toBe("region");
    expect(result.getAttribute("aria-labelledby")).toBe("result-title");
    expect(result.tabIndex).toBe(-1);
    expect(title.id).toBe("result-title");
    expect(document.activeElement).toBe(result);
  });

  it("uses Escape to cancel ending an active run without resuming gameplay", () => {
    const { game, overlay, ui } = createHarness();
    game.togglePause();
    ui.render(true);
    click(overlay.querySelector('[data-action="request-run-exit"]')!);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);

    expect(game.phase).toBe("paused");
    expect(game.modalLock).toBe(false);
    expect(overlay.textContent).toContain("Pause");
    expect(overlay.textContent).not.toContain("End this run?");
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="request-run-exit"]'),
    );
  });

  it("contains keyboard focus in the active-run exit dialog and restores it when canceled", () => {
    const { game, overlay, ui } = createHarness();
    game.togglePause();
    ui.render(true);
    click(overlay.querySelector('[data-action="request-run-exit"]')!);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const cancel = dialog.querySelector<HTMLElement>('[data-action="cancel-run-exit"]')!;
    const confirm = dialog.querySelector<HTMLElement>('[data-action="confirm-run-exit"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("run-exit-title");
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(confirm);

    click(cancel);
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="request-run-exit"]'),
    );
  });

  it("offers only replay, next, and exit navigation in tutorial sections", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="tutorial-menu"]')!);

    game.tutorialSectionComplete = true;
    ui.render(true);
    expect(overlay.querySelector('[data-action="tutorial-skip-section"]')).toBeNull();
    expect(overlay.querySelector('[data-action="tutorial-replay"]')).not.toBeNull();
    expect(overlay.querySelector('[data-action="tutorial-next-section"]')?.textContent)
      .toContain("Next Section");
    expect(overlay.querySelector('[data-action="tutorial-exit"]')).not.toBeNull();

    game.startTutorial(8);
    game.tutorialSectionComplete = true;
    ui.render(true);
    expect(overlay.querySelector('[data-action="tutorial-next-section"]')?.textContent)
      .toContain("Back to Main Menu");
  });

  it("names and focuses tutorial instructions when training opens", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);

    click(overlay.querySelector('[data-action="tutorial-menu"]')!);

    const guide = overlay.querySelector<HTMLElement>(".tutorial-guide-card")!;
    expect(guide.getAttribute("role")).toBe("region");
    expect(guide.getAttribute("aria-live")).toBe("polite");
    expect(guide.getAttribute("aria-atomic")).toBe("true");
    expect(guide.getAttribute("aria-labelledby")).toBe("tutorial-guide-title");
    expect(document.activeElement).toBe(guide);
  });

  it("confirms tutorial exit before discarding section progress", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="tutorial-menu"]')!);

    click(overlay.querySelector('[data-action="tutorial-exit"]')!);
    expect(game.phase).toBe("day");
    expect(game.tutorialMode).toBe(true);
    expect(game.modalLock).toBe(true);
    expect(overlay.textContent).toContain("Exit Tutorial?");

    click(overlay.querySelector('[data-action="cancel-tutorial-exit"]')!);
    expect(game.phase).toBe("day");
    expect(game.tutorialMode).toBe(true);
    expect(game.modalLock).toBe(false);
    expect(overlay.textContent).not.toContain("Exit Tutorial?");

    click(overlay.querySelector('[data-action="tutorial-exit"]')!);
    click(overlay.querySelector('[data-action="confirm-tutorial-exit"]')!);
    expect(game.phase).toBe("menu");
    expect(game.tutorialMode).toBe(false);
  });

  it("contains keyboard focus in the tutorial exit dialog and restores it when canceled", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="tutorial-menu"]')!);

    const trigger = overlay.querySelector<HTMLElement>('[data-action="tutorial-exit"]')!;
    click(trigger);

    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!;
    const cancel = dialog.querySelector<HTMLElement>('[data-action="cancel-tutorial-exit"]')!;
    const confirm = dialog.querySelector<HTMLElement>('[data-action="confirm-tutorial-exit"]')!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("tutorial-exit-title");
    expect(document.activeElement).toBe(cancel);

    confirm.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab" }));
    expect(document.activeElement).toBe(cancel);

    cancel.focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Tab", shiftKey: true }));
    expect(document.activeElement).toBe(confirm);

    click(cancel);
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="tutorial-exit"]'),
    );
  });

  it("uses Escape to open and close the tutorial exit confirmation", () => {
    const { game, overlay, ui } = createHarness();
    game.returnToMenu();
    ui.render(true);
    click(overlay.querySelector('[data-action="tutorial-menu"]')!);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);
    expect(game.phase).toBe("day");
    expect(game.modalLock).toBe(true);
    expect(overlay.textContent).toContain("Exit Tutorial?");
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="cancel-tutorial-exit"]'),
    );

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);
    expect(game.phase).toBe("day");
    expect(game.tutorialMode).toBe(true);
    expect(game.modalLock).toBe(false);
    expect(overlay.textContent).not.toContain("Exit Tutorial?");
    expect(document.activeElement).toBe(
      overlay.querySelector('[data-action="tutorial-exit"]'),
    );
  });

  it("keeps pointer coordinates accurate when the canvas is responsively scaled", () => {
    const { input } = createHarness();
    const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas")!;
    canvas.getBoundingClientRect = () => ({
      width: 640,
      height: 360,
      left: 10,
      top: 20,
      right: 650,
      bottom: 380,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    });
    canvas.dispatchEvent(new MouseEvent("pointermove", {
      clientX: 330,
      clientY: 200,
    }));
    expect(input.mouse).toEqual({ x: 640, y: 360 });
  });
});
