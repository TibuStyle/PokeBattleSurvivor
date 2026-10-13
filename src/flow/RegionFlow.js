import { getUpgradeCost, PERMANENT_UPGRADES } from '../data/economy.js';
import { getRegion, getStarter } from '../data/regions.js';
import { ProfileStore } from './ProfileStore.js';

/**
 * Orquesta el flujo entre mapa, elección gratuita del inicial y partida.
 * No conoce Three.js ni el DOM: por eso se puede probar por separado.
 */
export class RegionFlow {
  constructor(store = new ProfileStore()) {
    this.store = store;
    this.profile = store.load();
    this.selectedRegionId = this.profile.lastRegionId;
    this.screen = 'hub';
    this.activeRun = null;
    this.lastRunSummary = null;
  }

  get selectedRegion() {
    return getRegion(this.selectedRegionId);
  }

  get selectedProgress() {
    return this.profile.regions[this.selectedRegionId];
  }

  getRegionProgress(regionId) {
    return this.profile.regions[regionId] ?? null;
  }

  isRegionUnlocked(regionId) {
    return this.profile.regions[regionId]?.unlocked === true;
  }

  isPokemonUnlocked(pokemonId) {
    return this.profile.unlockedPokemon.includes(pokemonId);
  }

  selectRegion(regionId) {
    const region = getRegion(regionId);
    if (!region || !this.isRegionUnlocked(regionId)) return false;

    this.selectedRegionId = regionId;
    this.profile.lastRegionId = regionId;
    this.screen = this.profile.regions[regionId].starterId ? 'region' : 'starter-select';
    this.store.save(this.profile);
    return true;
  }

  chooseStarter(starterId) {
    if (this.screen !== 'starter-select') return false;

    const region = this.selectedRegion;
    const progress = this.selectedProgress;
    const starter = getStarter(region?.id, starterId);
    if (!starter || !progress || progress.starterId) return false;

    progress.starterId = starter.id;
    this.profile.unlockedPokemon = [...new Set([...this.profile.unlockedPokemon, starter.id])];
    this.screen = 'region';
    this.store.save(this.profile);
    return true;
  }

  enterRun() {
    const region = this.selectedRegion;
    const progress = this.selectedProgress;
    const starter = getStarter(region?.id, progress?.starterId);

    if (!region || !progress?.unlocked) return null;
    if (!starter) {
      this.screen = 'starter-select';
      return null;
    }

    this.activeRun = {
      regionId: region.id,
      regionName: region.name,
      mapName: region.mapName,
      boss: region.boss,
      enemies: [...region.enemies],
      palette: [...region.palette],
      starter: { ...starter, types: [...starter.types] },
      upgrades: { ...this.profile.upgrades },
      startedAt: Date.now(),
    };
    this.lastRunSummary = null;
    this.screen = 'run';
    return this.activeRun;
  }

  /**
   * Punto de integración para el futuro sistema de fin de partida/recompensas.
   * En una victoria, el jefe abre la siguiente región una sola vez.
   */
  completeRun({
    victory = false,
    elapsedSeconds = 0,
    rewards = {},
    kills = 0,
    level = 1,
    orbsCollected = 0,
    upgrades = {},
  } = {}) {
    if (this.screen !== 'run' || !this.activeRun) return null;

    const progress = this.profile.regions[this.activeRun.regionId];
    const elapsed = Number.isFinite(Number(elapsedSeconds)) ? Math.max(0, Math.floor(Number(elapsedSeconds))) : 0;
    const safeKills = Number.isFinite(Number(kills)) ? Math.max(0, Math.floor(Number(kills))) : 0;
    const safeLevel = Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : 1;
    const safeOrbs = Number.isFinite(Number(orbsCollected)) ? Math.max(0, Math.floor(Number(orbsCollected))) : 0;
    const awarded = {
      coins: this.#addReward('coins', rewards.coins),
      tickets: this.#addReward('tickets', rewards.tickets),
      gems: this.#addReward('gems', rewards.gems),
    };
    let unlockedRegionId = null;

    progress.bestTime = Math.max(progress.bestTime, elapsed);
    if (victory) {
      progress.cleared = true;
      const nextRegionId = getRegion(this.activeRun.regionId)?.nextRegionId;
      if (nextRegionId && !this.profile.regions[nextRegionId].unlocked) {
        this.profile.regions[nextRegionId].unlocked = true;
        unlockedRegionId = nextRegionId;
      }
    }

    this.lastRunSummary = {
      regionId: this.activeRun.regionId,
      victory,
      elapsedSeconds: elapsed,
      kills: safeKills,
      level: safeLevel,
      orbsCollected: safeOrbs,
      upgrades: upgrades && typeof upgrades === 'object' ? { ...upgrades } : {},
      rewards: awarded,
      unlockedRegionId,
    };
    this.activeRun = null;
    this.screen = 'results';
    this.store.save(this.profile);
    return this.lastRunSummary;
  }

  purchaseUpgrade(upgradeId) {
    const upgrade = PERMANENT_UPGRADES.find((entry) => entry.id === upgradeId);
    if (!upgrade) return { ok: false, reason: 'unknown-upgrade' };

    const level = this.profile.upgrades[upgradeId] ?? 0;
    if (level >= upgrade.maxLevel) return { ok: false, reason: 'max-level' };

    const cost = getUpgradeCost(upgrade, level);
    if (this.profile.resources.coins < cost) return { ok: false, reason: 'not-enough-coins', cost };

    this.profile.resources.coins -= cost;
    this.profile.upgrades[upgradeId] = level + 1;
    this.store.save(this.profile);
    return { ok: true, level: level + 1, cost };
  }

  returnToHub() {
    this.activeRun = null;
    this.screen = 'hub';
    this.store.save(this.profile);
  }

  #addReward(resourceId, amount) {
    const value = Number.isFinite(Number(amount)) ? Math.max(0, Math.floor(Number(amount))) : 0;
    this.profile.resources[resourceId] += value;
    return value;
  }
}
