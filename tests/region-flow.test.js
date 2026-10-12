import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionFlow } from '../src/flow/RegionFlow.js';
import { ProfileStore, PROFILE_STORAGE_KEY } from '../src/flow/ProfileStore.js';

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function createFlow(storage = createStorage()) {
  const store = new ProfileStore(storage);
  return { flow: new RegionFlow(store), storage };
}

test('una cuenta nueva empieza en Kanto y debe elegir su inicial antes de entrar', () => {
  const { flow } = createFlow();

  assert.equal(flow.screen, 'hub');
  assert.equal(flow.isRegionUnlocked('kanto'), true);
  assert.equal(flow.isRegionUnlocked('johto'), false);
  assert.equal(flow.selectRegion('kanto'), true);
  assert.equal(flow.screen, 'starter-select');
  assert.equal(flow.enterRun(), null);
  assert.equal(flow.screen, 'starter-select');
});

test('el inicial gratuito se elige una vez y queda asociado a la región', () => {
  const { flow } = createFlow();
  flow.selectRegion('kanto');

  assert.equal(flow.chooseStarter('charmander'), true);
  assert.equal(flow.screen, 'region');
  assert.equal(flow.chooseStarter('squirtle'), false);
  assert.equal(flow.profile.regions.kanto.starterId, 'charmander');
  assert.equal(flow.isPokemonUnlocked('charmander'), true);
});

test('entrar a partida entrega una configuración aislada para el motor 3D', () => {
  const { flow } = createFlow();
  flow.selectRegion('kanto');
  flow.chooseStarter('squirtle');

  const run = flow.enterRun();
  assert.equal(flow.screen, 'run');
  assert.equal(run.regionId, 'kanto');
  assert.equal(run.mapName, 'Bosque Verde');
  assert.equal(run.starter.id, 'squirtle');
  assert.equal(run.palette.length, 3);
  assert.ok(run.upgrades);
  assert.notEqual(run.starter.types, flow.selectedRegion.starters[2].types);
});

test('ganar al jefe paga recursos, marca la región y desbloquea Johto', () => {
  const { flow } = createFlow();
  flow.selectRegion('kanto');
  flow.chooseStarter('bulbasaur');
  flow.enterRun();

  const summary = flow.completeRun({
    victory: true,
    elapsedSeconds: 721,
    rewards: { coins: 100, tickets: 2, gems: 1 },
  });

  assert.equal(summary.unlockedRegionId, 'johto');
  assert.equal(flow.isRegionUnlocked('johto'), true);
  assert.equal(flow.profile.regions.kanto.cleared, true);
  assert.equal(flow.profile.regions.kanto.bestTime, 721);
  assert.deepEqual(flow.profile.resources, { coins: 100, tickets: 2, gems: 1 });
  assert.equal(flow.completeRun({ victory: true }), null);
});

test('las mejoras consumen monedas y el progreso sobrevive al recargar', () => {
  const storage = createStorage();
  const { flow } = createFlow(storage);
  flow.selectRegion('kanto');
  flow.chooseStarter('charmander');
  flow.enterRun();
  flow.completeRun({ rewards: { coins: 100 } });

  const purchase = flow.purchaseUpgrade('maxHealth');
  assert.deepEqual(purchase, { ok: true, level: 1, cost: 30 });
  assert.equal(flow.profile.resources.coins, 70);

  const reloaded = new RegionFlow(new ProfileStore(storage));
  assert.equal(reloaded.profile.regions.kanto.starterId, 'charmander');
  assert.equal(reloaded.profile.upgrades.maxHealth, 1);
  assert.equal(reloaded.profile.resources.coins, 70);
  assert.equal(reloaded.purchaseUpgrade('not-a-real-upgrade').ok, false);
});
