// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}

import { describe, expect, it } from "vitest";
import type { AudioCueDetail } from "./audio";
import { Game } from "./game";
import { Input } from "./input";
import type { EnemyKind, Portal, Projectile } from "./types";

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

function internals(game: Game): {
  rebuildSpatial(): void;
  spawnEnemy(portal: Portal, kind: EnemyKind): void;
  updateProjectiles(dt: number): void;
} {
  return game as unknown as ReturnType<typeof internals>;
}

function projectile(game: Game, owner: "player" | "turret"): Projectile {
  const target = game.enemies[0]!;
  return {
    id: owner === "player" ? 9001 : 9002,
    owner,
    x: target.x - 30,
    y: target.y,
    previousX: target.x - 30,
    previousY: target.y,
    vx: 1000,
    vy: 0,
    radius: 5,
    damage: 1,
    rangeLeft: 100,
    lifetime: 1,
    hitIds: new Set(),
    color: "#fff",
  };
}

describe("shared arrow impact audio", () => {
  it.each(["player", "turret"] as const)(
    "emits the Arrow Hit cue exactly once for a %s arrow impact",
    (owner) => {
      const game = new Game(input());
      game.startRun("normal", `arrow-${owner}`);
      internals(game).spawnEnemy(game.portals[0]!, "basic");
      const enemy = game.enemies[0]!;
      enemy.x = game.player.x + 100;
      enemy.y = game.player.y;
      enemy.health = 100;
      enemy.maxHealth = 100;
      game.projectiles = [projectile(game, owner)];
      internals(game).rebuildSpatial();
      const cues: AudioCueDetail[] = [];
      const listener = (event: Event): void => {
        cues.push((event as CustomEvent<AudioCueDetail>).detail);
      };
      window.addEventListener("flagfall-audio-cue", listener);
      internals(game).updateProjectiles(0.05);
      window.removeEventListener("flagfall-audio-cue", listener);
      expect(cues.filter((cue) => cue.cue === "arrow-impact")).toHaveLength(1);
    },
  );
});
