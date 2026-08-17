import { describe, expect, it } from "vitest";
import { predictInterceptPoint } from "./intercept";

describe("lightweight turret intercept aiming", () => {
  it("leads a moving target without changing projectile physics", () => {
    const aim = predictInterceptPoint(
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 0, y: 120 },
      940,
      1,
      0.84,
    );
    expect(aim.x).toBe(400);
    expect(aim.y).toBeGreaterThan(0);
    expect(aim.y).toBeLessThan(120);
  });

  it("keeps current-position aim when no positive intercept exists", () => {
    expect(predictInterceptPoint(
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 2000, y: 0 },
      940,
      1,
      0.84,
    )).toEqual({ x: 100, y: 0 });
  });
});
