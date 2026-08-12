import { describe, expect, it } from "vitest";
import { BOUNTIES, selectRunBounties } from "./bounties";

describe("seeded run bounties", () => {
  it("provides exactly 50 definitions at the configured 70/20/10 split", () => {
    expect(BOUNTIES).toHaveLength(50);
    expect(BOUNTIES.filter((item) => item.difficulty === 1)).toHaveLength(35);
    expect(BOUNTIES.filter((item) => item.difficulty === 2)).toHaveLength(10);
    expect(BOUNTIES.filter((item) => item.difficulty === 3)).toHaveLength(5);
    expect(new Set(BOUNTIES.map((item) => item.id)).size).toBe(50);
  });

  it("selects three distinct deterministic bounties without tier input", () => {
    const first = selectRunBounties("bounty-seed");
    expect(selectRunBounties("bounty-seed")).toEqual(first);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((item) => item.id)).size).toBe(3);
    expect(selectRunBounties("another-seed")).not.toEqual(first);
  });
});
