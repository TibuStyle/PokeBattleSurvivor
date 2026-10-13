import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunSession } from '../src/game/RunSession.js';
import { HORDE_CONFIG } from '../src/data/combat.js';

/**
 * Pruebas de la v0.3: élites, minijefe, dash, retirada táctica y disparo automático.
 * En v0.4 el disparo automático depende del movimiento básico del inicial (ver moves-v04).
 */

function fixedRandom(sequence) {
  let idx = 0;
  return () => {
    const value = sequence[idx % sequence.length];
    idx += 1;
    return value;
  };
}

function createSession(options = {}) {
  return new RunSession(
    {
      regionId: 'kanto',
      regionName: 'Kanto',
      boss: 'Mewtwo',
      enemies: ['Caterpie', 'Weedle'],
      starter: { id: 'bulbasaur', name: 'Bulbasaur', types: ['Planta'], color: '#80d79c', accent: '#c5ee88' },
      upgrades: {},
    },
    {
      random: options.random ?? fixedRandom([0.1, 0.7, 0.4, 0.9]),
      bossSpawnSeconds: options.bossSpawnSeconds ?? 2000, // desactivado por defecto
      miniBossSpawnSeconds: options.miniBossSpawnSeconds ?? 60,
      initialEnemies: options.initialEnemies ?? 4,
      worldLimit: options.worldLimit ?? 52,
      spawnInitialWave: options.spawnInitialWave !== false,
    },
  );
}

function unlockDash(session) {
  session.gainXp(session.xpToNext);
  assert.equal(session.status, 'level-up');
  assert.ok(session.pendingChoices.some((choice) => choice.id === 'unlockDash'));
  assert.equal(session.chooseUpgrade('unlockDash').ok, true);
  return session;
}

describe('v0.3: élites con aura escalan y aparecen desde la oleada configurada', () => {
  it('marca enemigos como élite con aura cuando el dado cae por debajo del umbral', () => {
    // Aseguramos que la probabilidad siempre acierte (0 está por debajo del umbral de élite)
    const session = createSession({ random: fixedRandom([0, 0, 0, 0, 0]), spawnInitialWave: false });
    // Forzamos la oleada 3 para que el spawn pueda ser élite
    session.wave = HORDE_CONFIG.eliteStartWave;
    const elite = session.spawnEnemy({ distance: 10, angle: 0 });
    assert.equal(elite.isElite, true, 'el enemigo debería marcarse como élite');
    assert.ok(elite.aura, 'el élite debe tener aura');
    assert.ok(elite.hp > 60, 'el HP del élite debe amplificarse');
    assert.ok(elite.xpValue > 20, 'el XP del élite debe ser mayor');
  });

  it('los élites asesinados incrementan el contador y dan más XP', () => {
    const session = createSession({ spawnInitialWave: false, random: fixedRandom([0.3]) });
    const elite = session.spawnEnemy({ isElite: true, hp: 1, species: 'Caterpie', x: 0, z: -5 });
    const result = session.firePrimary({ x: 0, z: -1 }, { force: true });
    assert.ok(result.defeated.some((d) => d.isElite), 'la derrota debe marcarse como élite');
    assert.equal(session.eliteKills, 1);
  });
});

describe('v0.3: el minijefe aparece al cumplirse el hito y entrega bonificación', () => {
  it('aparece a los miniBossSpawnSeconds y no antes', () => {
    // Sin oleada inicial para que el fuego automático no pause el mundo por subida de nivel
    const session = createSession({
      miniBossSpawnSeconds: 2,
      initialEnemies: 0,
      spawnInitialWave: false,
    });
    for (let i = 0; i < 80; i += 1) session.update(0.05, { movement: { x: 0, z: 0 }, aimDirection: { x: 1, z: 0 } });
    assert.equal(session.miniBossSpawned, true, 'el minijefe debe haber aparecido');
    assert.ok(session.activeMiniBoss, 'el minijefe debe estar activo');
  });

  it('derrotar al minijefe suma bonificación de monedas y ticket', () => {
    const session = createSession({
      miniBossSpawnSeconds: 0.01,
      initialEnemies: 0,
      spawnInitialWave: false,
    });
    // Avanzamos lo suficiente para que aparezca el minijefe
    session.update(0.5, { movement: { x: 0, z: 0 }, aimDirection: { x: 1, z: 0 } });
    const miniBoss = session.activeMiniBoss;
    assert.ok(miniBoss, 'debe haber un minijefe activo');
    // Lo colocamos frente al jugador para rematarlo con fuego dirigido
    miniBoss.x = 0;
    miniBoss.z = -6;
    miniBoss.hp = 1;
    session.firePrimary({ x: 0, z: -1 }, { force: true });
    assert.equal(session.miniBossDefeated, true);
    assert.ok(session.bonusCoins > 0, 'debe haber bonificación de monedas');
    assert.ok(session.bonusTickets >= 1, 'debe haber al menos un ticket de bonificación');
  });
});

describe('v0.3: la esquiva (dash) otorga invulnerabilidad y respeta el enfriamiento', () => {
  it('el dash se resuelve con desplazamiento inmediato y no se puede encadenar', () => {
    const session = unlockDash(createSession({ spawnInitialWave: false }));
    const before = { x: session.player.x, z: session.player.z };
    const res = session.dash({ x: 1, z: 0 });
    assert.equal(res.ok, true);
    assert.ok(session.player.x > before.x, 'el jugador debe desplazarse hacia el dash');
    // Durante el dash debe ser invulnerable
    const dmg = session.damagePlayer(999);
    assert.equal(dmg.damaged, false, 'el jugador debe ser invulnerable durante el dash');
    const second = session.dash({ x: 1, z: 0 });
    assert.equal(second.ok, false, 'el segundo dash debe bloquearse por enfriamiento');
  });
});

describe('v0.3: la retirada táctica marca la partida como extraída con recompensa parcial', () => {
  it('extract() finaliza la partida sin victoria y reduce el pago por tiempo', () => {
    const session = createSession({ initialEnemies: 0, spawnInitialWave: false });
    session.update(10, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
    const beforeKills = session.kills;
    session.extract();
    assert.equal(session.status, 'extracted');
    const result = session.buildRunResult();
    assert.equal(result.extracted, true);
    assert.equal(result.victory, false);
    assert.equal(result.kills, beforeKills);
    assert.ok(result.rewards.coins >= 6, 'debe haber pago mínimo por retirada');
    assert.equal(result.rewards.gems, 0);
  });
});

describe('v0.3: el ataque básico se dispara automáticamente en cada tick cuando está listo', () => {
  it('fuego automático genera beams sin que el jugador haga input', () => {
    const session = createSession({ initialEnemies: 0, spawnInitialWave: false });
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -6, hp: 999 });
    const before = session.totalDamageDealt;
    session.update(0.5, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
    assert.ok(session.totalDamageDealt > before, 'el disparo automático debe infligir daño');
  });
});

describe('v0.3: la mejora Impulso Etéreo mejora la esquiva desbloqueada', () => {
  it('solo aparece tras desbloquear Shift y reduce enfriamiento/aumenta distancia', () => {
    const session = createSession({ spawnInitialWave: false, random: fixedRandom([0.1, 0.5, 0.9]) });
    assert.ok(!session.rollUpgradeChoices(3).some((choice) => choice.id === 'dashFlow'));
    unlockDash(session);

    let choices = [];
    for (let attempt = 0; attempt < 100 && !choices.some((choice) => choice.id === 'dashFlow'); attempt += 1) {
      choices = session.rollUpgradeChoices(3);
    }
    assert.ok(choices.some((choice) => choice.id === 'dashFlow'), 'el catálogo puede ofrecer la mejora de esquiva');
    session.pendingLevelUps = 1;
    session.pendingChoices = choices;
    session.status = 'level-up';
    assert.equal(session.chooseUpgrade('dashFlow').ok, true);
    assert.ok(session.stats.dash.cooldown < 2.4, 'el cooldown debe reducirse');
    assert.ok(session.stats.dash.distance > 4.2, 'la distancia debe aumentar');
  });
});
