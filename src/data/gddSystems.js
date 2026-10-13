/**
 * src/data/gddSystems.js
 * Sistemas del GDD para PokeBattleSurvivor:
 * 1. Pasivas por Tipo y Excepciones Legendarias (Synergy System)
 * 2. Sistema de Objetos de Equipo (Restos, Pañuelo Elección, Cinta Elegida)
 * 3. Gachapón Normal (Tickets) y Gachapón Shiny (Gemas)
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
      chainMaxTargets: 8,
      arcIntervalMs: 350,
      arcDamageRatio: 0.55,
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
    maxMissingHpCritBonus: 0.52, // Hasta +52% prob. crítico con PS bajos
    critMultiplier: 2.0,
    legendaryPassive: {
      name: 'Eclipse de Calamidad',
      description: 'Los golpes críticos con menos del 50% de PS generan ondas oscuras y drenan velocidad enemiga.',
      critMultiplier: 2.6,
      shockwaveRadius: 4.0,
    },
  },
};

/**
 * Calcula la probabilidad de crítico dinámica para Pokémon de Tipo Siniestro.
 */
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
    category: 'aimed', // Disparo activo con clic del mouse hacia el cursor
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
    category: 'auto', // Se lanza sola con cooldown en área alrededor del Pokémon
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
    category: 'state', // Activable con tecla E / Clic Derecho (bloqueado si llevas Cinta Elegida)
    type: 'Normal',
    maxLevel: 3,
    levels: {
      1: { damageMultiplier: 1.4, durationSec: 20, cooldownSec: 5, description: 'Potencia el daño un +40% durante 20s (5s de enfriamiento tras expirar).' },
      2: { damageMultiplier: 1.65, durationSec: 20, cooldownSec: 5, description: 'Potencia el daño un +65% durante 20s (5s de enfriamiento).' },
      3: { damageMultiplier: 2.0, durationSec: 20, cooldownSec: 5, description: 'Nivel Máx: Duplica el daño (+100%) durante 20s (5s de enfriamiento).' },
    },
  },
};

// 4. SISTEMA DE GACHAPÓN NORMAL (TICKETS) Y SHINY (GEMAS)
export const GACHA_POOL = [
  // Comunes (60%) - Funcionan como Skins ligadas a su Tipología
  { id: 'pidgey', name: 'Pidgey', rarity: 'common', types: ['Volador'], chassisType: 'Volador', isLegendary: false },
  { id: 'fearow', name: 'Fearow', rarity: 'common', types: ['Volador'], chassisType: 'Volador', isLegendary: false },
  { id: 'pikachu', name: 'Pikachu', rarity: 'common', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false },
  { id: 'spheal', name: 'Spheal', rarity: 'common', types: ['Hielo', 'Agua'], chassisType: 'Hielo', isLegendary: false },
  { id: 'poochyena', name: 'Poochyena', rarity: 'common', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false },
  // Raros (25%)
  { id: 'raichu', name: 'Raichu', rarity: 'rare', types: ['Eléctrico'], chassisType: 'Eléctrico', isLegendary: false },
  { id: 'glalie', name: 'Glalie', rarity: 'rare', types: ['Hielo'], chassisType: 'Hielo', isLegendary: false },
  { id: 'houndoom', name: 'Houndoom', rarity: 'rare', types: ['Siniestro', 'Fuego'], chassisType: 'Siniestro', isLegendary: false },
  // Súper Raros (10%)
  { id: 'aerodactyl', name: 'Aerodactyl', rarity: 'super_rare', types: ['Volador', 'Roca'], chassisType: 'Volador', isLegendary: false },
  { id: 'absol', name: 'Absol', rarity: 'super_rare', types: ['Siniestro'], chassisType: 'Siniestro', isLegendary: false },
  // Legendarios (5%) - Pasivas únicas y forma elemental perfecta
  { id: 'zapdos', name: 'Zapdos', rarity: 'legendary', types: ['Eléctrico', 'Volador'], chassisType: 'Eléctrico', isLegendary: true },
  { id: 'articuno', name: 'Articuno', rarity: 'legendary', types: ['Hielo', 'Volador'], chassisType: 'Hielo', isLegendary: true },
  { id: 'lugia', name: 'Lugia', rarity: 'legendary', types: ['Volador', 'Psíquico'], chassisType: 'Volador', isLegendary: true },
  { id: 'mewtwo', name: 'Mewtwo', rarity: 'legendary', types: ['Psíquico'], chassisType: 'Psíquico', isLegendary: true },
];

export function selectRarityByRoll(randomValue = Math.random()) {
  const roll = randomValue * 100;
  if (roll < 5) return 'legendary';    // 5%
  if (roll < 15) return 'super_rare';  // 10% (5 a 15)
  if (roll < 40) return 'rare';        // 25% (15 a 40)
  return 'common';                     // 60% (40 a 100)
}

/**
 * Tirada de Gachapón Normal (consume 1 Ticket).
 */
export function rollNormalGacha(randomFn = Math.random) {
  const rarity = selectRarityByRoll(randomFn());
  const candidates = GACHA_POOL.filter((p) => p.rarity === rarity);
  const pool = candidates.length > 0 ? candidates : GACHA_POOL;
  const index = Math.floor(randomFn() * pool.length);
  return { ...pool[index], rarity };
}

/**
 * Tirada de Gachapón Shiny (consume Gemas).
 * Regla GDD: Solo otorga la Skin Shiny de Pokémon que YA tengas desbloqueados.
 */
export function rollShinyGacha(unlockedPokemonIds = [], randomFn = Math.random) {
  const unlockedSet = new Set(unlockedPokemonIds);
  const unlockedPool = GACHA_POOL.filter((p) => unlockedSet.has(p.id));

  if (unlockedPool.length === 0) {
    return null;
  }

  const rarity = selectRarityByRoll(randomFn());
  const byRarity = unlockedPool.filter((p) => p.rarity === rarity);
  const finalPool = byRarity.length > 0 ? byRarity : unlockedPool;
  const index = Math.floor(randomFn() * finalPool.length);
  return {
    ...finalPool[index],
    isShiny: true,
  };
}
