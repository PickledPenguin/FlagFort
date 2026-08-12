const clockworkEnemyImage = (name: string): string => `enemies/${name}`;

export const CLOCKWORK_ENEMY_ARTWORK = {
  springjack: clockworkEnemyImage("springjack-zombie"),
  aetherGunner: clockworkEnemyImage("aether-gunner-zombie"),
  gearwright: clockworkEnemyImage("gearwright-zombie"),
  chronoforgeColossus: {
    armored: clockworkEnemyImage("chronoforge-colossus"),
    broken: clockworkEnemyImage("chronoforge-colossus-broken"),
  },
} as const;
