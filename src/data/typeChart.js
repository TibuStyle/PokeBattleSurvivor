/**
 * Tabla de tipos (generaciones VI en adelante, 18 tipos) en español, como usa el resto del juego.
 * Solo se listan las relaciones distintas de 1: ataque → defensa → multiplicador.
 * Un ataque contra varios tipos multiplica cada efectividad (p. ej. Fuego vs Bicho/Acero = ×4).
 */
export const TYPES = [
  'Normal', 'Fuego', 'Agua', 'Planta', 'Eléctrico', 'Hielo', 'Lucha', 'Veneno', 'Tierra',
  'Volador', 'Psíquico', 'Bicho', 'Roca', 'Fantasma', 'Dragón', 'Siniestro', 'Acero', 'Hada',
];

const CHART = {
  Normal: { Roca: 0.5, Fantasma: 0, Acero: 0.5 },
  Fuego: { Fuego: 0.5, Agua: 0.5, Planta: 2, Hielo: 2, Bicho: 2, Roca: 0.5, Dragón: 0.5, Acero: 2 },
  Agua: { Fuego: 2, Agua: 0.5, Planta: 0.5, Tierra: 2, Roca: 2, Dragón: 0.5 },
  Planta: { Fuego: 0.5, Agua: 2, Planta: 0.5, Veneno: 0.5, Tierra: 2, Volador: 0.5, Bicho: 0.5, Roca: 2, Dragón: 0.5, Acero: 0.5 },
  Eléctrico: { Agua: 2, Eléctrico: 0.5, Planta: 0.5, Tierra: 0, Volador: 2, Dragón: 0.5 },
  Hielo: { Fuego: 0.5, Agua: 0.5, Planta: 2, Hielo: 0.5, Tierra: 2, Volador: 2, Dragón: 2, Acero: 0.5 },
  Lucha: { Normal: 2, Hielo: 2, Veneno: 0.5, Volador: 0.5, Psíquico: 0.5, Bicho: 0.5, Roca: 2, Fantasma: 0, Siniestro: 2, Acero: 2, Hada: 0.5 },
  Veneno: { Planta: 2, Veneno: 0.5, Tierra: 0.5, Roca: 0.5, Fantasma: 0.5, Acero: 0, Hada: 2 },
  Tierra: { Fuego: 2, Eléctrico: 2, Planta: 0.5, Veneno: 2, Volador: 0, Bicho: 0.5, Roca: 2, Acero: 2 },
  Volador: { Eléctrico: 0.5, Planta: 2, Lucha: 2, Bicho: 2, Roca: 0.5, Acero: 0.5 },
  Psíquico: { Lucha: 2, Veneno: 2, Psíquico: 0.5, Siniestro: 0, Acero: 0.5 },
  Bicho: { Fuego: 0.5, Planta: 2, Lucha: 0.5, Veneno: 0.5, Volador: 0.5, Psíquico: 2, Fantasma: 0.5, Siniestro: 2, Acero: 0.5, Hada: 0.5 },
  Roca: { Fuego: 2, Hielo: 2, Lucha: 0.5, Tierra: 0.5, Volador: 2, Bicho: 2, Acero: 0.5 },
  Fantasma: { Normal: 0, Psíquico: 2, Fantasma: 2, Siniestro: 0.5 },
  Dragón: { Dragón: 2, Acero: 0.5, Hada: 0 },
  Siniestro: { Lucha: 0.5, Psíquico: 2, Fantasma: 2, Siniestro: 0.5, Hada: 0.5 },
  Acero: { Fuego: 0.5, Agua: 0.5, Eléctrico: 0.5, Hielo: 2, Roca: 2, Acero: 0.5, Hada: 2 },
  Hada: { Fuego: 0.5, Lucha: 2, Veneno: 0.5, Dragón: 2, Siniestro: 2, Acero: 0.5 },
};

/** Color de cada tipo para chips, bordes y barras. */
export const TYPE_COLORS = {
  Normal: '#a8a77a',
  Fuego: '#ee8130',
  Agua: '#6390f0',
  Planta: '#7ac74c',
  Eléctrico: '#f7d02c',
  Hielo: '#96d9d6',
  Lucha: '#c22e28',
  Veneno: '#a33ea1',
  Tierra: '#e2bf65',
  Volador: '#a98ff3',
  Psíquico: '#f95587',
  Bicho: '#a6b91a',
  Roca: '#b6a136',
  Fantasma: '#735797',
  Dragón: '#6f35fc',
  Siniestro: '#705746',
  Acero: '#b7b7ce',
  Hada: '#d685ad',
};

/** Multiplicador de un ataque de `attackType` contra uno o varios tipos defensores. */
export function getTypeMultiplier(attackType, defenderTypes = []) {
  const row = CHART[attackType];
  if (!row) return 1;
  return defenderTypes.reduce((multiplier, defender) => multiplier * (row[defender] ?? 1), 1);
}

/** Tipos defensores contra los que `attackType` es súper eficaz (×2 o más). */
export function getSuperEffectiveTargets(attackType) {
  const row = CHART[attackType] ?? {};
  return Object.keys(row).filter((defender) => row[defender] > 1);
}

/** Etiqueta legible para la eficacia de un golpe, usada en el HUD y en la Pokédex. */
export function describeEffectiveness(multiplier) {
  if (multiplier === 0) return 'Sin efecto';
  if (multiplier > 1) return 'Muy eficaz';
  if (multiplier < 1) return 'Poco eficaz';
  return 'Eficacia normal';
}

export function getTypeColor(type) {
  return TYPE_COLORS[type] ?? '#b8c3c1';
}
