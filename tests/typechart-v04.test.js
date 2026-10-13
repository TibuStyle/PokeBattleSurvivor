import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TYPES,
  TYPE_COLORS,
  describeEffectiveness,
  getSuperEffectiveTargets,
  getTypeMultiplier,
} from '../src/data/typeChart.js';

test('v0.4 tabla de tipos: efectividades básicas', () => {
  assert.equal(getTypeMultiplier('Fuego', ['Planta']), 2);
  assert.equal(getTypeMultiplier('Agua', ['Fuego']), 2);
  assert.equal(getTypeMultiplier('Fuego', ['Agua']), 0.5);
  assert.equal(getTypeMultiplier('Eléctrico', ['Tierra']), 0, 'Eléctrico no afecta a Tierra');
  assert.equal(getTypeMultiplier('Normal', ['Fantasma']), 0, 'Normal no afecta a Fantasma');
  assert.equal(getTypeMultiplier('Normal', ['Normal']), 1, 'sin relación especial vale 1');
});

test('v0.4 tabla de tipos: los tipos defensores combinados multiplican sus efectividades', () => {
  assert.equal(getTypeMultiplier('Fuego', ['Bicho', 'Acero']), 4, 'Fuego contra Bicho/Acero es ×4');
  assert.equal(getTypeMultiplier('Fuego', ['Roca', 'Agua']), 0.25, 'Fuego contra Roca/Agua es ×0,25');
  assert.equal(getTypeMultiplier('Eléctrico', ['Agua', 'Volador']), 4);
  assert.equal(getTypeMultiplier('Tierra', ['Volador', 'Fuego']), 0, 'un tipo inmune anula el golpe');
});

test('v0.4 tabla de tipos: los tipos de ataque desconocidos no alteran el daño', () => {
  assert.equal(getTypeMultiplier('Desconocido', ['Fuego']), 1);
  assert.equal(getTypeMultiplier('Fuego', []), 1);
});

test('v0.4 tabla de tipos: lista de objetivos súper eficaces', () => {
  const targets = getSuperEffectiveTargets('Fuego');
  for (const type of ['Planta', 'Hielo', 'Bicho', 'Acero']) {
    assert.ok(targets.includes(type), `Fuego debe ser súper eficaz contra ${type}`);
  }
  assert.ok(!targets.includes('Agua'), 'Fuego no es súper eficaz contra Agua');
});

test('v0.4 tabla de tipos: etiquetas de eficacia', () => {
  assert.equal(describeEffectiveness(0), 'Sin efecto');
  assert.equal(describeEffectiveness(2), 'Muy eficaz');
  assert.equal(describeEffectiveness(0.5), 'Poco eficaz');
  assert.equal(describeEffectiveness(1), 'Eficacia normal');
});

test('v0.4 tabla de tipos: cada tipo tiene color y los nombres son coherentes', () => {
  assert.equal(TYPES.length, 18);
  for (const type of TYPES) {
    assert.match(TYPE_COLORS[type] ?? '', /^#[0-9a-f]{6}$/i, `${type} necesita color`);
  }
});
