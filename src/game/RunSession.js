import {
  BASE_PLAYER_STATS,
  HORDE_CONFIG,
  PSYBEAM_BASE,
  RUN_UPGRADES,
  getBossProfile,
  getEnemyProfile,
  getXpForNextLevel,
} from '../data/combat.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * Simulación pura de una partida v0.2:
 * - Hordas por oleadas y jefe regional
 * - Psicorrayo con daño, enfriamiento, perforación y empuje
 * - Sistema de vida (PS), daño por contacto y ventana de gracia
 * - Orbes de experiencia con imán y recogida
 * - Subida de nivel con elección de 1 entre 3 mejoras
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
      starter: runConfig.starter ?? { id: 'bulbasaur', name: 'Bulbasaur', types: ['Planta'], color: '#80d79c', accent: '#c5ee88' },
      upgrades: { ...(runConfig.upgrades ?? {}) },
    };

    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.worldLimit = Number.isFinite(options.worldLimit) ? options.worldLimit : 52;
    this.bossSpawnSeconds = Number.isFinite(options.bossSpawnSeconds)
      ? options.bossSpawnSeconds
      : HORDE_CONFIG.bossSpawnSeconds;
    this.maxActiveEnemies = Number.isFinite(options.maxActiveEnemies)
      ? options.maxActiveEnemies
      : HORDE_CONFIG.maxActiveEnemies;

    this.nextEntityId = 1;
    this.elapsedSeconds = 0;
    this.wave = 1;
    this.spawnTimer = 0.85;
    this.psybeamCooldown = 0;

    this.runUpgrades = {};
    this.stats = this.computeStats();

    this.player = {
      x: 0,
      z: 0,
      height: 0,
      rotationY: 0,
      hp: this.stats.maxHp,
      maxHp: this.stats.maxHp,
      radius: BASE_PLAYER_STATS.playerRadius,
      invulnerableTimer: 0,
      hitFlash: 0,
      alive: true,
    };

    this.level = 1;
    this.xp = 0;
    this.xpToNext = getXpForNextLevel(1);
    this.kills = 0;
    this.orbsCollected = 0;
    this.totalDamageDealt = 0;

    this.pendingLevelUps = 0;
    this.pendingChoices = null;

    this.enemies = [];
    this.orbs = [];
    this.bossSpawned = false;
    this.bossDefeated = false;
    this.status = 'running';

    if (options.spawnInitialWave !== false) {
      const initialCount = Number.isFinite(options.initialEnemies)
        ? options.initialEnemies
        : HORDE_CONFIG.initialEnemies;
      this.spawnHordeWave(initialCount);
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

    const powerRank = inRun.psybeamPower ?? 0;
    const cadenceRank = inRun.psybeamCadence ?? 0;
    const prismRank = inRun.psybeamPrism ?? 0;
    const waveRank = inRun.psybeamWave ?? 0;
    const vitalityRank = inRun.vitalityBoost ?? 0;
    const agileRank = inRun.agileStep ?? 0;
    const magnetRank = inRun.auraMagnet ?? 0;

    const maxHp = Math.round(
      BASE_PLAYER_STATS.maxHp * (1 + permHealthRank * 0.05) + vitalityRank * 25,
    );
    const moveSpeed = BASE_PLAYER_STATS.moveSpeed
      * (1 + permMoveRank * 0.03)
      * (1 + agileRank * 0.12);
    const magnetRadius = BASE_PLAYER_STATS.magnetRadius
      * (1 + permPickupRank * 0.08)
      * (1 + magnetRank * 0.35);
    const pickupRadius = BASE_PLAYER_STATS.pickupRadius * (1 + magnetRank * 0.08);
    const xpMultiplier = (1 + permXpRank * 0.02) * (1 + magnetRank * 0.15);

    const cooldownFactor = Math.max(0.28, (1 - permCastRank * 0.03) * Math.pow(0.85, cadenceRank));

    return {
      maxHp,
      moveSpeed,
      magnetRadius,
      pickupRadius,
      xpMultiplier,
      psybeam: {
        name: PSYBEAM_BASE.name,
        damage: Math.round(PSYBEAM_BASE.damage * (1 + powerRank * 0.25)),
        cooldown: Number((PSYBEAM_BASE.cooldown * cooldownFactor).toFixed(3)),
        range: Number((PSYBEAM_BASE.range * (1 + prismRank * 0.12)).toFixed(2)),
        width: Number((PSYBEAM_BASE.width * (1 + waveRank * 0.25)).toFixed(2)),
        knockback: Number((PSYBEAM_BASE.knockback * (1 + waveRank * 0.35)).toFixed(2)),
        beams: PSYBEAM_BASE.beams + prismRank,
        pierce: PSYBEAM_BASE.pierce + powerRank,
        spreadRadians: PSYBEAM_BASE.spreadRadians,
        color: PSYBEAM_BASE.color,
      },
    };
  }

  get isPausedForChoice() {
    return this.status === 'level-up';
  }

  get isFinished() {
    return this.status === 'victory' || this.status === 'defeat';
  }

  get activeBoss() {
    return this.enemies.find((enemy) => enemy.isBoss) ?? null;
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

    const maxHp = Math.max(1, Math.round((overrides.hp ?? profile.hp) * waveScale));
    const enemy = {
      id: `enemy-${this.nextEntityId++}`,
      species: profile.name,
      isBoss: false,
      x,
      z,
      hp: maxHp,
      maxHp,
      speed: (overrides.speed ?? profile.speed) * speedScale,
      contactDamage: Math.max(1, Math.round((overrides.contactDamage ?? profile.contactDamage) * (1 + (this.wave - 1) * 0.08))),
      xpValue: overrides.xpValue ?? profile.xp,
      radius: overrides.radius ?? profile.radius,
      color: overrides.color ?? profile.color,
      accent: overrides.accent ?? profile.accent,
      shape: overrides.shape ?? profile.shape,
      hitFlash: 0,
      knockbackX: 0,
      knockbackZ: 0,
      rotationY: 0,
    };

    this.enemies.push(enemy);
    return enemy;
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
      isBoss: true,
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

  firePsybeam(direction = { x: 0, z: -1 }, { force = false } = {}) {
    if (this.status !== 'running' || !this.player.alive) {
      return { fired: false, reason: 'not-running', beams: [], hits: [], defeated: [] };
    }
    if (!force && this.psybeamCooldown > 0) {
      return { fired: false, reason: 'cooldown', beams: [], hits: [], defeated: [] };
    }

    let dirX = Number(direction?.x) || 0;
    let dirZ = Number(direction?.z) || 0;
    const len = Math.hypot(dirX, dirZ);
    if (len > 0.0001) {
      dirX /= len;
      dirZ /= len;
    } else {
      dirX = 0;
      dirZ = -1;
    }

    this.player.rotationY = Math.atan2(dirX, dirZ);
    this.psybeamCooldown = this.stats.psybeam.cooldown;

    const baseAngle = Math.atan2(dirZ, dirX);
    const beamCount = this.stats.psybeam.beams;
    const spread = this.stats.psybeam.spreadRadians;
    const range = this.stats.psybeam.range;
    const halfWidth = this.stats.psybeam.width * 0.5;
    const baseDamage = this.stats.psybeam.damage;
    const knockback = this.stats.psybeam.knockback;
    const pierce = this.stats.psybeam.pierce;

    const beams = [];
    const hits = [];
    const defeated = [];
    const hitCountByEnemy = new Map();

    for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
      const offsetIndex = beamIndex - (beamCount - 1) / 2;
      const angle = baseAngle + offsetIndex * spread;
      const rayX = Math.cos(angle);
      const rayZ = Math.sin(angle);
      const startX = this.player.x;
      const startZ = this.player.z;
      const endX = startX + rayX * range;
      const endZ = startZ + rayZ * range;

      const candidates = [];
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        const relX = enemy.x - startX;
        const relZ = enemy.z - startZ;
        const projection = relX * rayX + relZ * rayZ;
        if (projection < -enemy.radius * 0.5 || projection > range + enemy.radius) continue;

        const clampedProj = clamp(projection, 0, range);
        const closestX = startX + rayX * clampedProj;
        const closestZ = startZ + rayZ * clampedProj;
        const distSq = (enemy.x - closestX) ** 2 + (enemy.z - closestZ) ** 2;
        const hitRadius = enemy.radius + halfWidth;

        if (distSq <= hitRadius * hitRadius) {
          candidates.push({ enemy, distance: Math.max(0, projection) });
        }
      }

      candidates.sort((a, b) => a.distance - b.distance);
      const piercedTargets = candidates.slice(0, pierce);
      const effectiveLength = piercedTargets.length >= pierce
        ? clamp(piercedTargets[piercedTargets.length - 1].distance + 0.4, 1.5, range)
        : range;

      beams.push({
        startX,
        startZ,
        endX: startX + rayX * effectiveLength,
        endZ: startZ + rayZ * effectiveLength,
        dirX: rayX,
        dirZ: rayZ,
        length: effectiveLength,
        width: this.stats.psybeam.width,
      });

      for (const { enemy } of piercedTargets) {
        if (enemy.hp <= 0) continue;
        const priorHits = hitCountByEnemy.get(enemy.id) ?? 0;
        const damage = priorHits === 0 ? baseDamage : Math.max(1, Math.round(baseDamage * 0.5));
        hitCountByEnemy.set(enemy.id, priorHits + 1);

        enemy.hp = Math.max(0, enemy.hp - damage);
        enemy.hitFlash = 0.18;
        const kbFactor = enemy.isBoss ? 0.35 : 1;
        enemy.knockbackX += rayX * knockback * kbFactor;
        enemy.knockbackZ += rayZ * knockback * kbFactor;
        this.totalDamageDealt += damage;

        hits.push({
          enemyId: enemy.id,
          species: enemy.species,
          x: enemy.x,
          z: enemy.z,
          damage,
          remainingHp: enemy.hp,
          defeated: enemy.hp <= 0,
        });
      }
    }

    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (enemy.hp > 0) continue;

      this.enemies.splice(index, 1);
      this.kills += 1;
      const orb = this.spawnOrb({
        x: enemy.x,
        z: enemy.z,
        value: enemy.xpValue,
      });
      defeated.push({
        enemyId: enemy.id,
        species: enemy.species,
        isBoss: enemy.isBoss,
        x: enemy.x,
        z: enemy.z,
        color: enemy.color,
        orbId: orb.id,
      });

      if (enemy.isBoss) {
        this.bossDefeated = true;
        this.status = 'victory';
      }
    }

    return {
      fired: true,
      beams,
      hits,
      defeated,
    };
  }

  damagePlayer(amount, sourceEnemy = null) {
    if (!this.player.alive || this.status !== 'running') return { damaged: false, hp: this.player.hp };
    if (this.player.invulnerableTimer > 0) return { damaged: false, reason: 'invulnerable', hp: this.player.hp };

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

  rollUpgradeChoices(count = 3) {
    const available = RUN_UPGRADES.filter((upgrade) => {
      const currentRank = this.runUpgrades[upgrade.id] ?? 0;
      return currentRank < upgrade.maxRank;
    });

    const pool = [...available];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    return pool.slice(0, Math.max(1, count)).map((upgrade) => {
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
      orbsPicked: [],
      playerDamaged: null,
      leveledUp: false,
      bossSpawned: null,
    };

    const dt = Math.max(0, Number(delta) || 0);
    if (dt === 0 || this.status !== 'running' || !this.player.alive) {
      return events;
    }

    this.elapsedSeconds += dt;
    this.psybeamCooldown = Math.max(0, this.psybeamCooldown - dt);
    this.player.invulnerableTimer = Math.max(0, this.player.invulnerableTimer - dt);
    this.player.hitFlash = Math.max(0, this.player.hitFlash - dt);

    // Movimiento del jugador
    const moveX = Number(input.movement?.x) || 0;
    const moveZ = Number(input.movement?.z) || 0;
    const moveLen = Math.hypot(moveX, moveZ);
    if (moveLen > 0.0001) {
      const normX = moveLen > 1 ? moveX / moveLen : moveX;
      const normZ = moveLen > 1 ? moveZ / moveLen : moveZ;
      this.player.x = clamp(this.player.x + normX * this.stats.moveSpeed * dt, -this.worldLimit, this.worldLimit);
      this.player.z = clamp(this.player.z + normZ * this.stats.moveSpeed * dt, -this.worldLimit, this.worldLimit);
    }

    if (Number.isFinite(input.height)) {
      this.player.height = Math.max(0, input.height);
    }

    if (input.aimDirection) {
      const ax = Number(input.aimDirection.x) || 0;
      const az = Number(input.aimDirection.z) || 0;
      if (ax * ax + az * az > 0.0001) {
        this.player.rotationY = Math.atan2(ax, az);
      }
    }

    // Disparo continuo si el jugador mantiene pulsado el ataque
    if (input.primaryFireHeld && this.psybeamCooldown <= 0) {
      const fireResult = this.firePsybeam(input.aimDirection ?? { x: 0, z: -1 });
      if (fireResult.fired) {
        events.beams.push(...fireResult.beams);
        events.hits.push(...fireResult.hits);
        events.defeated.push(...fireResult.defeated);
      }
      if (this.status !== 'running') return events;
    }

    // Progresión de oleadas y aparición de la horda
    const nextWave = 1 + Math.floor(this.elapsedSeconds / HORDE_CONFIG.waveDurationSeconds);
    if (nextWave > this.wave) {
      this.wave = nextWave;
      this.spawnHordeWave(2 + Math.min(4, this.wave));
    }

    if (!this.bossSpawned && this.elapsedSeconds >= this.bossSpawnSeconds) {
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

    // Movimiento, separación y colisión de los enemigos
    this.#updateEnemies(dt, events);
    if (this.status !== 'running') return events;

    // Imán y recogida de orbes de experiencia
    this.#updateOrbs(dt, events);

    return events;
  }

  #updateEnemies(dt, events) {
    const count = this.enemies.length;

    for (let i = 0; i < count; i += 1) {
      const enemy = this.enemies[i];
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

      const dx = this.player.x - enemy.x;
      const dz = this.player.z - enemy.z;
      const dist = Math.hypot(dx, dz) || 0.0001;
      const dirX = dx / dist;
      const dirZ = dz / dist;

      enemy.rotationY = Math.atan2(dirX, dirZ);
      enemy.x += (dirX * enemy.speed + enemy.knockbackX) * dt;
      enemy.z += (dirZ * enemy.speed + enemy.knockbackZ) * dt;

      const decay = Math.exp(-dt * 9);
      enemy.knockbackX *= decay;
      enemy.knockbackZ *= decay;

      enemy.x = clamp(enemy.x, -this.worldLimit, this.worldLimit);
      enemy.z = clamp(enemy.z, -this.worldLimit, this.worldLimit);
    }

    // Separación suave entre enemigos para evitar que colapsen en un único punto
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

    // Daño por contacto contra el jugador
    for (const enemy of this.enemies) {
      const dx = this.player.x - enemy.x;
      const dz = this.player.z - enemy.z;
      const hitDistance = this.player.radius + enemy.radius;
      const verticalReach = enemy.isBoss ? 1.55 : 0.85;
      if (this.player.height <= verticalReach && dx * dx + dz * dz <= hitDistance * hitDistance) {
        const result = this.damagePlayer(enemy.contactDamage, enemy);
        if (result.damaged) {
          events.playerDamaged = {
            ...result,
            enemyId: enemy.id,
            species: enemy.species,
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
      orbsCollected: this.orbsCollected,
      activeEnemies: this.enemies.length,
      psybeamDamage: this.stats.psybeam.damage,
      psybeamBeams: this.stats.psybeam.beams,
      psybeamCooldown: this.stats.psybeam.cooldown,
      activeUpgrades,
      pendingChoices: this.pendingChoices ? [...this.pendingChoices] : null,
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
    const elapsedSeconds = Math.max(0, Math.floor(this.elapsedSeconds));
    const coins = Math.max(
      6,
      Math.floor(elapsedSeconds * 0.45) + this.kills * 2 + (this.level - 1) * 6 + (victory ? 70 : 0),
    );
    const tickets = (victory ? 2 : 0) + (this.kills >= 10 || elapsedSeconds >= 45 ? 1 : 0);
    const gems = victory ? 1 : 0;

    return {
      victory,
      elapsedSeconds,
      kills: this.kills,
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
