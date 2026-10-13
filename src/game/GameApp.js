import * as THREE from 'three';
import { HybridControls } from './HybridControls.js';
import { RunSession } from './RunSession.js';

const WORLD_LIMIT = 52;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Escena 3D Three.js para PokeBattle Survivor v0.2:
 * bosque procedural, compañero, hordas regionales, Psicorrayo con daño,
 * orbes de experiencia y retroalimentación visual de combate.
 */
export class GameApp {
  constructor(
    container,
    {
      onPauseChange = () => {},
      onHudUpdate = () => {},
      onLevelUp = () => {},
      onRunEnd = () => {},
    } = {},
  ) {
    this.container = container;
    this.onPauseChange = onPauseChange;
    this.onHudUpdate = onHudUpdate;
    this.onLevelUp = onLevelUp;
    this.onRunEnd = onRunEnd;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Arena 3D: WASD mueve, el ratón apunta, clic dispara Psicorrayo y 1-3 elige mejoras',
    );
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = null;
    this.camera = null;
    this.player = null;
    this.playerBodyMaterial = null;
    this.controls = null;
    this.session = null;
    this.running = false;
    this.paused = false;
    this.frameId = 0;
    this.elapsed = 0;
    this.lastHudSignature = '';
    this.height = 0;
    this.verticalVelocity = 0;
    this.effects = [];
    this.enemyVisuals = new Map();
    this.orbVisuals = new Map();
    this.clock = new THREE.Clock();

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  start(runConfig) {
    this.stop();
    this.runConfig = runConfig;
    this.session = new RunSession(runConfig, {
      worldLimit: WORLD_LIMIT,
      random: this.seededRandom(1337 + (runConfig.regionId?.length ?? 5) * 97),
    });

    this.createScene(runConfig);
    this.container.classList.add('is-active');
    this.container.setAttribute('aria-hidden', 'false');
    this.running = true;
    this.paused = false;
    this.elapsed = 0;
    this.lastHudSignature = '';
    this.height = 0;
    this.verticalVelocity = 0;
    this.effects = [];

    this.syncEnemies(0);
    this.syncOrbs(0);

    this.controls = new HybridControls({
      element: this.renderer.domElement,
      camera: this.camera,
      player: this.player,
      onPrimaryFire: ({ direction }) => this.fireAimedMove(direction),
      onJump: () => {},
      onPause: () => {
        if (this.session?.isPausedForChoice) return;
        this.setPaused(!this.paused);
      },
      onSelectUpgrade: (index) => this.chooseUpgrade(index),
    });

    this.clock.start();
    this.renderer.domElement.focus({ preventScroll: true });
    this.onPauseChange(false);
    this.emitHudUpdate(true);
    this.frameId = requestAnimationFrame(() => this.frame());
  }

  createScene(runConfig) {
    const palette = runConfig.palette ?? ['#9bdc83', '#477956', '#dec17e'];
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#111a18');
    this.scene.fog = new THREE.Fog('#111a18', 32, 110);

    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 180);
    this.camera.position.set(0, 18, 14);
    this.camera.lookAt(0, 0, 0);

    const ambient = new THREE.HemisphereLight('#d6f4dc', '#304437', 2.25);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff0d0', 3.1);
    sun.position.set(-12, 22, 9);
    this.scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      new THREE.MeshStandardMaterial({ color: palette[1], roughness: 1, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(180, 72, '#c3e8b1', '#a7c89d');
    grid.position.y = -0.045;
    grid.material.transparent = true;
    grid.material.opacity = 0.11;
    this.scene.add(grid);

    this.addForest(palette);
    this.addPlayer(runConfig.starter);
    this.addTargetMarker();
    this.handleResize();
  }

  addForest(palette) {
    const [leafColor, trunkColor, highlight] = palette;
    const random = this.seededRandom(241);
    const leafTones = [leafColor, highlight, '#5eaa70', '#85c781'];

    for (let index = 0; index < 68; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 10 + random() * 42;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 1.2 + random() * 1.2;
      const tree = new THREE.Group();
      tree.position.set(x, 0, z);
      tree.rotation.y = random() * Math.PI * 2;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.2, height, 5),
        new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 1 }),
      );
      trunk.position.y = height / 2;
      tree.add(trunk);

      const crown = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.72 + random() * 0.32, 0),
        new THREE.MeshStandardMaterial({ color: leafTones[Math.floor(random() * leafTones.length)], roughness: 0.9 }),
      );
      crown.position.y = height + 0.45;
      crown.scale.set(1, 0.92 + random() * 0.22, 0.95);
      tree.add(crown);
      this.scene.add(tree);
    }
  }

  addPlayer(starter) {
    this.player = new THREE.Group();
    this.player.position.set(0, 0, 0);

    this.playerBodyMaterial = new THREE.MeshStandardMaterial({
      color: starter.color,
      roughness: 0.3,
      metalness: 0.08,
      emissive: starter.color,
      emissiveIntensity: 0.14,
    });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), this.playerBodyMaterial);
    body.position.y = 0.72;
    body.scale.set(1, 0.95, 0.9);
    this.player.add(body);

    const crestMaterial = new THREE.MeshStandardMaterial({
      color: starter.accent,
      roughness: 0.28,
      emissive: starter.accent,
      emissiveIntensity: 0.18,
    });
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.4, 5), crestMaterial);
    crest.position.set(0, 0.74, 0.55);
    crest.rotation.x = Math.PI / 2;
    this.player.add(crest);

    const orbit = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({ color: '#fff1b5', emissive: '#ffcf67', emissiveIntensity: 0.8 }),
    );
    orbit.position.set(0.63, 1.04, 0);
    this.player.add(orbit);

    this.scene.add(this.player);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 28),
      new THREE.MeshBasicMaterial({ color: '#07100b', transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.015;
    this.scene.add(this.playerShadow);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.79, 0.025, 6, 36),
      new THREE.MeshBasicMaterial({ color: starter.accent, transparent: true, opacity: 0.74 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.player.add(ring);
    this.playerRing = ring;
  }

  addTargetMarker() {
    this.targetMarker = new THREE.Mesh(
      new THREE.RingGeometry(0.39, 0.47, 32),
      new THREE.MeshBasicMaterial({ color: '#dcffe6', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    this.targetMarker.rotation.x = -Math.PI / 2;
    this.targetMarker.position.set(0, 0.035, -7);
    this.scene.add(this.targetMarker);
  }

  fireAimedMove(direction) {
    if (!this.running || this.paused || !this.session || this.session.status !== 'running') return;

    const result = this.session.firePsybeam(direction);
    if (!result.fired) return;

    this.spawnBeamEffects(result.beams);
    this.spawnHitEffects(result.hits);
    this.spawnDefeatEffects(result.defeated);
    this.syncEnemies(0);
    this.syncOrbs(0);
    this.emitHudUpdate(true);

    if (this.session.isFinished) {
      this.finishRun();
    }
  }

  chooseUpgrade(selection) {
    if (!this.running || !this.session || this.session.status !== 'level-up') return false;

    const result = this.session.chooseUpgrade(selection);
    if (!result.ok) return false;

    this.controls?.clearKeys();
    this.spawnLevelUpEffect('#c7f27b');
    this.emitHudUpdate(true);
    this.onLevelUp(this.session.pendingChoices);
    if (this.session.status === 'running') {
      this.renderer.domElement.focus({ preventScroll: true });
    }
    return true;
  }

  frame() {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(() => this.frame());

    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  update(delta) {
    if (!this.controls || !this.player || !this.session) return;
    this.elapsed += delta;
    this.updateEffects(delta);

    if (this.session.status === 'level-up') {
      this.playerRing.rotation.z += delta * 1.1;
      this.syncOrbs(delta);
      return;
    }

    if (this.session.isFinished) {
      this.finishRun();
      return;
    }

    if (this.controls.consumeJumpRequest() && this.height <= 0.001) {
      this.verticalVelocity = 8.6;
    }

    const isFlying = this.runConfig.starter.types.includes('Volador');
    const gliding = isFlying && this.height > 0 && this.controls.isJumpHeld();
    this.verticalVelocity -= (gliding ? 5.8 : 21) * delta;
    this.height = Math.max(0, this.height + this.verticalVelocity * delta);
    if (this.height === 0) this.verticalVelocity = 0;

    this.controls.updateAim();
    const movement = this.controls.getMovementVector();
    const aimDirection = this.controls.aimDirection;

    const events = this.session.update(delta, {
      movement,
      aimDirection,
      height: this.height,
      primaryFireHeld: this.controls.isPrimaryFireHeld(),
    });

    if (events.beams.length > 0) this.spawnBeamEffects(events.beams);
    if (events.hits.length > 0) this.spawnHitEffects(events.hits);
    if (events.defeated.length > 0) this.spawnDefeatEffects(events.defeated);
    if (events.orbsPicked.length > 0) this.spawnOrbPickupEffects(events.orbsPicked);
    if (events.playerDamaged) this.spawnPlayerHitEffect();
    if (events.bossSpawned) this.spawnLevelUpEffect('#ff7be5');

    this.player.position.set(
      this.session.player.x,
      this.height + Math.sin(this.elapsed * 3.2) * 0.045,
      this.session.player.z,
    );
    this.player.rotation.y = this.session.player.rotationY;

    if (this.playerBodyMaterial) {
      if (this.session.player.hitFlash > 0) {
        this.playerBodyMaterial.emissive.set('#ff5c77');
        this.playerBodyMaterial.emissiveIntensity = 0.85;
      } else if (this.session.player.invulnerableTimer > 0) {
        const blink = 0.22 + Math.abs(Math.sin(this.elapsed * 24)) * 0.45;
        this.playerBodyMaterial.emissive.set(this.runConfig.starter.accent);
        this.playerBodyMaterial.emissiveIntensity = blink;
      } else {
        this.playerBodyMaterial.emissive.set(this.runConfig.starter.color);
        this.playerBodyMaterial.emissiveIntensity = 0.14;
      }
    }

    this.controls.updateAim();
    this.targetMarker.position.set(this.controls.aimPoint.x, 0.035, this.controls.aimPoint.z);

    this.playerShadow.position.set(this.player.position.x, 0.015, this.player.position.z);
    this.playerShadow.material.opacity = 0.42 - clamp01(this.height / 5) * 0.22;
    this.playerRing.rotation.z += delta * 0.55;

    const cameraTarget = new THREE.Vector3(this.player.position.x, 0, this.player.position.z);
    const desiredCameraPosition = new THREE.Vector3(
      this.player.position.x,
      18 + this.height * 0.3,
      this.player.position.z + 14,
    );
    this.camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 4.5));
    this.camera.lookAt(cameraTarget);

    this.syncEnemies(delta);
    this.syncOrbs(delta);
    this.emitHudUpdate(false);

    if (events.leveledUp && this.session.status === 'level-up') {
      this.controls.clearKeys();
      this.spawnLevelUpEffect('#ffe07d');
      this.onLevelUp(this.session.pendingChoices);
    }

    if (this.session.isFinished) {
      this.finishRun();
    }
  }

  syncEnemies() {
    if (!this.scene || !this.session) return;

    const activeIds = new Set();
    for (const enemy of this.session.enemies) {
      activeIds.add(enemy.id);
      let visual = this.enemyVisuals.get(enemy.id);
      if (!visual) {
        visual = this.createEnemyVisual(enemy);
        this.enemyVisuals.set(enemy.id, visual);
        this.scene.add(visual.group);
      }

      const bob = Math.sin(this.elapsed * (enemy.isBoss ? 3.5 : 6.2) + enemy.x * 0.5) * 0.05;
      visual.group.position.set(enemy.x, Math.max(0, bob), enemy.z);
      visual.bodyGroup.rotation.y = enemy.rotationY;

      const hpRatio = clamp01(enemy.hp / enemy.maxHp);
      visual.hpFill.scale.x = Math.max(0.001, hpRatio);
      visual.hpFill.position.x = -(1 - hpRatio) * visual.barWidth * 0.5;
      visual.hpFill.material.color.set(hpRatio > 0.45 ? '#a9edbb' : hpRatio > 0.2 ? '#ffc66d' : '#ff6b7b');

      if (enemy.hitFlash > 0) {
        visual.bodyMaterial.emissive.set('#ffffff');
        visual.bodyMaterial.emissiveIntensity = 0.85;
        visual.bodyGroup.scale.setScalar(1.08);
      } else {
        visual.bodyMaterial.emissive.set(enemy.color);
        visual.bodyMaterial.emissiveIntensity = enemy.isBoss ? 0.28 : 0.12;
        visual.bodyGroup.scale.setScalar(1);
      }
    }

    for (const [enemyId, visual] of this.enemyVisuals.entries()) {
      if (!activeIds.has(enemyId)) {
        this.disposeObjectGroup(visual.group);
        this.enemyVisuals.delete(enemyId);
      }
    }
  }

  createEnemyVisual(enemy) {
    const group = new THREE.Group();
    const bodyGroup = new THREE.Group();
    group.add(bodyGroup);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: enemy.color,
      roughness: 0.42,
      metalness: 0.08,
      emissive: enemy.color,
      emissiveIntensity: enemy.isBoss ? 0.28 : 0.12,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: enemy.accent,
      roughness: 0.35,
      emissive: enemy.accent,
      emissiveIntensity: 0.24,
    });

    const scale = enemy.isBoss ? 1.55 : 1;

    if (enemy.shape === 'larva' || enemy.shape === 'stinger') {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36 * scale, 12, 10), bodyMaterial);
      head.position.set(0, 0.42 * scale, 0.18 * scale);
      bodyGroup.add(head);

      const seg1 = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 10, 8), bodyMaterial);
      seg1.position.set(0, 0.34 * scale, -0.18 * scale);
      bodyGroup.add(seg1);

      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11 * scale, 0.32 * scale, 5), accentMaterial);
      horn.position.set(0, 0.68 * scale, 0.34 * scale);
      horn.rotation.x = Math.PI / 4;
      bodyGroup.add(horn);
    } else if (enemy.shape === 'boss') {
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.72 * scale, 1), bodyMaterial);
      core.position.y = 0.95;
      bodyGroup.add(core);

      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 8, 28), accentMaterial);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = 0.95;
      bodyGroup.add(crown);
    } else {
      const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(0.44 * scale, 0), bodyMaterial);
      torso.position.y = 0.48 * scale;
      bodyGroup.add(torso);

      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.26 * scale, 0.18 * scale, 0.38 * scale), accentMaterial);
      crest.position.set(0, 0.62 * scale, 0.22 * scale);
      bodyGroup.add(crest);
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(enemy.radius * 1.05, 20),
      new THREE.MeshBasicMaterial({ color: '#060d0a', transparent: true, opacity: 0.38, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    group.add(shadow);

    const barWidth = enemy.isBoss ? 1.5 : 0.86;
    const barHeight = enemy.isBoss ? 0.11 : 0.075;
    const barY = enemy.isBoss ? 2.15 : 1.18;

    const hpBg = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth, barHeight),
      new THREE.MeshBasicMaterial({ color: '#0d1714', transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    hpBg.position.set(0, barY, 0);
    hpBg.rotation.x = -Math.PI / 5;
    group.add(hpBg);

    const hpFill = new THREE.Mesh(
      new THREE.PlaneGeometry(barWidth, barHeight * 0.72),
      new THREE.MeshBasicMaterial({ color: '#a9edbb', side: THREE.DoubleSide }),
    );
    hpFill.position.set(0, barY, 0.005);
    hpFill.rotation.x = -Math.PI / 5;
    group.add(hpFill);

    return {
      group,
      bodyGroup,
      bodyMaterial,
      hpFill,
      barWidth,
    };
  }

  syncOrbs(delta) {
    if (!this.scene || !this.session) return;

    const activeIds = new Set();
    for (const orb of this.session.orbs) {
      activeIds.add(orb.id);
      let visual = this.orbVisuals.get(orb.id);
      if (!visual) {
        visual = this.createOrbVisual(orb);
        this.orbVisuals.set(orb.id, visual);
        this.scene.add(visual.group);
      }

      const hover = 0.28 + Math.sin(this.elapsed * 4.5 + orb.age * 3) * 0.08;
      visual.group.position.set(orb.x, hover, orb.z);
      visual.gem.rotation.y += delta * (orb.magnetized ? 6.5 : 2.6);
      visual.gem.rotation.x += delta * 1.4;
    }

    for (const [orbId, visual] of this.orbVisuals.entries()) {
      if (!activeIds.has(orbId)) {
        this.disposeObjectGroup(visual.group);
        this.orbVisuals.delete(orbId);
      }
    }
  }

  createOrbVisual(orb) {
    const group = new THREE.Group();
    const isHighValue = orb.value >= 50;
    const color = isHighValue ? '#ffd166' : '#7bf2c7';
    const emissive = isHighValue ? '#ffae34' : '#3cd6a5';

    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(orb.radius, 0),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 0.75,
        roughness: 0.18,
        metalness: 0.15,
      }),
    );
    group.add(gem);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(orb.radius * 0.9, orb.radius * 1.35, 18),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.48,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -0.22;
    group.add(halo);

    return { group, gem, halo };
  }

  spawnBeamEffects(beams) {
    if (!this.scene) return;
    const beamY = 0.76 + this.height;

    for (const beamData of beams) {
      const start = new THREE.Vector3(beamData.startX, beamY, beamData.startZ);
      const end = new THREE.Vector3(beamData.endX, beamY, beamData.endZ);
      const delta = end.clone().sub(start);
      const length = Math.max(0.2, delta.length());
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      );

      // Núcleo psíquico brillante
      const coreMaterial = new THREE.MeshBasicMaterial({
        color: '#ffe6fa',
        transparent: true,
        opacity: 0.96,
        depthWrite: false,
      });
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.09, length, 8, 1, true),
        coreMaterial,
      );
      core.position.copy(midpoint);
      core.quaternion.copy(orientation);
      this.scene.add(core);
      this.effects.push({ mesh: core, ttl: 0.16, remaining: 0.16 });

      // Aura exterior de Psicorrayo
      const auraRadius = Math.max(0.12, beamData.width * 0.24);
      const auraMaterial = new THREE.MeshBasicMaterial({
        color: '#ff7be5',
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
      });
      const aura = new THREE.Mesh(
        new THREE.CylinderGeometry(auraRadius * 0.65, auraRadius, length, 10, 1, true),
        auraMaterial,
      );
      aura.position.copy(midpoint);
      aura.quaternion.copy(orientation);
      this.scene.add(aura);
      this.effects.push({ mesh: aura, ttl: 0.21, remaining: 0.21 });
    }
  }

  spawnHitEffects(hits) {
    if (!this.scene) return;
    for (const hit of hits) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.46, 20),
        new THREE.MeshBasicMaterial({
          color: '#ff9ef0',
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(hit.x, 0.12, hit.z);
      this.scene.add(ring);
      this.effects.push({ mesh: ring, ttl: 0.2, remaining: 0.2, grow: 2.2 });
    }
  }

  spawnDefeatEffects(defeated) {
    if (!this.scene) return;
    for (const enemy of defeated) {
      const burst = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.65, 24),
        new THREE.MeshBasicMaterial({
          color: enemy.color || '#c7f27b',
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      burst.rotation.x = -Math.PI / 2;
      burst.position.set(enemy.x, 0.08, enemy.z);
      this.scene.add(burst);
      this.effects.push({ mesh: burst, ttl: 0.28, remaining: 0.28, grow: 2.8 });
    }
  }

  spawnOrbPickupEffects(orbsPicked) {
    if (!this.scene) return;
    for (const picked of orbsPicked) {
      const spark = new THREE.Mesh(
        new THREE.RingGeometry(0.14, 0.32, 16),
        new THREE.MeshBasicMaterial({
          color: '#7bf2c7',
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      spark.rotation.x = -Math.PI / 2;
      spark.position.set(picked.x, 0.1, picked.z);
      this.scene.add(spark);
      this.effects.push({ mesh: spark, ttl: 0.18, remaining: 0.18, grow: 2.0 });
    }
  }

  spawnPlayerHitEffect() {
    if (!this.scene || !this.player) return;
    const wave = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.85, 28),
      new THREE.MeshBasicMaterial({
        color: '#ff6b7b',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    wave.rotation.x = -Math.PI / 2;
    wave.position.set(this.player.position.x, 0.08, this.player.position.z);
    this.scene.add(wave);
    this.effects.push({ mesh: wave, ttl: 0.25, remaining: 0.25, grow: 2.4 });
  }

  spawnLevelUpEffect(color = '#ffe07d') {
    if (!this.scene || !this.player) return;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.98, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.set(this.player.position.x, 0.09, this.player.position.z);
    this.scene.add(halo);
    this.effects.push({ mesh: halo, ttl: 0.42, remaining: 0.42, grow: 3.1 });
  }

  updateEffects(delta) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.remaining -= delta;
      const ratio = Math.max(0, effect.remaining / effect.ttl);
      effect.mesh.material.opacity = ratio;
      if (effect.grow) {
        const scale = 1 + (1 - ratio) * effect.grow;
        effect.mesh.scale.setScalar(scale);
      }
      if (effect.remaining <= 0) {
        this.scene?.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        this.effects.splice(index, 1);
      }
    }
  }

  emitHudUpdate(force = false) {
    if (!this.session) return;
    const snapshot = this.session.getHudSnapshot();
    const signature = [
      snapshot.elapsedSeconds,
      snapshot.wave,
      snapshot.status,
      snapshot.hp,
      snapshot.maxHp,
      snapshot.level,
      snapshot.xp,
      snapshot.xpToNext,
      snapshot.kills,
      snapshot.orbsCollected,
      snapshot.activeEnemies,
      snapshot.boss?.hp ?? 0,
      snapshot.activeUpgrades.map((u) => `${u.id}:${u.rank}`).join(','),
    ].join('|');

    if (force || signature !== this.lastHudSignature) {
      this.lastHudSignature = signature;
      this.onHudUpdate(snapshot);
    }
  }

  finishRun() {
    if (!this.session) return;
    const result = this.session.buildRunResult();
    this.stop();
    this.onRunEnd(result);
  }

  extractCurrentRun() {
    if (!this.session) return null;
    const result = this.session.buildRunResult();
    this.stop();
    return result;
  }

  setPaused(paused) {
    if (!this.running || this.paused === paused) return;
    this.paused = paused;
    if (paused) this.controls?.clearKeys();
    this.onPauseChange(paused);
  }

  handleResize() {
    if (!this.renderer || !this.camera) {
      this.renderer?.setSize(window.innerWidth, window.innerHeight);
      return;
    }
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  disposeObjectGroup(group) {
    if (!group) return;
    group.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
      else object.material?.dispose();
    });
    this.scene?.remove(group);
  }

  stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.running = false;
    this.paused = false;
    this.controls?.dispose();
    this.controls = null;
    this.enemyVisuals.clear();
    this.orbVisuals.clear();
    this.disposeScene();
    this.container.classList.remove('is-active');
    this.container.setAttribute('aria-hidden', 'true');
  }

  disposeScene() {
    if (!this.scene) return;
    this.scene.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
      else object.material?.dispose();
    });
    this.scene.clear();
    this.scene = null;
    this.camera = null;
    this.player = null;
    this.playerBodyMaterial = null;
    this.effects = [];
  }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this.handleResize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }
}
