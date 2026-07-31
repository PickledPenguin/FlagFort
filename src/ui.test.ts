// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it, vi } from "vitest";
import { audioManager } from "./audio";
import { BALANCE } from "./config";
import { Game } from "./game";
import { Input } from "./input";
import { Ui } from "./ui";

interface Harness {
  game: Game;
  hud: HTMLElement;
  input: Input;
  overlay: HTMLElement;
  toast: HTMLElement;
  ui: Ui;
}

function createHarness(): Harness {
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
  const game = new Game(input);
  const ui = new Ui(game, hud, overlay, toast);
  game.startRun("normal", "ui-test-seed");
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

    game.phase = "night";
    ui.render(true);
    expect(href('[aria-label="Bow"] use'))
      .toBe("./images/ui/build-bar/actions/nighttime-bow.svg#icon");
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
    click(hud.querySelector('[data-action="skip-night"]')!);

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);

    expect(game.skipNightConfirmation).toBe(false);
    expect(game.modalLock).toBe(false);
    expect(game.phase).toBe("day");
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

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape" }));
    game.update(BALANCE.fixedStep);
    expect(game.phase).toBe("day");
    expect(game.tutorialMode).toBe(true);
    expect(game.modalLock).toBe(false);
    expect(overlay.textContent).not.toContain("Exit Tutorial?");
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
