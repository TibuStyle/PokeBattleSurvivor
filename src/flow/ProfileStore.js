import { PERMANENT_UPGRADES } from '../data/economy.js';
import { REGIONS, STARTERS, getStarter } from '../data/regions.js';

export const PROFILE_STORAGE_KEY = 'pokebattle-survivor.profile.v1';

const STARTER_IDS = new Set(STARTERS.map((starter) => starter.id));
const UPGRADE_IDS = new Set(PERMANENT_UPGRADES.map((upgrade) => upgrade.id));

function getBrowserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Algunos navegadores bloquean localStorage en pestañas privadas/orígenes opacos.
    return null;
  }
}

export function createDefaultProfile() {
  return {
    version: 1,
    resources: { coins: 0, tickets: 0, gems: 0 },
    unlockedPokemon: [],
    lastRegionId: 'kanto',
    regions: Object.fromEntries(
      REGIONS.map((region, index) => [
        region.id,
        {
          unlocked: index === 0,
          starterId: null,
          cleared: false,
          bestTime: 0,
        },
      ]),
    ),
    upgrades: Object.fromEntries(PERMANENT_UPGRADES.map(({ id }) => [id, 0])),
  };
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
}

export function normalizeProfile(saved) {
  const defaults = createDefaultProfile();
  const source = saved && typeof saved === 'object' ? saved : {};
  const regions = {};

  for (const [index, region] of REGIONS.entries()) {
    const previous = source.regions?.[region.id] ?? {};
    const starterId = getStarter(region.id, previous.starterId) ? previous.starterId : null;
    regions[region.id] = {
      unlocked: index === 0 || previous.unlocked === true,
      starterId,
      cleared: previous.cleared === true,
      bestTime: nonNegativeInteger(previous.bestTime),
    };
  }

  const unlockedPokemon = Array.isArray(source.unlockedPokemon)
    ? source.unlockedPokemon.filter((id) => STARTER_IDS.has(id))
    : [];

  for (const progress of Object.values(regions)) {
    if (progress.starterId) unlockedPokemon.push(progress.starterId);
  }

  const resources = source.resources ?? {};
  const savedUpgrades = source.upgrades ?? {};
  const upgrades = { ...defaults.upgrades };
  for (const id of UPGRADE_IDS) {
    upgrades[id] = nonNegativeInteger(savedUpgrades[id]);
  }

  const requestedLastRegion = REGIONS.some((region) => region.id === source.lastRegionId && regions[region.id].unlocked)
    ? source.lastRegionId
    : 'kanto';

  return {
    version: 1,
    resources: {
      coins: nonNegativeInteger(resources.coins),
      tickets: nonNegativeInteger(resources.tickets),
      gems: nonNegativeInteger(resources.gems),
    },
    unlockedPokemon: [...new Set(unlockedPokemon)],
    lastRegionId: requestedLastRegion,
    regions,
    upgrades,
  };
}

export class ProfileStore {
  constructor(storage = getBrowserStorage()) {
    this.storage = storage;
  }

  load() {
    if (!this.storage) return createDefaultProfile();

    try {
      const raw = this.storage.getItem(PROFILE_STORAGE_KEY);
      return raw ? normalizeProfile(JSON.parse(raw)) : createDefaultProfile();
    } catch {
      return createDefaultProfile();
    }
  }

  save(profile) {
    if (!this.storage) return false;

    try {
      this.storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfile(profile)));
      return true;
    } catch {
      // La sesión sigue funcionando aunque el navegador no permita guardar.
      return false;
    }
  }
}
