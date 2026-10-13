import { RunSession } from '../src/game/RunSession.js';
/**
 * tests/gdd-systems.test.js
 * Suite de pruebas unitarias para validar los sistemas del GDD 3D:
 * - Probabilidades del Gachapón Normal (60% Común, 25% Raro, 10% Súper Raro, 5% Legendario)
 * - Gachapón Shiny restringido exclusivamente a Pokémon ya desbloqueados
 * - Pasivas por Tipo (Volador, Eléctrico, Hielo, Siniestro)
 * - Objetos Equipables (Restos, Pañuelo Elección, Cinta Elegida bloquea Estado)
 * - Controles Híbridos (Puntería con cursor, salto/planeo con Espacio, bloqueo de Danza Espada con Cinta Elegida)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPE_SYNERGIES,
  EQUIP_ITEMS,
  LEVEL_UP_SKILLS,
  selectRarityByRoll,
  rollNormalGacha,
  rollShinyGacha,
  calculateDarkTypeCritChance,
  getEquippedItemModifiers,
} from '../src/data/gddSystems.js';
import { HybridControls } from '../src/game/HybridControls.js';

test('Gachapón respeta exactamente las probabilidades 60% / 25% / 10% / 5%', () => {
  assert.equal(selectRarityByRoll(0.02), 'legendary');   // < 5%
  assert.equal(selectRarityByRoll(0.10), 'super_rare');  // 5% - 15%
  assert.equal(selectRarityByRoll(0.25), 'rare');        // 15% - 40%
  assert.equal(selectRarityByRoll(0.75), 'common');      // 40% - 100%

  const pull = rollNormalGacha(() => 0.01);
  assert.equal(pull.rarity, 'legendary');
  assert.equal(pull.isLegendary, true);
});

test('Gachapón Shiny solo entrega skins Variocolor de Pokémon ya desbloqueados', () => {
  assert.equal(rollShinyGacha([]), null);

  const shiny = rollShinyGacha(['pikachu'], () => 0.5);
  assert.ok(shiny);
  assert.equal(shiny.id, 'pikachu');
  assert.equal(shiny.isShiny, true);
});

test('Pasiva de Tipo Siniestro incrementa el crítico cuanta menos vida tengas', () => {
  const fullHp = calculateDarkTypeCritChance(100, 100, false);
  const lowHp = calculateDarkTypeCritChance(10, 100, false);
  const legendaryLowHp = calculateDarkTypeCritChance(10, 100, true);

  assert.ok(lowHp.critChance > fullHp.critChance);
  assert.ok(legendaryLowHp.critDamage > lowHp.critDamage);
});

test('Objetos de Equipo aplican modificadores y Cinta Elegida bloquea Movimientos de Estado', () => {
  const restos = getEquippedItemModifiers('restos');
  const panuelo = getEquippedItemModifiers('panuelo_eleccion');
  const cinta = getEquippedItemModifiers('cinta_elegida');

  assert.ok(restos.lifestealRatio > 0);
  assert.ok(panuelo.attackSpeedMultiplier > 1 && panuelo.moveSpeedMultiplier < 1);
  assert.ok(cinta.physicalDamageMultiplier > 1 && cinta.blocksStateMoves === true);

  // Verificar que HybridControls bloquea la activación de habilidad de estado con Cinta Elegida
  const controls = new HybridControls({ enabled: false });
  controls.enabled = true;
  controls.setEquippedItemConstraints({ blocksStateMoves: true });
  controls.handleKeyDown({ code: 'KeyE' });
  assert.equal(controls.consumeStateSkill(), false);

  // Y la permite cuando no lleva Cinta Elegida
  controls.setEquippedItemConstraints({ blocksStateMoves: false });
  controls.handleKeyDown({ code: 'KeyE' });
  assert.equal(controls.consumeStateSkill(), true);
});

test('Habilidades de subida de nivel evolucionan Psicorrayo y Danza Espada según el GDD', () => {
  assert.equal(LEVEL_UP_SKILLS.psicorrayo.levels[1].beams, 1);
  assert.equal(LEVEL_UP_SKILLS.psicorrayo.levels[2].beams, 2);
  assert.equal(LEVEL_UP_SKILLS.psicorrayo.levels[3].pierce, true);
  assert.equal(LEVEL_UP_SKILLS.danza_espada.levels[1].durationSec, 20);
  assert.equal(LEVEL_UP_SKILLS.danza_espada.levels[1].cooldownSec, 5);
  assert.ok(TYPE_SYNERGIES.Volador.legendaryPassive.tornadoRadius > 0);
});

test('HybridControls expone todos los métodos requeridos por GameApp.js y calcula WASD correctamente', () => {
  const controls = new HybridControls({ enabled: false, cameraYaw: Math.PI });
  controls.enabled = true;

  controls.handleKeyDown({ code: 'KeyW' });
  const move = controls.getMovementVector(Math.PI);
  assert.ok(Math.abs(move.z - -1) < 1e-6, 'W con yaw=PI avanza hacia -Z');

  controls.handleKeyDown({ code: 'Space' });
  assert.equal(controls.isJumpHeld(), true);
  assert.equal(controls.consumeJumpRequest(), true);
  assert.equal(controls.consumeJumpRequest(), false);

  controls.clearKeys();
  assert.equal(controls.isJumpHeld(), false);
  controls.dispose();
});

test('RunSession aplica Restos (Lifesteal), Cinta Elegida (+Daño / Bloqueo Danza Espada) y Tornado Volador', () => {
  const sessionRestos = new RunSession(
    {
      regionId: 'kanto',
      equippedItemId: 'restos',
      starter: { id: 'charmander', name: 'Charmander', types: ['Fuego'], color: '#f38b52', accent: '#ffd166' },
    },
    { spawnInitialWave: false }
  );
  sessionRestos.player.hp = 50;
  sessionRestos.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 200 });
  sessionRestos.firePrimary({ x: 0, z: -1 }, { force: true });
  assert.ok(sessionRestos.player.hp > 50, 'Restos debe recuperar PS al golpear');

  const sessionCinta = new RunSession(
    {
      regionId: 'kanto',
      equippedItemId: 'cinta_elegida',
      starter: { id: 'torchic', name: 'Torchic', types: ['Fuego', 'Volador'], color: '#f4a84e', accent: '#ffe293' },
    },
    { spawnInitialWave: false }
  );
  const blockedState = sessionCinta.castStateSkill();
  assert.equal(blockedState.fired, false);
  assert.equal(blockedState.reason, 'blocked-by-choice-band');

  sessionCinta.spawnEnemy({ species: 'Caterpie', x: 1, z: 1, hp: 200 });
  const tornado = sessionCinta.triggerLandingTornado();
  assert.equal(tornado.triggered, true);
  assert.equal(tornado.hits.length, 1);
});
