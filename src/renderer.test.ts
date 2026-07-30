import { describe, expect, it, vi } from "vitest";
import { ASSETS } from "./assets";
import { Renderer } from "./renderer";

describe("player appearance rendering", () => {
  it("composes the saved body color, body details, and selected eyes", () => {
    const renderer = Object.create(Renderer.prototype) as {
      ctx: Pick<CanvasRenderingContext2D, "save" | "translate" | "rotate" | "restore">;
      drawPlayer(game: unknown): void;
      drawSprite: ReturnType<typeof vi.fn>;
      drawTintedSprite: ReturnType<typeof vi.fn>;
    };
    renderer.ctx = {
      save: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      restore: vi.fn(),
    };
    renderer.drawSprite = vi.fn();
    renderer.drawTintedSprite = vi.fn();

    renderer.drawPlayer({
      player: {
        x: 100,
        y: 200,
        radius: 25,
        angle: 0,
        cooldown: 0,
        punchHand: "right",
        hurtFlash: 0,
      },
      phase: "day",
      upgrades: { punchRate: 0 },
      profileManager: {
        profile: {
          playerColor: "#d7a6c8",
          eyeStyle: "sleepy",
        },
      },
      getSelectedAction: () => "fists",
      getBestGlove: () => "wood",
    });

    expect(renderer.drawTintedSprite).toHaveBeenCalledWith(
      ASSETS.player.body,
      "#d7a6c8",
      -30,
      -30,
      60,
      60,
      false,
    );
    expect(renderer.drawSprite).toHaveBeenCalledWith(
      ASSETS.player.bodyDetails,
      -30,
      -30,
      60,
      60,
      false,
    );
    expect(renderer.drawSprite).toHaveBeenCalledWith(
      ASSETS.player.eyes.sleepy,
      -30,
      -30,
      60,
      60,
      false,
    );
  });
});
