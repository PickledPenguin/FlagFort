import type { EntityStatuses } from "./types";

export interface StatusTarget {
  statuses?: EntityStatuses;
}

export function applySlow(target: StatusTarget, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  target.statuses ??= {};
  const current = target.statuses.slow?.remaining ?? 0;
  target.statuses.slow = { remaining: Math.max(current, duration) };
}

export function updateStatuses(target: StatusTarget, dt: number): void {
  const slow = target.statuses?.slow;
  if (!slow) return;
  slow.remaining = Math.max(0, slow.remaining - Math.max(0, dt));
  if (slow.remaining <= 0) delete target.statuses!.slow;
  if (target.statuses && Object.keys(target.statuses).length === 0) delete target.statuses;
}

export function isSlowed(target: StatusTarget): boolean {
  return (target.statuses?.slow?.remaining ?? 0) > 0;
}
