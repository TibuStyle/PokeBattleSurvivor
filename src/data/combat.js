export const BASE_PLAYER_STATS = {
  maxHp: 100,
  moveSpeed: 6.5,
  playerRadius: 0.62,
  pickupRadius: 1.15,
  magnetRadius: 3.8,
  contactGraceSeconds: 0.55,
};

export const PSYBEAM_BASE = {
  id: 'psybeam',
  name: 'Psicorrayo',
  damage: 28,
  cooldown: 0.42,
  range: 11.5,
  width: 0.78,
  knockback: 2.5,
  beams: 1,
  pierce: 3,
  spreadRadians: 0.18,
  color: '#ff7be5',
};

export const HORDE_CONFIG = {
  initialEnemies: 4,
  baseSpawnInterval: 2.1,
  minSpawnInterval: 0.55,
  waveDurationSeconds: 20,
  maxActiveEnemies: 36,
  spawnMinRadius: 12.5,
  spawnMaxRadius: 19.5,
  bossSpawnSeconds: 90,
};

export const ENEMY_PROFILES = {
  Caterpie: {
    name: 'Caterpie',
    hp: 36,
    speed: 2.45,
    contactDamage: 10,
    xp: 16,
    radius: 0.48,
    color: '#7ad96c',
    accent: '#f6e785',
    shape: 'larva',
  },
  Weedle: {
    name: 'Weedle',
    hp: 30,
    speed: 2.95,
    contactDamage: 12,
    xp: 18,
    radius: 0.45,
    color: '#d89b48',
    accent: '#fff0a6',
    shape: 'stinger',
  },
  Spinarak: {
    name: 'Spinarak',
    hp: 44,
    speed: 2.85,
    contactDamage: 13,
    xp: 20,
    radius: 0.5,
    color: '#6acb68',
    accent: '#e25b6f',
    shape: 'crawler',
  },
  Hoothoot: {
    name: 'Hoothoot',
    hp: 52,
    speed: 3.1,
    contactDamage: 14,
    xp: 22,
    radius: 0.52,
    color: '#b9855a',
    accent: '#f3d078',
    shape: 'flyer',
  },
  Poochyena: {
    name: 'Poochyena',
    hp: 58,
    speed: 3.3,
    contactDamage: 16,
    xp: 24,
    radius: 0.52,
    color: '#7e8494',
    accent: '#f06d6d',
    shape: 'hound',
  },
  Numel: {
    name: 'Numel',
    hp: 74,
    speed: 2.3,
    contactDamage: 18,
    xp: 26,
    radius: 0.62,
    color: '#e6b15c',
    accent: '#75b878',
    shape: 'brute',
  },
};

export const BOSS_PROFILES = {
  Mewtwo: {
    name: 'Mewtwo',
    hp: 420,
    speed: 2.65,
    contactDamage: 24,
    xp: 120,
    radius: 0.95,
    color: '#c9a3f7',
    accent: '#ff7be5',
    shape: 'boss',
  },
  'Ho-Oh / Lugia': {
    name: 'Ho-Oh / Lugia',
    hp: 520,
    speed: 2.8,
    contactDamage: 26,
    xp: 150,
    radius: 1.0,
    color: '#f49d5b',
    accent: '#7de6e0',
    shape: 'boss',
  },
  Groudon: {
    name: 'Groudon',
    hp: 640,
    speed: 2.55,
    contactDamage: 30,
    xp: 180,
    radius: 1.08,
    color: '#e05844',
    accent: '#ffd166',
    shape: 'boss',
  },
};

export const RUN_UPGRADES = [
  {
    id: 'psybeamPower',
    name: 'Foco Psíquico',
    category: 'Psicorrayo',
    icon: '◈',
    maxRank: 5,
    description: '+25% de daño de Psicorrayo y +1 objetivo perforado.',
  },
  {
    id: 'psybeamCadence',
    name: 'Pulso Mental',
    category: 'Psicorrayo',
    icon: 'ϟ',
    maxRank: 5,
    description: '−15% de enfriamiento de Psicorrayo.',
  },
  {
    id: 'psybeamPrism',
    name: 'Prisma Psíquico',
    category: 'Psicorrayo',
    icon: '❖',
    maxRank: 3,
    description: '+1 haz adicional en abanico y +12% de alcance.',
  },
  {
    id: 'psybeamWave',
    name: 'Onda Telequinética',
    category: 'Control',
    icon: '◎',
    maxRank: 4,
    description: '+25% de ancho de haz y +35% de empuje contra la horda.',
  },
  {
    id: 'vitalityBoost',
    name: 'Cuerpo Resiliente',
    category: 'Supervivencia',
    icon: '♥',
    maxRank: 5,
    description: '+25 PS máximos y recupera 30 PS al instante.',
  },
  {
    id: 'agileStep',
    name: 'Paso Ligero',
    category: 'Movilidad',
    icon: '↗',
    maxRank: 4,
    description: '+12% de velocidad de movimiento.',
  },
  {
    id: 'auraMagnet',
    name: 'Atracción Astral',
    category: 'Experiencia',
    icon: '⌖',
    maxRank: 4,
    description: '+35% de radio de imán de orbes y +15% de XP.',
  },
];

export function getEnemyProfile(species) {
  return ENEMY_PROFILES[species] ?? ENEMY_PROFILES.Caterpie;
}

export function getBossProfile(bossName) {
  return BOSS_PROFILES[bossName] ?? {
    ...BOSS_PROFILES.Mewtwo,
    name: bossName || 'Jefe Regional',
  };
}

export function getXpForNextLevel(level = 1) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  return Math.round(40 + (safeLevel - 1) * 26 + Math.pow(safeLevel - 1, 1.35) * 10);
}
