const desertEnemyImage = (name: string): string => `enemies/${name}`;

export const DESERT_ENEMY_ARTWORK = {
  duneHopper: desertEnemyImage("dune-hopper-zombie"),
  sandcaster: desertEnemyImage("sandcaster-zombie"),
  tombguard: {
    armored: desertEnemyImage("tombguard-zombie"),
    broken: desertEnemyImage("tombguard-zombie-broken"),
  },
  duneColossus: {
    armored: desertEnemyImage("dune-colossus"),
    broken: desertEnemyImage("dune-colossus-broken"),
  },
} as const;
