import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campaignEnemyPortrait } from "./assets";
import { ENEMY_REGISTRY } from "./enemy-registry";
import { SIMPLE_ENEMY_BIOME_FILTERS, SIMPLE_ENEMY_OUTLINE_COLORS } from "./renderer";
import type { CampaignTierId } from "./types";

const skinPalettes = {
  forest: { basic: "#70ad4c", runner: "#82bd5d", outline: "#29462c" },
  snowy: { basic: "#66bed1", runner: "#7bcbd9", outline: "#173746" },
  desert: { basic: "#6fa06a", runner: "#82b17d", outline: "#315640" },
  volcanic: { basic: "#536b53", runner: "#67845f", outline: "#29382e" },
  wasteland: { basic: "#56765f", runner: "#69896f", outline: "#293d33" },
  rift: { basic: "#6562a8", runner: "#7875ba", outline: "#252952" },
  mire: { basic: "#587764", runner: "#6a8975", outline: "#213b39" },
  clockwork: { basic: "#6f8478", runner: "#81968a", outline: "#273b3b" },
} as const satisfies Record<CampaignTierId, {
  basic: string;
  runner: string;
  outline: string;
}>;

function luminance(color: string): number {
  const channels = color.slice(1).match(/../g)!.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

describe("campaign basic and runner zombie skins", () => {
  for (const [tierId, palette] of Object.entries(skinPalettes) as
    [CampaignTierId, (typeof skinPalettes)[CampaignTierId]][]) {
    it(`uses a slightly lighter runner with the ${tierId} outline`, () => {
      const basicPath = campaignEnemyPortrait("basic", tierId);
      const runnerPath = campaignEnemyPortrait("runner", tierId);
      const expectedPrefix = tierId === "forest" ? "" : `${tierId}-`;

      expect(basicPath).toBe(`./images/enemies/${expectedPrefix}basic-zombie.svg`);
      expect(runnerPath).toBe(`./images/enemies/${expectedPrefix}runner-zombie.svg`);
      expect(SIMPLE_ENEMY_OUTLINE_COLORS[tierId]).toBe(palette.outline);
      if (tierId !== "forest") {
        expect(SIMPLE_ENEMY_BIOME_FILTERS[tierId].basic).toBeTruthy();
        expect(SIMPLE_ENEMY_BIOME_FILTERS[tierId].runner).toBeTruthy();
      }

      const basicSvg = readFileSync(new URL(`../public/${basicPath.slice(2)}`, import.meta.url), "utf8");
      const runnerSvg = readFileSync(new URL(`../public/${runnerPath.slice(2)}`, import.meta.url), "utf8");
      expect(basicSvg).toContain(`fill="${palette.basic}"`);
      expect(runnerSvg).toContain(`fill="${palette.runner}"`);
      expect(basicSvg).toContain(`stroke="${palette.outline}"`);
      expect(runnerSvg).toContain(`stroke="${palette.outline}"`);

      const lightnessLift = luminance(palette.runner) - luminance(palette.basic);
      expect(lightnessLift).toBeGreaterThan(0);
      expect(lightnessLift).toBeLessThan(0.1);
    });
  }

  it("describes the runner by its tier-independent lighter-color tell", () => {
    expect(ENEMY_REGISTRY.runner.tell).toBe("Small body, lighter color");
  });

  it("gives the forest breaker and jumper matching portrait outlines", () => {
    for (const kind of ["breaker", "jumper"] as const) {
      const svg = readFileSync(
        new URL(`../public/images/enemies/${kind}-zombie.svg`, import.meta.url),
        "utf8",
      );
      expect(svg).toContain(`stroke="${skinPalettes.forest.outline}"`);
    }
  });
});
