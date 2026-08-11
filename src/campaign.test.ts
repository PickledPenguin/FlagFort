import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_TIERS,
  campaignTier,
  highestUnlockedCampaignTierId,
  isCampaignTierUnlocked,
} from "./campaign";
import { selectEnemyRoster } from "./enemy-registry";
import { ProfileManager, createDefaultProfile, lifetimeXpAtLevel } from "./profile";
import { generateWorld } from "./world";
import type { KeyValueStore } from "./platform";
import type { CoinSettlement, XpRewardBreakdown } from "./rewards";

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
  it("keeps tier order, requirements, rewards, enemies, bosses, and effects on definitions", () => {
    expect(CAMPAIGN_TIERS.map((tier) => tier.id)).toEqual(["forest", "snowy"]);
    expect(campaignTier("snowy")).toMatchObject({
      unlock: { level: 4, previousTierId: "forest" },
      boss: "frost-warden",
      specialEnemies: ["frostbite", "snowballer", "icebound"],
      biome: { ground: "snow", resourceSnowChance: 0.58 },
    });
    expect(campaignTier("snowy").milestones.every((item) => item.reward.kind === "coins")).toBe(true);
  });

  it("requires both player level and the previous clear", () => {
    const snowy = campaignTier("snowy");
    expect(isCampaignTierUnlocked(snowy, { level: 4, defeatedTierIds: [] })).toBe(false);
    expect(isCampaignTierUnlocked(snowy, { level: 3, defeatedTierIds: ["forest"] })).toBe(false);
    expect(isCampaignTierUnlocked(snowy, { level: 4, defeatedTierIds: ["forest"] })).toBe(true);
    expect(highestUnlockedCampaignTierId({ level: 3, defeatedTierIds: ["forest"] })).toBe("forest");
    expect(highestUnlockedCampaignTierId({ level: 4, defeatedTierIds: ["forest"] })).toBe("snowy");
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

  it("assigns resource snow deterministically without changing Forest", () => {
    const first = generateWorld("snow-seed", 1, "snowy");
    const second = generateWorld("snow-seed", 1, "snowy");
    expect(first.resources.map((node) => node.snowCovered))
      .toEqual(second.resources.map((node) => node.snowCovered));
    expect(first.resources.some((node) => node.snowCovered)).toBe(true);
    expect(generateWorld("snow-seed", 1, "forest").resources.every((node) => !node.snowCovered)).toBe(true);
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
});
