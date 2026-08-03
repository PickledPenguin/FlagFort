/// <reference types="vite/client" />

import "./styles.css";
import { audioManager } from "./audio";
import { BALANCE } from "./config";
import { Game } from "./game";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { Input } from "./input";
import { musicContextForState, musicManager } from "./music";
import { platform } from "./platform";
import { ProfileManager } from "./profile";
import type { RunSettlementResult } from "./profile";
import { Renderer } from "./renderer";
import type { Choice, EnemyKind, Tier } from "./types";
import { Ui } from "./ui";

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Required game element is missing: ${selector}`);
  return element;
}

const canvas = requiredElement<HTMLCanvasElement>("#game-canvas");
const hud = requiredElement<HTMLElement>("#hud");
const overlay = requiredElement<HTMLElement>("#overlay");
const toastLayer = requiredElement<HTMLElement>("#toast-layer");

overlay.innerHTML = `
  <section class="screen loading-screen">
    <div class="loading-card" role="status" aria-live="polite">
      <img class="loading-flag" src="./images/gameplay/flag/cloth.svg" alt="">
      <p class="eyebrow">RAISING THE STANDARD</p>
      <h1>FLAG <span>FORT</span></h1>
      <div class="loading-track"><i></i></div>
      <p>Loading campaign progress...</p>
    </div>
  </section>`;

async function bootstrap(): Promise<void> {
  await platform.initialize();
  platform.loadingStart();

  const profileManager = new ProfileManager(platform.storage);
  const dailyReward = profileManager.getDailyRewardStatus();
  const input = new Input(canvas);
  const game = new Game(input, profileManager, platform);
  const renderer = new Renderer(canvas);
  const ui = new Ui(game, hud, overlay, toastLayer, dailyReward);

  audioManager.setPlatformMuted(platform.platformMuted);
  platform.onMuteChange((muted) => {
    audioManager.setPlatformMuted(muted);
    ui.render(true);
  });
  platform.onUserChange(() => {
    profileManager.setStorage(platform.storage);
    ui.render(true);
  });

  audioManager.initialize();
  musicManager.initialize();
  game.bindUi(() => ui.render(), () => ui.render(true));

  if (import.meta.env.DEV) {
    const preview = new URLSearchParams(location.search);
    const enemyPreview = preview.get("enemyPreview") as EnemyKind | null;
    const enemyKinds = Object.keys(ENEMY_REGISTRY) as EnemyKind[];
    const swordPreview = preview.get("swordPreview") as Tier | null;
    const tiers: Tier[] = ["wood", "stone", "gold", "diamond"];
    if (swordPreview && tiers.includes(swordPreview)) {
      profileManager.profile.equipment.sword = { tier: swordPreview, equipped: true };
      game.startRun("normal", "flagfall-sword-preview", [], true, { settle: false });
      game.phase = "night";
      game.selectedSlot = 1;
      input.mouse.x = 830;
      input.mouse.y = 480;
      input.mouseDown = preview.has("swing");
      if (preview.has("swingFreeze")) {
        game.player.angle = 0;
        (game as unknown as { punch(): void }).punch();
        (game as unknown as { updateMeleeSwing(dt: number): void }).updateMeleeSwing(0.16);
        input.mouseDown = false;
        game.modalLock = true;
      }
    } else if (enemyPreview && enemyKinds.includes(enemyPreview)) {
      game.startRun("normal", "flagfall-enemy-preview", [], true, { settle: false });
      game.phase = "dawn";
      game.enemyWarning = enemyPreview;
    } else if (preview.has("upgradePreview")) {
      game.startRun("normal", "flagfall-upgrade-preview", [], true, { settle: false });
      game.phase = "dawn";
      game.choices = [
        {
          id: "moveSpeed",
          name: "Fleet Feet",
          description: "Move faster.",
          mutationId: "health",
          mutationName: "Thick Skulls",
          mutationDescription: "All zombies health +12%.",
          kind: "upgrade",
        },
        {
          id: "punchDamage",
          name: "Heavy Hands",
          description: "Punch harder.",
          mutationId: "damage",
          mutationName: "Vicious Claws",
          mutationDescription: "All zombies player damage +10%.",
          kind: "upgrade",
        },
        {
          id: "bowDamage",
          name: "Hardwood Arrows",
          description: "Arrows deal more damage.",
          mutationId: "speed",
          mutationName: "Restless Dead",
          mutationDescription: "All zombies speed +6%.",
          kind: "upgrade",
        },
      ] satisfies Choice[];
    } else if (preview.has("toastPreview")) {
      game.startRun("normal", "flagfall-toast-preview", [], true, { settle: false });
      game.toast = "A long gameplay message remains below the timer and Skip Night controls.";
      game.toastTime = 600;
    } else if (preview.has("rewardPreview")) {
      const outcome = preview.get("rewardPreview");
      const challengeRewardPreview = outcome === "challenge";
      const profitOrLoss = outcome === "loss" ? -100 : outcome === "break-even" ? 0 : 100;
      const totalReturn = 100 + profitOrLoss;
      game.startRun("normal", "flagfall-reward-preview", [], true, { settle: false });
      game.phase = outcome === "loss" ? "defeat" : "victory";
      game.night = game.phase === "victory" ? 10 : 1;
      if (challengeRewardPreview) {
        game.activeChallenges = new Set(["resource-drought", "accelerated-horde"]);
      }
      game.stats.nightsSurvived = outcome === "loss" ? 0 : outcome === "break-even" ? 5 : 10;
      game.lastSettlement = {
        id: "reward-preview",
        xp: {
          personalKills: 84,
          nights: game.stats.nightsSurvived === 10 ? 700 : game.stats.nightsSurvived === 5 ? 175 : 0,
          victory: game.phase === "victory" ? 300 : 0,
          adaptiveDifficulty: 75,
          difficulty: 75,
          challenge: challengeRewardPreview ? 348 : 0,
          subtotal: game.stats.nightsSurvived === 10 ? 1159 + (challengeRewardPreview ? 348 : 0) : game.stats.nightsSurvived === 5 ? 634 : 159,
          difficultyPercent: 100,
          difficultyAdjustment: 0,
          total: game.stats.nightsSurvived === 10 ? 1159 + (challengeRewardPreview ? 348 : 0) : game.stats.nightsSurvived === 5 ? 634 : 159,
        },
        coins: {
          investment: 100,
          returnedPrincipal: Math.min(100, totalReturn),
          profitOrLoss,
          totalReturn,
          finalCoinChange: profitOrLoss,
          returnPercent: totalReturn,
        },
        previousLifetimeXp: 2390,
        newLifetimeXp: game.phase === "victory" ? 3685 : 2873,
        previousSpendableXp: 390,
        newSpendableXp: game.phase === "victory" ? 1685 : 873,
        previousCoins: 15,
        newCoins: Math.max(0, 15 + totalReturn),
        previousLevel: 5,
        newLevel: game.phase === "victory" ? 7 : 6,
      } satisfies RunSettlementResult;
    }
  }

  ui.render(true);
  platform.reportProgress(Math.min(
    100,
    profileManager.profile.progress.campaignWins > 0
      ? 100
      : profileManager.profile.progress.totalNightsSurvived * 10,
  ));

  function syncMusic(): void {
    const audio = audioManager.getSettings();
    musicManager.setSettings(
      audio.master * audio.music,
      audio.master * audio.countdown,
      audioManager.isEffectivelyMuted(),
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
  platform.loadingStop();

  let previous = performance.now();
  let accumulator = 0;
  let lastContextKey = "";

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

    const activelyPlaying = game.phase === "day" || game.phase === "night";
    if (activelyPlaying) platform.gameplayStart();
    else platform.gameplayStop();
    const contextKey = activelyPlaying
      ? `${game.seed}|${game.difficulty}|${game.night}|${game.phase}`
      : "";
    if (contextKey !== lastContextKey) {
      lastContextKey = contextKey;
      if (activelyPlaying) {
        const equipment = profileManager.profile.equipment;
        platform.setGameContext({
          seed: game.seed,
          difficulty: game.difficulty,
          night: game.night,
          phase: game.phase,
          playerLevel: profileManager.profile.playerLevel,
          equipment: (Object.keys(equipment) as Array<keyof typeof equipment>)
            .filter((kind) => equipment[kind].equipped)
            .map((kind) => `${kind}:${equipment[kind].tier}`)
            .join(",") || "none",
        });
      } else platform.clearGameContext();
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
  window.countdownForest = game;
}

void bootstrap().catch((error) => {
  console.error("Flag Fort failed to start.", error);
  overlay.innerHTML = `
    <section class="screen loading-screen">
      <div class="loading-card error" role="alert">
        <p class="eyebrow">LOAD RECOVERY</p>
        <h2>Could not raise the flag</h2>
        <p>Refresh to retry. Your saved progress has not been changed.</p>
      </div>
    </section>`;
});

declare global {
  interface Window {
    countdownForest: Game;
  }
}
