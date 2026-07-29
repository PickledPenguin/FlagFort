/// <reference types="vite/client" />

import "./styles.css";
import { audioManager } from "./audio";
import { BALANCE } from "./config";
import { Game } from "./game";
import { Input } from "./input";
import { musicContextForState, musicManager } from "./music";
import { Renderer } from "./renderer";
import type { Choice, EnemyKind } from "./types";
import { Ui } from "./ui";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const hud = document.querySelector<HTMLElement>("#hud");
const overlay = document.querySelector<HTMLElement>("#overlay");
const toastLayer = document.querySelector<HTMLElement>("#toast-layer");
if (!canvas || !hud || !overlay || !toastLayer) throw new Error("Required game elements are missing");

const input = new Input(canvas);
const game = new Game(input);
const renderer = new Renderer(canvas);
const ui = new Ui(game, hud, overlay, toastLayer);
audioManager.initialize();
musicManager.initialize();
game.bindUi(() => ui.render(), () => ui.render(true));

if (import.meta.env.DEV) {
  const preview = new URLSearchParams(location.search);
  const enemyPreview = preview.get("enemyPreview") as EnemyKind | null;
  const enemyKinds: EnemyKind[] = [
    "basic",
    "runner",
    "breaker",
    "jumper",
    "summoner",
    "boss",
  ];
  if (enemyPreview && enemyKinds.includes(enemyPreview)) {
    game.startRun("normal", "flagfall-enemy-preview", [], true);
    game.phase = "dawn";
    game.enemyWarning = enemyPreview;
  } else if (preview.has("upgradePreview")) {
    game.startRun("normal", "flagfall-upgrade-preview", [], true);
    game.phase = "dawn";
    game.choices = [
      {
        id: "moveSpeed",
        name: "Fleet Feet",
        description: "Move faster.",
        mutationId: "health",
        mutationName: "Thick Skulls",
        mutationDescription: "Zombies gain health.",
        kind: "upgrade",
      },
      {
        id: "punchDamage",
        name: "Heavy Hands",
        description: "Punch harder.",
        mutationId: "damage",
        mutationName: "Vicious Claws",
        mutationDescription: "Zombies deal more damage.",
        kind: "upgrade",
      },
      {
        id: "bowDamage",
        name: "Hardwood Arrows",
        description: "Arrows deal more damage.",
        mutationId: "speed",
        mutationName: "Restless Dead",
        mutationDescription: "Zombies move faster.",
        kind: "upgrade",
      },
    ] satisfies Choice[];
  } else if (preview.has("toastPreview")) {
    game.startRun("normal", "flagfall-toast-preview", [], true);
    game.toast = "A long gameplay message remains below the timer and Skip Night controls.";
    game.toastTime = 600;
  }
}

ui.render(true);

function syncMusic(): void {
  const audio = audioManager.getSettings();
  musicManager.setSettings(
    audio.master * audio.music,
    audio.master * audio.countdown,
    audio.muted,
  );
  musicManager.setContext(musicContextForState({
    phase: game.phase,
    timer: game.timer,
    night: game.night,
    tutorialMode: game.tutorialMode,
    bossNight: game.isBossNight(),
  }));
}

syncMusic();

let previous = performance.now();
let accumulator = 0;

function frame(now: number): void {
  const frameTime = Math.min(0.1, (now - previous) / 1000);
  previous = now;
  accumulator += frameTime;
  while (accumulator >= BALANCE.fixedStep) {
    game.update(BALANCE.fixedStep);
    accumulator -= BALANCE.fixedStep;
  }
  renderer.render(game, frameTime);
  ui.render();
  syncMusic();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

declare global {
  interface Window {
    countdownForest: Game;
  }
}

window.countdownForest = game;
