export interface ModifierLayers {
  base: number;
  permanent?: number;
  equipment?: number;
  challenge?: number;
  temporary?: number;
  mutation?: number;
  contextual?: number;
  temporaryFlat?: number;
}

/**
 * Effective-stat order is fixed: base, permanent, equipment, challenge,
 * temporary, mutation, contextual, then temporary flat additions.
 * Percentage layers are additive to prevent hidden double multiplication.
 */
export function resolveEffectiveStat(layers: ModifierLayers): number {
  const percent = (layers.permanent ?? 0)
    + (layers.equipment ?? 0)
    + (layers.challenge ?? 0)
    + (layers.temporary ?? 0)
    + (layers.mutation ?? 0)
    + (layers.contextual ?? 0);
  return layers.base * Math.max(0, 1 + percent) + (layers.temporaryFlat ?? 0);
}

export function resolveCooldown(baseCooldown: number, additiveRateBonuses: readonly number[]): number {
  const totalRate = additiveRateBonuses.reduce((sum, bonus) => sum + Math.max(-0.95, bonus), 0);
  return baseCooldown / Math.max(0.05, 1 + totalRate);
}

export interface ActionSpeedLayers {
  permanent?: number;
  equipment?: number;
  challenge?: number;
  temporary?: number;
  mutation?: number;
  contextual?: number;
}

/**
 * Resolves rate bonuses once, then converts the effective rate back to a
 * cooldown. Explicit cooldown multipliers are reserved for equipment whose
 * design intentionally changes action timing, such as swords.
 */
export function resolveActionCooldown(
  baseCooldown: number,
  layers: ActionSpeedLayers,
  documentedCooldownMultipliers: readonly number[] = [],
): number {
  const effectiveRate = resolveEffectiveStat({ base: 1, ...layers });
  const cooldownMultiplier = documentedCooldownMultipliers
    .filter((value) => Number.isFinite(value) && value >= 0)
    .reduce((product, value) => product * value, 1);
  return baseCooldown / Math.max(0.05, effectiveRate) * cooldownMultiplier;
}

export function resolveActionRate(baseCooldown: number, layers: ActionSpeedLayers): number {
  return 1 / resolveActionCooldown(baseCooldown, layers);
}
