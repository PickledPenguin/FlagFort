const desertEnemyImage = (name: string): string => `enemies/${name}`;

export const DESERT_ENEMY_ARTWORK = {
  duneHopper: desertEnemyImage("dune-hopper-zombie"),
  sandcaster: desertEnemyImage("sandcaster-zombie"),
  tombguard: desertEnemyImage("tombguard-zombie"),
} as const;
