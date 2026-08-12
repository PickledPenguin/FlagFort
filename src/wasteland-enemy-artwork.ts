const wastelandEnemyImage = (name: string): string => `enemies/${name}`;

export const WASTELAND_ENEMY_ARTWORK = {
  radstalker: wastelandEnemyImage("radstalker-zombie"),
  sludgeLobber: wastelandEnemyImage("sludge-lobber-zombie"),
  ruinSiren: wastelandEnemyImage("ruin-siren-zombie"),
  reactorRevenant: {
    armored: wastelandEnemyImage("reactor-revenant"),
    broken: wastelandEnemyImage("reactor-revenant-broken"),
  },
} as const;
