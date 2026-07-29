import { RESOURCE_ORDER } from "./config";
import type { ResourceWallet } from "./rules";
import type { ResourceKind } from "./types";

export interface CostLayoutItem {
  resource: ResourceKind;
  value: number;
  row: number;
  column: number;
}

/**
 * The single resource-cost layout shared by DOM menus and world-space previews.
 * Coordinates are one-based so they map directly to CSS grid lines.
 */
export function resourceCostLayout(wallet: ResourceWallet): CostLayoutItem[] {
  const resources = RESOURCE_ORDER.filter((resource) => wallet[resource] > 0);
  return resources.map((resource, index) => {
    if (resources.length <= 2) return { resource, value: wallet[resource], row: 1, column: index + 1 };
    if (resources.length === 3) {
      return index < 2
        ? { resource, value: wallet[resource], row: 1, column: index + 1 }
        : { resource, value: wallet[resource], row: 2, column: 1 };
    }
    return {
      resource,
      value: wallet[resource],
      row: Math.floor(index / 2) + 1,
      column: index % 2 + 1,
    };
  });
}

export function costLayoutRows(wallet: ResourceWallet): CostLayoutItem[][] {
  const items = resourceCostLayout(wallet);
  const rows = new Map<number, CostLayoutItem[]>();
  for (const item of items) rows.set(item.row, [...(rows.get(item.row) ?? []), item]);
  return [...rows.values()];
}
