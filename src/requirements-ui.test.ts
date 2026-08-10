// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it } from "vitest";
import { CHALLENGES } from "./challenges";
import { Game } from "./game";
import { Input } from "./input";
import { Ui } from "./ui";
import type { EnemyKind } from "./types";

function harness(): { game: Game; hud: HTMLElement; overlay: HTMLElement; ui: Ui } {
  document.body.innerHTML = "";
  const hud = document.createElement("div");
  const overlay = document.createElement("div");
  const toast = document.createElement("div");
  const game = new Game({
    mouse: { x: 640, y: 360 },
    mouseDown: false,
    pressed: false,
    escapePressed: false,
    numberPressed: 0,
    keys: new Set<string>(),
    endFrame: () => undefined,
    releasePointer: () => undefined,
  } as unknown as Input);
  const ui = new Ui(game, hud, overlay, toast);
  return { game, hud, overlay, ui };
}

describe("production controls and challenge accessibility", () => {
  it("uses the same eight-button production build bar in the tutorial", () => {
    const { game, hud, ui } = harness();
    game.startTutorial(0);
    ui.render(true);
    expect(hud.querySelectorAll(".toolbar .tool")).toHaveLength(8);
    expect(hud.querySelector(".tutorial-toolbar")).toBeNull();
    expect(hud.querySelector('[data-slot="8"][aria-label="Turret"] .tool-symbol'))
      .not.toBeNull();
  });

  it("uses the production material-tier picker behavior in the tutorial", () => {
    const { game, hud, ui } = harness();
    game.startTutorial(4);
    ui.render(true);

    const wallButton = hud.querySelector<HTMLButtonElement>('[data-slot="4"]')!;
    expect(wallButton.disabled).toBe(false);
    wallButton.click();

    const tierPanel = hud.querySelector(".tier-panel");
    expect(tierPanel?.querySelectorAll(".tier-option")).toHaveLength(4);
    const stoneButton = tierPanel?.querySelector<HTMLButtonElement>(
      '[data-kind="wall"][data-tier="stone"]',
    );
    expect(stoneButton?.disabled).toBe(false);
    stoneButton?.click();

    expect(game.selectedSlot).toBe(4);
    expect(game.selectedTiers.wall).toBe("stone");
    expect(hud.querySelector('[data-kind="wall"][data-tier="stone"]')
      ?.classList.contains("selected")).toBe(true);
  });

  it("renders all 12 challenge cards with accessible checkboxes and Lucide icons", () => {
    const { overlay, ui } = harness();
    ui.render(true);
    (overlay.querySelector('[data-action="challenges"]') as HTMLElement).click();
    expect(overlay.querySelectorAll(".challenge-card")).toHaveLength(12);
    expect(overlay.querySelectorAll('.challenge-card input[type="checkbox"]'))
      .toHaveLength(12);
    expect(overlay.querySelectorAll(".challenge-icon")).toHaveLength(12);
    for (const challenge of CHALLENGES) {
      expect(overlay.querySelector(`input[aria-label="${challenge.title}"]`)).not.toBeNull();
    }
  });

  it("allows all challenges to be selected simultaneously", () => {
    const { hud, overlay, ui } = harness();
    ui.render(true);
    (overlay.querySelector('[data-action="challenges"]') as HTMLElement).click();
    for (const challenge of CHALLENGES) {
      overlay.querySelector<HTMLInputElement>(
        `[data-challenge="${challenge.id}"]`,
      )?.click();
    }
    expect(overlay.querySelectorAll<HTMLInputElement>("[data-challenge]:checked"))
      .toHaveLength(12);
    expect(overlay.textContent).toContain("12 selected · +175% campaign victory XP");
    (overlay.querySelector('[data-action="close-panel"]') as HTMLElement).click();
    expect(overlay.textContent).toContain("30s DAY · 30s NIGHT · 10 NIGHTS · 12 CHALLENGES");
    expect(overlay.textContent).toContain("+175% VICTORY XP");
    (overlay.querySelector('[data-action="open-campaign"]') as HTMLElement).click();
    (overlay.querySelector('[data-action="start-campaign-tier"]') as HTMLElement).click();
    expect(hud.querySelector<HTMLButtonElement>('[aria-label="Repair"]')?.disabled).toBe(true);
  });

  it("renders every zombie introduction with its exact SVG portrait", () => {
    const { game, overlay, ui } = harness();
    const kinds: EnemyKind[] = [
      "basic",
      "runner",
      "breaker",
      "jumper",
      "summoner",
      "boss",
    ];
    game.startRun("normal", "portrait-parity");
    game.phase = "dawn";
    for (const kind of kinds) {
      game.enemyWarning = kind;
      ui.render(true);
      const portrait = overlay.querySelector<HTMLImageElement>(`[data-zombie-portrait="${kind}"]`);
      expect(portrait?.src).toContain(`/images/enemies/${kind === "boss" ? "countdown-boss" : `${kind}-zombie`}.svg`);
    }
  });
});
