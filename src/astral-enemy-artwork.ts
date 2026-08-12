const astralEnemyImage = (name: string): string => `enemies/${name}`;

export const ASTRAL_ENEMY_ARTWORK = {
  riftStrider: astralEnemyImage("rift-strider-zombie"),
  cometSlinger: astralEnemyImage("comet-slinger-zombie"),
  voidHerald: astralEnemyImage("void-herald-zombie"),
} as const;
