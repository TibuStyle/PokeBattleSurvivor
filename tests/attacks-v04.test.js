import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunSession } from '../src/game/RunSession.js';
import { STARTERS } from '../src/data/regions.js';

/**
 * Pruebas de la v0.4: movimientos propios, STAB, efectividad, formas de ataque y
 * especial con la tecla Q con enfriamiento visible.
 */

const DOWN = { x: 0, z: -1 };

function fixedRandom(sequence = [0.1, 0.7, 0.4, 0.9]) {
  let idx = 0;
  return () => {
    const value = sequence[idx % sequence.length];
    idx += 1;
    return value;
  };
}

function starter(id) {
  const found = STARTERS.find((entry) => entry.id === id);
  assert.ok(found, `el inicial ${id} debe existir`);
  return { ...found, types: [...found.types] };
}

function createSession(starterId, options = {}) {
  return new RunSession(
    {
      regionId: 'kanto',
      regionName: 'Kanto',
      boss: 'Mewtwo',
      enemies: ['Caterpie', 'Weedle'],
      starter: starter(starterId),
      upgrades: {},
    },
    {
      random: fixedRandom(),
      bossSpawnSeconds: 2000,
      miniBossSpawnSeconds: 2000,
      initialEnemies: 0,
      worldLimit: 52,
      spawnInitialWave: false,
      maxActiveEnemies: options.maxActiveEnemies ?? 30,
    },
  );
}

function unlockSpecial(session) {
  session.gainXp(session.xpToNext);
  assert.equal(session.status, 'level-up');
  assert.ok(session.pendingChoices.some((choice) => choice.id === 'unlockSpecial'));
  assert.equal(session.chooseUpgrade('unlockSpecial').ok, true);
  return session;
}

describe('v0.4 ataques: Charmander usa Ascuas y Lanzallamas tras desbloquear el especial', () => {
  it('ningún golpe ni haz de Charmander procede de Psicorrayo', () => {
    const session = unlockSpecial(createSession('charmander'));
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -4, hp: 999 });
    session.spawnEnemy({ species: 'Weedle', x: 1, z: -5, hp: 999 });
    const moveIds = new Set();
    let pressed = true;
    for (let frame = 0; frame < 60 * 12; frame += 1) {
      const events = session.update(1 / 60, { aimDirection: DOWN, specialPressed: pressed });
      pressed = false;
      for (const beam of events.beams) moveIds.add(beam.moveId);
      for (const attack of events.attacks) moveIds.add(attack.moveId);
    }
    assert.ok(moveIds.size > 0, 'debe haber habido ataques');
    for (const id of moveIds) {
      assert.ok(['ascuas', 'lanzallamas'].includes(id), `movimiento inesperado: ${id}`);
    }
  });

  it('el HUD muestra Ascuas como básico y Lanzallamas como especial', () => {
    const hud = createSession('charmander').getHudSnapshot();
    assert.equal(hud.basicAttack.name, 'Ascuas');
    assert.equal(hud.specialAttack.name, 'Lanzallamas');
    assert.equal(hud.basicAttack.stab, true, 'Ascuas es de tipo Fuego, igual que Charmander');
    assert.equal(hud.specialAttack.stab, true);
    assert.equal(hud.specialAttack.unlocked, false, 'el especial empieza bloqueado');
    assert.equal(hud.dashUnlocked, false, 'la esquiva empieza bloqueada');
  });
});

describe('v0.4 daño: STAB y efectividad', () => {
  it('Ascuas contra Caterpie (Bicho) hace 60 de daño: STAB ×1,5 y súper eficaz ×2', () => {
    const session = createSession('charmander');
    const enemy = session.spawnEnemy({ species: 'Caterpie', x: 0, z: -5, hp: 999 });
    const result = session.fireAttack('basic', DOWN, { force: true });
    assert.equal(result.fired, true);
    assert.equal(result.hits.length, 1);
    const [hit] = result.hits;
    assert.equal(hit.damage, 60);
    assert.equal(hit.effectiveness, 2);
    assert.equal(hit.stab, true);
    assert.equal(enemy.hp, 999 - 60);
  });

  it('Picotazo (Volador) de Torchic no tiene STAB y hace 35 contra Caterpie', () => {
    const session = createSession('torchic');
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -4, hp: 999 });
    const result = session.fireAttack('basic', DOWN, { force: true });
    const [hit] = result.hits;
    assert.equal(hit.stab, false, 'Volador no coincide con el tipo Fuego de Torchic');
    assert.equal(hit.effectiveness, 2);
    assert.equal(hit.damage, 35);
  });

  it('Bomba Lodo de Bulbasaur usa STAB (Veneno) contra Caterpie (Bicho) y hace 68', () => {
    const session = unlockSpecial(createSession('bulbasaur'));
    session.spawnEnemy({ species: 'Caterpie', x: 1.5, z: 0, hp: 999 });
    const result = session.fireAttack('special', DOWN, { force: true });
    const [hit] = result.hits;
    assert.equal(hit.stab, true);
    assert.equal(hit.effectiveness, 1);
    assert.equal(hit.damage, 68); // round(45 × 1,5)
  });

  it('un enemigo inmune no recibe daño ni bloquea el ataque', () => {
    // Disparo Lodo (Tierra) no afecta a Hoothoot (Normal/Volador)
    const session = createSession('mudkip');
    const hoothoot = session.spawnEnemy({ species: 'Hoothoot', x: 0, z: -4, hp: 52 });
    const result = session.fireAttack('basic', DOWN, { force: true });
    assert.equal(result.fired, true);
    assert.equal(result.hits.length, 0);
    assert.equal(hoothoot.hp, 52);
  });
});

describe('v0.4 formas de ataque', () => {
  it('Lanzallamas es un abanico: alcanza a los enemigos delante y no a los de atrás', () => {
    const session = unlockSpecial(createSession('charmander'));
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -2, hp: 999 });
    session.spawnEnemy({ species: 'Caterpie', x: 0.5, z: -3, hp: 999 });
    session.spawnEnemy({ species: 'Caterpie', x: -0.5, z: -4, hp: 999 });
    const behind = session.spawnEnemy({ species: 'Caterpie', x: 0, z: 2, hp: 999 });
    const result = session.fireAttack('special', DOWN, { force: true });
    assert.equal(result.shape, 'cone');
    assert.equal(result.hits.length, 3);
    assert.equal(behind.hp, 999);
    for (const hit of result.hits) {
      assert.equal(hit.damage, 135, 'Lanzallamas: round(45 × 1,5 × 2)');
    }
  });

  it('Bomba Lodo es un área alrededor del jugador: alcanza el radio y no lo que queda fuera', () => {
    const session = unlockSpecial(createSession('bulbasaur'));
    const near = session.spawnEnemy({ species: 'Caterpie', x: 1.5, z: 0, hp: 999 });
    const far = session.spawnEnemy({ species: 'Caterpie', x: 0, z: -6, hp: 999 });
    const result = session.fireAttack('special', DOWN, { force: true });
    assert.equal(result.shape, 'burst');
    assert.equal(result.area.radius, 3.2);
    assert.equal(result.area.slot, 'special');
    assert.ok(result.hits.some((hit) => hit.enemyId === near.id));
    assert.ok(!result.hits.some((hit) => hit.enemyId === far.id));
    assert.equal(far.hp, 999);
  });
});

describe('v0.4 especial con Q y enfriamiento visible', () => {
  it('el especial se bloquea mientras se enfría y se reduce con el tiempo', () => {
    const session = unlockSpecial(createSession('charmander'));
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 999 });
    const first = session.castSpecial(DOWN);
    assert.equal(first.fired, true);
    const cooldown = session.cooldowns.special;
    assert.equal(cooldown, 5.5, 'Lanzallamas tiene enfriamiento de 5,5 s');

    const second = session.castSpecial(DOWN);
    assert.equal(second.fired, false);
    assert.equal(second.reason, 'cooldown');

    session.update(1, { aimDirection: DOWN });
    const hud = session.getHudSnapshot();
    assert.equal(hud.specialAttack.ready, false);
    assert.ok(Math.abs(hud.specialAttack.cooldownRemaining - (cooldown - 1)) < 0.05, 'el enfriamiento baja cada segundo');

    session.update(cooldown, { aimDirection: DOWN });
    assert.equal(session.getHudSnapshot().specialAttack.ready, true);
    assert.equal(session.castSpecial(DOWN).fired, true, 'vuelve a lanzarse al terminar el enfriamiento');
  });

  it('pulsar Q (specialPressed) lanza el especial y rechaza una segunda pulsación con motivo', () => {
    const session = unlockSpecial(createSession('charmander'));
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 999 });
    const first = session.update(1 / 60, { aimDirection: DOWN, specialPressed: true });
    assert.ok(first.attacks.some((attack) => attack.slot === 'special'), 'la primera pulsación dispara el especial');
    const second = session.update(1 / 60, { aimDirection: DOWN, specialPressed: true });
    assert.equal(second.specialRejected?.reason, 'cooldown');
    assert.ok(second.specialRejected.remaining > 0);
  });

  it('el básico sigue siendo automático y no depende del enfriamiento del especial', () => {
    const session = unlockSpecial(createSession('charmander'));
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -4, hp: 999 });
    session.castSpecial(DOWN);
    const events = session.update(0.6, { aimDirection: DOWN });
    assert.ok(events.attacks.some((attack) => attack.slot === 'basic'), 'Ascuas se lanza solo');
  });
});

describe('v0.4 HUD de ataques', () => {
  it('registra el último golpe con eficacia y número de impactos', () => {
    const session = createSession('charmander');
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -5, hp: 999 });
    const before = session.getHudSnapshot().lastAttackSeq;
    session.fireAttack('basic', DOWN, { force: true });
    const hud = session.getHudSnapshot();
    assert.equal(hud.lastAttackSeq, before + 1);
    assert.equal(hud.lastAttack.effectiveness, 2);
    assert.equal(hud.lastAttack.stab, true);
    assert.equal(hud.lastAttack.hitCount, 1);
  });
});
