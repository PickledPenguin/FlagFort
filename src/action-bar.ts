import type { ActionKind, StructureKind } from "./types";

export type ActionBarIcon = "melee" | "repair-wrench" | "nighttime-bow" | "recycle-mallet";

export interface ActionBarAction {
  action: Exclude<ActionKind, StructureKind>;
  label: string;
  icon: ActionBarIcon;
}

export const BUILD_ACTION_BAR: readonly ActionBarAction[] = [
  { action: "fists", label: "Fists", icon: "melee" },
  { action: "tool", label: "Repair", icon: "repair-wrench" },
  { action: "recycle", label: "Recycle", icon: "recycle-mallet" },
];

export const COMBAT_ACTION_BAR: readonly ActionBarAction[] = [
  { action: "fists", label: "Fists", icon: "melee" },
  { action: "tool", label: "Bow", icon: "nighttime-bow" },
];

const BUILD_ACTIONS: readonly ActionKind[] = [
  ...BUILD_ACTION_BAR.map(({ action }) => action),
  "wall",
  "spikes",
  "door",
  "harvester",
  "turret",
];

const COMBAT_ACTIONS: readonly ActionKind[] = COMBAT_ACTION_BAR.map(({ action }) => action);

export function actionBarActions(combatMode: boolean): readonly ActionKind[] {
  return combatMode ? COMBAT_ACTIONS : BUILD_ACTIONS;
}
