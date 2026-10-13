import { TYPE_SYNERGIES, LEVEL_UP_SKILLS, CHEST_LOOT_TABLE, calculateDarkTypeCritChance, getEquippedItemModifiers, getGachaMoveset } from '../data/gddSystems.js';
import {
  BASE_PLAYER_STATS,
  HORDE_CONFIG,
  RUN_UPGRADES,
  getBossProfile,
  getEliteAura,
  getEnemyProfile,
  getMiniBossProfile,
  getXpForNextLevel,
} from '../data/combat.js';
import { DAMAGE_SCALE, STAB_MULTIPLIER, getStarterMoveset } from '../data/moves.js';
import { describeEffectiveness, getTypeMultiplier } from '../data/typeChart.js';
import { DEFAULT_AIM, normalizeDirection, resolveAttackShape } from './attacks.js';
import { forwardFromYaw, smoothYaw } from './cameraRig.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Simulación pura de una partida v0.4:
 * - Hordas por oleadas con enemigos élite y jefe regional
 * - Minijefe a los 4 minutos como hito intermedio
 * - Ataque básico automático (según el inicial) y especial con Q, ambos con enfriamiento
 * - Efectividad de tipos y STAB (×1,5 si el tipo del movimiento coincide con el del compañero)
 * - Formas de ataque: haz (perforación), abanico (cono) y área alrededor del compañero
 * - Sistema de vida (PS), daño por contacto y ventana de gracia
 * - Orbes de experiencia con imán y recogida
 * - Subida de nivel con elección de 1 entre 3 mejoras
 * - Esquiva/dash (Shift) con invulnerabilidad y enfriamiento
 * - Retirada táctica que conserva una fracción de recompensas
 *
 * No depende de Three.js ni del DOM para poder probarse en Node.
 */
export class RunSession {
  constructor(runConfig = {}, options = {}) {
    this.runConfig = {
      regionId: runConfig.regionId ?? 'kanto',
      regionName: runConfig.regionName ?? 'Kanto',
      mapName: runConfig.mapName ?? 'Bosque Verde',
      boss: runConfig.boss ?? 'Mewtwo',
      enemies: Array.isArray(runConfig.enemies) && runConfig.enemies.length > 0
        ? [...runConfig.enemies]
        : ['Caterpie', 'Weedle'],
      starter: runConfig.starter ?? { id: 'bulbasaur', name: 'Bulbasaur', types: ['Planta', 'Veneno'], color: '#80d79c', accent: '#c5ee88' },
      upgrades: { ...(runConfig.upgrades ?? {}) },
      equippedItemId: runConfig.equippedItemId ?? null,
    };
    this.equippedItem = getEquippedItemModifiers(this.runConfig.equippedItemId);
    this.runConfig.starter = {
      ...this.runConfig.starter,
      types: [...(this.runConfig.starter.types ?? [])],
    };

    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.worldLimit = Number.isFinite(options.worldLimit) ? options.worldLimit : 52;
    this.bossSpawnSeconds = Number.isFinite(options.bossSpawnSeconds)
      ? options.bossSpawnSeconds
      : HORDE_CONFIG.bossSpawnSeconds;
    this.miniBossSpawnSeconds = Number.isFinite(options.miniBossSpawnSeconds)
      ? options.miniBossSpawnSeconds
      : HORDE_CONFIG.miniBossSpawnSeconds;
    this.maxActiveEnemies = Number.isFinite(options.maxActiveEnemies)
      ? options.maxActiveEnemies
      : HORDE_CONFIG.maxActiveEnemies;

    // Movimientos del compañero: básico (automático) y especial (Q)
    this.moveset = getGachaMoveset(this.runConfig.starter.id) ?? getStarterMoveset(this.runConfig.starter.id);

    this.nextEntityId = 1;
    this.elapsedSeconds = 0;
    this.wave = 1;
    this.spawnTimer = 0.85;
    this.cooldowns = { basic: 0, special: 0, state: 0 };
    this.stateBuffTimer = 0;
    this.lastAttack = null;
    this.attackSeq = 0;

    this.runUpgrades = {};
    this.unlockedSkills = { special: false, dash: false };
    this.stats = this.computeStats();

    this.player = {
      x: 0,
      z: 0,
      height: 0,
      rotationY: Math.PI,
      rotationTargetY: Math.PI,
      hp: this.stats.maxHp,
      maxHp: this.stats.maxHp,
      radius: BASE_PLAYER_STATS.playerRadius,
      invulnerableTimer: 0,
      hitFlash: 0,
      alive: true,
      dashTimer: 0,
      dashCooldown: 0,
      dashDirX: 0,
      dashDirZ: 0,
      dashFlash: 0,
    };

    this.level = 1;
    this.xp = 0;
    this.xpToNext = getXpForNextLevel(1);
    this.kills = 0;
    this.eliteKills = 0;
    this.orbsCollected = 0;
    this.totalDamageDealt = 0;
    this.bonusCoins = 0;
    this.bonusTickets = 0;

    this.pendingLevelUps = 0;
    this.pendingChoices = null;

    this.enemies = [];
    this.orbs = [];
    this.frostNodes = [];
    this.frostSpawnTimer = 0;
    this.bossTelegraphs = [];
    this.bossPatternTimer = 2.8;
    this.chests = [];
    this.chestSpawnTimer = 6.0;
    this.lastChestLoot = null;
    this.rerollsRemaining = 2;
    this.miniBossSpawned = false;
    this.miniBossDefeated = false;
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.status = 'running'; // running | level-up | victory | defeat | extracted

    if (options.spawnInitialWave !== false) {
      const initialCount = Number.isFinite(options.initialEnemies)
        ? options.initialEnemies
        : HORDE_CONFIG.initialEnemies;
      this.spawnHordeWave(initialCount);
      this.spawnChest({ distance: 9.5 });
      this.spawnChest({ distance: 14.0 });
    }
  }

  computeStats() {
    const permanent = this.runConfig.upgrades ?? {};
    const inRun = this.runUpgrades ?? {};

    const permHealthRank = Math.max(0, Number(permanent.maxHealth) || 0);
    const permMoveRank = Math.max(0, Number(permanent.moveSpeed) || 0);
    const permCastRank = Math.max(0, Number(permanent.castSpeed) || 0);
    const permPickupRank = Math.max(0, Number(permanent.pickupRange) || 0);
    const permXpRank = Math.max(0, Number(permanent.xpBonus) || 0);

    const powerRank = inRun.attackPower ?? 0;
    const cadenceRank = inRun.attackCadence ?? 0;
    const prismRank = inRun.attackPrism ?? 0;
    const waveRank = inRun.attackWave ?? 0;
    const specialPowerRank = inRun.specialPower ?? 0;
    const specialRangeRank = inRun.specialRange ?? 0;
    const specialCadenceRank = inRun.specialCadence ?? 0;
    const vitalityRank = inRun.vitalityBoost ?? 0;
    const agileRank = inRun.agileStep ?? 0;
    const magnetRank = inRun.auraMagnet ?? 0;
    const dashRank = inRun.dashFlow ?? 0;

    const maxHp = Math.round(
      BASE_PLAYER_STATS.maxHp * (1 + permHealthRank * 0.05) + vitalityRank * 25,
    );
    const itemMods = getEquippedItemModifiers(this.runConfig.equippedItemId);
    const moveSpeed = BASE_PLAYER_STATS.moveSpeed
      * (1 + permMoveRank * 0.03)
      * (1 + agileRank * 0.12)
      * itemMods.moveSpeedMultiplier;
    const magnetRadius = BASE_PLAYER_STATS.magnetRadius
      * (1 + permPickupRank * 0.08)
      * (1 + magnetRank * 0.35);
    const pickupRadius = BASE_PLAYER_STATS.pickupRadius * (1 + magnetRank * 0.08);
    const xpMultiplier = (1 + permXpRank * 0.02) * (1 + magnetRank * 0.15);

    const cadenceFactor = Math.max(
      0.22,
      ((1 - permCastRank * 0.03) * Math.pow(0.85, cadenceRank)) / itemMods.attackSpeedMultiplier,
    );
    const specialCadenceFactor = Math.max(0.28, cadenceFactor * Math.pow(0.88, specialCadenceRank));
    const dashCooldown = BASE_PLAYER_STATS.dashCooldownSeconds * Math.pow(0.8, dashRank);
    const dashDistance = BASE_PLAYER_STATS.dashDistance * (1 + dashRank * 0.15);

    const stateDamageBonus = (this.stateBuffTimer ?? 0) > 0 ? LEVEL_UP_SKILLS.danza_espada.levels[1].damageMultiplier : 1;
    const itemPowerMult = itemMods.physicalDamageMultiplier * stateDamageBonus;
    const sharedModifiers = { powerRank, prismRank, waveRank, cadenceFactor, powerMultiplier: itemPowerMult };
    const specialModifiers = this.unlockedSkills.special
      ? {
          ...sharedModifiers,
          cadenceFactor: specialCadenceFactor,
          powerMultiplier: 1 + specialPowerRank * 0.25,
          rangeMultiplier: 1 + specialRangeRank * 0.15,
        }
      : {
          powerRank: 0,
          prismRank: 0,
          waveRank: 0,
          cadenceFactor: 1,
          powerMultiplier: 1,
          rangeMultiplier: 1,
        };

    return {
      maxHp,
      moveSpeed,
      magnetRadius,
      pickupRadius,
      xpMultiplier,
      dash: {
        distance: dashDistance,
        duration: BASE_PLAYER_STATS.dashDurationSeconds,
        cooldown: dashCooldown,
        invulnerability: BASE_PLAYER_STATS.dashInvulnerabilitySeconds,
      },
      moves: {
        basic: this.#deriveAttack(this.moveset.basic, sharedModifiers),
        special: this.#deriveAttack(this.moveset.special, specialModifiers),
      },
    };
  }

  #deriveAttack(move, {
    powerRank,
    prismRank,
    waveRank,
    cadenceFactor,
    powerMultiplier = 1,
    rangeMultiplier = 1,
  }) {
    return {
      id: move.id,
      power: move.power * DAMAGE_SCALE * (1 + powerRank * 0.25) * powerMultiplier,
      cooldown: Number((move.cooldown * cadenceFactor).toFixed(3)),
      range: Number(((move.range ?? 0) * (1 + prismRank * 0.12) * rangeMultiplier).toFixed(2)),
      width: Number(((move.width ?? 0.6) * (1 + waveRank * 0.25)).toFixed(2)),
      knockback: Number(((move.knockback ?? 1) * (1 + waveRank * 0.35)).toFixed(2)),
      pierce: (move.pierce ?? 1) + powerRank,
      beams: (move.beams ?? 1) + prismRank,
      spreadRadians: 0.18,
      arc: Number(((move.arc ?? 0.9) * (1 + prismRank * 0.08)).toFixed(3)),
      maxTargets: (move.maxTargets ?? 4) + powerRank,
      radius: Number(((move.radius ?? 2.5) * (1 + prismRank * 0.1) * rangeMultiplier).toFixed(2)),
    };
  }

  get isPausedForChoice() {
    return this.status === 'level-up';
  }

  get isFinished() {
    return this.status === 'victory' || this.status === 'defeat' || this.status === 'extracted';
  }

  get activeBoss() {
    return this.enemies.find((enemy) => enemy.isBoss) ?? null;
  }

  get activeMiniBoss() {
    return this.enemies.find((enemy) => enemy.isMiniBoss) ?? null;
  }

  spawnEnemy(overrides = {}) {
    const speciesList = this.runConfig.enemies;
    const species = overrides.species
      ?? speciesList[Math.floor(this.random() * speciesList.length)]
      ?? 'Caterpie';
    const profile = getEnemyProfile(species);

    const waveScale = 1 + Math.max(0, this.wave - 1) * 0.14;
    const speedScale = 1 + Math.min(0.45, Math.max(0, this.wave - 1) * 0.04);

    let x = overrides.x;
    let z = overrides.z;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      const angle = Number.isFinite(overrides.angle)
        ? overrides.angle
        : this.random() * Math.PI * 2;
      const radius = Number.isFinite(overrides.distance)
        ? overrides.distance
        : HORDE_CONFIG.spawnMinRadius
          + this.random() * (HORDE_CONFIG.spawnMaxRadius - HORDE_CONFIG.spawnMinRadius);
      x = clamp(this.player.x + Math.cos(angle) * radius, -this.worldLimit + 1, this.worldLimit - 1);
      z = clamp(this.player.z + Math.sin(angle) * radius, -this.worldLimit + 1, this.worldLimit - 1);
    }

    // Élites a partir de la oleada configurada
    const isElite = overrides.isElite === true
      || (overrides.isElite !== false
        && this.wave >= HORDE_CONFIG.eliteStartWave
        && this.random() < HORDE_CONFIG.eliteChancePerWave
        && !overrides.isBoss
        && !overrides.isMiniBoss);

    const aura = isElite ? getEliteAura(overrides.auraId) : null;
    const hpMult = aura?.hpMultiplier ?? 1;
    const spdMult = aura?.speedMultiplier ?? 1;
    const dmgMult = aura?.damageMultiplier ?? 1;
    const xpMult = aura?.xpMultiplier ?? 1;

    const maxHp = Math.max(1, Math.round((overrides.hp ?? profile.hp) * waveScale * hpMult));
    const enemy = {
      id: `enemy-${this.nextEntityId++}`,
      species: profile.name,
      types: [...(overrides.types ?? profile.types ?? [])],
      isElite: false,
      isMiniBoss: false,
      isBoss: false,
      aura: null,
      x,
      z,
      hp: maxHp,
      maxHp,
      speed: (overrides.speed ?? profile.speed) * speedScale * spdMult,
      contactDamage: Math.max(
        1,
        Math.round((overrides.contactDamage ?? profile.contactDamage) * (1 + (this.wave - 1) * 0.08) * dmgMult),
      ),
      xpValue: Math.round((overrides.xpValue ?? profile.xp) * xpMult),
      radius: overrides.radius ?? profile.radius,
      color: overrides.color ?? profile.color,
      accent: overrides.accent ?? profile.accent,
      shape: overrides.shape ?? profile.shape,
      hitFlash: 0,
      knockbackX: 0,
      knockbackZ: 0,
      rotationY: 0,
    };

    if (isElite && aura) {
      enemy.isElite = true;
      enemy.aura = { id: aura.id, name: aura.name, color: aura.color };
      enemy.radius = (enemy.radius ?? 0.5) * 1.18;
    }

    this.enemies.push(enemy);
    return enemy;
  }

  spawnMiniBoss(overrides = {}) {
    const profile = getMiniBossProfile(this.runConfig.regionId);
    const angle = Number.isFinite(overrides.angle) ? overrides.angle : this.random() * Math.PI * 2;
    const distance = Number.isFinite(overrides.distance) ? overrides.distance : 14;
    const x = Number.isFinite(overrides.x)
      ? overrides.x
      : clamp(this.player.x + Math.cos(angle) * distance, -this.worldLimit + 2, this.worldLimit - 2);
    const z = Number.isFinite(overrides.z)
      ? overrides.z
      : clamp(this.player.z + Math.sin(angle) * distance, -this.worldLimit + 2, this.worldLimit - 2);

    const maxHp = Math.max(1, Math.round(overrides.hp ?? profile.hp));
    const miniBoss = {
      id: `miniboss-${this.nextEntityId++}`,
      species: profile.name,
      types: [...(profile.types ?? [])],
      isElite: false,
      isMiniBoss: true,
      isBoss: false,
      aura: { id: 'sentinel', name: 'Centinela', color: profile.accent },
      x,
      z,
      hp: maxHp,
      maxHp,
      speed: overrides.speed ?? profile.speed,
      contactDamage: overrides.contactDamage ?? profile.contactDamage,
      xpValue: overrides.xpValue ?? profile.xp,
      radius: overrides.radius ?? profile.radius,
      color: overrides.color ?? profile.color,
      accent: overrides.accent ?? profile.accent,
      shape: 'miniboss',
      hitFlash: 0,
      knockbackX: 0,
      knockbackZ: 0,
      rotationY: 0,
      rewardCoins: profile.rewardCoins,
      rewardTickets: profile.rewardTickets,
    };

    this.miniBossSpawned = true;
    this.enemies.push(miniBoss);
    return miniBoss;
  }

  spawnBoss(overrides = {}) {
    const profile = getBossProfile(overrides.name ?? this.runConfig.boss);
    const angle = Number.isFinite(overrides.angle) ? overrides.angle : this.random() * Math.PI * 2;
    const distance = Number.isFinite(overrides.distance) ? overrides.distance : 15;
    const x = Number.isFinite(overrides.x)
      ? overrides.x
      : clamp(this.player.x + Math.cos(angle) * distance, -this.worldLimit + 2, this.worldLimit - 2);
    const z = Number.isFinite(overrides.z)
      ? overrides.z
      : clamp(this.player.z + Math.sin(angle) * distance, -this.worldLimit + 2, this.worldLimit - 2);

    const maxHp = Math.max(1, Math.round(overrides.hp ?? profile.hp));
    const boss = {
      id: `boss-${this.nextEntityId++}`,
      species: profile.name,
      types: [...(profile.types ?? [])],
      isElite: false,
      isMiniBoss: false,
      isBoss: true,
      aura: null,
      x,
      z,
      hp: maxHp,
      maxHp,
      speed: overrides.speed ?? profile.speed,
      contactDamage: overrides.contactDamage ?? profile.contactDamage,
      xpValue: overrides.xpValue ?? profile.xp,
      radius: overrides.radius ?? profile.radius,
      color: overrides.color ?? profile.color,
      accent: overrides.accent ?? profile.accent,
      shape: 'boss',
      hitFlash: 0,
      knockbackX: 0,
      knockbackZ: 0,
      rotationY: 0,
    };

    this.bossSpawned = true;
    this.enemies.push(boss);
    return boss;
  }

  spawnHordeWave(count = 4) {
    const spawned = [];
    const safeCount = Math.max(0, Math.floor(count));
    const baseAngle = this.random() * Math.PI * 2;

    for (let index = 0; index < safeCount; index += 1) {
      if (this.enemies.length >= this.maxActiveEnemies) break;
      const angle = baseAngle + (index / Math.max(1, safeCount)) * Math.PI * 2 + (this.random() - 0.5) * 0.35;
      spawned.push(this.spawnEnemy({ angle }));
    }
    return spawned;
  }

  spawnOrb({ x = 0, z = 0, value = 15 } = {}) {
    const orb = {
      id: `orb-${this.nextEntityId++}`,
      x: clamp(x, -this.worldLimit, this.worldLimit),
      z: clamp(z, -this.worldLimit, this.worldLimit),
      value: Math.max(1, Math.round(value)),
      radius: value >= 50 ? 0.34 : 0.22,
      magnetized: false,
      age: 0,
    };
    this.orbs.push(orb);
    return orb;
  }

  /**
   * Genera un Cofre 3D en el mapa (estilo Megabonk) con objetos del mundo Pokémon.
   */
  spawnChest(overrides = {}) {
    const angle = Number.isFinite(overrides.angle) ? overrides.angle : this.random() * Math.PI * 2;
    const distance = Number.isFinite(overrides.distance) ? overrides.distance : 10 + this.random() * 14;
    const x = Number.isFinite(overrides.x)
      ? overrides.x
      : clamp(this.player.x + Math.cos(angle) * distance, -this.worldLimit + 3, this.worldLimit - 3);
    const z = Number.isFinite(overrides.z)
      ? overrides.z
      : clamp(this.player.z + Math.sin(angle) * distance, -this.worldLimit + 3, this.worldLimit - 3);

    const lootTemplate = CHEST_LOOT_TABLE[Math.floor(this.random() * CHEST_LOOT_TABLE.length)] ?? CHEST_LOOT_TABLE[0];
    const chest = {
      id: `chest-${this.nextEntityId++}`,
      x,
      z,
      radius: 0.78,
      loot: { ...lootTemplate },
    };
    this.chests.push(chest);
    return chest;
  }

  /**
   * Permite cambiar las 3 cartas de subida de nivel (Reroll estilo PokéSurvivor).
   */
  rerollUpgradeChoices() {
    if (this.status !== 'level-up' || this.rerollsRemaining <= 0) {
      return { ok: false, reason: 'no-rerolls' };
    }
    this.rerollsRemaining -= 1;
    this.pendingChoices = this.rollUpgradeChoices(3);
    return { ok: true, rerollsRemaining: this.rerollsRemaining, pendingChoices: this.pendingChoices };
  }

  /** Ataque básico (automático). Compatible con la API de v0.3 mediante `firePrimary`. */
  firePrimary(direction = DEFAULT_AIM, options = {}) {
    return this.fireAttack('basic', direction, options);
  }

  /** Especial con la tecla Q. Solo se lanza si su enfriamiento ha terminado. */
  castSpecial(direction = DEFAULT_AIM) {
    return this.fireAttack('special', direction);
  }

  /**
   * Habilidad de Estado Activable (ej. Danza Espada: potencia el daño por 20s, 5s de enfriamiento).
   * Se bloquea si el compañero equipa Cinta Elegida.
   */
  castStateSkill() {
    if (this.status !== 'running' || !this.player.alive) {
      return { fired: false, reason: 'not-running' };
    }
    if (this.equippedItem?.blocksStateMoves) {
      return { fired: false, reason: 'blocked-by-choice-band' };
    }
    if (this.stateBuffTimer > 0 || this.cooldowns.state > 0) {
      return { fired: false, reason: 'cooldown', remaining: this.cooldowns.state };
    }
    const spec = LEVEL_UP_SKILLS.danza_espada.levels[1];
    this.stateBuffTimer = spec.durationSec;
    this.cooldowns.state = spec.cooldownSec;
    this.stats = this.computeStats();
    return {
      fired: true,
      skillId: 'danza_espada',
      durationSec: spec.durationSec,
      damageMultiplier: spec.damageMultiplier,
    };
  }

  /**
   * Pasiva Legendaria Tipo Volador (estilo Megabonk):
   * Al aterrizar tras planear genera un tornado físico que daña y lanza a los enemigos.
   */
  triggerLandingTornado() {
    if (this.status !== 'running' || !this.player.alive) return { triggered: false, hits: [] };
    if (!this.runConfig.starter.types.includes('Volador')) return { triggered: false, hits: [] };

    const passive = TYPE_SYNERGIES.Volador.legendaryPassive;
    const hits = [];
    for (const enemy of this.enemies) {
      if (enemy.hp <= 0) continue;
      const dx = enemy.x - this.player.x;
      const dz = enemy.z - this.player.z;
      const dist = Math.hypot(dx, dz);
      if (dist <= passive.tornadoRadius) {
        const dir = dist > 0.001 ? { x: dx / dist, z: dz / dist } : { x: 0, z: -1 };
        enemy.hp = Math.max(0, enemy.hp - passive.tornadoDamage);
        enemy.knockbackX += dir.x * passive.knockbackForce;
        enemy.knockbackZ += dir.z * passive.knockbackForce;
        hits.push({ enemyId: enemy.id, damage: passive.tornadoDamage });
      }
    }
    return { triggered: true, radius: passive.tornadoRadius, hits };
  }

  /**
   * Resuelve un ataque del compañero: qué alcanza, daño (STAB y efectividad), empuje,
   * derrotas y orbes. Devuelve `fired: false` con `reason` si no puede lanzarse.
   */
  fireAttack(slot, direction = DEFAULT_AIM, { force = false } = {}) {
    if (this.status !== 'running' || !this.player.alive) {
      return this.#emptyAttack(slot, 'not-running');
    }
    if (slot === 'special' && !this.unlockedSkills.special) {
      return this.#emptyAttack(slot, 'locked');
    }
    if (!this.moveset[slot] || !this.stats.moves[slot]) {
      return this.#emptyAttack(slot, 'unknown-slot');
    }
    if (!force && this.cooldowns[slot] > 0) {
      return this.#emptyAttack(slot, 'cooldown', this.cooldowns[slot]);
    }

    const move = this.moveset[slot];
    const derived = this.stats.moves[slot];
    const dir = normalizeDirection(direction);

    // Se actualiza el destino de giro; la orientación visible se interpola en update().
    this.player.rotationTargetY = Math.atan2(dir.x, dir.z);
    this.cooldowns[slot] = derived.cooldown;

    const attackerTypes = this.runConfig.starter.types;
    const stab = attackerTypes.includes(move.type) ? STAB_MULTIPLIER : 1;
    // Los enemigos inmunes al tipo del movimiento no participan (no bloquean haces ni cuentan para abanicos).
    const attackable = this.enemies.filter(
      (enemy) => enemy.hp > 0 && getTypeMultiplier(move.type, enemy.types) > 0,
    );
    const origin = { x: this.player.x, z: this.player.z };
    const shape = resolveAttackShape({ move, derived, origin, direction: dir, enemies: attackable });

    const beams = shape.beams.map((beam) => ({ ...beam, color: move.color, moveId: move.id }));
    const hits = [];
    const defeated = [];

    for (const target of shape.targets) {
      const { enemy } = target;
      if (enemy.hp <= 0) continue;

      const effectiveness = getTypeMultiplier(move.type, enemy.types);
      // Impactos repetidos sobre el mismo enemigo (haces perforantes) hacen la mitad de daño.
      const repeatFactor = target.repeatIndex === 0 ? 1 : 0.5;
      let darkCritMult = 1;
      if (attackerTypes.includes('Siniestro') && this.player.hp < this.player.maxHp) {
        const { critChance, critDamage } = calculateDarkTypeCritChance(
          this.player.hp,
          this.player.maxHp,
          Boolean(this.runConfig.starter.isLegendary),
        );
        if (this.random() < critChance) {
          darkCritMult = critDamage;
        }
      }
      const damage = Math.max(1, Math.round(derived.power * stab * effectiveness * repeatFactor * darkCritMult));

      enemy.hp = Math.max(0, enemy.hp - damage);
      enemy.hitFlash = 0.18;
      const kbFactor = enemy.isBoss ? 0.35 : (enemy.isMiniBoss ? 0.55 : 1);
      const hitDir = target.direction
        ?? normalizeDirection({ x: enemy.x - origin.x, z: enemy.z - origin.z });
      enemy.knockbackX += hitDir.x * derived.knockback * kbFactor;
      enemy.knockbackZ += hitDir.z * derived.knockback * kbFactor;
      this.totalDamageDealt += damage;

      hits.push({
        enemyId: enemy.id,
        species: enemy.species,
        isElite: !!enemy.isElite,
        isMiniBoss: !!enemy.isMiniBoss,
        isBoss: !!enemy.isBoss,
        x: enemy.x,
        z: enemy.z,
        damage,
        remainingHp: enemy.hp,
        defeated: enemy.hp <= 0,
        moveId: move.id,
        color: move.color,
        effectiveness,
        stab: stab > 1,
      });
    }

    // Pasiva Tipo Eléctrico: Rebote automático (y Pararrayos en Cadena si es Legendario)
    if (slot === 'basic' && attackerTypes.includes('Eléctrico') && hits.length > 0) {
      const synergy = TYPE_SYNERGIES.Eléctrico;
      const maxBounces = this.runConfig.starter.isLegendary
        ? synergy.legendaryPassive.chainMaxTargets
        : synergy.bounceCount;
      const alreadyHitIds = new Set(hits.map((h) => h.enemyId));
      let lastSource = hits[0];

      for (let b = 0; b < maxBounces; b += 1) {
        let closest = null;
        let closestDist = synergy.bounceRange;
        for (const candidate of attackable) {
          if (candidate.hp <= 0 || alreadyHitIds.has(candidate.id)) continue;
          const dist = Math.hypot(candidate.x - lastSource.x, candidate.z - lastSource.z);
          if (dist <= closestDist) {
            closestDist = dist;
            closest = candidate;
          }
        }
        if (!closest) break;

        alreadyHitIds.add(closest.id);
        const eff = getTypeMultiplier('Eléctrico', closest.types);
        const bounceDamage = Math.max(
          1,
          Math.round(derived.power * stab * eff * synergy.bounceDamageDecay),
        );
        closest.hp = Math.max(0, closest.hp - bounceDamage);
        closest.hitFlash = 0.18;
        this.totalDamageDealt += bounceDamage;

        beams.push({
          startX: lastSource.x,
          startZ: lastSource.z,
          endX: closest.x,
          endZ: closest.z,
          width: 0.45,
          color: '#f7d02c',
          moveId: 'electric-chain',
        });

        const bounceHit = {
          enemyId: closest.id,
          species: closest.species,
          isElite: !!closest.isElite,
          isMiniBoss: !!closest.isMiniBoss,
          isBoss: !!closest.isBoss,
          x: closest.x,
          z: closest.z,
          damage: bounceDamage,
          remainingHp: closest.hp,
          defeated: closest.hp <= 0,
          moveId: move.id,
          color: '#f7d02c',
          effectiveness: eff,
          stab: true,
        };
        hits.push(bounceHit);
        lastSource = bounceHit;
      }
    }

    if (hits.length > 0) {
      const totalHitDamage = hits.reduce((sum, hit) => sum + hit.damage, 0);
      if (this.equippedItem?.lifestealRatio > 0 && this.player.alive) {
        const heal = Math.max(1, Math.round(totalHitDamage * this.equippedItem.lifestealRatio));
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + heal);
      }
      this.attackSeq += 1;
      this.lastAttack = {
        seq: this.attackSeq,
        slot,
        moveId: move.id,
        moveName: move.name,
        effectiveness: hits[0].effectiveness,
        stab: stab > 1,
        damage: hits.reduce((sum, hit) => sum + hit.damage, 0),
        hitCount: hits.length,
      };
    }

    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (enemy.hp > 0) continue;

      this.enemies.splice(index, 1);
      this.kills += 1;
      if (enemy.isElite) this.eliteKills += 1;

      const orb = this.spawnOrb({
        x: enemy.x,
        z: enemy.z,
        value: enemy.xpValue,
      });

      let bonusCoins = 0;
      let bonusTickets = 0;
      if (enemy.isMiniBoss) {
        this.miniBossDefeated = true;
        bonusCoins = enemy.rewardCoins ?? 40;
        bonusTickets = enemy.rewardTickets ?? 1;
        this.bonusCoins += bonusCoins;
        this.bonusTickets += bonusTickets;
      }

      defeated.push({
        enemyId: enemy.id,
        species: enemy.species,
        isElite: !!enemy.isElite,
        isMiniBoss: !!enemy.isMiniBoss,
        isBoss: !!enemy.isBoss,
        x: enemy.x,
        z: enemy.z,
        color: enemy.color,
        aura: enemy.aura,
        orbId: orb.id,
        bonusCoins,
        bonusTickets,
      });

      if (enemy.isBoss) {
        this.bossDefeated = true;
        this.status = 'victory';
      }
    }

    return {
      fired: true,
      slot,
      moveId: move.id,
      moveName: move.name,
      color: move.color,
      shape: move.shape,
      beams,
      hits,
      defeated,
      area: shape.area ? { ...shape.area, slot } : null,
    };
  }

  #emptyAttack(slot, reason, remaining = 0) {
    return {
      fired: false,
      slot,
      reason,
      remaining,
      beams: [],
      hits: [],
      defeated: [],
      area: null,
    };
  }

  dash(direction = { x: 0, z: 0 }) {
    if (this.status !== 'running' || !this.player.alive) return { ok: false, reason: 'not-running' };
    if (!this.unlockedSkills.dash) return { ok: false, reason: 'locked' };
    if (this.player.dashCooldown > 0 || this.player.dashTimer > 0) return { ok: false, reason: 'cooldown' };

    let dx = Number(direction.x) || 0;
    let dz = Number(direction.z) || 0;
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) {
      // Si no hay dirección de movimiento, dashea hacia la orientación actual
      dx = Math.sin(this.player.rotationY);
      dz = Math.cos(this.player.rotationY);
    } else {
      dx /= len;
      dz /= len;
    }

    this.player.dashDirX = dx;
    this.player.dashDirZ = dz;
    this.player.rotationTargetY = Math.atan2(dx, dz);
    this.player.dashTimer = this.stats.dash.duration;
    this.player.dashCooldown = this.stats.dash.cooldown;
    this.player.invulnerableTimer = Math.max(
      this.player.invulnerableTimer,
      this.stats.dash.invulnerability,
    );
    this.player.dashFlash = 0.22;

    // Aplicar el desplazamiento inmediato (el bucle ajustará el resto con arrastre)
    const instantPortion = 0.7;
    this.player.x = clamp(
      this.player.x + dx * this.stats.dash.distance * instantPortion,
      -this.worldLimit,
      this.worldLimit,
    );
    this.player.z = clamp(
      this.player.z + dz * this.stats.dash.distance * instantPortion,
      -this.worldLimit,
      this.worldLimit,
    );

    return {
      ok: true,
      dirX: dx,
      dirZ: dz,
      distance: this.stats.dash.distance,
      cooldown: this.stats.dash.cooldown,
    };
  }

  damagePlayer(amount, sourceEnemy = null) {
    if (!this.player.alive || this.status !== 'running') return { damaged: false, hp: this.player.hp };
    if (this.player.invulnerableTimer > 0 || this.player.dashTimer > 0) {
      return { damaged: false, reason: 'invulnerable', hp: this.player.hp };
    }

    const safeDamage = Math.max(1, Math.round(Number(amount) || 0));
    this.player.hp = Math.max(0, this.player.hp - safeDamage);
    this.player.invulnerableTimer = BASE_PLAYER_STATS.contactGraceSeconds;
    this.player.hitFlash = 0.24;

    if (sourceEnemy) {
      const dx = this.player.x - sourceEnemy.x;
      const dz = this.player.z - sourceEnemy.z;
      const dist = Math.hypot(dx, dz) || 1;
      this.player.x = clamp(this.player.x + (dx / dist) * 0.55, -this.worldLimit, this.worldLimit);
      this.player.z = clamp(this.player.z + (dz / dist) * 0.55, -this.worldLimit, this.worldLimit);
    }

    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.player.alive = false;
      this.status = 'defeat';
    }

    return {
      damaged: true,
      damage: safeDamage,
      hp: this.player.hp,
      defeated: !this.player.alive,
    };
  }

  /** Inicia la retirada táctica. Conserva el botín acumulado sin victoria. */
  extract() {
    if (this.isFinished) return { ok: false, reason: 'already-finished', status: this.status };
    this.status = 'extracted';
    this.player.alive = false;
    return { ok: true, status: this.status };
  }

  gainXp(rawAmount) {
    const gained = Math.max(1, Math.round((Number(rawAmount) || 0) * this.stats.xpMultiplier));
    this.xp += gained;
    let levelsGained = 0;

    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = getXpForNextLevel(this.level);
      this.pendingLevelUps += 1;
      levelsGained += 1;
    }

    if (this.pendingLevelUps > 0 && !this.pendingChoices && this.status === 'running') {
      const choices = this.rollUpgradeChoices(3);
      if (choices.length > 0) {
        this.pendingChoices = choices;
        this.status = 'level-up';
      } else {
        this.pendingLevelUps = 0;
      }
    }

    return { gained, levelsGained, level: this.level, xp: this.xp, xpToNext: this.xpToNext };
  }

  #isUpgradeAvailable(upgrade) {
    const currentRank = this.runUpgrades[upgrade.id] ?? 0;
    if (currentRank >= upgrade.maxRank) return false;
    if (upgrade.unlockSkill && this.unlockedSkills[upgrade.unlockSkill]) return false;
    if (upgrade.requiresSkill && !this.unlockedSkills[upgrade.requiresSkill]) return false;
    return true;
  }

  rollUpgradeChoices(count = 3) {
    const choiceCount = Math.max(1, Math.floor(Number(count) || 3));
    const available = RUN_UPGRADES.filter((upgrade) => this.#isUpgradeAvailable(upgrade));

    // Presenta siempre como opción las habilidades aún bloqueadas. Así Q y Shift no
    // dependen de una tirada afortunada; siguen siendo tres tarjetas y solo se elige una.
    const unlocks = available.filter((upgrade) => upgrade.unlockSkill).slice(0, choiceCount);
    const unlockIds = new Set(unlocks.map((upgrade) => upgrade.id));
    const pool = available.filter((upgrade) => !unlockIds.has(upgrade.id));
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return [...unlocks, ...pool.slice(0, Math.max(0, choiceCount - unlocks.length))].map((upgrade) => {
      const currentRank = this.runUpgrades[upgrade.id] ?? 0;
      return {
        id: upgrade.id,
        name: upgrade.name,
        category: upgrade.category,
        icon: upgrade.icon,
        description: upgrade.description,
        currentRank,
        nextRank: currentRank + 1,
        maxRank: upgrade.maxRank,
        unlockSkill: upgrade.unlockSkill ?? null,
      };
    });
  }

  chooseUpgrade(selection) {
    if (this.status !== 'level-up' || !Array.isArray(this.pendingChoices) || this.pendingChoices.length === 0) {
      return { ok: false, reason: 'no-pending-choice' };
    }

    let chosen = null;
    if (typeof selection === 'number') {
      chosen = this.pendingChoices[selection] ?? null;
    } else if (typeof selection === 'string') {
      chosen = this.pendingChoices.find((option) => option.id === selection) ?? null;
    }

    if (!chosen) {
      return { ok: false, reason: 'invalid-choice' };
    }

    const previousMaxHp = this.stats.maxHp;
    const nextRank = (this.runUpgrades[chosen.id] ?? 0) + 1;
    this.runUpgrades[chosen.id] = nextRank;
    if (chosen.unlockSkill) this.unlockedSkills[chosen.unlockSkill] = true;
    if (chosen.unlockSkill === 'special') this.cooldowns.special = 0;
    this.stats = this.computeStats();

    if (chosen.id === 'vitalityBoost') {
      const maxHpDelta = Math.max(0, this.stats.maxHp - previousMaxHp);
      this.player.maxHp = this.stats.maxHp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.max(30, maxHpDelta));
    } else {
      this.player.maxHp = this.stats.maxHp;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp);
    }

    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);

    if (this.pendingLevelUps > 0) {
      const nextChoices = this.rollUpgradeChoices(3);
      if (nextChoices.length > 0) {
        this.pendingChoices = nextChoices;
        this.status = 'level-up';
      } else {
        this.pendingLevelUps = 0;
        this.pendingChoices = null;
        this.status = 'running';
      }
    } else {
      this.pendingChoices = null;
      this.status = 'running';
    }

    return {
      ok: true,
      upgradeId: chosen.id,
      name: chosen.name,
      rank: nextRank,
      status: this.status,
      pendingChoices: this.pendingChoices,
    };
  }

  update(delta, input = {}) {
    const events = {
      beams: [],
      hits: [],
      defeated: [],
      attacks: [],
      orbsPicked: [],
      playerDamaged: null,
      playerDashed: null,
      dashRejected: null,
      specialRejected: null,
      leveledUp: false,
      miniBossSpawned: null,
      bossSpawned: null,
    };

    const dt = Math.max(0, Number(delta) || 0);
    if (dt === 0 || this.isFinished) {
      return events;
    }
    // En pausa por elección no actualizamos el mundo, pero sí devolvemos snapshot
    if (this.status === 'level-up') {
      return events;
    }

    this.elapsedSeconds += dt;
    this.cooldowns.basic = Math.max(0, this.cooldowns.basic - dt);
    this.cooldowns.special = Math.max(0, this.cooldowns.special - dt);
    if (this.stateBuffTimer > 0) {
      this.stateBuffTimer = Math.max(0, this.stateBuffTimer - dt);
      if (this.stateBuffTimer === 0) {
        this.stats = this.computeStats();
      }
    } else {
      this.cooldowns.state = Math.max(0, this.cooldowns.state - dt);
    }
    this.player.invulnerableTimer = Math.max(0, this.player.invulnerableTimer - dt);
    this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);
    this.player.dashFlash = Math.max(0, this.player.dashFlash - dt);

    // Dash: aplicar la parte residual del desplazamiento con arrastre
    if (this.player.dashTimer > 0) {
      const dashPortion = Math.min(1, dt / Math.max(0.001, this.stats.dash.duration));
      const residual = this.stats.dash.distance * 0.3;
      this.player.x = clamp(
        this.player.x + this.player.dashDirX * residual * dashPortion,
        -this.worldLimit,
        this.worldLimit,
      );
      this.player.z = clamp(
        this.player.z + this.player.dashDirZ * residual * dashPortion,
        -this.worldLimit,
        this.worldLimit,
      );
      this.player.dashTimer = Math.max(0, this.player.dashTimer - dt);
    }
    this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);

    // Acción de esquiva solicitada por el jugador
    if (input.dashPressed) {
      const dashResult = this.dash(input.movement);
      if (dashResult.ok) events.playerDashed = dashResult;
      else events.dashRejected = { reason: dashResult.reason };
    }

    // Movimiento del jugador
    const moveX = Number(input.movement?.x) || 0;
    const moveZ = Number(input.movement?.z) || 0;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.0001 && this.player.dashTimer <= 0) {
      const normX = moveLen > 1 ? moveX / moveLen : moveX;
      const normZ = moveLen > 1 ? moveZ / moveLen : moveZ;
      this.player.x = clamp(this.player.x + normX * this.stats.moveSpeed * dt, -this.worldLimit, this.worldLimit);
      this.player.z = clamp(this.player.z + normZ * this.stats.moveSpeed * dt, -this.worldLimit, this.worldLimit);

      // Pasiva Tipo Hielo: Rastro de escarcha al caminar
      if (this.runConfig.starter.types.includes('Hielo')) {
        this.frostSpawnTimer -= dt;
        if (this.frostSpawnTimer <= 0) {
          this.frostSpawnTimer = 0.35;
          const iceSynergy = TYPE_SYNERGIES.Hielo;
          this.frostNodes.push({
            id: `frost-${this.nextEntityId++}`,
            x: this.player.x,
            z: this.player.z,
            radius: iceSynergy.trailRadius,
            remaining: iceSynergy.trailDurationSec,
            duration: iceSynergy.trailDurationSec,
          });
        }
      }
    }

    if (Number.isFinite(input.height)) {
      this.player.height = Math.max(0, input.height);
    }

    const aim = normalizeDirection(
      input.aimDirection ?? forwardFromYaw(this.player.rotationY),
    );
    const facing = moveLen > 0.0001
      ? normalizeDirection({ x: moveX, z: moveZ })
      : aim;
    this.player.rotationTargetY = Math.atan2(facing.x, facing.z);
    this.player.rotationY = smoothYaw(this.player.rotationY, this.player.rotationTargetY, dt);

    // Especial (Q): solo si su enfriamiento ha terminado
    if (input.specialPressed) {
      const special = this.castSpecial(aim);
      if (special.fired) {
        this.#recordAttack(events, special);
      } else {
        events.specialRejected = { reason: special.reason, remaining: special.remaining };
      }
      if (this.isFinished) return events;
    }

    // Ataque básico automático cuando no está en enfriamiento
    if (this.cooldowns.basic <= 0) {
      const basic = this.fireAttack('basic', aim, { force: true });
      if (basic.fired) this.#recordAttack(events, basic);
      if (this.isFinished) return events;
    }

    // Progresión de oleadas
    const nextWave = 1 + Math.floor(this.elapsedSeconds / HORDE_CONFIG.waveDurationSeconds);
    if (nextWave > this.wave) {
      this.wave = nextWave;
      this.spawnHordeWave(2 + Math.min(4, this.wave));
    }

    // Minijefe al alcanzar el hito configurado (solo una vez por partida)
    if (!this.miniBossSpawned && this.elapsedSeconds >= this.miniBossSpawnSeconds) {
      events.miniBossSpawned = this.spawnMiniBoss();
    }

    // Jefe regional tras derrotar al minijefe o alcanzar el tiempo final
    const bossReady = this.miniBossDefeated || this.elapsedSeconds >= this.bossSpawnSeconds;
    if (!this.bossSpawned && bossReady && this.elapsedSeconds >= this.miniBossSpawnSeconds + 30) {
      events.bossSpawned = this.spawnBoss();
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      const interval = Math.max(
        HORDE_CONFIG.minSpawnInterval,
        HORDE_CONFIG.baseSpawnInterval * Math.pow(0.88, this.wave - 1),
      );
      this.spawnTimer = interval;
      if (this.enemies.length < this.maxActiveEnemies) {
        const batchCount = this.wave >= 3 ? 2 : 1;
        this.spawnHordeWave(batchCount);
      }
    }

    this.#updateEnemies(dt, events);
    if (this.isFinished) return events;

    this.#updateOrbs(dt, events);
    this.#updateChests(dt, events);

    return events;
  }

  #recordAttack(events, result) {
    events.beams.push(...result.beams);
    events.hits.push(...result.hits);
    events.defeated.push(...result.defeated);
    events.attacks.push({
      slot: result.slot,
      moveId: result.moveId,
      moveName: result.moveName,
      color: result.color,
      shape: result.shape,
      area: result.area,
      hitCount: result.hits.length,
    });
  }

  #updateEnemies(dt, events) {
    const count = this.enemies.length;

    // Actualizar duración de nodos de escarcha (Tipo Hielo)
    for (let f = this.frostNodes.length - 1; f >= 0; f -= 1) {
      this.frostNodes[f].remaining -= dt;
      if (this.frostNodes[f].remaining <= 0) {
        this.frostNodes.splice(f, 1);
      }
    }

    // Actualizar patrones Bullet Hell 3D del Jefe Regional (áreas marcadas en el suelo)
    const activeBoss = this.activeBoss;
    if (activeBoss) {
      this.bossPatternTimer -= dt;
      if (this.bossPatternTimer <= 0) {
        this.bossPatternTimer = 4.2;
        this.bossTelegraphs.push({
          id: `telegraph-${this.nextEntityId++}`,
          x: this.player.x,
          z: this.player.z,
          radius: 3.2,
          duration: 1.35,
          remaining: 1.35,
          damage: Math.round(activeBoss.contactDamage * 0.85),
          color: activeBoss.accent ?? '#ff7be5',
        });
      }
    }

    for (let t = this.bossTelegraphs.length - 1; t >= 0; t -= 1) {
      const tele = this.bossTelegraphs[t];
      tele.remaining -= dt;
      if (tele.remaining <= 0) {
        this.bossTelegraphs.splice(t, 1);
        const distToPlayer = Math.hypot(this.player.x - tele.x, this.player.z - tele.z);
        // Se puede esquivar saliendo del área o saltando/planeando en 3D (height > 0.85)
        if (distToPlayer <= tele.radius && this.player.height <= 0.85) {
          const hitRes = this.damagePlayer(tele.damage, activeBoss);
          if (hitRes.damaged) {
            events.playerDamaged = { ...hitRes, fromTelegraph: true };
          }
        }
      }
    }

    for (let i = 0; i < count; i += 1) {
      const enemy = this.enemies[i];
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      // Comprobar si el enemigo pisa un nodo de escarcha (Tipo Hielo)
      let speedMultiplier = 1;
      if (this.frostNodes.length > 0) {
        for (const node of this.frostNodes) {
          if (Math.hypot(enemy.x - node.x, enemy.z - node.z) <= node.radius + enemy.radius) {
            speedMultiplier = 1 - TYPE_SYNERGIES.Hielo.trailSlowRatio;
            enemy.frostExposure = (enemy.frostExposure ?? 0) + dt;
            break;
          }
        }
      }

      const dx = this.player.x - enemy.x;
      const dz = this.player.z - enemy.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const dirX = dx / dist;
      const dirZ = dz / dist;

      enemy.rotationY = Math.atan2(dirX, dirZ);
      enemy.x += (dirX * enemy.speed * speedMultiplier + enemy.knockbackX) * dt;
      enemy.z += (dirZ * enemy.speed * speedMultiplier + enemy.knockbackZ) * dt;

      const decay = Math.exp(-dt * (enemy.isBoss ? 4 : 9));
      enemy.knockbackX *= decay;
      enemy.knockbackZ *= decay;

      enemy.x = clamp(enemy.x, -this.worldLimit, this.worldLimit);
      enemy.z = clamp(enemy.z, -this.worldLimit, this.worldLimit);
    }

    // Separación suave entre enemigos para evitar apilamiento
    for (let i = 0; i < count; i += 1) {
      const a = this.enemies[i];
      for (let j = i + 1; j < count; j += 1) {
        const b = this.enemies[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const minDist = a.radius + b.radius + 0.12;
        const distSq = dx * dx + dz * dz;
        if (distSq > 0 && distSq < minDist * minDist) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.x = clamp(a.x - nx * overlap, -this.worldLimit, this.worldLimit);
          a.z = clamp(a.z - nz * overlap, -this.worldLimit, this.worldLimit);
          b.x = clamp(b.x + nx * overlap, -this.worldLimit, this.worldLimit);
          b.z = clamp(b.z + nz * overlap, -this.worldLimit, this.worldLimit);
        }
      }
    }

    // Daño por contacto
    for (const enemy of this.enemies) {
      const dx = this.player.x - enemy.x;
      const dz = this.player.z - enemy.z;
      const hitDistance = this.player.radius + enemy.radius;
      const verticalReach = enemy.isBoss ? 1.55 : (enemy.isMiniBoss ? 1.3 : 0.85);
      if (this.player.height <= verticalReach && dx * dx + dz * dz <= hitDistance * hitDistance) {
        const result = this.damagePlayer(enemy.contactDamage, enemy);
        if (result.damaged) {
          events.playerDamaged = {
            ...result,
            enemyId: enemy.id,
            species: enemy.species,
            isElite: !!enemy.isElite,
            isMiniBoss: !!enemy.isMiniBoss,
            isBoss: !!enemy.isBoss,
          };
          if (!this.player.alive) break;
        }
      }
    }
  }

  #updateOrbs(dt, events) {
    for (let index = this.orbs.length - 1; index >= 0; index -= 1) {
      const orb = this.orbs[index];
      orb.age += dt;

      const dx = this.player.x - orb.x;
      const dz = this.player.z - orb.z;
      const dist = Math.hypot(dx, dz);

      if (dist <= this.stats.magnetRadius) {
        orb.magnetized = true;
      }

      if (orb.magnetized && dist > 0.001) {
        const pullSpeed = Math.max(11.5, this.stats.moveSpeed * 1.9);
        const step = Math.min(dist, pullSpeed * dt);
        orb.x += (dx / dist) * step;
        orb.z += (dz / dist) * step;
      }

      const newDist = Math.hypot(this.player.x - orb.x, this.player.z - orb.z);
      if (newDist <= this.stats.pickupRadius) {
        this.orbs.splice(index, 1);
        this.orbsCollected += 1;
        const xpResult = this.gainXp(orb.value);
        events.orbsPicked.push({
          orbId: orb.id,
          x: orb.x,
          z: orb.z,
          xpGained: xpResult.gained,
        });
        if (xpResult.levelsGained > 0) {
          events.leveledUp = true;
        }
      }
    }
  }

  #updateChests(dt, events) {
    events.chestsOpened ??= [];
    this.chestSpawnTimer -= dt;
    if (this.chestSpawnTimer <= 0) {
      this.chestSpawnTimer = 18.0;
      if (this.chests.length < 5) {
        this.spawnChest();
      }
    }

    for (let i = this.chests.length - 1; i >= 0; i -= 1) {
      const chest = this.chests[i];
      const dist = Math.hypot(this.player.x - chest.x, this.player.z - chest.z);
      if (dist <= this.player.radius + chest.radius) {
        this.chests.splice(i, 1);
        const { loot } = chest;
        const coinMult = this.equippedItem?.coinBonusMultiplier ?? 1;
        const earnedCoins = Math.round((loot.coins ?? 15) * coinMult);
        this.bonusCoins += earnedCoins;

        if (loot.kind === 'heal') {
          const healAmount = Math.round(this.player.maxHp * (loot.healRatio ?? 0.45));
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + healAmount);
        } else if (loot.kind === 'cleanse') {
          this.cooldowns.basic = 0;
          this.cooldowns.special = 0;
          this.player.dashCooldown = 0;
          this.player.invulnerableTimer = Math.max(this.player.invulnerableTimer, loot.invulnSec ?? 3.0);
        } else if (loot.kind === 'xp') {
          const xpRes = this.gainXp(loot.xpBonus ?? 60);
          if (xpRes.levelsGained > 0) events.leveledUp = true;
        }

        this.lastChestLoot = {
          id: loot.id,
          name: loot.name,
          icon: loot.icon,
          description: loot.description,
          coins: earnedCoins,
        };
        events.chestsOpened.push({
          chestId: chest.id,
          x: chest.x,
          z: chest.z,
          loot: this.lastChestLoot,
        });
      }
    }
  }

  #attackSnapshot(slot) {
    const move = this.moveset[slot];
    const derived = this.stats.moves[slot];
    const stab = this.runConfig.starter.types.includes(move.type);
    return {
      slot,
      id: move.id,
      name: move.name,
      type: move.type,
      shape: move.shape,
      color: move.color,
      description: move.description,
      damage: Math.max(1, Math.round(derived.power * (stab ? STAB_MULTIPLIER : 1))),
      stab,
      range: derived.range,
      cooldown: derived.cooldown,
      cooldownRemaining: Number(this.cooldowns[slot].toFixed(2)),
      unlocked: slot === 'basic' || Boolean(this.unlockedSkills[slot]),
      ready: (slot === 'basic' || Boolean(this.unlockedSkills[slot])) && this.cooldowns[slot] <= 0,
    };
  }

  getHudSnapshot() {
    const activeUpgrades = RUN_UPGRADES
      .filter((upgrade) => (this.runUpgrades[upgrade.id] ?? 0) > 0)
      .map((upgrade) => ({
        id: upgrade.id,
        name: upgrade.name,
        icon: upgrade.icon,
        rank: this.runUpgrades[upgrade.id],
        maxRank: upgrade.maxRank,
      }));

    const boss = this.activeBoss;
    const miniBoss = this.activeMiniBoss;
    const last = this.lastAttack;

    return {
      elapsedSeconds: Math.floor(this.elapsedSeconds),
      wave: this.wave,
      status: this.status,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      level: this.level,
      xp: this.xp,
      xpToNext: this.xpToNext,
      kills: this.kills,
      eliteKills: this.eliteKills,
      orbsCollected: this.orbsCollected,
      activeEnemies: this.enemies.length,
      basicAttack: this.#attackSnapshot('basic'),
      specialAttack: this.#attackSnapshot('special'),
      unlockedSkills: { ...this.unlockedSkills },
      lastAttackSeq: this.attackSeq,
      lastAttack: last
        ? {
            moveId: last.moveId,
            moveName: last.moveName,
            effectiveness: last.effectiveness,
            label: describeEffectiveness(last.effectiveness),
            stab: last.stab,
            damage: last.damage,
            hitCount: last.hitCount,
          }
        : null,
      dashUnlocked: this.unlockedSkills.dash,
      dashCooldown: this.player.dashCooldown,
      dashReady: this.unlockedSkills.dash && this.player.dashCooldown <= 0 && this.player.dashTimer <= 0,
      stateBuffActive: this.stateBuffTimer > 0,
      stateBuffRemaining: Number(this.stateBuffTimer.toFixed(1)),
      stateCooldown: Number(this.cooldowns.state.toFixed(1)),
      rerollsRemaining: this.rerollsRemaining,
      coinsInRun: this.bonusCoins + this.kills * 2,
      lastChestLoot: this.lastChestLoot,
      equippedItem: this.equippedItem,
      activeUpgrades,
      pendingChoices: this.pendingChoices ? [...this.pendingChoices] : null,
      miniBoss: miniBoss
        ? {
            name: miniBoss.species,
            hp: miniBoss.hp,
            maxHp: miniBoss.maxHp,
          }
        : null,
      boss: boss
        ? {
            name: boss.species,
            hp: boss.hp,
            maxHp: boss.maxHp,
          }
        : null,
    };
  }

  buildRunResult() {
    const victory = this.status === 'victory';
    const extracted = this.status === 'extracted';
    const elapsedSeconds = Math.max(0, Math.floor(this.elapsedSeconds));
    const timeCoeff = victory ? 0.45 : (extracted ? 0.3 : 0.2);
    const baseCoins = Math.max(
      6,
      Math.floor(elapsedSeconds * timeCoeff) + this.kills * 2 + (this.level - 1) * 6,
    );
    const coins = baseCoins + this.bonusCoins + (victory ? 70 : 0);
    const tickets = (victory ? 2 : 0) + this.bonusTickets + ((this.kills >= 10 || elapsedSeconds >= 45) ? 1 : 0);
    const gems = victory ? 1 : 0;

    return {
      victory,
      extracted,
      defeated: this.status === 'defeat',
      elapsedSeconds,
      kills: this.kills,
      eliteKills: this.eliteKills,
      miniBossDefeated: this.miniBossDefeated,
      level: this.level,
      orbsCollected: this.orbsCollected,
      upgrades: { ...this.runUpgrades },
      rewards: {
        coins,
        tickets,
        gems,
      },
    };
  }
}
