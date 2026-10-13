import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS } from '../src/data/regions.js';
import { MOVES, STARTER_MOVESETS, getStarterMoveset } from '../src/data/moves.js';
import { TYPES } from '../src/data/typeChart.js';

test('v0.4 movimientos: los nueve iniciales tienen un ataque básico y un especial', () => {
  assert.equal(STARTERS.length, 9);
  for (const starter of STARTERS) {
    const moveset = getStarterMoveset(starter.id);
    assert.ok(moveset.basic, `${starter.name} necesita ataque básico`);
    assert.ok(moveset.special, `${starter.name} necesita especial`);
    assert.equal(moveset.basic.slot, 'basic');
    assert.equal(moveset.special.slot, 'special');
    assert.ok(STARTER_MOVESETS[starter.id], `${starter.name} debe estar en STARTER_MOVESETS`);
  }
});

test('v0.4 movimientos: Charmander usa Ascuas y Lanzallamas, nunca Psicorrayo', () => {
  const moveset = getStarterMoveset('charmander');
  assert.equal(moveset.basic.id, 'ascuas');
  assert.equal(moveset.basic.name, 'Ascuas');
  assert.equal(moveset.special.id, 'lanzallamas');
  assert.equal(moveset.special.name, 'Lanzallamas');
  for (const move of Object.values(moveset)) {
    assert.notEqual(move.id, 'psicorrayo');
  }
});

test('v0.4 movimientos: ningún inicial de v0.4 usa Psicorrayo', () => {
  for (const [starterId, ids] of Object.entries(STARTER_MOVESETS)) {
    assert.notEqual(ids.basic, 'psicorrayo', `${starterId} no debe usar Psicorrayo como básico`);
    assert.notEqual(ids.special, 'psicorrayo', `${starterId} no debe usar Psicorrayo como especial`);
  }
});

test('v0.4 movimientos: todos los tipos de movimiento existen en la tabla de tipos', () => {
  for (const move of Object.values(MOVES)) {
    assert.ok(TYPES.includes(move.type), `${move.name} usa un tipo válido (${move.type})`);
  }
});

test('v0.4 movimientos: cada inicial tiene al menos un movimiento del mismo tipo (STAB)', () => {
  for (const starter of STARTERS) {
    const { basic, special } = getStarterMoveset(starter.id);
    const hasStab = [basic, special].some((move) => starter.types.includes(move.type));
    assert.ok(hasStab, `${starter.name} necesita STAB en alguno de sus movimientos`);
  }
});

test('v0.4 movimientos: parámetros válidos según la forma del ataque', () => {
  for (const move of Object.values(MOVES)) {
    assert.ok(move.power > 0, `${move.name}: potencia positiva`);
    assert.ok(move.cooldown > 0, `${move.name}: enfriamiento positivo`);
    if (move.shape === 'beam') {
      assert.ok(move.range > 0 && move.width > 0 && move.pierce >= 1, `${move.name}: haz con alcance, ancho y perforación`);
    } else if (move.shape === 'cone') {
      assert.ok(move.range > 0 && move.arc > 0 && move.maxTargets >= 1, `${move.name}: abanico con alcance, arco y objetivos`);
    } else if (move.shape === 'burst') {
      assert.ok(move.radius > 0, `${move.name}: área con radio`);
    } else {
      assert.fail(`${move.name}: forma desconocida ${move.shape}`);
    }
  }
});

test('v0.4 movimientos: el básico se recarga más rápido que el especial', () => {
  for (const starter of STARTERS) {
    const { basic, special } = getStarterMoveset(starter.id);
    assert.ok(basic.cooldown < special.cooldown, `${starter.name}: básico < especial en enfriamiento`);
  }
});

test('v0.4 movimientos: un inicial desconocido usa el juego base sin romper la partida', () => {
  const moveset = getStarterMoveset('pikachu-no-existe');
  assert.equal(moveset.basic.id, 'latigazo');
  assert.equal(moveset.special.id, 'bomba-lodo');
});
