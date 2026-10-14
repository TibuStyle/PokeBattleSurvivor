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
  rollTenNormalGacha,
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

test('Pasiva Tipo Eléctrico rebota ataques básicos hacia enemigos cercanos', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      starter: { id: 'pikachu', name: 'Pikachu', types: ['Eléctrico'], color: '#f7d02c', accent: '#fff4a3' },
    },
    { spawnInitialWave: false }
  );
  session.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 200 });
  session.spawnEnemy({ species: 'Caterpie', x: 2.2, z: -3.2, hp: 200 });

  const attack = session.firePrimary({ x: 0, z: -1 }, { force: true });
  assert.equal(attack.fired, true);
  assert.ok(attack.hits.length >= 2, 'El ataque eléctrico debe rebotar al segundo enemigo cercano');
  assert.ok(attack.beams.some((b) => b.moveId === 'electric-chain'), 'Genera arco eléctrico de rebote');
});

test('Pasiva Tipo Hielo deja rastro de escarcha al moverse y ralentiza enemigos', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      starter: { id: 'spheal', name: 'Spheal', types: ['Hielo', 'Agua'], color: '#8fdde7', accent: '#d8f8fc' },
    },
    { spawnInitialWave: false }
  );
  session.update(0.4, { movement: { x: 0, z: -1 }, aimDirection: { x: 0, z: -1 } });
  assert.ok(session.frostNodes.length >= 1, 'Caminar con Tipo Hielo genera nodos de escarcha');
});

test('Jefe Regional genera patrones Bullet Hell 3D en el suelo esquivables saltando', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      starter: { id: 'charmander', name: 'Charmander', types: ['Fuego'], color: '#f38b52', accent: '#ffd166' },
    },
    { spawnInitialWave: false }
  );
  session.spawnBoss({ name: 'Mewtwo', x: 0, z: -10, hp: 500 });
  session.bossPatternTimer = 0.05;
  session.update(0.1, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
  assert.equal(session.bossTelegraphs.length, 1, 'El jefe crea un área de peligro Bullet Hell en el suelo');

  // Si el jugador salta por encima de 0.85m cuando detona, esquiva la onda expansiva
  const hpBefore = session.player.hp;
  session.update(1.4, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 }, height: 1.5 });
  assert.equal(session.player.hp, hpBefore, 'Saltar o planear en 3D esquiva la onda del jefe en el suelo');
});

test('Tirada Gacha ×10 estilo PokéSurvivor garantiza al menos un Súper Raro o Legendario', () => {
  // Forzar tiradas comunes (0.85 -> common) y verificar que el pity garantice al menos 1 épico/legendario
  const pulls = rollTenNormalGacha(() => 0.85);
  assert.equal(pulls.length, 10);
  assert.ok(pulls.some((p) => p.rarity === 'super_rare' || p.rarity === 'legendary'));
});

test('Cofres 3D estilo Megabonk entregan objetos Pokémon (Baya Zidra / Pepita) y Reroll cambia cartas', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      starter: { id: 'charmander', name: 'Charmander', types: ['Fuego'], color: '#f38b52', accent: '#ffd166' },
    },
    { spawnInitialWave: false }
  );
  session.player.hp = 40;
  const chest = session.spawnChest({ x: 0, z: 0 });
  chest.loot = { id: 'baya_zidra', name: 'Baya Zidra', icon: '🍊', kind: 'heal', healRatio: 0.45, coins: 12 };

  const events = session.update(0.1, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
  assert.equal(events.chestsOpened.length, 1, 'El cofre 3D se abre al pasar sobre él');
  assert.ok(session.player.hp > 40, 'La Baya Zidra del cofre cura PS inmediatamente');

  // Probar Reroll de cartas al subir de nivel
  session.gainXp(session.xpToNext);
  assert.equal(session.status, 'level-up');
  const reroll = session.rerollUpgradeChoices();
  assert.equal(reroll.ok, true);
  assert.equal(session.rerollsRemaining, 1);
});

test('Santuarios de Carga (Altares Teracristal) y Portal del Jefe funcionan como en Megabonk', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      starter: { id: 'bulbasaur', name: 'Bulbasaur', types: ['Planta', 'Veneno'], color: '#80d79c', accent: '#c5ee88' },
    },
    { spawnInitialWave: false }
  );

  // 1. Probar carga de Altar Teracristal (Charge Shrine)
  const shrine = session.spawnShrine({ x: 0, z: 0, reward: { id: 'tera_might', name: '+20% Daño', kind: 'damage', value: 0.2 } });
  const basePower = session.stats.moves.basic.power;
  const ev = session.update(2.4, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
  assert.equal(shrine.completed, true, 'El santuario se completa al permanecer en su radio');
  assert.equal(ev.shrinesCompleted.length, 1);
  assert.ok(session.stats.moves.basic.power > basePower, 'La bendición del santuario incrementa el daño');

  // 2. Probar activación del Portal del Jefe (Boss Portal)
  session.player.x = session.bossPortal.x;
  session.player.z = session.bossPortal.z;
  session.update(1.6, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
  assert.equal(session.bossPortal.activated, true, 'Acercarse al Portal del Jefe lo activa');
  assert.equal(session.bossSpawned, true, 'El Portal del Jefe invoca al Jefe Regional');
});
