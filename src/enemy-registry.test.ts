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
    }
  });
});
