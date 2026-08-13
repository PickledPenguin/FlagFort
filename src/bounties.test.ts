import { describe, expect, it } from "vitest";
import { BOUNTIES, BOUNTY_FEASIBILITY_LIMITS, selectRunBounties } from "./bounties";

describe("seeded run bounties", () => {
  it("provides exactly 50 definitions at the configured 70/20/10 split", () => {
    expect(BOUNTIES).toHaveLength(50);
    expect(BOUNTIES.filter((item) => item.difficulty === 1)).toHaveLength(35);
    expect(BOUNTIES.filter((item) => item.difficulty === 2)).toHaveLength(10);
    expect(BOUNTIES.filter((item) => item.difficulty === 3)).toHaveLength(5);
    expect(new Set(BOUNTIES.map((item) => item.id)).size).toBe(50);
    expect(BOUNTIES.every((item) => item.requirement.target > 0)).toBe(true);
    expect(BOUNTIES.every((item) => item.exclusionGroup.length > 0)).toBe(true);
  });

  it("keeps every unlock-heavy build objective inside the audited run limit", () => {
    for (const bounty of BOUNTIES) {
      const limit = BOUNTY_FEASIBILITY_LIMITS[bounty.requirement.metric];
      expect(limit, bounty.id).toBeGreaterThan(0);
      expect(bounty.requirement.target, bounty.id).toBeLessThanOrEqual(limit);
      if (bounty.requirement.metric.endsWith("Created")) {
        expect(bounty.description, bounty.id).toMatch(/^Build |^Obtain /);
        expect(bounty.description, bounty.id).not.toContain("Establish");
      }
    }
  });

  it("selects three distinct deterministic bounties without tier input", () => {
    const first = selectRunBounties("bounty-seed");
    expect(selectRunBounties("bounty-seed")).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
    expect(selectRunBounties("another-seed")).not.toEqual(first);
  });

  it("never selects two variants from the same exclusion group", () => {
    for (let index = 0; index < 500; index += 1) {
      const selected = selectRunBounties(`exclusion-seed-${index}`);
      expect(new Set(selected.map((item) => item.exclusionGroup)).size).toBe(3);
    }
  });

  it("keeps deterministic selection stable across repeated calls", () => {
    const seeds = ["forest-run", "snow-run", "volcanic-run", "endless-run"];
    const firstPass = seeds.map((seed) => selectRunBounties(seed).map((item) => item.id));
    const secondPass = seeds.map((seed) => selectRunBounties(seed).map((item) => item.id));
    expect(secondPass).toEqual(firstPass);
  });
});
