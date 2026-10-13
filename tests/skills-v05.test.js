import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunSession } from '../src/game/RunSession.js';

const FORWARD = { x: 0, z: -1 };

function createSession() {
  return new RunSession(
    {
      regionId: 'kanto',
      boss: 'Mewtwo',
      enemies: ['Caterpie', 'Weedle'],
      starter: {
        id: 'charmander',
        name: 'Charmander',
        types: ['Fuego'],
        color: '#f38b52',
        accent: '#ffd166',
      },
      upgrades: {},
    },
    {
      random: () => 0.37,
      spawnInitialWave: false,
      initialEnemies: 0,
      bossSpawnSeconds: 2000,
      miniBossSpawnSeconds: 2000,
    },
  );
}

function beginLevelUp(session) {
  session.gainXp(session.xpToNext);
  assert.equal(session.status, 'level-up', 'ganar XP debe abrir la elección de nivel');
  assert.equal(session.pendingChoices.length, 3, 'cada subida conserva tres opciones');
  assert.equal(new Set(session.pendingChoices.map(({ id }) => id)).size, 3, 'las opciones no se repiten');
}

function chooseAvailableUpgrade(session, upgradeId) {
  const available = session.rollUpgradeChoices(99);
  const selected = available.find(({ id }) => id === upgradeId);
  assert.ok(selected, `${upgradeId} debe estar disponible en este estado de habilidad`);
  const alternatives = available.filter(({ id }) => id !== upgradeId).slice(0, 2);
  assert.equal(alternatives.length, 2, 'debe haber otras dos opciones distintas');
  session.pendingChoices = [selected, ...alternatives];
  session.pendingLevelUps = 1;
  session.status = 'level-up';
  const result = session.chooseUpgrade(upgradeId);
  assert.equal(result.ok, true, `${upgradeId} debe poder elegirse`);
  return result;
}

describe('v0.5 habilidades: desbloqueos por subida de nivel', () => {
  it('al comenzar solo está disponible el básico y Q/Shift no activan las habilidades bloqueadas', () => {
    const session = createSession();
    const before = { x: session.player.x, z: session.player.z };
    const hud = session.getHudSnapshot();

    assert.equal(hud.basicAttack.unlocked, true);
    assert.equal(hud.specialAttack.unlocked, false);
    assert.equal(hud.specialAttack.ready, false);
    assert.equal(hud.dashUnlocked, false);
    assert.equal(hud.dashReady, false);

    const special = session.castSpecial(FORWARD);
    assert.equal(special.fired, false);
    assert.equal(special.reason, 'locked');
    const forcedSpecial = session.fireAttack('special', FORWARD, { force: true });
    assert.equal(forcedSpecial.fired, false, 'force no debe saltarse un bloqueo de habilidad');
    assert.equal(forcedSpecial.reason, 'locked');

    const dash = session.dash({ x: 1, z: 0 });
    assert.deepEqual(dash, { ok: false, reason: 'locked' });
    assert.deepEqual({ x: session.player.x, z: session.player.z }, before, 'Shift bloqueado no mueve al jugador');

    const events = session.update(1 / 60, {
      movement: { x: 0, z: 0 },
      aimDirection: FORWARD,
      specialPressed: true,
      dashPressed: true,
    });
    assert.equal(events.specialRejected.reason, 'locked');
    assert.equal(events.dashRejected.reason, 'locked');
    assert.ok(!events.attacks.some((attack) => attack.slot === 'special'));
  });

  it('la primera subida ofrece Q y Shift como opciones dentro de tres elecciones únicas', () => {
    const session = createSession();
    beginLevelUp(session);
    const ids = session.pendingChoices.map(({ id }) => id);
    assert.ok(ids.includes('unlockSpecial'));
    assert.ok(ids.includes('unlockDash'));

    const unlocked = session.chooseUpgrade('unlockSpecial');
    assert.equal(unlocked.ok, true);
    assert.equal(session.unlockedSkills.special, true);
    assert.equal(session.unlockedSkills.dash, false, 'elegir Q no desbloquea Shift automáticamente');
    assert.equal(session.getHudSnapshot().specialAttack.unlocked, true);
    assert.equal(session.getHudSnapshot().dashUnlocked, false);
  });

  it('Q funciona solo después de elegir su desbloqueo; las mejoras especializadas esperan ese desbloqueo', () => {
    const session = createSession();
    const lockedOptions = session.rollUpgradeChoices(99).map(({ id }) => id);
    assert.ok(!lockedOptions.includes('specialPower'));
    assert.ok(!lockedOptions.includes('specialRange'));
    assert.ok(!lockedOptions.includes('specialCadence'));

    beginLevelUp(session);
    session.chooseUpgrade('unlockSpecial');
    const eligible = session.rollUpgradeChoices(99).map(({ id }) => id);
    assert.ok(eligible.includes('specialPower'));
    assert.ok(eligible.includes('specialRange'));
    assert.ok(eligible.includes('specialCadence'));

    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 1000 });
    assert.equal(session.castSpecial(FORWARD).fired, true);
  });
});

describe('v0.5 mejoras de habilidades', () => {
  it('el especial admite mejoras independientes de daño, alcance y enfriamiento', () => {
    const session = createSession();
    beginLevelUp(session);
    session.chooseUpgrade('unlockSpecial');
    session.spawnEnemy({ species: 'Caterpie', x: 0, z: -3, hp: 10000 });

    const firstHit = session.fireAttack('special', FORWARD, { force: true }).hits[0];
    const baseRange = session.stats.moves.special.range;
    const baseCooldown = session.stats.moves.special.cooldown;
    const basePower = session.stats.moves.special.power;
    assert.ok(firstHit, 'el movimiento especial debe golpear al objetivo delante');

    chooseAvailableUpgrade(session, 'specialPower');
    const strongerHit = session.fireAttack('special', FORWARD, { force: true }).hits[0];
    assert.ok(strongerHit.damage > firstHit.damage, 'Núcleo especial aumenta el daño real');
    assert.ok(session.stats.moves.special.power > basePower);

    chooseAvailableUpgrade(session, 'specialRange');
    assert.ok(session.stats.moves.special.range > baseRange, 'Alcance resonante aumenta el alcance');

    chooseAvailableUpgrade(session, 'specialCadence');
    assert.ok(session.stats.moves.special.cooldown < baseCooldown, 'Pulso especial reduce el enfriamiento');
    assert.ok(session.runUpgrades.specialPower === 1);
    assert.ok(session.runUpgrades.specialRange === 1);
    assert.ok(session.runUpgrades.specialCadence === 1);
  });

  it('Shift no tiene efecto hasta desbloquearse; después la mejora de movilidad amplía su alcance y reduce su enfriamiento', () => {
    const session = createSession();
    const unavailable = session.rollUpgradeChoices(99).map(({ id }) => id);
    assert.ok(!unavailable.includes('dashFlow'));
    assert.deepEqual(session.dash(FORWARD), { ok: false, reason: 'locked' });

    beginLevelUp(session);
    session.chooseUpgrade('unlockDash');
    assert.equal(session.unlockedSkills.dash, true);
    assert.equal(session.getHudSnapshot().dashUnlocked, true);
    const baseDistance = session.stats.dash.distance;
    const baseCooldown = session.stats.dash.cooldown;

    chooseAvailableUpgrade(session, 'dashFlow');
    assert.ok(session.stats.dash.distance > baseDistance);
    assert.ok(session.stats.dash.cooldown < baseCooldown);
    const dash = session.dash({ x: 1, z: 0 });
    assert.equal(dash.ok, true);
    assert.ok(dash.distance > baseDistance);
    assert.ok(session.player.invulnerableTimer > 0);
  });
});
