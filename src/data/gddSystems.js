/**
 * src/data/gddSystems.js
 * Sistemas del GDD para PokeBattleSurvivor:
 * 1. Pasivas por Tipo y Excepciones Legendarias (Synergy System)
 * 2. Sistema de Objetos de Equipo (Restos, Pañuelo Elección, Cinta Elegida)
 * 3. Gachapón Normal (Tickets) y Gachapón Shiny (Gemas) + Movimientos por Arquetipo
 * 4. Habilidades de Subida de Nivel (Puntería al Clic, Automáticas y Estado)
 */

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

// 2. SISTEMA DE OBJETOS DE EQUIPO (HELD ITEMS)
export const EQUIP_ITEMS = {
  restos: {
    id: 'restos',
    name: 'Restos',
    description: 'Robo de Vida (Lifesteal) del 4% del daño infligido por golpe.',
    lifestealRatio: 0.04,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.0,
    blocksStateMoves: false,
  },
  panuelo_eleccion: {
    id: 'panuelo_eleccion',
    name: 'Pañuelo Elección',
    description: '+35% Velocidad de ataque, -15% Velocidad de movimiento.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.35,
    moveSpeedMultiplier: 0.85,
    physicalDamageMultiplier: 1.0,
    blocksStateMoves: false,
  },
  cinta_elegida: {
    id: 'cinta_elegida',
    name: 'Cinta Elegida',
    description: '+45% Daño físico, pero bloquea todos los Movimientos de Estado.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.45,
    blocksStateMoves: true,
  },
};

export function getEquippedItemModifiers(itemId) {
  return EQUIP_ITEMS[itemId] ?? {
    id: 'none',
    name: 'Sin objeto',
    description: 'Sin modificadores de objeto.',
    lifestealRatio: 0,
    attackSpeedMultiplier: 1.0,
    moveSpeedMultiplier: 1.0,
    physicalDamageMultiplier: 1.0,
    blocksStateMoves: false,
  };
}

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

// 4. POOL DE GACHAPÓN (SKINS POR TIPO Y EXCEPCIONES LEGENDARIAS)
export const GACHA_POOL = [
  // Comunes (60%) - Skins ligadas a su Tipología
  { id: 'pidgey', name: 'Pidgey', rarity: 'common', rarityLabel: 'Común', types: ['Volador'], chassisType: 'Volador', isLegendary: false, color: '#c4b5ff', accent: '#ede6ff', shinyColor: '#ffd966' },
  { id: 'fearow', name: 'Fearow', rarity: 'common', rarityLabel: 'Común', types: ['Volador'], chassisType: 'Volador', isLegendary: false, color: '#b5947b', accent: '#f0c987', shinyColor: '#a6e22e' },
  { id: 'pikachu', name: 'Pikachu', rarity: 'common', rarityLabel: 'Común', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false, color: '#f7d02c', accent: '#fff4a3', shinyColor: '#ff9900' },
  { id: 'spheal', name: 'Spheal', rarity: 'common', rarityLabel: 'Común', types: ['Hielo', 'Agua'], chassisType: 'Hielo', isLegendary: false, color: '#8fdde7', accent: '#d8f8fc', shinyColor: '#d988ff' },
  { id: 'poochyena', name: 'Poochyena', rarity: 'common', rarityLabel: 'Común', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false, color: '#8a8f9e', accent: '#ff7b89', shinyColor: '#ffd27a' },
  // Raros (25%)
  { id: 'raichu', name: 'Raichu', rarity: 'rare', rarityLabel: 'Raro', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false, color: '#f39c12', accent: '#fff08a', shinyColor: '#ff6b4a' },
  { id: 'glalie', name: 'Glalie', rarity: 'rare', rarityLabel: 'Raro', types: ['Hielo'], chassisType: 'Hielo', isLegendary: false, color: '#96d9d6', accent: '#c9ffff', shinyColor: '#ff5c77' },
  { id: 'houndoom', name: 'Houndoom', rarity: 'rare', rarityLabel: 'Raro', types: ['Siniestro', 'Fuego'], chassisType: 'Siniestro', isLegendary: false, color: '#5c4b51', accent: '#ff6b4a', shinyColor: '#4aa3ff' },
  // Súper Raros (10%)
  { id: 'aerodactyl', name: 'Aerodactyl', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Volador', 'Roca'], chassisType: 'Volador', isLegendary: false, color: '#a98ff3', accent: '#e0d4fc', shinyColor: '#ff85d0' },
  { id: 'absol', name: 'Absol', rarity: 'super_rare', rarityLabel: 'Súper Raro', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false, color: '#d8dee9', accent: '#5e81ac', shinyColor: '#ff7a66' },
  // Legendarios (5%) - Pasivas únicas y forma elemental perfecta
  { id: 'zapdos', name: 'Zapdos', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Eléctrico', 'Volador'], chassisType: 'Eléctrico', isLegendary: true, color: '#ffd700', accent: '#fffacd', shinyColor: '#ffae00' },
  { id: 'articuno', name: 'Articuno', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Hielo', 'Volador'], chassisType: 'Hielo', isLegendary: true, color: '#5bc0eb', accent: '#e0fbfc', shinyColor: '#b8e8fc' },
  { id: 'lugia', name: 'Lugia', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Volador', 'Psíquico'], chassisType: 'Volador', isLegendary: true, color: '#b8d4e3', accent: '#7de6e0', shinyColor: '#ff8fa3' },
  { id: 'mewtwo', name: 'Mewtwo', rarity: 'legendary', rarityLabel: 'Legendario', types: ['Psíquico'], chassisType: 'Psíquico', isLegendary: true, color: '#c9a3f7', accent: '#ff7be5', shinyColor: '#7be36b' },
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
      id: 'psicorrayo', name: 'Psicorrayo', type: 'Psíquico', slot: 'basic', shape: 'beam',
      power: 65, cooldown: 0.42, range: 11.5, width: 0.82, pierce: 3, knockback: 2.5, beams: 1,
      color: '#ff7be5', description: 'Haz psíquico perforante que evoluciona con el nivel.',
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
