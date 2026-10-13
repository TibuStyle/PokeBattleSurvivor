/**
 * Catálogo de movimientos de v0.4.
 *
 * Cada inicial tiene dos ataques:
 *  - `basic`: se dispara solo (ataque automático), con enfriamiento corto.
 *  - `special`: se lanza con la tecla Q, con enfriamiento largo visible en el HUD.
 *
 * Formas (`shape`):
 *  - `beam`:  haz recto que perfora `pierce` objetivos (haces adicionales con `beams`).
 *  - `cone`:  abanico frente al personaje (`arc` en radianes, hasta `maxTargets` objetivos).
 *  - `burst`: área alrededor del personaje (`radius`).
 *
 * El daño base sale de `power`; `DAMAGE_SCALE` lo convierte a la escala del prototipo.
 * La efectividad y el STAB se aplican en RunSession con data/typeChart.js.
 */

export const DAMAGE_SCALE = 0.5;
export const STAB_MULTIPLIER = 1.5;

export const MOVES = {
  // --- Ataques automáticos -------------------------------------------------
  latigazo: {
    id: 'latigazo', name: 'Látigo Cepa', type: 'Planta', slot: 'basic', shape: 'beam',
    power: 45, cooldown: 0.62, range: 7.5, width: 0.85, pierce: 2, knockback: 1.2,
    color: '#7be36b', description: 'Zarcillo que golpea en línea recta.',
  },
  ascuas: {
    id: 'ascuas', name: 'Ascuas', type: 'Fuego', slot: 'basic', shape: 'beam',
    power: 40, cooldown: 0.5, range: 9, width: 0.7, pierce: 2, knockback: 1.0,
    color: '#ff9a4d', description: 'Brasas lanzadas en línea; perforan dos enemigos.',
  },
  'pistola-agua': {
    id: 'pistola-agua', name: 'Pistola Agua', type: 'Agua', slot: 'basic', shape: 'beam',
    power: 40, cooldown: 0.5, range: 9.5, width: 0.6, pierce: 1, knockback: 1.6,
    color: '#6fd3ff', description: 'Chorro preciso con mucho empuje.',
  },
  'hoja-afilada': {
    id: 'hoja-afilada', name: 'Hoja Afilada', type: 'Planta', slot: 'basic', shape: 'cone',
    power: 45, cooldown: 0.6, range: 7.5, arc: 0.9, maxTargets: 4, knockback: 1.4,
    color: '#9bea7a', description: 'Hojas en abanico que alcanzan varios enemigos cercanos.',
  },
  picotazo: {
    id: 'picotazo', name: 'Picotazo', type: 'Volador', slot: 'basic', shape: 'beam',
    power: 35, cooldown: 0.45, range: 7.5, width: 0.6, pierce: 1, knockback: 1.2,
    color: '#c4b5ff', description: 'Golpe rápido de corto alcance.',
  },
  absorber: {
    id: 'absorber', name: 'Absorber', type: 'Planta', slot: 'basic', shape: 'beam',
    power: 22, cooldown: 0.32, range: 6.5, width: 0.7, pierce: 1, knockback: 0.6,
    color: '#8fe38a', description: 'Ráfagas muy rápidas de daño ligero.',
  },
  'disparo-lodo': {
    id: 'disparo-lodo', name: 'Disparo Lodo', type: 'Tierra', slot: 'basic', shape: 'beam',
    power: 40, cooldown: 0.5, range: 8.5, width: 0.6, pierce: 1, knockback: 1.4,
    color: '#e2bf65', description: 'Proyectil de lodo con retroceso.',
  },

  // --- Especiales (tecla Q) ------------------------------------------------
  lanzallamas: {
    id: 'lanzallamas', name: 'Lanzallamas', type: 'Fuego', slot: 'special', shape: 'cone',
    power: 90, cooldown: 5.5, range: 7.5, arc: 0.75, maxTargets: 8, knockback: 2.2,
    color: '#ff7a2f', description: 'Llamarada frontal de alto daño.',
  },
  'rayo-solar': {
    id: 'rayo-solar', name: 'Rayo Solar', type: 'Planta', slot: 'special', shape: 'beam',
    power: 120, cooldown: 8, range: 14, width: 1.3, pierce: 6, knockback: 3,
    color: '#d6f06b', description: 'Rayo largo que atraviesa toda la horda.',
  },
  'bomba-lodo': {
    id: 'bomba-lodo', name: 'Bomba Lodo', type: 'Veneno', slot: 'special', shape: 'burst',
    power: 90, cooldown: 6, radius: 3.2, knockback: 2.6,
    color: '#b25ccf', description: 'Explosión venenosa alrededor del compañero.',
  },
  'giro-fuego': {
    id: 'giro-fuego', name: 'Giro Fuego', type: 'Fuego', slot: 'special', shape: 'burst',
    power: 50, cooldown: 6.5, radius: 2.6, knockback: 1.8,
    color: '#ffb347', description: 'Anillo de fuego que rodea al compañero.',
  },
  hidrobomba: {
    id: 'hidrobomba', name: 'Hidrobomba', type: 'Agua', slot: 'special', shape: 'cone',
    power: 110, cooldown: 8, range: 9, arc: 0.55, maxTargets: 10, knockback: 2.5,
    color: '#4aa3ff', description: 'Chorro concentrado de gran potencia.',
  },
  cascada: {
    id: 'cascada', name: 'Cascada', type: 'Agua', slot: 'special', shape: 'beam',
    power: 80, cooldown: 5, range: 9, width: 1.2, pierce: 3, knockback: 3.5,
    color: '#58c4ff', description: 'Embestida de agua que empuja a la horda.',
  },
  megaagotar: {
    id: 'megaagotar', name: 'Megaagotar', type: 'Planta', slot: 'special', shape: 'beam',
    power: 70, cooldown: 5, range: 9, width: 0.9, pierce: 2, knockback: 1.6,
    color: '#6fdc8a', description: 'Drena energía de los enemigos alcanzados.',
  },
  'rueda-fuego': {
    id: 'rueda-fuego', name: 'Rueda Fuego', type: 'Fuego', slot: 'special', shape: 'burst',
    power: 60, cooldown: 4.5, radius: 3.0, knockback: 2.4,
    color: '#ff8c42', description: 'Onda ígnea que se expande desde el compañero.',
  },
  surf: {
    id: 'surf', name: 'Surf', type: 'Agua', slot: 'special', shape: 'cone',
    power: 90, cooldown: 6.5, range: 6.5, arc: 1.25, maxTargets: 10, knockback: 3,
    color: '#3fb6ff', description: 'Ola amplia que barre todo lo que tiene delante.',
  },

  // --- Reservado: no lo usa ningún inicial de v0.4 -------------------------
  // Se conserva para futuros compañeros psíquicos. Charmander nunca lo usa.
  psicorrayo: {
    id: 'psicorrayo', name: 'Psicorrayo', type: 'Psíquico', slot: 'basic', shape: 'beam',
    power: 65, cooldown: 0.42, range: 11.5, width: 0.78, pierce: 3, knockback: 2.5, beams: 1,
    color: '#ff7be5', description: 'Haz psíquico (reservado para compañeros psíquicos).',
  },
};

/**
 * Movimientos de cada inicial, por id de starter (regions.js).
 * Los nueve iniciales de Kanto, Johto y Hoenn están cubiertos.
 */
export const STARTER_MOVESETS = {
  bulbasaur: { basic: 'latigazo', special: 'bomba-lodo' },
  charmander: { basic: 'ascuas', special: 'lanzallamas' },
  squirtle: { basic: 'pistola-agua', special: 'hidrobomba' },
  chikorita: { basic: 'hoja-afilada', special: 'rayo-solar' },
  cyndaquil: { basic: 'ascuas', special: 'giro-fuego' },
  totodile: { basic: 'pistola-agua', special: 'cascada' },
  treecko: { basic: 'absorber', special: 'megaagotar' },
  torchic: { basic: 'picotazo', special: 'rueda-fuego' },
  mudkip: { basic: 'disparo-lodo', special: 'surf' },
};

export function getMove(moveId) {
  return MOVES[moveId] ?? null;
}

/** Devuelve { basic, special } con los objetos completos de movimiento. */
export function getStarterMoveset(starterId) {
  const ids = STARTER_MOVESETS[starterId] ?? STARTER_MOVESETS.bulbasaur;
  return { basic: MOVES[ids.basic], special: MOVES[ids.special] };
}
