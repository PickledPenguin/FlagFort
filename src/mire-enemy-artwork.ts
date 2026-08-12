const mireEnemyImage = (name: string): string => `enemies/${name}`;

export const MIRE_ENEMY_ARTWORK = {
  mireLurker: mireEnemyImage("mire-lurker-zombie"),
  sporecaster: mireEnemyImage("sporecaster-zombie"),
  drownedBulwark: {
    armored: mireEnemyImage("drowned-bulwark-zombie"),
    broken: mireEnemyImage("drowned-bulwark-zombie-broken"),
  },
  mireheartTitan: {
    armored: mireEnemyImage("mireheart-titan"),
    broken: mireEnemyImage("mireheart-titan-broken"),
  },
} as const;
