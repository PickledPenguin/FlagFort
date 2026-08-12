import { describe, expect, it } from "vitest";
import { META_BALANCE } from "./meta-balance";
import {
  ProfileManager,
  canAffordAnyEquipment,
  canAffordAnyPermanentUpgrade,
  createDefaultProfile,
  crazyGamesCalendarDate,
  derivePlayerLevel,
  migrateProfile,
  parseProfile,
} from "./profile";
import { calculateXpRewards, settleCoinInvestment } from "./rewards";

class TestStore {
  values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

describe("versioned profile persistence", () => {
  it("recovers from corrupt data and writes the current schema", () => {
    const profile = parseProfile("{not-json");
    expect(profile).toEqual(createDefaultProfile());
    expect(profile.schemaVersion).toBe(META_BALANCE.profileSchemaVersion);
  });

  it("migrates partial profiles with validation and derived levels", () => {
    const profile = migrateProfile({
      schemaVersion: 1,
      lifetimeXp: 5000.8,
      spendableXp: 9000,
      coins: -20,
      playerLevel: 999,
      permanentUpgrades: { bowDamage: 999 },
      equipment: { helmet: { tier: "diamond", equipped: true }, sword: { tier: "invalid" } },
      playerColor: "not-a-color",
      eyeStyle: "focused",
      completedSettlementIds: ["a", "a", 7],
    });
    expect(profile.schemaVersion).toBe(META_BALANCE.profileSchemaVersion);
    expect(profile.spendableXp).toBe(profile.lifetimeXp);
    expect(profile.playerLevel).toBe(derivePlayerLevel(profile.lifetimeXp));
    expect(profile.coins).toBe(META_BALANCE.coinSafetyMinimum);
    expect(profile.permanentUpgrades.bowDamage).toBe(5);
    expect(profile.equipment.helmet.tier).toBe("diamond");
    expect(profile.equipment.sword.tier).toBeNull();
    expect(profile.eyeStyle).toBe("focused");
    expect(profile.completedSettlementIds).toEqual(["a"]);
  });

  it("retains only registered campaign clears during migration", () => {
    const profile = migrateProfile({
      campaign: {
        defeatedTierIds: ["snowy", "future-placeholder", "clockwork", "mire", "rift", "wasteland", "volcanic", "desert", "forest", "snowy", 7],
      },
    });

    expect(profile.campaign.defeatedTierIds)
      .toEqual(["snowy", "clockwork", "mire", "rift", "wasteland", "volcanic", "desert", "forest"]);
  });

  it("infers total nights from the separate legacy run history", () => {
    const store = new TestStore();
    store.setItem(META_BALANCE.legacyRecordsKey, JSON.stringify([
      {
        seed: "legacy-one",
        difficulty: "normal",
        challengeIds: [],
        victory: true,
        date: "2026-07-28T12:00:00.000Z",
        resourcesGathered: 10,
        structuresBuilt: 2,
        zombiesDefeated: 20,
        elapsed: 900,
        nightsSurvived: 10,
      },
      {
        seed: "legacy-two",
        difficulty: "hard",
        challengeIds: [],
        victory: false,
        date: "2026-07-29T12:00:00.000Z",
        resourcesGathered: 4,
        structuresBuilt: 1,
        zombiesDefeated: 8,
        elapsed: 360,
        nightsSurvived: 4,
      },
    ]));

    const manager = new ProfileManager(store);

    expect(manager.profile.progress.totalNightsSurvived).toBe(14);
  });

  it("grants one New York calendar-day reward across reloads and daylight-saving changes", () => {
    const store = new TestStore();
    const first = new ProfileManager(store);
    expect(first.claimDailyReward(new Date("2026-07-30T23:59:59-04:00")).granted).toBe(true);
    expect(first.profile.coins).toBe(20);

    const reloaded = new ProfileManager(store);
    expect(reloaded.claimDailyReward(new Date("2026-07-31T03:59:59Z")).granted).toBe(false);
    expect(reloaded.claimDailyReward(new Date("2026-08-01T00:00:00Z")).granted).toBe(true);
    expect(reloaded.profile.coins).toBe(35);
    expect(crazyGamesCalendarDate(new Date("2026-08-01T00:00:00+14:00"))).toBe("2026-07-31");
    expect(crazyGamesCalendarDate(new Date("2026-03-08T04:59:59Z"))).toBe("2026-03-07");
    expect(crazyGamesCalendarDate(new Date("2026-03-08T05:00:00Z"))).toBe("2026-03-08");
    expect(crazyGamesCalendarDate(new Date("2026-03-09T03:59:59Z"))).toBe("2026-03-08");
    expect(crazyGamesCalendarDate(new Date("2026-03-09T04:00:00Z"))).toBe("2026-03-09");
    expect(crazyGamesCalendarDate(new Date("2026-11-02T04:59:59Z"))).toBe("2026-11-01");
    expect(crazyGamesCalendarDate(new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02");
  });

  it("deducts and settles a run exactly once", () => {
    const store = new TestStore();
    const manager = new ProfileManager(store);
    manager.profile.coins = 100;
    store.setItem(META_BALANCE.profileStorageKey, JSON.stringify(manager.profile));
    manager.reload();
    expect(manager.beginRunSettlement("run-1", 100, new Date("2026-07-30T12:00:00Z"))).toBe(true);
    expect(manager.profile.coins).toBe(0);
    expect(manager.beginRunSettlement("run-1", 100)).toBe(true);
    expect(manager.profile.coins).toBe(0);

    const xp = calculateXpRewards({
      directPlayerKills: { basic: 1, runner: 0, breaker: 0, jumper: 0, summoner: 0, boss: 0 },
      nightsSurvived: 10,
      victory: true,
    });
    const coins = settleCoinInvestment(100, 10);
    const result = manager.settleRun("run-1", xp, coins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 10,
    });
    expect(result?.newCoins).toBe(200);
    expect(manager.settleRun("run-1", xp, coins, {
      nightsSurvived: 10,
      victory: true,
      structureScore: 10,
    })).toBeNull();
    expect(manager.profile.coins).toBe(200);
    expect(manager.profile.progress.totalRuns).toBe(1);
    expect(manager.profile.progress.totalNightsSurvived).toBe(10);
  });

  it("keeps lifetime XP when permanent upgrades spend XP", () => {
    const store = new TestStore();
    const manager = new ProfileManager(store);
    manager.profile.lifetimeXp = 5000;
    manager.profile.spendableXp = 5000;
    manager.profile.playerLevel = derivePlayerLevel(5000);
    store.setItem(META_BALANCE.profileStorageKey, JSON.stringify(manager.profile));
    manager.reload();
    const level = manager.profile.playerLevel;
    expect(manager.buyPermanentUpgrade("bowDamage")).toBe(true);
    expect(manager.profile.lifetimeXp).toBe(5000);
    expect(manager.profile.playerLevel).toBe(level);
    expect(manager.profile.spendableXp).toBe(4000);
  });

  it("reports only affordable valid next progression purchases", () => {
    const profile = createDefaultProfile();
    profile.spendableXp = 999;
    profile.coins = 99;
    expect(canAffordAnyPermanentUpgrade(profile)).toBe(false);
    expect(canAffordAnyEquipment(profile)).toBe(false);

    profile.spendableXp = 1000;
    profile.coins = 110;
    expect(canAffordAnyPermanentUpgrade(profile)).toBe(true);
    expect(canAffordAnyEquipment(profile)).toBe(true);

    for (const id of Object.keys(profile.permanentUpgrades) as Array<keyof typeof profile.permanentUpgrades>) {
      profile.permanentUpgrades[id] = META_BALANCE.permanentUpgrade.maximumLevel;
    }
    for (const item of Object.values(profile.equipment)) item.tier = "diamond";
    expect(canAffordAnyPermanentUpgrade(profile)).toBe(false);
    expect(canAffordAnyEquipment(profile)).toBe(false);
  });
});
