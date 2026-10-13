import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MenuController } from '../src/menu/MenuController.js';
import { RegionFlow } from '../src/flow/RegionFlow.js';
import { ProfileStore } from '../src/flow/ProfileStore.js';
import { REGIONS, STARTERS } from '../src/data/regions.js';

/**
 * Pruebas de la v0.4 de interfaz: Pokédex con movimientos, cobertura y previsiones.
 * Se usa un contenedor mínimo porque MenuController solo escribe innerHTML y lee la clase.
 */

function fakeRoot() {
  return {
    innerHTML: '',
    classList: { toggle() {} },
    addEventListener() {},
    removeEventListener() {},
    querySelector() {
      return null;
    },
  };
}

function createFlow() {
  const storage = { getItem: () => null, setItem() {} };
  return new RegionFlow(new ProfileStore(storage));
}

function createMenu(flow = createFlow()) {
  const root = fakeRoot();
  const menu = new MenuController(root, flow);
  return { root, menu, flow };
}

describe('v0.4 Pokédex: movimientos solo para compañeros desbloqueados', () => {
  it('un compañero sin desbloquear no muestra sus movimientos', () => {
    const { menu } = createMenu();
    const region = REGIONS.find((entry) => entry.id === 'kanto');
    const bulbasaur = STARTERS.find((entry) => entry.id === 'bulbasaur');
    const html = menu.renderDexCard(bulbasaur, region);
    assert.ok(html.includes('Compañero sin registrar'));
    assert.ok(!html.includes('dex-move'), 'no debe mostrar movimientos bloqueados');
    assert.ok(!html.includes('Látigo Cepa'));
    assert.ok(!html.includes('Bomba Lodo'));
  });

  it('un compañero desbloqueado muestra básico, especial, eficacia y descripción', () => {
    const flow = createFlow();
    flow.profile.unlockedPokemon.push('charmander');
    const { menu } = createMenu(flow);
    const region = REGIONS.find((entry) => entry.id === 'kanto');
    const charmander = STARTERS.find((entry) => entry.id === 'charmander');
    const html = menu.renderDexCard(charmander, region);
    assert.ok(html.includes('is-unlocked'));
    assert.equal((html.match(/class="dex-move"/g) ?? []).length, 2, 'dos movimientos: básico y especial');
    assert.ok(html.includes('Ascuas'));
    assert.ok(html.includes('Lanzallamas'));
    assert.ok(html.includes('Automático'), 'el básico se marca como automático');
    assert.ok(html.includes('Q · Especial'), 'el especial indica la tecla Q');
    assert.ok(html.includes('dex-coverage'), 'muestra cobertura súper eficaz');
    assert.ok(html.includes('Planta'), 'Fuego es súper eficaz contra Planta');
  });

  it('la Pokédex completa nunca muestra Psicorrayo como movimiento de un inicial', () => {
    const flow = createFlow();
    for (const starter of STARTERS) flow.profile.unlockedPokemon.push(starter.id);
    const { menu, root } = createMenu(flow);
    menu.activeTab = 'pokedex';
    menu.render();
    assert.ok(root.innerHTML.includes('Lanzallamas'));
    assert.ok(!root.innerHTML.includes('Psicorrayo'));
    assert.ok(root.innerHTML.includes('dex-move'));
  });

  it('la cabecera de la Pokédex cuenta los registrados sobre el total', () => {
    const flow = createFlow();
    flow.profile.unlockedPokemon.push('charmander', 'squirtle');
    const { menu, root } = createMenu(flow);
    menu.activeTab = 'pokedex';
    menu.render();
    assert.ok(root.innerHTML.includes(`02 / ${String(STARTERS.length).padStart(2, '0')} REGISTRADOS`));
  });
});

describe('v0.4 interfaz: pantallas de elección y región', () => {
  it('la selección de inicial muestra los movimientos de cada compañero sin fallar', () => {
    const flow = createFlow();
    assert.equal(flow.selectRegion('kanto'), true);
    const { menu, root } = createMenu(flow);
    menu.render();
    assert.equal(flow.screen, 'starter-select');
    assert.ok(root.innerHTML.includes('starter-moves'), 'la tarjeta de inicial lista sus movimientos');
    assert.ok(root.innerHTML.includes('Ascuas'));
    assert.ok(!root.innerHTML.includes('Psicorrayo'));
  });

  it('la pantalla de región lista el inicial elegido y no falla', () => {
    const flow = createFlow();
    flow.selectRegion('kanto');
    flow.chooseStarter('charmander');
    const { menu, root } = createMenu(flow);
    menu.render();
    assert.equal(flow.screen, 'region');
    assert.ok(root.innerHTML.includes('Charmander'));
    assert.ok(root.innerHTML.includes('Lanzallamas'));
  });

  it('el hub muestra la versión 0.4 en el pie', () => {
    const { menu, root } = createMenu();
    menu.render();
    assert.ok(root.innerHTML.includes('PROTOTIPO 0.4'));
  });
});
