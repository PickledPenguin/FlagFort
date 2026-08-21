import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_BIOMES,
  CAMPAIGN_TIERS,
  campaignTier,
  highestUnlockedCampaignTierId,
  earnedCampaignMilestones,
  isCampaignTierUnlocked,
} from "./campaign";
import type { CampaignBiomeDefinition } from "./campaign";
import {
  ENEMY_REGISTRY,
  isBossEnemyKind,
  rosterMilestones,
  selectEnemyRoster,
} from "./enemy-registry";
import { ProfileManager, createDefaultProfile, lifetimeXpAtLevel } from "./profile";
import { generateWorld } from "./world";
import type { KeyValueStore } from "./platform";
import type { CoinSettlement, XpRewardBreakdown } from "./rewards";
import { CAMPAIGN_TIER_IDS } from "./types";
import { RESOURCE_STATE_SKINS } from "./assets";
import { CAMPAIGN_TIER_ARTWORK } from "./campaign-artwork";
import { DESERT_ENEMY_ARTWORK } from "./desert-enemy-artwork";
import { VOLCANIC_ENEMY_ARTWORK } from "./volcanic-enemy-artwork";
import { WASTELAND_ENEMY_ARTWORK } from "./wasteland-enemy-artwork";
import { ASTRAL_ENEMY_ARTWORK } from "./astral-enemy-artwork";
import { MIRE_ENEMY_ARTWORK } from "./mire-enemy-artwork";
import { CLOCKWORK_ENEMY_ARTWORK } from "./clockwork-enemy-artwork";

class MemoryStore implements KeyValueStore {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const zeroXp: XpRewardBreakdown = {
  personalKills: 0,
  nights: 0,
  victory: 0,
  adaptiveDifficulty: 0,
  difficulty: 0,
  challenge: 0,
  subtotal: 0,
  difficultyPercent: 100,
  difficultyAdjustment: 0,
  total: 0,
};

const zeroCoins: CoinSettlement = {
  investment: 0,
  returnedPrincipal: 0,
  profitOrLoss: 0,
  totalReturn: 0,
  finalCoinChange: 0,
  returnPercent: 0,
};

describe("data-driven campaign tiers", () => {
  it("places exactly one campaign milestone on every level with three coin rewards between tiers", () => {
    const events = CAMPAIGN_TIERS.flatMap((tier) => [
      { level: tier.unlock.level, kind: "tier" },
      ...tier.milestones.map((milestone) => ({ level: milestone.level, kind: milestone.reward.kind })),
    ]).sort((a, b) => a.level - b.level);
    expect(events.map((event) => event.level)).toEqual(
      Array.from({ length: 29 }, (_, index) => index + 1),
    );
    expect(CAMPAIGN_TIERS.map((tier) => tier.unlock.level)).toEqual([1, 5, 9, 13, 17, 21, 25, 29]);
    expect(CAMPAIGN_TIERS.slice(0, -1).every((tier) => tier.milestones.length === 3)).toBe(true);
    expect(events.every((event) => event.kind === "tier" || event.kind === "coins")).toBe(true);
  });

  it("gates coin rewards only by player level, independently of tier access", () => {
    const levelRewards = earnedCampaignMilestones({
      level: 13,
      defeatedTierIds: [],
    }, []);
    expect(levelRewards.map((reward) => reward.id)).toEqual([
      "campaign-v2-level-2-coins",
      "campaign-v2-level-3-coins",
      "campaign-v2-level-4-coins",
      "campaign-v2-level-6-coins",
      "campaign-v2-level-7-coins",
      "campaign-v2-level-8-coins",
      "campaign-v2-level-10-coins",
      "campaign-v2-level-11-coins",
      "campaign-v2-level-12-coins",
    ]);

    const unclaimedRewards = earnedCampaignMilestones({
      level: 13,
      defeatedTierIds: ["forest"],
    }, CAMPAIGN_TIERS[0]!.milestones.map((milestone) => milestone.id));
    expect(unclaimedRewards.map((reward) => reward.id)).toEqual([
      "campaign-v2-level-6-coins",
      "campaign-v2-level-7-coins",
      "campaign-v2-level-8-coins",
      "campaign-v2-level-10-coins",
      "campaign-v2-level-11-coins",
      "campaign-v2-level-12-coins",
    ]);
  });

  it("unlocks each campaign tier by level or by clearing the previous tier", () => {
    const snow = campaignTier("snowy");
    expect(isCampaignTierUnlocked(snow, { level: 5, defeatedTierIds: [] })).toBe(true);
    expect(isCampaignTierUnlocked(snow, { level: 1, defeatedTierIds: ["forest"] })).toBe(true);
    expect(isCampaignTierUnlocked(snow, { level: 1, defeatedTierIds: [] })).toBe(false);
  });

  it("registers the complete themed artwork set for Clockwork Citadel", () => {
    expect(CLOCKWORK_ENEMY_ARTWORK).toEqual({
      springjack: "enemies/springjack-zombie",
      aetherGunner: "enemies/aether-gunner-zombie",
      gearwright: "enemies/gearwright-zombie",
      chronoforgeColossus: {
        armored: "enemies/chronoforge-colossus",
        broken: "enemies/chronoforge-colossus-broken",
      },
    });
    expect(Object.keys(CLOCKWORK_ENEMY_ARTWORK)).toHaveLength(4);
    expect(ENEMY_REGISTRY.springjack.assets.portrait)
      .toBe(CLOCKWORK_ENEMY_ARTWORK.springjack);
    expect(ENEMY_REGISTRY.springjack).toMatchObject({ rosterEligible: true, campaignTierIds: ["clockwork"] });
    expect(ENEMY_REGISTRY["aether-gunner"].assets.portrait)
      .toBe(CLOCKWORK_ENEMY_ARTWORK.aetherGunner);
    expect(ENEMY_REGISTRY["aether-gunner"]).toMatchObject({ rosterEligible: true, campaignTierIds: ["clockwork"] });
    expect(ENEMY_REGISTRY.gearwright.assets.portrait)
      .toBe(CLOCKWORK_ENEMY_ARTWORK.gearwright);
    expect(ENEMY_REGISTRY.gearwright).toMatchObject({ rosterEligible: true, campaignTierIds: ["clockwork"] });
  });

  it("registers Clockwork Citadel selection artwork", () => {
    expect(CAMPAIGN_TIER_ARTWORK.clockwork).toEqual({
      icon: "./images/campaign/clockwork-tier.svg",
      backdrop: "./images/campaign/clockwork-backdrop.svg",
    });
    expect(campaignTier("clockwork")).toMatchObject(CAMPAIGN_TIER_ARTWORK.clockwork);
  });

  it("registers a complete Clockwork Citadel resource-art skin for the upcoming eighth tier", () => {
    expect(RESOURCE_STATE_SKINS.clockwork).toEqual({
      wood: {
        active: "./images/world/clockwork-ironwood-active.svg",
        depleted: "./images/world/clockwork-ironwood-depleted.svg",
      },
      stone: {
        active: "./images/world/clockwork-gearstone-active.svg",
        depleted: "./images/world/clockwork-gearstone-depleted.svg",
      },
      gold: {
        active: "./images/world/clockwork-brass-active.svg",
        depleted: "./images/world/clockwork-brass-depleted.svg",
      },
      diamond: {
        active: "./images/world/clockwork-aether-core-active.svg",
        depleted: "./images/world/clockwork-aether-core-depleted.svg",
      },
    });
    expect(campaignTier("clockwork").biome.resourceStateSkin).toBe("clockwork");
  });

  it("defines the complete Clockwork Citadel campaign environment", () => {
    expect(CAMPAIGN_BIOMES.clockwork).toMatchObject({
      ground: "clockwork",
      minimapLabel: "CLOCKWORK CITADEL MAP",
      resourceStateSkin: "clockwork",
      friendlyProjectileColor: "#f1cf77",
      popupContrast: {
        protectedColors: ["#79e7df", "#e2b85d"],
      },
      palette: {
        viewport: "#151b23",
        ground: "#292e33",
        clearingCenter: "#4b4a45",
        clearingEdge: "#23292f",
      },
      weather: {
        activeDuring: "always",
        color: "#d9a64f",
        seedKey: "clockwork-citadel-spark-weather",
        particleCount: 66,
      },
    });
    expect(campaignTier("clockwork").biome).toBe(CAMPAIGN_BIOMES.clockwork);
  });

  it("registers a complete themed artwork set for the upcoming Drowned Mire enemies", () => {
    expect(MIRE_ENEMY_ARTWORK).toEqual({
      mireLurker: "enemies/mire-lurker-zombie",
      sporecaster: "enemies/sporecaster-zombie",
      drownedBulwark: {
        armored: "enemies/drowned-bulwark-zombie",
        broken: "enemies/drowned-bulwark-zombie-broken",
      },
      mireheartTitan: {
        armored: "enemies/mireheart-titan",
        broken: "enemies/mireheart-titan-broken",
      },
    });
    expect(Object.keys(MIRE_ENEMY_ARTWORK)).toHaveLength(4);
  });

  it("registers a complete Drowned Mire resource-art skin for the upcoming seventh tier", () => {
    expect(RESOURCE_STATE_SKINS.mire).toEqual({
      wood: {
        active: "./images/world/mire-cypress-active.svg",
        depleted: "./images/world/mire-cypress-depleted.svg",
      },
      stone: {
        active: "./images/world/mire-peatstone-active.svg",
        depleted: "./images/world/mire-peatstone-depleted.svg",
      },
      gold: {
        active: "./images/world/mire-bog-gold-active.svg",
        depleted: "./images/world/mire-bog-gold-depleted.svg",
      },
      diamond: {
        active: "./images/world/mire-ghost-crystal-active.svg",
        depleted: "./images/world/mire-ghost-crystal-depleted.svg",
      },
    });
  });

  it("registers a complete astral rift resource-art skin for the upcoming sixth tier", () => {
    expect(RESOURCE_STATE_SKINS.rift).toEqual({
      wood: {
        active: "./images/world/rift-twilight-wood-active.svg",
        depleted: "./images/world/rift-twilight-wood-depleted.svg",
      },
      stone: {
        active: "./images/world/rift-moonstone-active.svg",
        depleted: "./images/world/rift-moonstone-depleted.svg",
      },
      gold: {
        active: "./images/world/rift-star-metal-active.svg",
        depleted: "./images/world/rift-star-metal-depleted.svg",
      },
      diamond: {
        active: "./images/world/rift-void-crystal-active.svg",
        depleted: "./images/world/rift-void-crystal-depleted.svg",
      },
    });
  });

  it("registers a complete nuclear wasteland resource-art skin for the upcoming fifth tier", () => {
    expect(RESOURCE_STATE_SKINS.wasteland).toEqual({
      wood: {
        active: "./images/world/wasteland-deadwood-active.svg",
        depleted: "./images/world/wasteland-deadwood-depleted.svg",
      },
      stone: {
        active: "./images/world/wasteland-concrete-active.svg",
        depleted: "./images/world/wasteland-concrete-depleted.svg",
      },
      gold: {
        active: "./images/world/wasteland-uranium-active.svg",
        depleted: "./images/world/wasteland-uranium-depleted.svg",
      },
      diamond: {
        active: "./images/world/wasteland-isotope-crystal-active.svg",
        depleted: "./images/world/wasteland-isotope-crystal-depleted.svg",
      },
    });
  });

  it("registers a complete volcanic resource-art skin for the upcoming fourth tier", () => {
    expect(RESOURCE_STATE_SKINS.volcanic).toEqual({
      wood: {
        active: "./images/world/volcanic-charwood-active.svg",
        depleted: "./images/world/volcanic-charwood-depleted.svg",
      },
      stone: {
        active: "./images/world/volcanic-basalt-active.svg",
        depleted: "./images/world/volcanic-basalt-depleted.svg",
      },
      gold: {
        active: "./images/world/volcanic-sulfur-active.svg",
        depleted: "./images/world/volcanic-sulfur-depleted.svg",
      },
      diamond: {
        active: "./images/world/volcanic-ember-crystal-active.svg",
        depleted: "./images/world/volcanic-ember-crystal-depleted.svg",
      },
    });
  });

  it("registers a complete themed artwork set for the upcoming Desert enemies", () => {
    expect(DESERT_ENEMY_ARTWORK).toEqual({
      duneBurrower: "enemies/dune-burrower-zombie",
      sandstormer: "enemies/sandstormer-zombie",
      tombguard: {
        armored: "enemies/tombguard-zombie",
        broken: "enemies/tombguard-zombie-broken",
      },
      duneColossus: {
        armored: "enemies/dune-colossus",
        broken: "enemies/dune-colossus-broken",
      },
    });
  });

  it("registers a complete themed artwork set for the upcoming volcanic enemies", () => {
    expect(VOLCANIC_ENEMY_ARTWORK).toEqual({
      cinderburst: "enemies/cinderburst-zombie",
      magmaSpitter: "enemies/magma-spitter-zombie",
      obsidianCharger: {
        armored: "enemies/obsidian-charger-zombie",
        broken: "enemies/obsidian-charger-zombie-broken",
      },
      calderaSovereign: {
        armored: "enemies/caldera-sovereign",
        broken: "enemies/caldera-sovereign-broken",
      },
    });
  });

  it("registers a complete themed artwork set for the upcoming wasteland enemies", () => {
    expect(WASTELAND_ENEMY_ARTWORK).toEqual({
      radstalker: "enemies/radstalker-zombie",
      sludgeLobber: "enemies/sludge-lobber-zombie",
      ruinSiren: "enemies/ruin-siren-zombie",
      reactorRevenant: {
        armored: "enemies/reactor-revenant",
        broken: "enemies/reactor-revenant-broken",
      },
    });
  });

  it("registers a complete themed artwork set for the upcoming Astral Rift enemies", () => {
    expect(ASTRAL_ENEMY_ARTWORK).toEqual({
      riftStrider: "enemies/rift-strider-zombie",
      cometSlinger: "enemies/comet-slinger-zombie",
      voidHerald: "enemies/void-herald-zombie",
      eclipseRegent: {
        armored: "enemies/eclipse-regent",
        broken: "enemies/eclipse-regent-broken",
      },
    });
  });

  it("defines and exposes the Desert environment through its completed tier", () => {
    expect(CAMPAIGN_BIOMES.desert).toMatchObject({
      ground: "desert",
      minimapLabel: "SUNSCORCHED MAP",
      resourceStateSkin: "desert",
      friendlyProjectileColor: "#4f2f1c",
      palette: {
        viewport: "#9f6034",
        ground: "#c98243",
        clearingCenter: "#e4ad65",
        clearingEdge: "#b96f38",
      },
      weather: {
        activeDuring: "always",
        seedKey: "desert-dust-weather",
      },
    });
    expect(campaignTier("desert").biome).toBe(CAMPAIGN_BIOMES.desert);
  });

  it("defines and exposes the volcanic environment through its completed tier", () => {
    expect(CAMPAIGN_BIOMES.volcanic).toMatchObject({
      ground: "volcanic",
      minimapLabel: "VOLCANIC MAP",
      resourceStateSkin: "volcanic",
      friendlyProjectileColor: "#ffd27d",
      palette: {
        viewport: "#160f14",
        ground: "#2c1b1d",
        clearingCenter: "#4a2922",
        clearingEdge: "#24171a",
      },
      weather: {
        activeDuring: "always",
        color: "#ff8a3d",
        seedKey: "volcanic-ember-weather",
        particleCount: 72,
      },
    });
    expect(campaignTier("volcanic").biome).toBe(CAMPAIGN_BIOMES.volcanic);
  });

  it("defines and exposes the nuclear wasteland environment through its completed tier", () => {
    expect(CAMPAIGN_BIOMES.wasteland).toMatchObject({
      ground: "wasteland",
      minimapLabel: "FALLOUT MAP",
      resourceStateSkin: "wasteland",
      friendlyProjectileColor: "#d9f27c",
      popupContrast: {
        protectedColors: ["#8fe65c", "#67d8e8"],
      },
      palette: {
        viewport: "#172019",
        ground: "#31382a",
        clearingCenter: "#4b5137",
        clearingEdge: "#282f25",
      },
      weather: {
        activeDuring: "always",
        color: "#b7dd63",
        seedKey: "wasteland-fallout-weather",
        particleCount: 64,
      },
    });
    expect(campaignTier("wasteland").biome).toBe(CAMPAIGN_BIOMES.wasteland);
  });

  it("defines and exposes the Astral Rift environment through its completed tier", () => {
    expect(CAMPAIGN_BIOMES.rift).toMatchObject({
      ground: "rift",
      minimapLabel: "ASTRAL RIFT MAP",
      resourceStateSkin: "rift",
      friendlyProjectileColor: "#ffd98a",
      popupContrast: {
        protectedColors: ["#7cecff", "#d99cff"],
      },
      palette: {
        viewport: "#090d24",
        ground: "#20234d",
        clearingCenter: "#393765",
        clearingEdge: "#181b40",
      },
      weather: {
        activeDuring: "always",
        color: "#8eeaff",
        seedKey: "astral-rift-stardust-weather",
        particleCount: 76,
      },
    });
    expect(campaignTier("rift").biome).toBe(CAMPAIGN_BIOMES.rift);
  });

  it("defines the complete Drowned Mire campaign environment", () => {
    expect(CAMPAIGN_BIOMES.mire).toMatchObject({
      ground: "mire",
      minimapLabel: "DROWNED MIRE MAP",
      resourceStateSkin: "mire",
      friendlyProjectileColor: "#d8efaa",
      popupContrast: {
        protectedColors: ["#79e6c1", "#e8c86a"],
      },
      palette: {
        viewport: "#071713",
        ground: "#16332b",
        clearingCenter: "#2b4b3b",
        clearingEdge: "#102b25",
      },
      weather: {
        activeDuring: "always",
        color: "#f5df68",
        seedKey: "drowned-mire-fireflies",
        particleCount: 24,
      },
    });
    expect(campaignTier("mire").biome).toBe(CAMPAIGN_BIOMES.mire);
  });

  it("provides complete centralized selection artwork for current and upcoming biomes", () => {
    for (const artwork of Object.values(CAMPAIGN_TIER_ARTWORK)) {
      expect(artwork.icon).toMatch(/^\.\/images\/campaign\/.+-tier\.svg$/);
      expect(artwork.backdrop).toMatch(/^\.\/images\/campaign\/.+-backdrop\.svg$/);
    }
    expect(CAMPAIGN_TIER_ARTWORK.desert).toEqual({
      icon: "./images/campaign/desert-tier.svg",
      backdrop: "./images/campaign/desert-backdrop.svg",
    });
    expect(CAMPAIGN_TIER_ARTWORK.volcanic).toEqual({
      icon: "./images/campaign/volcanic-tier.svg",
      backdrop: "./images/campaign/volcanic-backdrop.svg",
    });
    expect(CAMPAIGN_TIER_ARTWORK.wasteland).toEqual({
      icon: "./images/campaign/wasteland-tier.svg",
      backdrop: "./images/campaign/wasteland-backdrop.svg",
    });
    expect(CAMPAIGN_TIER_ARTWORK.rift).toEqual({
      icon: "./images/campaign/rift-tier.svg",
      backdrop: "./images/campaign/rift-backdrop.svg",
    });
    expect(CAMPAIGN_TIER_ARTWORK.mire).toEqual({
      icon: "./images/campaign/mire-tier.svg",
      backdrop: "./images/campaign/mire-backdrop.svg",
    });
    expect(campaignTier("forest")).toMatchObject(CAMPAIGN_TIER_ARTWORK.forest);
    expect(campaignTier("snowy")).toMatchObject(CAMPAIGN_TIER_ARTWORK.snowy);
    expect(campaignTier("desert")).toMatchObject(CAMPAIGN_TIER_ARTWORK.desert);
    expect(campaignTier("volcanic")).toMatchObject(CAMPAIGN_TIER_ARTWORK.volcanic);
    expect(campaignTier("wasteland")).toMatchObject(CAMPAIGN_TIER_ARTWORK.wasteland);
    expect(campaignTier("rift")).toMatchObject(CAMPAIGN_TIER_ARTWORK.rift);
    expect(campaignTier("mire")).toMatchObject(CAMPAIGN_TIER_ARTWORK.mire);
    expect(campaignTier("clockwork")).toMatchObject(CAMPAIGN_TIER_ARTWORK.clockwork);
  });

  it("keeps tier order, requirements, rewards, enemies, bosses, and effects on definitions", () => {
    expect(CAMPAIGN_TIERS.map((tier) => tier.id)).toEqual(CAMPAIGN_TIER_IDS);
    expect(campaignTier("snowy")).toMatchObject({
      unlock: { level: 5, previousTierId: "forest" },
      boss: "frost-warden",
      specialEnemies: ["frostbite", "snowballer", "icebound"],
      biome: {
        ground: "snow",
        resourceStateSkin: "temperate",
        resourceOverlay: {
          kind: "cap",
          chance: 0.58,
          seedKey: "resource-snow",
          fillColor: "#f7ffff",
          strokeColor: "#b7d7df",
        },
        friendlyProjectileColor: "#704321",
        popupContrast: {
          protectedColors: ["#63c6e8"],
          perceivedBrightnessThreshold: 150,
          darkenMultiplier: 0.42,
        },
        palette: {
          viewport: "#b9d6db",
          ground: "#d7e7e8",
          clearingCenter: "#f1f6f4",
          clearingEdge: "#c7dcdd",
          foliage: ["#acc7c9", "#b9d0d0", "#c5d9d8", "#d0e2e0"],
        },
      },
    });
    expect(campaignTier("snowy").milestones.every((item) => item.reward.kind === "coins")).toBe(true);
    expect(campaignTier("desert")).toMatchObject({
      order: 2,
      unlock: { level: 9, previousTierId: "snowy" },
      boss: "dune-colossus",
      specialEnemies: ["dune-burrower", "sandstormer", "tombguard"],
      biome: CAMPAIGN_BIOMES.desert,
    });
    expect(campaignTier("wasteland")).toMatchObject({
      order: 3,
      unlock: { level: 13, previousTierId: "desert" },
      boss: "reactor-revenant",
      specialEnemies: ["radstalker", "sludge-lobber", "ruin-siren"],
      biome: CAMPAIGN_BIOMES.wasteland,
    });
    expect(campaignTier("volcanic")).toMatchObject({
      order: 4,
      unlock: { level: 17, previousTierId: "wasteland" },
      boss: "caldera-sovereign",
      specialEnemies: ["cinderburst", "magma-spitter", "obsidian-charger"],
      biome: CAMPAIGN_BIOMES.volcanic,
    });
    expect(campaignTier("rift")).toMatchObject({
      order: 5,
      unlock: { level: 21, previousTierId: "volcanic" },
      boss: "eclipse-regent",
      specialEnemies: ["rift-strider", "comet-slinger", "void-herald"],
      biome: CAMPAIGN_BIOMES.rift,
    });
    expect(campaignTier("mire")).toMatchObject({
      order: 6,
      unlock: { level: 25, previousTierId: "rift" },
      boss: "mireheart-titan",
      specialEnemies: ["mire-lurker", "sporecaster", "drowned-bulwark"],
      biome: CAMPAIGN_BIOMES.mire,
    });
    expect(campaignTier("clockwork")).toMatchObject({
      order: 7,
      unlock: { level: 29, previousTierId: "mire" },
      boss: "chronoforge-colossus",
      specialEnemies: ["springjack", "aether-gunner", "gearwright"],
      biome: CAMPAIGN_BIOMES.clockwork,
    });
  });

  it("classifies every configured campaign boss through registry metadata", () => {
    for (const tier of CAMPAIGN_TIERS) {
      expect(isBossEnemyKind(tier.boss)).toBe(true);
    }
    expect(isBossEnemyKind("basic")).toBe(false);
    expect(isBossEnemyKind("splitter-child")).toBe(false);
  });

  it("defines complete render palettes for every biome", () => {
    const biomes: readonly CampaignBiomeDefinition[] = Object.values(CAMPAIGN_BIOMES);
    for (const biome of biomes) {
      expect(RESOURCE_STATE_SKINS[biome.resourceStateSkin]).toBeDefined();
      expect(biome.palette.foliage).toHaveLength(4);
      expect(Object.values(biome.palette).flat().every((color) => (
        typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)
      ))).toBe(true);
      expect(biome.friendlyProjectileColor === undefined
        || /^#[0-9a-f]{6}$/i.test(biome.friendlyProjectileColor)).toBe(true);
      expect(biome.popupContrast?.protectedColors.every((color) => (
        /^#[0-9a-f]{6}$/i.test(color)
      )) ?? true).toBe(true);
      if (biome.popupContrast) {
        expect(biome.popupContrast.perceivedBrightnessThreshold).toBeGreaterThan(0);
        expect(biome.popupContrast.darkenMultiplier).toBeGreaterThan(0);
        expect(biome.popupContrast.darkenMultiplier).toBeLessThan(1);
      }
      const resourceOverlay = biome.resourceOverlay;
      if (resourceOverlay) {
        expect(resourceOverlay.chance).toBeGreaterThan(0);
        expect(resourceOverlay.chance).toBeLessThanOrEqual(1);
        expect(resourceOverlay.seedKey).not.toHaveLength(0);
        expect(resourceOverlay.fillColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(resourceOverlay.strokeColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(resourceOverlay.opacity).toBeGreaterThan(0);
        expect(resourceOverlay.opacity).toBeLessThanOrEqual(1);
        expect(resourceOverlay.hitOpacity).toBeGreaterThan(0);
        expect(resourceOverlay.hitOpacity).toBeLessThanOrEqual(1);
        expect(resourceOverlay.widthRatio).toBeGreaterThan(0);
        expect(resourceOverlay.heightRatio).toBeGreaterThan(0);
        expect(resourceOverlay.lineWidth).toBeGreaterThan(0);
      }
      const weather = biome.weather;
      if (weather) {
        expect(weather.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(weather.seedKey).not.toHaveLength(0);
        expect(weather.particleCount).toBeGreaterThan(0);
        expect(weather.fadeSeconds).toBeGreaterThan(0);
        for (const range of [
          weather.fallSpeed,
          weather.radius,
          weather.driftAmplitude,
          weather.driftSpeed,
          weather.spawnGapRatio,
        ]) {
          expect(range[0]).toBeGreaterThanOrEqual(0);
          expect(range[1]).toBeGreaterThan(range[0]);
        }
      }
    }
  });

  it("assigns every biome's three configured specials to distinct roster tiers", () => {
    for (const tier of CAMPAIGN_TIERS.filter((item) => item.id !== "forest" && item.specialEnemies.length > 0)) {
      const roster = selectEnemyRoster("campaign-special-slots", tier.id);
      const specialEnemies = new Set<string>(tier.specialEnemies);
      expect(Object.values(roster).filter((kind) => specialEnemies.has(kind))).toHaveLength(3);
      expect(new Set(Object.values(roster)).size).toBe(5);
    }
  });

  it("keeps Forest Frontier roster slots seed-random across all shared candidates", () => {
    const rosters = Array.from({ length: 20 }, (_, index) =>
      selectEnemyRoster(`forest-card-options-${index}`, "forest"));
    expect(new Set(rosters.map((roster) => roster[3])).size).toBeGreaterThan(1);
    expect(new Set(rosters.map((roster) => roster[5])).size).toBeGreaterThan(1);
    expect(new Set(rosters.map((roster) => roster[7])).size).toBeGreaterThan(1);
  });

  it("accepts either the level path or previous-clear path for every later tier", () => {
    for (const tier of CAMPAIGN_TIERS.slice(1)) {
      const previousTierId = tier.unlock.previousTierId!;
      expect(isCampaignTierUnlocked(tier, {
        level: tier.unlock.level,
        defeatedTierIds: [],
      })).toBe(true);
      expect(isCampaignTierUnlocked(tier, {
        level: tier.unlock.level - 1,
        defeatedTierIds: [previousTierId],
      })).toBe(true);
      expect(isCampaignTierUnlocked(tier, {
        level: tier.unlock.level - 1,
        defeatedTierIds: [],
      })).toBe(false);
    }
    expect(highestUnlockedCampaignTierId({ level: 13, defeatedTierIds: [] }))
      .toBe("wasteland");
    expect(highestUnlockedCampaignTierId({ level: 1, defeatedTierIds: ["forest"] }))
      .toBe("snowy");
  });

  it("guarantees the three Snowbound threats in stable roster slots", () => {
    expect(selectEnemyRoster("same-seed", "snowy")).toEqual({
      1: "basic",
      2: "runner",
      3: "frostbite",
      5: "snowballer",
      7: "icebound",
    });
    expect(selectEnemyRoster("same-seed", "snowy")).toEqual(selectEnemyRoster("same-seed", "snowy"));
    expect(Object.values(selectEnemyRoster("same-seed", "forest")))
      .not.toEqual(expect.arrayContaining(["frostbite", "snowballer", "icebound"]));
  });

  it("guarantees the three Desert threats in stable roster slots and forecasts its boss", () => {
    expect(selectEnemyRoster("same-seed", "desert")).toEqual({
      1: "basic",
      2: "runner",
      3: "dune-burrower",
      5: "sandstormer",
      7: "tombguard",
    });
    expect(selectEnemyRoster("same-seed", "desert"))
      .toEqual(selectEnemyRoster("same-seed", "desert"));
  });

  it("guarantees the three volcanic threats in stable roster slots", () => {
    expect(selectEnemyRoster("same-seed", "volcanic")).toEqual({
      1: "basic",
      2: "runner",
      3: "cinderburst",
      5: "magma-spitter",
      7: "obsidian-charger",
    });
    expect(selectEnemyRoster("same-seed", "volcanic"))
      .toEqual(selectEnemyRoster("same-seed", "volcanic"));
  });

  it("guarantees the three wasteland threats in stable roster slots", () => {
    const roster = selectEnemyRoster("same-seed", "wasteland");
    expect(roster).toEqual({
      1: "basic",
      2: "runner",
      3: "radstalker",
      5: "sludge-lobber",
      7: "ruin-siren",
    });
    expect(selectEnemyRoster("same-seed", "wasteland"))
      .toEqual(roster);
    expect(rosterMilestones(roster, campaignTier("wasteland").boss).at(-1))
      .toEqual({ night: 10, enemy: "reactor-revenant", label: "Reactor Revenant" });
  });

  it("guarantees the three Astral Rift threats in stable roster slots", () => {
    const roster = selectEnemyRoster("same-seed", "rift");
    expect(roster).toEqual({
      1: "basic",
      2: "runner",
      3: "rift-strider",
      5: "comet-slinger",
      7: "void-herald",
    });
    expect(selectEnemyRoster("same-seed", "rift")).toEqual(roster);
    expect(rosterMilestones(roster, campaignTier("rift").boss).at(-1))
      .toEqual({ night: 10, enemy: "eclipse-regent", label: "Eclipse Regent" });
  });

  it("guarantees the three Drowned Mire threats in stable roster slots", () => {
    const roster = selectEnemyRoster("same-seed", "mire");
    expect(roster).toEqual({
      1: "basic",
      2: "runner",
      3: "mire-lurker",
      5: "sporecaster",
      7: "drowned-bulwark",
    });
    expect(selectEnemyRoster("same-seed", "mire")).toEqual(roster);
    expect(rosterMilestones(roster, campaignTier("mire").boss).at(-1))
      .toEqual({ night: 10, enemy: "mireheart-titan", label: "Mireheart Titan" });
  });

  it("guarantees the three Clockwork Citadel threats in stable roster slots", () => {
    const roster = selectEnemyRoster("same-seed", "clockwork");
    expect(roster).toEqual({
      1: "basic",
      2: "runner",
      3: "springjack",
      5: "aether-gunner",
      7: "gearwright",
    });
    expect(selectEnemyRoster("same-seed", "clockwork")).toEqual(roster);
    expect(rosterMilestones(roster, campaignTier("clockwork").boss).at(-1))
      .toEqual({ night: 10, enemy: "chronoforge-colossus", label: "Chronoforge Colossus" });
  });

  it("assigns biome resource overlays deterministically without changing Forest", () => {
    const first = generateWorld("snow-seed", 1, "snowy");
    const second = generateWorld("snow-seed", 1, "snowy");
    expect(first.resources.map((node) => node.biomeOverlay))
      .toEqual(second.resources.map((node) => node.biomeOverlay));
    expect(first.resources.some((node) => node.biomeOverlay)).toBe(true);
    expect(generateWorld("snow-seed", 1, "forest").resources.every((node) => (
      node.biomeOverlay === undefined
    ))).toBe(true);
  });

  it("fixes hidden Mire infections deterministically for the seeded run", () => {
    const first = generateWorld("mire-infection-seed", 1, "mire");
    const second = generateWorld("mire-infection-seed", 1, "mire");
    expect(first.resources.filter((node) => node.infected).map((node) => node.id))
      .toEqual(second.resources.filter((node) => node.infected).map((node) => node.id));
    expect(first.resources.some((node) => node.infected)).toBe(true);
    expect(generateWorld("mire-infection-seed", 1, "forest").resources
      .every((node) => node.infected === undefined)).toBe(true);
  });

  it("persists a Forest clear and grants earned level rewards once", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(7);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 7;
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);
    expect(manager.beginRunSettlement("forest-clear", 0)).toBe(true);
    const result = manager.settleRun("forest-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 100,
      campaignTierId: "forest",
    });
    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards?.map((item) => item.id)).toEqual([
      "campaign-v2-level-2-coins",
      "campaign-v2-level-3-coins",
      "campaign-v2-level-4-coins",
      "campaign-v2-level-6-coins",
      "campaign-v2-level-7-coins",
    ]);
    expect(manager.profile.campaign.defeatedTierIds).toContain("forest");
    expect(manager.profile.coins).toBe(190);
    expect(manager.settleRun("forest-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 100,
      campaignTierId: "forest",
    })).toBeNull();
  });

  it("persists a Snowbound clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(13);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 13;
    profile.campaign.defeatedTierIds = ["forest"];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones.map((milestone) => milestone.id));
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("snowbound-clear", 0)).toBe(true);
    const result = manager.settleRun("snowbound-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 120,
      campaignTierId: "snowy",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds).toEqual(["forest", "snowy"]);
  });

  it("persists a Desert clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(19);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 19;
    profile.campaign.defeatedTierIds = ["forest", "snowy"];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 19)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("desert-clear", 0)).toBe(true);
    const result = manager.settleRun("desert-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 140,
      campaignTierId: "desert",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds).toEqual(["forest", "snowy", "desert"]);
  });

  it("persists a Fallout clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(25);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 25;
    profile.campaign.defeatedTierIds = ["forest", "snowy", "desert"];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 25)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("fallout-clear", 0)).toBe(true);
    const result = manager.settleRun("fallout-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 160,
      campaignTierId: "wasteland",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds)
      .toEqual(["forest", "snowy", "desert", "wasteland"]);
  });

  it("persists a Caldera clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(31);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 31;
    profile.campaign.defeatedTierIds = ["forest", "snowy", "desert", "wasteland"];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 31)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("caldera-clear", 0)).toBe(true);
    const result = manager.settleRun("caldera-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 180,
      campaignTierId: "volcanic",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds)
      .toEqual(["forest", "snowy", "desert", "wasteland", "volcanic"]);
  });

  it("persists an Astral Rift clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(37);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 37;
    profile.campaign.defeatedTierIds = [
      "forest", "snowy", "desert", "volcanic", "wasteland",
    ];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 37)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("astral-clear", 0)).toBe(true);
    const result = manager.settleRun("astral-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 200,
      campaignTierId: "rift",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds)
      .toEqual(["forest", "snowy", "desert", "volcanic", "wasteland", "rift"]);
  });

  it("persists a Drowned Mire clear without re-announcing a level-unlocked tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(43);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 43;
    profile.campaign.defeatedTierIds = [
      "forest", "snowy", "desert", "volcanic", "wasteland", "rift",
    ];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 43)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("mire-clear", 0)).toBe(true);
    const result = manager.settleRun("mire-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 220,
      campaignTierId: "mire",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds)
      .toEqual(["forest", "snowy", "desert", "volcanic", "wasteland", "rift", "mire"]);
  });

  it("persists the terminal Clockwork Citadel clear without announcing another tier", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(47);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 47;
    profile.campaign.defeatedTierIds = [
      "forest", "snowy", "desert", "wasteland", "volcanic", "rift", "mire",
    ];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 47)
      .map((milestone) => milestone.id);
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("clockwork-clear", 0)).toBe(true);
    const result = manager.settleRun("clockwork-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 240,
      campaignTierId: "clockwork",
    });

    expect(result?.newlyUnlockedTierIds).toEqual([]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds).toEqual(CAMPAIGN_TIER_IDS);
  });
});
