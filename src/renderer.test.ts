import { describe, expect, it, vi } from "vitest";
import { ASSETS } from "./assets";
import { CAMPAIGN_BIOMES, campaignTier } from "./campaign";
import { createWeatherField, Renderer } from "./renderer";

describe("world-space biome weather", () => {
  it("builds varied deterministic fields from purpose-specific visual seeds", () => {
    const weather = campaignTier("snowy").biome.weather!;
    const first = createWeatherField("snow-run", 120, weather);
    const second = createWeatherField("snow-run", 120, weather);
    expect(first).toEqual(second);
    expect(createWeatherField("other-run", 120, weather)).not.toEqual(first);
    expect(new Set(first.map((particle) => particle.y)).size).toBe(120);
    expect(new Set(first.map((particle) => particle.fallSpeed.toFixed(3))).size).toBeGreaterThan(110);
    expect(new Set(first.map((particle) => particle.radius.toFixed(3))).size).toBeGreaterThan(100);
  });

  it("keeps staged volcanic embers deterministic and separate from snowfall", () => {
    const volcanic = createWeatherField("campaign-seed", 72, CAMPAIGN_BIOMES.volcanic.weather!);
    expect(createWeatherField("campaign-seed", 72, CAMPAIGN_BIOMES.volcanic.weather!))
      .toEqual(volcanic);
    expect(createWeatherField("campaign-seed", 72, CAMPAIGN_BIOMES.snow.weather!))
      .not.toEqual(volcanic);
    expect(volcanic).toHaveLength(72);
  });

  it("keeps staged wasteland fallout deterministic and purpose-seeded", () => {
    const wasteland = createWeatherField(
      "campaign-seed",
      64,
      CAMPAIGN_BIOMES.wasteland.weather!,
    );
    expect(createWeatherField("campaign-seed", 64, CAMPAIGN_BIOMES.wasteland.weather!))
      .toEqual(wasteland);
    expect(createWeatherField("campaign-seed", 64, CAMPAIGN_BIOMES.volcanic.weather!))
      .not.toEqual(wasteland);
    expect(wasteland).toHaveLength(64);
  });

  it("keeps staged astral stardust deterministic and distinct from other weather", () => {
    const rift = createWeatherField("campaign-seed", 76, CAMPAIGN_BIOMES.rift.weather!);
    expect(createWeatherField("campaign-seed", 76, CAMPAIGN_BIOMES.rift.weather!))
      .toEqual(rift);
    expect(createWeatherField("campaign-seed", 76, CAMPAIGN_BIOMES.wasteland.weather!))
      .not.toEqual(rift);
    expect(rift).toHaveLength(76);
  });

  it("keeps staged Mire wisps deterministic and purpose-seeded", () => {
    const mire = createWeatherField("campaign-seed", 58, CAMPAIGN_BIOMES.mire.weather!);
    expect(createWeatherField("campaign-seed", 58, CAMPAIGN_BIOMES.mire.weather!))
      .toEqual(mire);
    expect(createWeatherField("campaign-seed", 58, CAMPAIGN_BIOMES.rift.weather!))
      .not.toEqual(mire);
    expect(mire).toHaveLength(58);
  });

  it("keeps staged Clockwork sparks deterministic and purpose-seeded", () => {
    const clockwork = createWeatherField(
      "campaign-seed",
      66,
      CAMPAIGN_BIOMES.clockwork.weather!,
    );
    expect(createWeatherField("campaign-seed", 66, CAMPAIGN_BIOMES.clockwork.weather!))
      .toEqual(clockwork);
    expect(createWeatherField("campaign-seed", 66, CAMPAIGN_BIOMES.mire.weather!))
      .not.toEqual(clockwork);
    expect(clockwork).toHaveLength(66);
  });
});

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
