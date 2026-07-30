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
