import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_BIOMES,
  CAMPAIGN_TIERS,
  campaignTier,
  highestUnlockedCampaignTierId,
  isCampaignTierUnlocked,
} from "./campaign";
import type { CampaignBiomeDefinition } from "./campaign";
import { isBossEnemyKind, selectEnemyRoster } from "./enemy-registry";
import { ProfileManager, createDefaultProfile, lifetimeXpAtLevel } from "./profile";
import { generateWorld } from "./world";
import type { KeyValueStore } from "./platform";
import type { CoinSettlement, XpRewardBreakdown } from "./rewards";
import { CAMPAIGN_TIER_IDS } from "./types";
import { RESOURCE_STATE_SKINS } from "./assets";
import { CAMPAIGN_TIER_ARTWORK } from "./campaign-artwork";
import { DESERT_ENEMY_ARTWORK } from "./desert-enemy-artwork";
import { VOLCANIC_ENEMY_ARTWORK } from "./volcanic-enemy-artwork";

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
      duneHopper: "enemies/dune-hopper-zombie",
      sandcaster: "enemies/sandcaster-zombie",
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

  it("defines a complete nuclear wasteland environment without exposing an unfinished tier", () => {
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
    expect(CAMPAIGN_TIERS.some((tier) => tier.biome === CAMPAIGN_BIOMES.wasteland)).toBe(false);
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
    expect(campaignTier("forest")).toMatchObject(CAMPAIGN_TIER_ARTWORK.forest);
    expect(campaignTier("snowy")).toMatchObject(CAMPAIGN_TIER_ARTWORK.snowy);
    expect(campaignTier("desert")).toMatchObject(CAMPAIGN_TIER_ARTWORK.desert);
    expect(campaignTier("volcanic")).toMatchObject(CAMPAIGN_TIER_ARTWORK.volcanic);
  });

  it("keeps tier order, requirements, rewards, enemies, bosses, and effects on definitions", () => {
    expect(CAMPAIGN_TIERS.map((tier) => tier.id)).toEqual(CAMPAIGN_TIER_IDS);
    expect(campaignTier("snowy")).toMatchObject({
      unlock: { level: 4, previousTierId: "forest" },
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
      unlock: { level: 7, previousTierId: "snowy" },
      boss: "dune-colossus",
      specialEnemies: ["dune-hopper", "sandcaster", "tombguard"],
      biome: CAMPAIGN_BIOMES.desert,
    });
    expect(campaignTier("volcanic")).toMatchObject({
      order: 3,
      unlock: { level: 10, previousTierId: "desert" },
      boss: "caldera-sovereign",
      specialEnemies: ["cinderburst", "magma-spitter", "obsidian-charger"],
      biome: CAMPAIGN_BIOMES.volcanic,
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
    for (const tier of CAMPAIGN_TIERS.filter((item) => item.specialEnemies.length > 0)) {
      const roster = selectEnemyRoster("campaign-special-slots", tier.id);
      const specialEnemies = new Set<string>(tier.specialEnemies);
      expect(Object.values(roster).filter((kind) => specialEnemies.has(kind))).toHaveLength(3);
      expect(new Set(Object.values(roster)).size).toBe(5);
    }
  });

  it("requires both player level and the previous clear", () => {
    const snowy = campaignTier("snowy");
    const desert = campaignTier("desert");
    expect(isCampaignTierUnlocked(snowy, { level: 4, defeatedTierIds: [] })).toBe(false);
    expect(isCampaignTierUnlocked(snowy, { level: 3, defeatedTierIds: ["forest"] })).toBe(false);
    expect(isCampaignTierUnlocked(snowy, { level: 4, defeatedTierIds: ["forest"] })).toBe(true);
    expect(highestUnlockedCampaignTierId({ level: 3, defeatedTierIds: ["forest"] })).toBe("forest");
    expect(highestUnlockedCampaignTierId({ level: 4, defeatedTierIds: ["forest"] })).toBe("snowy");
    expect(isCampaignTierUnlocked(desert, { level: 7, defeatedTierIds: ["forest"] })).toBe(false);
    expect(isCampaignTierUnlocked(desert, { level: 6, defeatedTierIds: ["forest", "snowy"] })).toBe(false);
    expect(isCampaignTierUnlocked(desert, { level: 7, defeatedTierIds: ["forest", "snowy"] })).toBe(true);
    expect(highestUnlockedCampaignTierId({
      level: 7,
      defeatedTierIds: ["forest", "snowy"],
    })).toBe("desert");
    const volcanic = campaignTier("volcanic");
    expect(isCampaignTierUnlocked(volcanic, {
      level: 10,
      defeatedTierIds: ["forest", "snowy"],
    })).toBe(false);
    expect(isCampaignTierUnlocked(volcanic, {
      level: 9,
      defeatedTierIds: ["forest", "snowy", "desert"],
    })).toBe(false);
    expect(isCampaignTierUnlocked(volcanic, {
      level: 10,
      defeatedTierIds: ["forest", "snowy", "desert"],
    })).toBe(true);
    expect(highestUnlockedCampaignTierId({
      level: 10,
      defeatedTierIds: ["forest", "snowy", "desert"],
    })).toBe("volcanic");
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
      3: "dune-hopper",
      5: "sandcaster",
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

  it("persists a Forest clear, grants earned ladder rewards once, and announces Snowbound", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(4);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 4;
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);
    expect(manager.beginRunSettlement("forest-clear", 0)).toBe(true);
    const result = manager.settleRun("forest-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 100,
      campaignTierId: "forest",
    });
    expect(result?.newlyUnlockedTierIds).toEqual(["snowy"]);
    expect(result?.grantedCampaignRewards?.map((item) => item.id)).toEqual([
      "forest-level-2-coins",
      "forest-level-3-coins",
    ]);
    expect(manager.profile.campaign.defeatedTierIds).toContain("forest");
    expect(manager.profile.coins).toBe(70);
    expect(manager.settleRun("forest-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 100,
      campaignTierId: "forest",
    })).toBeNull();
  });

  it("persists a Snowbound clear and announces Desert when its level gate is met", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(7);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 7;
    profile.campaign.defeatedTierIds = ["forest"];
    profile.campaign.claimedRewardIds = [
      "forest-level-2-coins",
      "forest-level-3-coins",
      "snowy-level-5-coins",
      "snowy-level-6-coins",
    ];
    store.setItem("flagfort-profile-v2", JSON.stringify(profile));
    const manager = new ProfileManager(store);

    expect(manager.beginRunSettlement("snowbound-clear", 0)).toBe(true);
    const result = manager.settleRun("snowbound-clear", zeroXp, zeroCoins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 120,
      campaignTierId: "snowy",
    });

    expect(result?.newlyUnlockedTierIds).toEqual(["desert"]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds).toEqual(["forest", "snowy"]);
  });

  it("persists a Desert clear and announces the Caldera Crucible when its level gate is met", () => {
    const store = new MemoryStore();
    const profile = createDefaultProfile();
    profile.lifetimeXp = lifetimeXpAtLevel(10);
    profile.spendableXp = profile.lifetimeXp;
    profile.playerLevel = 10;
    profile.campaign.defeatedTierIds = ["forest", "snowy"];
    profile.campaign.claimedRewardIds = CAMPAIGN_TIERS
      .flatMap((tier) => tier.milestones)
      .filter((milestone) => milestone.level <= 10)
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

    expect(result?.newlyUnlockedTierIds).toEqual(["volcanic"]);
    expect(result?.grantedCampaignRewards).toEqual([]);
    expect(manager.profile.campaign.defeatedTierIds).toEqual(["forest", "snowy", "desert"]);
  });
});
