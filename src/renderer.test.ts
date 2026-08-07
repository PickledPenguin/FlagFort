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
      isCombatMode: () => false,
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

  it("rotates equipped helmets into the player's facing direction", () => {
    const renderer = Object.create(Renderer.prototype) as {
      ctx: Pick<CanvasRenderingContext2D, "save" | "translate" | "rotate" | "restore">;
      drawPlayer(game: unknown): void;
      drawSprite: ReturnType<typeof vi.fn>;
      drawTintedSprite: ReturnType<typeof vi.fn>;
    };
    renderer.ctx = {
      save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn(),
    };
    renderer.drawSprite = vi.fn();
    renderer.drawTintedSprite = vi.fn();

    renderer.drawPlayer({
      player: { x: 100, y: 200, radius: 25, angle: 0, cooldown: 0, punchHand: "right", hurtFlash: 0 },
      upgrades: { punchRate: 0 },
      profileManager: { profile: {
        playerColor: "#d9b783", eyeStyle: "round",
        equipment: { helmet: { tier: "wood", equipped: true } },
      } },
      getSelectedAction: () => "fists",
      getBestGlove: () => "wood",
      isCombatMode: () => false,
    });

    expect(renderer.ctx.rotate).toHaveBeenCalledWith(-Math.PI / 2);
    expect(renderer.drawSprite).toHaveBeenCalledWith(
      ASSETS.equipment.helmet.wood, -30, -37, 60, 55, false,
    );
  });

  it("anchors both sword hands to the rendered handle without moving the sword", () => {
    const renderer = Object.create(Renderer.prototype) as {
      ctx: Pick<CanvasRenderingContext2D, "save" | "translate" | "rotate" | "restore">;
      drawPlayer(game: unknown): void;
      drawSprite: ReturnType<typeof vi.fn>;
      drawTintedSprite: ReturnType<typeof vi.fn>;
    };
    renderer.ctx = {
      save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn(),
    };
    renderer.drawSprite = vi.fn();
    renderer.drawTintedSprite = vi.fn();

    renderer.drawPlayer({
      player: { x: 100, y: 200, radius: 25, angle: 0, cooldown: 0, punchHand: "right", hurtFlash: 0 },
      upgrades: { punchRate: 0 },
      profileManager: { profile: {
        playerColor: "#d9b783", eyeStyle: "round",
        equipment: { sword: { tier: "wood", equipped: true } },
      } },
      getSelectedAction: () => "fists",
      getBestGlove: () => "wood",
      isCombatMode: () => true,
      getEquippedSword: () => ({ arc: 1.2 }),
      getMeleeSwingProgress: () => null,
    });

    expect(renderer.drawSprite).toHaveBeenCalledWith(
      ASSETS.equipment.sword.wood, -18, -72, 72, 79, false,
    );
    const handCalls = renderer.drawSprite.mock.calls.filter(([asset]) => asset === ASSETS.player.hands.wood);
    expect(handCalls).toHaveLength(2);
    expect(handCalls[0]?.[1]).toBeCloseTo(-8.85, 2);
    expect(handCalls[0]?.[2]).toBeCloseTo(-24.86, 2);
    expect(handCalls[1]?.[1]).toBeCloseTo(-19.59, 2);
    expect(handCalls[1]?.[2]).toBeCloseTo(-12.63, 2);
  });

  it.each([
    ["tool", "wrench", ASSETS.player.tools.repair, ASSETS.equipment.wrench.wood, [15, -25, 45, 45]],
    ["recycle", "mallet", ASSETS.player.tools.recycle, ASSETS.equipment.mallet.wood, [15, -25, 50, 50]],
  ] as const)("keeps equipped %s artwork in the base tool's hand placement", (
    action, equipmentKind, baseAsset, equippedAsset, bounds,
  ) => {
    const render = (equipment: Record<string, { tier: "wood"; equipped: boolean }> | undefined) => {
      const renderer = Object.create(Renderer.prototype) as {
        ctx: Pick<CanvasRenderingContext2D, "save" | "translate" | "rotate" | "restore">;
        drawPlayer(game: unknown): void;
        drawSprite: ReturnType<typeof vi.fn>;
        drawTintedSprite: ReturnType<typeof vi.fn>;
      };
      renderer.ctx = { save: vi.fn(), translate: vi.fn(), rotate: vi.fn(), restore: vi.fn() };
      renderer.drawSprite = vi.fn();
      renderer.drawTintedSprite = vi.fn();
      renderer.drawPlayer({
        player: { x: 100, y: 200, radius: 25, angle: 0, cooldown: 0, punchHand: "right", hurtFlash: 0 },
        upgrades: { punchRate: 0 },
        profileManager: { profile: { playerColor: "#d9b783", eyeStyle: "round", equipment } },
        getSelectedAction: () => action,
        getBestGlove: () => "wood",
        isCombatMode: () => false,
      });
      return renderer.drawSprite.mock.calls;
    };
    const baseCall = render(undefined).find(([asset]) => asset === baseAsset);
    const equippedCall = render({ [equipmentKind]: { tier: "wood", equipped: true } })
      .find(([asset]) => asset === equippedAsset);
    expect(baseCall?.slice(1, 5)).toEqual(bounds);
    expect(equippedCall?.slice(1, 5)).toEqual(bounds);
  });
});
