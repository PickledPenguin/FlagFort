const desertEnemyImage = (name: string): string => `enemies/${name}`;

export const DESERT_ENEMY_ARTWORK = {
  duneBurrower: desertEnemyImage("dune-burrower-zombie"),
  sandstormer: desertEnemyImage("sandstormer-zombie"),
  tombguard: {
    armored: desertEnemyImage("tombguard-zombie"),
    broken: desertEnemyImage("tombguard-zombie-broken"),
  },
  duneColossus: {
    armored: desertEnemyImage("dune-colossus"),
    broken: desertEnemyImage("dune-colossus-broken"),
  },
} as const;
