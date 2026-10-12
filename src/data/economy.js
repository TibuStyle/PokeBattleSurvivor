export const RARITY_RATES = [
  { id: 'common', label: 'Común', percent: 60, color: '#b8c3c1' },
  { id: 'rare', label: 'Raro', percent: 25, color: '#58c9dc' },
  { id: 'super-rare', label: 'Súper raro', percent: 10, color: '#bb87f2' },
  { id: 'legendary', label: 'Legendario', percent: 5, color: '#ffc66d' },
];

export const PERMANENT_UPGRADES = [
  {
    id: 'maxHealth',
    name: 'Reservas vitales',
    detail: '+5% de vida máxima por rango.',
    icon: '♥',
    baseCost: 30,
    maxLevel: 8,
  },
  {
    id: 'moveSpeed',
    name: 'Impulso',
    detail: '+3% de velocidad de movimiento por rango.',
    icon: '↗',
    baseCost: 35,
    maxLevel: 8,
  },
  {
    id: 'castSpeed',
    name: 'Ritmo de combate',
    detail: '−3% de enfriamiento por rango.',
    icon: 'ϟ',
    baseCost: 40,
    maxLevel: 8,
  },
  {
    id: 'pickupRange',
    name: 'Imán de experiencia',
    detail: '+8% de radio de recogida por rango.',
    icon: '⌖',
    baseCost: 30,
    maxLevel: 8,
  },
  {
    id: 'xpBonus',
    name: 'Estudio de campo',
    detail: '+2% de experiencia por rango.',
    icon: '✦',
    baseCost: 45,
    maxLevel: 8,
  },
];

export function getUpgradeCost(upgrade, currentLevel) {
  return Math.round(upgrade.baseCost * 1.45 ** currentLevel);
}
