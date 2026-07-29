import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BALANCE } from "./config";
import { Game } from "./game";
import { Input } from "./input";

const indexSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
const gameSource = readFileSync(new URL("./game.ts", import.meta.url), "utf8");
const rendererSource = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function input(): Input {
  return {
    mouse: { x: 640, y: 360 },
    mouseDown: false,
    pressed: false,
    escapePressed: false,
    numberPressed: 0,
    keys: new Set<string>(),
    endFrame: () => undefined,
    releasePointer: () => undefined,
  } as unknown as Input;
}

describe("browser and HUD requirements", () => {
  it("uses Flag Fall for every browser-title surface", () => {
    expect(indexSource).toContain("<title>Flag Fall</title>");
    expect(indexSource).toContain('aria-label="Flag Fall game world"');
    expect(indexSource).not.toContain("<title>Countdown Forest</title>");
  });

  it("keeps adaptive balancing internal in the normal HUD and messages", () => {
    expect(uiSource).not.toContain("data-threat-indicator");
    expect(gameSource).not.toContain("has begun · ${this.adaptiveState.indicator}");
    for (const label of [
      "Low fortification",
      "Expected fortification",
      "Advanced fortification",
      "Horde adapting",
    ]) {
      expect(uiSource).not.toContain(label);
    }
  });

  it("positions an independent toast layer below the countdown controls", () => {
    expect(stylesSource).toMatch(/#toast-layer\s*\{[\s\S]*padding:\s*clamp\(224px/);
    expect(stylesSource).toMatch(/#toast-layer \.toast\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
    expect(indexSource).toContain('<div id="toast-layer" aria-live="assertive"></div>');
  });
});

describe("tutorial production parity", () => {
  it("starts the first section in the upper playable portion", () => {
    const game = new Game(input());
    game.startTutorial(0);
    const center = BALANCE.mapSize / 2;
    expect(game.player.y).toBeLessThan(center - BALANCE.tutorialArena.radius * 0.6);
    expect(game.isInsideTutorialArena(game.player.x, game.player.y, game.player.radius))
      .toBe(true);
  });

  it("uses the regular gameplay build-control positioning and sizing", () => {
    expect(stylesSource).not.toMatch(/\.tutorial-active \.toolbar\s*\{/);
    expect(stylesSource).not.toMatch(/\.tutorial-active \.tool\s*\{/);
    expect(stylesSource).not.toMatch(/\.tutorial-active \.tier-panel\s*\{/);
  });

  it("provides a valid turret placement that can reach the tutorial zombie", () => {
    const game = new Game(input());
    game.startTutorial(6);
    const area = game.tutorialPlacementArea!;
    const zombie = game.enemies[0]!;
    const turretRadius = BALANCE.structure.radius.turret;
    expect(Math.hypot(area.x - game.player.x, area.y - game.player.y) + turretRadius)
      .toBeLessThanOrEqual(BALANCE.player.buildReach);
    expect(Math.hypot(area.x - zombie.x, area.y - zombie.y))
      .toBeLessThanOrEqual(game.getTurretRange("wood"));
    expect(game.isInsideTutorialArena(area.x, area.y, area.radius)).toBe(true);
  });
});

describe("shared render and transition architecture", () => {
  it("uses the production zombie body renderer in gameplay and a generic modal threat symbol", () => {
    expect(rendererSource).toContain("drawZombieBody(ctx");
    expect(uiSource).toContain('class="zombie-art threat-symbol"');
    expect(uiSource).not.toContain("zombiePortraitMarkup(this.game.enemyWarning)");
    expect(uiSource).not.toContain("drawZombieBody(ctx");
  });

  it("contains card-only transitions and no page-level transition shell", () => {
    expect(uiSource).not.toContain("transition-only");
    expect(stylesSource).not.toContain(".transition-only");
    expect(stylesSource).toContain(".choice-set.incoming");
    expect(stylesSource).toContain(".choice-track.transitioning .choice-set.incoming");
  });
});
