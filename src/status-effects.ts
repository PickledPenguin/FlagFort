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

export function applyBurn(target: StatusTarget, duration: number): void {
  if (!Number.isFinite(duration) || duration <= 0) return;
  target.statuses ??= {};
  target.statuses.burn = {
    remaining: Math.max(target.statuses.burn?.remaining ?? 0, duration),
  };
}

export function updateStatuses(target: StatusTarget, dt: number): void {
  if (!target.statuses) return;
  for (const kind of ["slow", "burn"] as const) {
    const status = target.statuses[kind];
    if (!status) continue;
    status.remaining = Math.max(0, status.remaining - Math.max(0, dt));
    if (status.remaining <= 0) delete target.statuses[kind];
  }
  if (!target.statuses.slow && !target.statuses.burn) delete target.statuses;
}

export function isBurning(target: StatusTarget): boolean {
  return (target.statuses?.burn?.remaining ?? 0) > 0;
}

export function isSlowed(target: StatusTarget): boolean {
  return (target.statuses?.slow?.remaining ?? 0) > 0;
}
