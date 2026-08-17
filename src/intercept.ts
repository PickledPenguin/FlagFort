import type { Vec2 } from "./types";

export function predictInterceptPoint(
  origin: Vec2,
  target: Vec2,
  velocity: Vec2,
  projectileSpeed: number,
  maximumTime: number,
  leadFactor = 1,
): Vec2 {
  if (projectileSpeed <= 0 || maximumTime <= 0) return { ...target };
  const rx = target.x - origin.x;
  const ry = target.y - origin.y;
  const a = velocity.x * velocity.x + velocity.y * velocity.y
    - projectileSpeed * projectileSpeed;
  const b = 2 * (rx * velocity.x + ry * velocity.y);
  const c = rx * rx + ry * ry;
  let interceptTime = Number.POSITIVE_INFINITY;
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) > 1e-6) interceptTime = -c / b;
  } else {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      const first = (-b - root) / (2 * a);
      const second = (-b + root) / (2 * a);
      if (first > 0) interceptTime = first;
      if (second > 0) interceptTime = Math.min(interceptTime, second);
    }
  }
  if (!Number.isFinite(interceptTime) || interceptTime <= 0) return { ...target };
  const time = Math.min(maximumTime, interceptTime) * Math.max(0, Math.min(1, leadFactor));
  return {
    x: target.x + velocity.x * time,
    y: target.y + velocity.y * time,
  };
}
