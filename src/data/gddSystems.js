/**
 * src/data/gddSystems.js
 * Fusión PokéSurvivor (UI, 9 Regiones, Gacha x1/x10, Objetos Pokémon, Pokédex con Sprites)
 * + Megabonk 3D (Colinas 3D, Cofres en el mapa, Coronas de Élite, Empuje físico y Sinergias).
 */

export const POKEMON_DEX_IDS = {
  // Iniciales Regionales
  bulbasaur: 1, charmander: 4, squirtle: 7,
  chikorita: 152, cyndaquil: 155, totodile: 158,
  treecko: 252, torchic: 255, mudkip: 258,
  turtwig: 387, chimchar: 390, piplup: 393,
  snivy: 495, tepig: 498, oshawott: 501,
  chespin: 650, fennekin: 653, froakie: 656,
  rowlet: 722, litten: 725, popplio: 728,
  grookey: 810, scorbunny: 813, sobble: 816,
  sprigatito: 906, fuecoco: 909, quaxly: 912,
  // Pool Gachapón y Favoritos PokéSurvivor
  pidgey: 16, fearow: 22, pikachu: 25, raichu: 26,
  psyduck: 54, slowpoke: 79, gengar: 94, eevee: 133,
  snorlax: 143, aerodactyl: 142, zapdos: 145, articuno: 144,
  moltres: 146, dragonite: 149, mewtwo: 150,
  houndoom: 229, lugia: 249, ho_oh: 250,
  gardevoir: 282, absol: 359, spheal: 363, glalie: 362,
  poochyena: 261, aggron: 306, flygon: 330,
  groudon: 383, kyogre: 382, rayquaza: 384,
  lucario: 448, garchomp: 445, greninja: 658,
  ceruledge: 937, tinkaton: 959,
};

export const ENEMY_SPECIES_DEX_IDS = {
  Caterpie: 10,
  Weedle: 13,
  Spinarak: 167,
  Hoothoot: 163,
  Poochyena: 261,
  Numel: 322,
  'Onix centinela': 95,
  'Ursaring centinela': 217,
  'Aggron centinela': 306,
  Mewtwo: 150,
  'Ho-Oh / Lugia': 250,
  Groudon: 383,
};

/**
 * Devuelve el Sprite 3D oficial estilo Pokémon GO / Pokémon HOME (512x512 renderizado en 3D con iluminación).
 */
export function getPokemonSpriteUrl(pokemonId, { shiny = false } = {}) {
  const key = String(pokemonId || '').toLowerCase();
  const dexNumber = POKEMON_DEX_IDS[key] ?? ENEMY_SPECIES_DEX_IDS[pokemonId] ?? 25;
  return shiny
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/shiny/${dexNumber}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${dexNumber}.png`;
}

/**
 * Devuelve el Sprite 3D de cualquier enemigo o jefe por nombre de especie para renderizarlo en Three.js.
 */
export function getEnemy3dSpriteUrl(speciesName) {
  const dexNumber = ENEMY_SPECIES_DEX_IDS[speciesName] ?? POKEMON_DEX_IDS[String(speciesName || '').toLowerCase()] ?? 10;
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home/${dexNumber}.png`;
}

/**
 * Devuelve la URL del modelo 3D .glb optimizado en Pokemon-3D-api si se desea carga GLTF directa.
 */
export function getPokemonGlbUrl(pokemonId, { shiny = false } = {}) {
  const key = String(pokemonId || '').toLowerCase();
  const dexNumber = POKEMON_DEX_IDS[key] ?? ENEMY_SPECIES_DEX_IDS[pokemonId] ?? 1;
  const folder = shiny ? 'shiny' : 'regular';
  return `https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/${folder}/${dexNumber}.glb`;
}

export function getPokemonGlbCandidateUrls(pokemonIdOrSpecies, { shiny = false } = {}) {
  const key = String(pokemonIdOrSpecies || '').toLowerCase();
  const dexNumber = POKEMON_DEX_IDS[key] ?? ENEMY_SPECIES_DEX_IDS[pokemonIdOrSpecies] ?? 1;
  const folder = shiny ? 'shiny' : 'regular';
  return [
    `https://raw.githubusercontent.com/Pokemon-3D-api/assets/main/models/opt/${folder}/${dexNumber}.glb`,
    `https://raw.githubusercontent.com/Sudhanshu-Ambastha/Pokemon-3D-api/main/models/opt/${folder}/${dexNumber}.glb`,
    `https://raw.githubusercontent.com/Sudhanshu-Ambastha/Pokemon-3D/main/models/glb/${folder}/${dexNumber}.glb`,
  ];
}

// 1. PASIVAS POR TIPO (SYNERGY SYSTEM)
export const TYPE_SYNERGIES = {
  Volador: {
    type: 'Volador',
    name: 'Corriente Ascendente',
    description: 'Permite planear (Glide) manteniendo Espacio tras un salto.',
    glideGravityScale: 0.28,
    glideMoveSpeedBonus: 0.15,
    legendaryPassive: {
      name: 'Vendaval Megabonk',
      description: 'Al aterrizar de un planeo o salto, genera un tornado físico que lanza y daña a la horda.',
      tornadoRadius: 4.5,
      tornadoDamage: 48,
      knockbackForce: 14,
    },
  },
  Eléctrico: {
    type: 'Eléctrico',
    name: 'Conductividad',
    description: 'Los ataques básicos rebotan automáticamente hacia enemigos cercanos.',
    bounceCount: 2,
    bounceRange: 5.0,
    bounceDamageDecay: 0.75,
    legendaryPassive: {
      name: 'Pararrayos en Cadena',
      description: 'Los enemigos golpeados actúan como pararrayos, encadenando arcos voltaicos entre toda la horda.',
      chainMaxTargets: 6,
      arcIntervalMs: 350,
      arcDamageRatio: 0.75,
    },
  },
  Hielo: {
    type: 'Hielo',
    name: 'Senda Gélida',
    description: 'Deja un rastro pasivo de escarcha que ralentiza un 35% a los enemigos.',
    trailSlowRatio: 0.35,
    trailDurationSec: 3.5,
    trailRadius: 2.2,
    legendaryPassive: {
      name: 'Cero Absoluto Explosivo',
      description: 'Congela por completo a los enemigos sobre el rastro y explotan en fragmentos al contacto.',
      freezeThresholdSec: 1.5,
      shatterRadius: 3.8,
      shatterDamage: 65,
    },
  },
  Siniestro: {
    type: 'Siniestro',
    name: 'Instinto Abisal',
    description: 'Aumenta la probabilidad de golpe crítico cuanta menos vida (PS) tengas.',
    baseCritChance: 0.08,
    maxMissingHpCritBonus: 0.52,
    critMultiplier: 2.0,
    legendaryPassive: {
      name: 'Eclipse de Calamidad',
      description: 'Los golpes críticos con menos del 50% de PS generan ondas oscuras y multiplican el daño ×2.6.',
      critMultiplier: 2.6,
      shockwaveRadius: 4.0,
    },
  },
};

export function calculateDarkTypeCritChance(currentHp, maxHp, isLegendary = false) {
  const synergy = TYPE_SYNERGIES.Siniestro;
  const safeMax = Math.max(1, maxHp);
  const missingRatio = Math.max(0, Math.min(1, 1 - currentHp / safeMax));
  const critChance = synergy.baseCritChance + missingRatio * synergy.maxMissingHpCritBonus;
  const critDamage = isLegendary ? synergy.legendaryPassive.critMultiplier : synergy.critMultiplier;
  return { critChance, critDamage };
}

// 2. SISTEMA DE OBJETOS EQUIPABLES DEL MUNDO POKÉMON
export const EQUIP_ITEMS = {
  restos: {
    id: 'restos',
    name: 'Restos',
    icon: '🍎',
    description: 'Robo de Vida (Lifesteal) del 4% del daño infligido por golpe.',
    lifestealRatio: 0.04,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.0,
    coinBonusMultiplier: 1.0,
    blocksStateMoves: false,
  },
  panuelo_eleccion: {
    id: 'panuelo_eleccion',
    name: 'Pañuelo Elección',
    icon: '🧣',
    description: '+35% Velocidad de ataque, -15% Velocidad de movimiento.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.35,
    moveSpeedMultiplier: 0.85,
    physicalDamageMultiplier: 1.0,
    coinBonusMultiplier: 1.0,
    blocksStateMoves: false,
  },
  cinta_elegida: {
    id: 'cinta_elegida',
    name: 'Cinta Elegida',
    icon: '🎗️',
    description: '+45% Daño físico, pero bloquea todos los Movimientos de Estado.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.45,
    coinBonusMultiplier: 1.0,
    blocksStateMoves: true,
  },
  vidasfera: {
    id: 'vidasfera',
    name: 'Vidasfera',
    icon: '🔮',
    description: '+30% Daño total y +10% Velocidad de ataque (clásico de PokéSurvivor).',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.1,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.3,
    coinBonusMultiplier: 1.0,
    blocksStateMoves: false,
  },
  moneda_amuleto: {
    id: 'moneda_amuleto',
    name: 'Moneda Amuleto',
    icon: '🪙',
    description: '+35% Pokémonedas obtenidas al derrotar enemigos y abrir cofres.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.05,
    physicalDamageMultiplier: 1.0,
    coinBonusMultiplier: 1.35,
    blocksStateMoves: false,
  },
};

export function getEquippedItemModifiers(itemId) {
  return EQUIP_ITEMS[itemId] ?? {
    id: 'none',
    name: 'Sin objeto',
    icon: '○',
    description: 'Sin modificadores de objeto.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.0,
    coinBonusMultiplier: 1.0,
    blocksStateMoves: false,
  };
}

// 2B. BOTÍN DE COFRES 3D EN EL MAPA (ESTILO MEGABONK + MUNDO POKÉMON)
export const CHEST_LOOT_TABLE = [
  { id: 'baya_zidra', name: 'Baya Zidra', icon: '🍊', kind: 'heal', healRatio: 0.45, coins: 12, description: 'Recupera un 45% de tus PS máximos al instante.' },
  { id: 'baya_ziuela', name: 'Baya Ziuela', icon: '🍏', kind: 'cleanse', invulnSec: 3.0, coins: 15, description: 'Reinicia enfriamientos y otorga 3s de escudo.' },
  { id: 'caramelo_raro', name: 'Caramelo Raro', icon: '🍬', kind: 'xp', xpBonus: 65, coins: 18, description: 'Otorga una gran inyección de XP inmediata.' },
  { id: 'pepita', name: 'Pepita de Oro', icon: '✨', kind: 'coins', coins: 45, description: '+45 Pokémonedas directas para tus mejoras.' },
];

// 3. HABILIDADES EN PARTIDA (PUNTERÍA, AUTOMÁTICAS Y ESTADO)
export const LEVEL_UP_SKILLS = {
  psicorrayo: {
    id: 'psicorrayo',
    name: 'Psicorrayo',
    category: 'aimed',
    type: 'Psíquico',
    maxLevel: 3,
    levels: {
      1: { beams: 1, pierce: false, damage: 28, cooldown: 0.75, description: 'Nivel 1: Rayo lineal hacia el clic del cursor.' },
      2: { beams: 2, spreadAngleDeg: 10, pierce: false, damage: 34, cooldown: 0.7, description: 'Nivel 2: Dispara dos rayos psíquicos en paralelo.' },
      3: { beams: 2, spreadAngleDeg: 8, pierce: true, damage: 44, cooldown: 0.6, description: 'Nivel Máx: Dos rayos hiper-intensos que atraviesan hordas enteras.' },
    },
  },
  aura_esfera: {
    id: 'aura_esfera',
    name: 'Pulso Elemental',
    category: 'auto',
    type: 'Agua',
    maxLevel: 3,
    levels: {
      1: { radius: 3.5, damage: 22, cooldown: 2.2, description: 'Nivel 1: Pulso automático alrededor del compañero.' },
      2: { radius: 4.5, damage: 30, cooldown: 1.9, description: 'Nivel 2: Mayor radio de impacto y menor enfriamiento.' },
      3: { radius: 5.8, damage: 42, cooldown: 1.5, knockback: 9, description: 'Nivel Máx: Onda expansiva con empuje físico 3D.' },
    },
  },
  danza_espada: {
    id: 'danza_espada',
    name: 'Danza Espada',
    category: 'state',
    type: 'Normal',
    maxLevel: 3,
    levels: {
      1: { damageMultiplier: 1.4, durationSec: 20, cooldownSec: 5, description: 'Potencia el daño un +40% durante 20s (5s de enfriamiento tras expirar).' },
      2: { damageMultiplier: 1.65, durationSec: 20, cooldownSec: 5, description: 'Potencia el daño un +65% durante 20s (5s de enfriamiento).' },
      3: { damageMultiplier: 2.0, durationSec: 20, cooldownSec: 5, description: 'Nivel Máx: Duplica el daño (+100%) durante 20s (5s de enfriamiento).' },
    },
  },
};

// 4. POOL AMPLIADO DE POKÉMON (9 REGIONES + FAVORITOS DE POKÉSURVIVOR)
export const GACHA_POOL = [
  // Comunes (60%)
  { id: 'pidgey', dex: 16, region: 'Kanto', name: 'Pidgey', rarity: 'common', rarityLabel: 'Común', types: ['Volador'], chassisType: 'Volador', isLegendary: false, color: '#c4b5ff', accent: '#ede6ff', shinyColor: '#ffd966' },
  { id: 'fearow', dex: 22, region: 'Kanto', name: 'Fearow', rarity: 'common', rarityLabel: 'Común', types: ['Volador'], chassisType: 'Volador', isLegendary: false, color: '#b5947b', accent: '#f0c987', shinyColor: '#a6e22e' },
  { id: 'pikachu', dex: 25, region: 'Kanto', name: 'Pikachu', rarity: 'common', rarityLabel: 'Común', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false, color: '#f7d02c', accent: '#fff4a3', shinyColor: '#ff9900' },
  { id: 'psyduck', dex: 54, region: 'Kanto', name: 'Psyduck', rarity: 'common', rarityLabel: 'Común', types: ['Agua', 'Psíquico'], chassisType: 'Psíquico', isLegendary: false, color: '#f9d769', accent: '#78c6e5', shinyColor: '#6fd3ff' },
  { id: 'slowpoke', dex: 79, region: 'Kanto', name: 'Slowpoke', rarity: 'common', rarityLabel: 'Común', types: ['Agua', 'Psíquico'], chassisType: 'Psíquico', isLegendary: false, color: '#f598b6', accent: '#ffe293', shinyColor: '#d094ff' },
  { id: 'eevee', dex: 133, region: 'Kanto', name: 'Eevee', rarity: 'common', rarityLabel: 'Común', types: ['Normal'], chassisType: 'Volador', isLegendary: false, color: '#c89b6e', accent: '#f5e4c3', shinyColor: '#e5e9f0' },
  { id: 'spheal', dex: 363, region: 'Hoenn', name: 'Spheal', rarity: 'common', rarityLabel: 'Común', types: ['Hielo', 'Agua'], chassisType: 'Hielo', isLegendary: false, color: '#8fdde7', accent: '#d8f8fc', shinyColor: '#d988ff' },
  { id: 'poochyena', dex: 261, region: 'Hoenn', name: 'Poochyena', rarity: 'common', rarityLabel: 'Común', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false, color: '#8a8f9e', accent: '#ff7b89', shinyColor: '#ffd27a' },

  // Raros (25%)
  { id: 'raichu', dex: 26, region: 'Kanto', name: 'Raichu', rarity: 'rare', rarityLabel: 'Raro', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false, color: '#f39c12', accent: '#fff08a', shinyColor: '#ff6b4a' },
  { id: 'gengar', dex: 94, region: 'Kanto', name: 'Gengar', rarity: 'rare', rarityLabel: 'Raro', types: ['Fantasma', 'Veneno'], chassisType: 'Siniestro', isLegendary: false, color: '#735797', accent: '#ff6b87', shinyColor: '#dcdde1' },
  { id: 'snorlax', dex: 143, region: 'Kanto', name: 'Snorlax', rarity: 'rare', rarityLabel: 'Raro', types: ['Normal'], chassisType: 'Hielo', isLegendary: false, color: '#486878', accent: '#f5e4c3', shinyColor: '#2e5cb8' },
  { id: 'houndoom', dex: 229, region: 'Johto', name: 'Houndoom', rarity: 'rare', rarityLabel: 'Raro', types: ['Siniestro', 'Fuego'], chassisType: 'Siniestro', isLegendary: false, color: '#5c4b51', accent: '#ff6b4a', shinyColor: '#4aa3ff' },
  { id: 'gardevoir', dex: 282, region: 'Hoenn', name: 'Gardevoir', rarity: 'rare', rarityLabel: 'Raro', types: ['Psíquico', 'Hada'], chassisType: 'Psíquico', isLegendary: false, color: '#7be39b', accent: '#ff8fa3', shinyColor: '#6fd3ff' },
  { id: 'glalie', dex: 362, region: 'Hoenn', name: 'Glalie', rarity: 'rare', rarityLabel: 'Raro', types: ['Hielo'], chassisType: 'Hielo', isLegendary: false, color: '#96d9d6', accent: '#c9ffff', shinyColor: '#ff5c77' },
  { id: 'scorbunny', dex: 813, region: 'Galar', name: 'Scorbunny', rarity: 'rare', rarityLabel: 'Raro', types: ['Fuego'], chassisType: 'Eléctrico', isLegendary: false, color: '#ff7a45', accent: '#ffe58f', shinyColor: '#ffd666' },
  { id: 'sprigatito', dex: 906, region: 'Paldea', name: 'Sprigatito', rarity: 'rare', rarityLabel: 'Raro', types: ['Planta'], chassisType: 'Volador', isLegendary: false, color: '#80d79c', accent: '#c5ee88', shinyColor: '#b388ff' },

  // Súper Raros / Épicos (10%)
  { id: 'aerodactyl', dex: 142, region: 'Kanto', name: 'Aerodactyl', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Volador', 'Roca'], chassisType: 'Volador', isLegendary: false, color: '#a98ff3', accent: '#e0d4fc', shinyColor: '#ff85d0' },
  { id: 'dragonite', dex: 149, region: 'Kanto', name: 'Dragonite', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Dragón', 'Volador'], chassisType: 'Volador', isLegendary: false, color: '#f5b041', accent: '#7de6e0', shinyColor: '#58d68d' },
  { id: 'absol', dex: 359, region: 'Hoenn', name: 'Absol', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false, color: '#d8dee9', accent: '#5e81ac', shinyColor: '#ff7a66' },
  { id: 'lucario', dex: 448, region: 'Sinnoh', name: 'Lucario', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Lucha', 'Acero'], chassisType: 'Eléctrico', isLegendary: false, color: '#4aa3ff', accent: '#ffd166', shinyColor: '#f7d02c' },
  { id: 'garchomp', dex: 445, region: 'Sinnoh', name: 'Garchomp', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Dragón', 'Tierra'], chassisType: 'Siniestro', isLegendary: false, color: '#546de5', accent: '#ff6b6b', shinyColor: '#303952' },
  { id: 'greninja', dex: 658, region: 'Kalos', name: 'Greninja', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Agua', 'Siniestro'], chassisType: 'Siniestro', isLegendary: false, color: '#3867d6', accent: '#ff8fa3', shinyColor: '#2f3542' },
  { id: 'ceruledge', dex: 937, region: 'Paldea', name: 'Ceruledge', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Fuego', 'Fantasma'], chassisType: 'Siniestro', isLegendary: false, color: '#6c5ce7', accent: '#ff7675', shinyColor: '#fdcb6e' },

  // Legendarios (5%) - Pasivas únicas y forma elemental perfecta
  { id: 'zapdos', dex: 145, region: 'Kanto', name: 'Zapdos', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Eléctrico', 'Volador'], chassisType: 'Eléctrico', isLegendary: true, color: '#ffd700', accent: '#fffacd', shinyColor: '#ffae00' },
  { id: 'articuno', dex: 144, region: 'Kanto', name: 'Articuno', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Hielo', 'Volador'], chassisType: 'Hielo', isLegendary: true, color: '#5bc0eb', accent: '#e0fbfc', shinyColor: '#b8e8fc' },
  { id: 'lugia', dex: 249, region: 'Johto', name: 'Lugia', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Volador', 'Psíquico'], chassisType: 'Volador', isLegendary: true, color: '#b8d4e3', accent: '#7de6e0', shinyColor: '#ff8fa3' },
  { id: 'rayquaza', dex: 384, region: 'Hoenn', name: 'Rayquaza', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Dragón', 'Volador'], chassisType: 'Volador', isLegendary: true, color: '#58d68d', accent: '#ffd166', shinyColor: '#2c3e50' },
  { id: 'mewtwo', dex: 150, region: 'Kanto', name: 'Mewtwo', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Psíquico'], chassisType: 'Psíquico', isLegendary: true, color: '#c9a3f7', accent: '#ff7be5', shinyColor: '#7be36b' },
];

export const GACHA_ARCHETYPE_MOVES = {
  Volador: {
    basic: {
      id: 'tornado-aire', name: 'Tornado Aéreo', type: 'Volador', slot: 'basic', shape: 'beam',
      power: 42, cooldown: 0.48, range: 8.5, width: 0.75, pierce: 2, knockback: 1.6,
      color: '#a98ff3', description: 'Ráfaga cortante que empuja a la horda.',
    },
    special: {
      id: 'vendaval', name: 'Vendaval', type: 'Volador', slot: 'special', shape: 'burst',
      power: 95, cooldown: 5.5, radius: 3.6, knockback: 3.2,
      color: '#7de6e0', description: 'Torbellino 3D que lanza por los aires a los enemigos cercanos.',
    },
  },
  Eléctrico: {
    basic: {
      id: 'impactrueno', name: 'Impactrueno', type: 'Eléctrico', slot: 'basic', shape: 'beam',
      power: 44, cooldown: 0.46, range: 9.2, width: 0.7, pierce: 2, knockback: 1.1,
      color: '#f7d02c', description: 'Descarga veloz que rebota hacia enemigos cercanos.',
    },
    special: {
      id: 'trueno', name: 'Trueno', type: 'Eléctrico', slot: 'special', shape: 'burst',
      power: 105, cooldown: 6.0, radius: 3.8, knockback: 2.6,
      color: '#ffe066', description: 'Tempestad eléctrica que electrocuta toda el área.',
    },
  },
  Hielo: {
    basic: {
      id: 'viento-hielo', name: 'Viento Hielo', type: 'Hielo', slot: 'basic', shape: 'cone',
      power: 42, cooldown: 0.54, range: 8.0, arc: 0.85, maxTargets: 5, knockback: 1.3,
      color: '#96d9d6', description: 'Abanico gélido que congela el avance enemigo.',
    },
    special: {
      id: 'ventisca', name: 'Ventisca', type: 'Hielo', slot: 'special', shape: 'burst',
      power: 100, cooldown: 6.2, radius: 4.0, knockback: 2.4,
      color: '#c9ffff', description: 'Tormenta polar que cristaliza todo a su alrededor.',
    },
  },
  Siniestro: {
    basic: {
      id: 'pulso-umbrio', name: 'Pulso Umbrío', type: 'Siniestro', slot: 'basic', shape: 'beam',
      power: 46, cooldown: 0.5, range: 8.8, width: 0.8, pierce: 2, knockback: 1.4,
      color: '#8a8f9e', description: 'Haz sombrío con alta letalidad crítica a baja vida.',
    },
    special: {
      id: 'juego-sucio', name: 'Estallido Nocturno', type: 'Siniestro', slot: 'special', shape: 'cone',
      power: 105, cooldown: 5.8, range: 8.5, arc: 0.9, maxTargets: 9, knockback: 2.5,
      color: '#ff6b87', description: 'Barrido abisal devastador frente al compañero.',
    },
  },
  Psíquico: {
    basic: {
      id: 'onda-psiquica', name: 'Psicoataque', type: 'Psíquico', slot: 'basic', shape: 'beam',
      power: 62, cooldown: 0.44, range: 11.2, width: 0.82, pierce: 3, knockback: 2.5, beams: 1,
      color: '#ff7be5', description: 'Haz mental perforante que evoluciona con el nivel.',
    },
    special: {
      id: 'onda-mental', name: 'Onda Mental', type: 'Psíquico', slot: 'special', shape: 'burst',
      power: 125, cooldown: 6.5, radius: 4.4, knockback: 3.6,
      color: '#c9a3f7', description: 'Explosión psíquica masiva estilo Mewtwo.',
    },
  },
};

export function getGachaPokemon(pokemonId) {
  return GACHA_POOL.find((p) => p.id === pokemonId) ?? null;
}

export function getGachaMoveset(pokemonId) {
  const entry = getGachaPokemon(pokemonId);
  if (!entry) return null;
  return GACHA_ARCHETYPE_MOVES[entry.chassisType] ?? GACHA_ARCHETYPE_MOVES.Volador;
}

export function selectRarityByRoll(randomValue = Math.random()) {
  const roll = randomValue * 100;
  if (roll < 5) return 'legendary';
  if (roll < 15) return 'super_rare';
  if (roll < 40) return 'rare';
  return 'common';
}

export function rollNormalGacha(randomFn = Math.random) {
  const rarity = selectRarityByRoll(randomFn());
  const candidates = GACHA_POOL.filter((p) => p.rarity === rarity);
  const pool = candidates.length > 0 ? candidates : GACHA_POOL;
  const index = Math.floor(randomFn() * pool.length);
  return { ...pool[index], rarity };
}

/**
 * Tirada múltiple ×10 estilo PokéSurvivor: garantiza al menos un Pokémon Súper Raro o Legendario.
 */
export function rollTenNormalGacha(randomFn = Math.random) {
  const results = [];
  for (let i = 0; i < 10; i += 1) {
    results.push(rollNormalGacha(randomFn));
  }
  const hasHighRarity = results.some((r) => r.rarity === 'super_rare' || r.rarity === 'legendary');
  if (!hasHighRarity) {
    const highPool = GACHA_POOL.filter((p) => p.rarity === 'super_rare' || p.rarity === 'legendary');
    const pick = highPool[Math.floor(randomFn() * highPool.length)];
    results[results.length - 1] = { ...pick };
  }
  return results;
}

export function rollShinyGacha(unlockedPokemonIds = [], randomFn = Math.random) {
  const unlockedSet = new Set(unlockedPokemonIds);
  const unlockedPool = GACHA_POOL.filter((p) => unlockedSet.has(p.id));
  if (unlockedPool.length === 0) return null;

  const rarity = selectRarityByRoll(randomFn());
  const byRarity = unlockedPool.filter((p) => p.rarity === rarity);
  const finalPool = byRarity.length > 0 ? byRarity : unlockedPool;
  const index = Math.floor(randomFn() * finalPool.length);
  return {
    ...finalPool[index],
    isShiny: true,
  };
}
