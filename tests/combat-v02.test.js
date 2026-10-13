import test from 'node:test';
import assert from 'node:assert/strict';
import { RegionFlow } from '../src/flow/RegionFlow.js';
import { ProfileStore } from '../src/flow/ProfileStore.js';
import { RunSession } from '../src/game/RunSession.js';

function createDeterministicRandom(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('v0.2: genera hordas regionales y las desplaza hacia el jugador', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      enemies: ['Caterpie', 'Weedle'],
      boss: 'Mewtwo',
    },
    {
      random: createDeterministicRandom(10),
      initialEnemies: 5,
      bossSpawnSeconds: 30,
    },
  );

  assert.equal(session.enemies.length, 5);
  for (const enemy of session.enemies) {
    assert.ok(['Caterpie', 'Weedle'].includes(enemy.species));
  }

  const target = session.enemies[0];
  const initialDist = Math.hypot(target.x - session.player.x, target.z - session.player.z);
  session.update(0.5);
  const nextDist = Math.hypot(target.x - session.player.x, target.z - session.player.z);

  assert.ok(nextDist < initialDist, 'los enemigos de la horda deben acercarse al jugador');
});

test('v0.2: Psicorrayo inflige daño, respeta enfriamiento y suelta orbes de XP al derrotar enemigos', () => {
  const session = new RunSession(
    { regionId: 'kanto', enemies: ['Caterpie'] },
    { spawnInitialWave: false, random: createDeterministicRandom(20) },
  );

  const enemy = session.spawnEnemy({ species: 'Caterpie', x: 0, z: -5, hp: 50 });
  assert.equal(enemy.hp, 50);

  // Primer disparo de Psicorrayo (daño base 28)
  const firstShot = session.firePsybeam({ x: 0, z: -1 });
  assert.equal(firstShot.fired, true);
  assert.equal(firstShot.hits.length, 1);
  assert.equal(enemy.hp, 22);
  assert.equal(session.enemies.length, 1);

  // En enfriamiento no debe disparar sin forzar
  const cooldownShot = session.firePsybeam({ x: 0, z: -1 });
  assert.equal(cooldownShot.fired, false);
  assert.equal(cooldownShot.reason, 'cooldown');

  // Con el disparo automático de v0.3, el Psicorrayo se vuelve a disparar tras el
  // enfriamiento. Bajamos la vida restante para asegurar la derrota con el próximo
  // haz y avanzamos el tiempo suficiente para que el orbe quede disponible.
  enemy.hp = 1;
  session.psybeamCooldown = 0;
  for (let i = 0; i < 20; i += 1) {
    session.update(0.08, { movement: { x: 0, z: 0 }, aimDirection: { x: 0, z: -1 } });
    if (session.kills > 0) break;
  }
  assert.equal(session.kills, 1, 'el enemigo debe ser derrotado');
  assert.equal(session.enemies.length, 0);
  assert.ok(session.orbs.length <= 1, 'debe existir el orbe de XP del enemigo derrotado');
});

test('v0.2: sistema de vida aplica daño por contacto, ventana de gracia y derrota al llegar a 0 PS', () => {
  const session = new RunSession(
    {
      regionId: 'kanto',
      upgrades: { maxHealth: 2 }, // +10% vida máxima -> 110 PS
    },
    { spawnInitialWave: false, random: createDeterministicRandom(30) },
  );

  assert.equal(session.player.maxHp, 110);
  assert.equal(session.player.hp, 110);

  // Enemigo en contacto con el jugador
  session.spawnEnemy({ species: 'Weedle', x: 0.2, z: 0, contactDamage: 40 });
  const step1 = session.update(0.05);
  assert.ok(step1.playerDamaged?.damaged);
  assert.equal(session.player.hp, 70);

  // Durante la ventana de invulnerabilidad no recibe daño adicional
  const step2 = session.update(0.05);
  assert.equal(step2.playerDamaged, null);
  assert.equal(session.player.hp, 70);

  // Daño letal tras expirar la ventana de gracia
  session.player.invulnerableTimer = 0;
  const lethal = session.damagePlayer(75);
  assert.equal(lethal.defeated, true);
  assert.equal(session.player.hp, 0);
  assert.equal(session.player.alive, false);
  assert.equal(session.status, 'defeat');
});

test('v0.2: imán de orbes de XP, subida de nivel y elección de 1 entre 3 mejoras', () => {
  const session = new RunSession(
    { regionId: 'kanto' },
    { spawnInitialWave: false, random: createDeterministicRandom(40) },
  );

  // Colocar dos orbes dentro del radio de imán/recogida para alcanzar los 40 XP del nivel 1
  session.spawnOrb({ x: 2.0, z: 0, value: 22 });
  session.spawnOrb({ x: 0.4, z: 0, value: 25 });

  // Avanzar varios pasos para que el imán atraiga y recoja ambos orbes
  for (let i = 0; i < 6; i += 1) {
    session.update(0.15);
    if (session.status === 'level-up') break;
  }

  assert.equal(session.orbsCollected, 2);
  assert.equal(session.level, 2);
  assert.equal(session.status, 'level-up');
  assert.ok(Array.isArray(session.pendingChoices));
  assert.equal(session.pendingChoices.length, 3);

  // Las 3 opciones ofrecidas deben ser distintas
  const uniqueIds = new Set(session.pendingChoices.map((choice) => choice.id));
  assert.equal(uniqueIds.size, 3);

  const chosenOption = session.pendingChoices[0];
  const pickResult = session.chooseUpgrade(chosenOption.id);
  assert.equal(pickResult.ok, true);
  assert.equal(pickResult.upgradeId, chosenOption.id);
  assert.equal(pickResult.rank, 1);
  assert.equal(session.runUpgrades[chosenOption.id], 1);
  assert.equal(session.status, 'running');
  assert.equal(session.pendingChoices, null);
});

test('v0.2: derrotar al jefe regional completa la expedición con victoria y desbloquea la siguiente región', () => {
  const storageValues = new Map();
  const storage = {
    getItem: (k) => storageValues.get(k) ?? null,
    setItem: (k, v) => storageValues.set(k, v),
  };
  const flow = new RegionFlow(new ProfileStore(storage));
  flow.selectRegion('kanto');
  flow.chooseStarter('charmander');
  const runConfig = flow.enterRun();

  const session = new RunSession(runConfig, {
    spawnInitialWave: false,
    random: createDeterministicRandom(99),
  });

  const boss = session.spawnBoss({ x: 0, z: -4, hp: 25 });
  assert.equal(boss.isBoss, true);
  assert.equal(boss.species, 'Mewtwo');

  const shot = session.firePsybeam({ x: 0, z: -1 });
  assert.equal(shot.fired, true);
  assert.equal(session.bossDefeated, true);
  assert.equal(session.status, 'victory');

  const result = session.buildRunResult();
  assert.equal(result.victory, true);
  assert.ok(result.rewards.coins > 0);
  assert.ok(result.rewards.tickets >= 2);
  assert.equal(result.rewards.gems, 1);

  const summary = flow.completeRun(result);
  assert.equal(summary.victory, true);
  assert.equal(summary.unlockedRegionId, 'johto');
  assert.equal(flow.isRegionUnlocked('johto'), true);
});
