import { ASSETS } from "./assets";
import { buildBarIcon } from "./build-bar-icons";
import { resourceCostLayout } from "./cost-layout";
import type { ResourceWallet } from "./rules";
import type { ActionKind, ResourceKind, StructureKind, Tier } from "./types";

type GenericIcon = "heart" | "timer" | "settings" | "play"
  | "book" | "maximize" | "shuffle" | "restart" | "close" | "arrow-left"
  | "arrow-right" | "skip" | "copy" | "pause";

export function icon(name: GenericIcon, className = ""): string {
  return `<img class="icon ${className}" src="${ASSETS.ui[name]}" alt="" aria-hidden="true">`;
}

export function resourceIcon(kind: ResourceKind, label = false): string {
  return `<img class="resource-glyph ${kind}" src="${ASSETS.resources[kind]}" ${label ? `alt="${kind}"` : 'alt="" aria-hidden="true"'}>`;
}

export function gameSymbol(action: ActionKind, tier: Tier = "wood", large = false): string {
  if (action === "fists") {
    return `<span class="game-symbol fists ${tier} ${large ? "large" : ""}" aria-hidden="true">${buildBarIcon("fists", { tier, large })}</span>`;
  }
  if (action === "tool") {
    return `<span class="game-symbol generic ${large ? "large" : ""}">${buildBarIcon("repair-wrench", { large })}</span>`;
  }
  if (action === "recycle") {
    return `<span class="game-symbol generic recycle ${large ? "large" : ""}">${buildBarIcon("recycle-mallet", { large })}</span>`;
  }
  const kind = action as StructureKind;
  return `<span class="game-symbol structure ${kind} ${tier} ${large ? "large" : ""}" aria-hidden="true">${buildBarIcon(kind, { tier, large })}</span>`;
}

export { buildBarIcon };

export function costIcons(wallet: ResourceWallet, prefix = "", owned?: ResourceWallet): string {
  const values = resourceCostLayout(wallet);
  if (values.length === 0) return '<span class="resource-cost-layout count-0"><span class="cost-free">0</span></span>';
  const items = values.map(({ resource, row, column }, index) => {
    const state = owned ? (owned[resource] >= wallet[resource] ? "affordable" : "insufficient") : "";
    const centered = values.length === 3 && index === 2 ? " centered" : "";
    return `<span class="cost-item ${state}${centered}" style="--cost-row:${row};--cost-column:${column}" title="${resource}">${resourceIcon(resource)}<b>${prefix}${wallet[resource]}</b></span>`;
  }).join("");
  return `<span class="resource-cost-layout count-${values.length}">${items}</span>`;
}
