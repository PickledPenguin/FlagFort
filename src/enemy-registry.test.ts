import { describe, expect, it } from "vitest";
import { ENEMY_REGISTRY, ROSTER_TIERS, introducedRosterEnemies, rosterMilestones, selectEnemyRoster } from "./enemy-registry";

describe("deterministic enemy roster", () => {
  it("selects exactly one configured enemy per tier from a dedicated stable stream", () => {
    const first = selectEnemyRoster("fort-seed");
    const repeated = selectEnemyRoster("fort-seed");
    expect(first).toEqual(repeated);
    expect(Object.keys(first)).toHaveLength(ROSTER_TIERS.length);
    expect(first[1]).toBe("basic");
    expect(first[2]).toBe("runner");
    for (const tier of ROSTER_TIERS) {
      expect(ENEMY_REGISTRY[first[tier]].tier).toBe(tier);
      expect(ENEMY_REGISTRY[first[tier]].selectionWeight).toBeGreaterThan(0);
    }
  });

  it("uses the same roster for introductions and unlocked spawn candidates", () => {
    const roster = selectEnemyRoster("shared-roster");
    const milestones = rosterMilestones(roster);
    for (const tier of ROSTER_TIERS) {
      const selected = roster[tier];
      const introduction = ENEMY_REGISTRY[selected].introductionNight;
      expect(milestones.find((item) => item.night === introduction)?.enemy).toBe(selected);
      expect(introducedRosterEnemies(roster, introduction)).toContain(selected);
      const alternatives = Object.values(ENEMY_REGISTRY)
        .filter((item) => item.rosterEligible && item.tier === tier && item.id !== selected);
      for (const alternative of alternatives) {
        expect(introducedRosterEnemies(roster, 99)).not.toContain(alternative.id);
      }
    }
  });

  it("centralizes safety, behavior, assets, threat, XP, and weights for every enemy", () => {
    for (const definition of Object.values(ENEMY_REGISTRY)) {
      expect(definition.assets.portrait).toMatch(/^enemies\//);
      expect(definition.base.health).toBeGreaterThan(0);
      expect(definition.caps.perWave).toBeGreaterThan(0);
      expect(definition.caps.simultaneous).toBeGreaterThan(0);
      expect(definition.threat).toBeGreaterThanOrEqual(0);
      expect(definition.xp).toBeGreaterThanOrEqual(0);
      expect(definition.targeting.mode).toBeTruthy();
      expect(definition.attack.mode).toBeTruthy();
      expect(definition.death.mode).toBeTruthy();
      if (definition.armor) {
        expect(definition.armor.health).toBeGreaterThan(0);
        expect(definition.armor.projectileResistance).toBeGreaterThanOrEqual(0);
        expect(definition.armor.projectileResistance).toBeLessThan(1);
        expect(definition.armor.barColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.armor.label).toBeTruthy();
        expect(definition.armor.brokenSprite).toMatch(/^enemies\//);
        expect(definition.armor.breakShardCount).toBeGreaterThan(0);
        expect(definition.armor.breakShake).toBeGreaterThanOrEqual(0);
      }
      if (definition.summon) {
        expect(definition.summon.initialCooldown.minimum).toBeGreaterThanOrEqual(0);
        expect(definition.summon.initialCooldown.maximum)
          .toBeGreaterThanOrEqual(definition.summon.initialCooldown.minimum);
        expect(definition.summon.cooldown).toBeGreaterThan(0);
        expect(definition.summon.cappedRetryCooldown).toBeGreaterThan(0);
        expect(definition.summon.maximumLiving).toBeGreaterThan(0);
        expect(definition.summon.kinds?.length ?? 1).toBeGreaterThan(0);
        expect(definition.summon.particleColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(definition.summon.particleCount).toBeGreaterThan(0);
        expect(definition.summon.popupText).toBeTruthy();
        expect(definition.audio.charge).toBeTruthy();
      }
    }
  });
});
