export const REGIONS = [
  {
    id: 'kanto',
    name: 'Kanto',
    generation: 1,
    mapName: 'Bosque Verde',
    boss: 'Mewtwo',
    enemies: ['Caterpie', 'Weedle'],
    nextRegionId: 'johto',
    unlockHint: 'Vence al jefe de Kanto',
    palette: ['#a6ec76', '#4f9d67', '#e3c779'],
    starters: [
      { id: 'bulbasaur', name: 'Bulbasaur', types: ['Planta', 'Veneno'], color: '#80d79c', accent: '#c5ee88' },
      { id: 'charmander', name: 'Charmander', types: ['Fuego'], color: '#f48a55', accent: '#ffd27a' },
      { id: 'squirtle', name: 'Squirtle', types: ['Agua'], color: '#78c6e5', accent: '#c3f0ee' },
    ],
  },
  {
    id: 'johto',
    name: 'Johto',
    generation: 2,
    mapName: 'Bosque Encinar',
    boss: 'Ho-Oh / Lugia',
    enemies: ['Spinarak', 'Hoothoot'],
    nextRegionId: 'hoenn',
    unlockHint: 'Vence al jefe de Johto',
    palette: ['#94d5aa', '#497d62', '#d8bc76'],
    starters: [
      { id: 'chikorita', name: 'Chikorita', types: ['Planta'], color: '#b5d96b', accent: '#e5f29f' },
      { id: 'cyndaquil', name: 'Cyndaquil', types: ['Fuego'], color: '#f28b4e', accent: '#ffcd68' },
      { id: 'totodile', name: 'Totodile', types: ['Agua'], color: '#55b8d7', accent: '#b0e8ef' },
    ],
  },
  {
    id: 'hoenn',
    name: 'Hoenn',
    generation: 3,
    mapName: 'Monte Cenizo',
    boss: 'Groudon',
    enemies: ['Poochyena', 'Numel'],
    nextRegionId: null,
    unlockHint: 'Vence al jefe de Hoenn',
    palette: ['#e7a56f', '#895a43', '#f2cf9d'],
    starters: [
      { id: 'treecko', name: 'Treecko', types: ['Planta'], color: '#68c47b', accent: '#b8ed91' },
      { id: 'torchic', name: 'Torchic', types: ['Fuego'], color: '#f4a84e', accent: '#ffe293' },
      { id: 'mudkip', name: 'Mudkip', types: ['Agua'], color: '#78b5e9', accent: '#c9e9fb' },
    ],
  },
];

export const STARTERS = REGIONS.flatMap((region) =>
  region.starters.map((starter) => ({
    ...starter,
    regionId: region.id,
    regionName: region.name,
  })),
);

export function getRegion(regionId) {
  return REGIONS.find((region) => region.id === regionId) ?? null;
}

export function getStarter(regionId, starterId) {
  return getRegion(regionId)?.starters.find((starter) => starter.id === starterId) ?? null;
}
