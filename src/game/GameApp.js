import { getPokemonGlbCandidateUrls } from '../data/gddSystems.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { HybridControls } from './HybridControls.js';
import { RunSession } from './RunSession.js';
import { CAMERA_RIG, MOUSE_LOOK, normalizeSensitivity, thirdPersonCameraPose } from './cameraRig.js';

const WORLD_LIMIT = 52;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * Escena 3D Three.js para PokeBattle Survivor v0.4:
 * bosque procedural, compañero con movimientos propios, hordas regionales con élites,
 * minijefe a los 4 min, ataque automático y especial (Q) con enfriamiento visible,
 * cámara baja de tercera persona, orbes de experiencia, esquiva (Shift) y retirada táctica.
 */
export class GameApp {
  constructor(
    container,
    {
      onPauseChange = () => {},
      onHudUpdate = () => {},
      onLevelUp = () => {},
      onRunEnd = () => {},
      onExtractRequest = () => {},
      onPointerLockChange = () => {},
    } = {},
  ) {
    this.container = container;
    this.onPauseChange = onPauseChange;
    this.onHudUpdate = onHudUpdate;
    this.onLevelUp = onLevelUp;
    this.onRunEnd = onRunEnd;
    this.onExtractRequest = onExtractRequest;
    this.onPointerLockChange = onPointerLockChange;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Arena 3D: WASD se mueve según la cámara, ratón con captura mueve la cámara, Q especial (desbloqueable), Shift esquiva (desbloqueable), Espacio salta, Esc pausa y 1-3 elige mejoras',
    );
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = null;
    this.camera = null;
    this.cameraYaw = Math.PI;
    this.cameraPitch = CAMERA_RIG.defaultPitch;
    this.mouseSensitivity = MOUSE_LOOK.defaultSensitivity;
    this.player = null;
    this.playerBodyMaterial = null;
    this.playerRing = null;
    this.playerShadow = null;
    this.targetMarker = null;
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
    this.chestVisuals = new Map();
    this.shrineVisuals = new Map();
    this.bossPortalMesh = null;
    this.playerWorldHpFill = null;
    this.bossMarker = null;
    this.miniBossMarker = null;
    this.dashTrail = null;
    this.clock = new THREE.Clock();
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.glbCache = new Map();
    this.glbPending = new Map();
    this.activeMixers = [];
    this.aimLaserLine = null;

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  start(runConfig, { mouseSensitivity = this.mouseSensitivity } = {}) {
    this.stop();
    this.mouseSensitivity = normalizeSensitivity(mouseSensitivity);
    this.runConfig = runConfig;
    this.session = new RunSession(runConfig, {
      worldLimit: WORLD_LIMIT,
      initialEnemies: 18,
      maxActiveEnemies: 75,
      random: this.seededRandom(1337 + (runConfig.regionId?.length ?? 5) * 97),
    });
    // En la vista 3D estilo Megabonk damos un plus de agilidad al jugador para surfear las colinas
    this.session.stats.moveSpeed *= 1.28;

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
    this.syncChests(0);
    this.syncShrines(0);

    this.controls = new HybridControls({
      element: this.renderer.domElement,
      cameraYaw: this.cameraYaw,
      cameraPitch: this.cameraPitch,
      mouseSensitivity: this.mouseSensitivity,
      onPointerLockChange: (locked, details) => this.onPointerLockChange(locked, details),
      onCameraLook: ({ yaw, pitch }) => {
        this.cameraYaw = yaw;
        this.cameraPitch = pitch;
      },
      canUseSpecial: () => Boolean(this.session?.unlockedSkills.special),
      canUseDash: () => Boolean(this.session?.unlockedSkills.dash),
      onLockedAbility: () => {},
      onPause: () => {
        if (this.session?.isPausedForChoice) return;
        this.setPaused(!this.paused);
      },
      onSelectUpgrade: (index) => this.chooseUpgrade(index),
    });
    this.controls.setEquippedItemConstraints({
      blocksStateMoves: Boolean(runConfig.equippedItem?.blocksStateMoves),
    });

    this.clock.start();
    this.renderer.domElement.focus({ preventScroll: true });
    this.onPauseChange(false);
    this.emitHudUpdate(true);
    this.frameId = requestAnimationFrame(() => this.frame());
  }

  createScene(runConfig) {
    const palette = runConfig.palette ?? ['#9bdc83', '#477956', '#dec17e'];
    const isDesertVolcano = runConfig.regionId === 'hoenn';
    const skyColor = isDesertVolcano ? '#e9b872' : (runConfig.regionId === 'johto' ? '#164e63' : '#1b4332');
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.FogExp2(skyColor, 0.014);

    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 220);
    this.cameraYaw = Math.PI;
    this.cameraPitch = CAMERA_RIG.defaultPitch;

    const ambient = new THREE.HemisphereLight('#d6f4dc', '#304437', 2.25);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff0d0', 3.1);
    sun.position.set(-12, 22, 9);
    this.scene.add(sun);

    const floorGeo = new THREE.PlaneGeometry(180, 180, 72, 72);
    const posAttr = floorGeo.attributes.position;
    for (let i = 0; i < posAttr.count; i += 1) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      // Plane is rotated -PI/2 around X, so world Z corresponds to -vy
      const worldZ = -vy;
      posAttr.setZ(i, this.getTerrainHeight(vx, worldZ));
    }
    floorGeo.computeVertexNormals();
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ color: palette[1], roughness: 0.92, metalness: 0.04, flatShading: true }),
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
    if (runConfig.regionId === 'hoenn') {
      this.addVolcanicAsh();
    }
    this.addPlayer(runConfig.starter);
    this.addTargetMarker();
    this.updateCamera(0, true);
    this.handleResize();
  }

  addVolcanicAsh() {
    if (!this.scene) return;
    const count = 220;
    const positions = new Float32Array(count * 3);
    const random = this.seededRandom(901);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (random() - 0.5) * 70;
      positions[i * 3 + 1] = random() * 14 + 0.5;
      positions[i * 3 + 2] = (random() - 0.5) * 70;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: '#ffd29d',
      size: 0.22,
      transparent: true,
      opacity: 0.68,
    });
    this.ashSystem = new THREE.Points(geometry, material);
    this.scene.add(this.ashSystem);
  }

  addForest(palette) {
    const [leafColor, trunkColor, highlight] = palette;
    const random = this.seededRandom(241);
    const leafTones = [leafColor, highlight, '#5eaa70', '#85c781'];

    for (let index = 0; index < 64; index += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 12 + random() * 40;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 3.2 + random() * 2.6;
      const tree = new THREE.Group();
      tree.position.set(x, this.getTerrainHeight(x, z), z);
      tree.rotation.y = random() * Math.PI * 2;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.48, height, 6),
        new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.92, flatShading: true }),
      );
      trunk.position.y = height / 2;
      tree.add(trunk);

      const crownColor = leafTones[Math.floor(random() * leafTones.length)];
      const crownMat = new THREE.MeshStandardMaterial({ color: crownColor, roughness: 0.82, flatShading: true });
      for (let c = 0; c < 3; c += 1) {
        const puff = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.35 + random() * 0.55, 1),
          crownMat,
        );
        puff.position.set((c - 1) * 0.65, height + (c === 1 ? 0.85 : 0.35), (random() - 0.5) * 0.5);
        tree.add(puff);
      }
      this.scene.add(tree);
    }

    // Arcos de Piedra Gigantes 3D en el horizonte (inspirados en la captura 1 de Megabonk)
    const archMat = new THREE.MeshStandardMaterial({ color: '#8d7b68', roughness: 0.9, flatShading: true });
    for (let a = 0; a < 4; a += 1) {
      const archAngle = (a / 4) * Math.PI * 2 + 0.4;
      const ax = Math.cos(archAngle) * 38;
      const az = Math.sin(archAngle) * 38;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(6.5, 1.35, 7, 14, Math.PI), archMat);
      arch.position.set(ax, this.getTerrainHeight(ax, az) - 0.5, az);
      arch.rotation.y = archAngle + Math.PI / 2;
      this.scene.add(arch);
    }

    // Rocas Low-Poly estilo Megabonk repartidas por las colinas
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: '#6c757d',
      roughness: 0.88,
      metalness: 0.08,
      flatShading: true,
    });
    for (let r = 0; r < 26; r += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 8 + random() * 40;
      const rx = Math.cos(angle) * radius;
      const rz = Math.sin(angle) * radius;
      const scale = 0.75 + random() * 1.35;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), rockMaterial);
      rock.position.set(rx, this.getTerrainHeight(rx, rz) + scale * 0.35, rz);
      rock.rotation.set(random() * 2, random() * 2, random() * 2);
      rock.scale.set(1.2, 0.78, 1.0);
      this.scene.add(rock);
    }
  }

  /**
   * Construye un modelo 3D articulado (cabeza, hocico, ojos 3D, orejas/alas, patas con animación de marcha y cola)
   * que se muestra al instante y sirve de chasis 3D mientras se descarga el archivo .glb oficial.
   */
  buildArticulated3dPokemonMesh({ color = '#80d79c', accent = '#c5ee88', scale = 1, isFlying = false } = {}) {
    const root = new THREE.Group();
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.38,
      metalness: 0.08,
      emissive: color,
      emissiveIntensity: 0.14,
      flatShading: true,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.32,
      emissive: accent,
      emissiveIntensity: 0.22,
      flatShading: true,
    });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const pupilMat = new THREE.MeshBasicMaterial({ color: '#111622' });

    // Torso 3D
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68 * scale, 0.58 * scale, 0.86 * scale), mainMat);
    torso.position.set(0, 0.52 * scale, 0);
    root.add(torso);

    // Caparazón / lomo acentuado
    const backShell = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42 * scale, 0), accentMat);
    backShell.position.set(0, 0.72 * scale, -0.05 * scale);
    backShell.scale.set(1.05, 0.65, 1.15);
    root.add(backShell);

    // Cabeza 3D mirando hacia +Z (convención de rotationY en RunSession)
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.58 * scale, 0.52 * scale, 0.56 * scale), mainMat);
    head.position.set(0, 0.86 * scale, 0.42 * scale);
    root.add(head);

    // Ojos 3D y Orejas/Cuernos
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085 * scale, 8, 8), eyeWhiteMat);
      eye.position.set(side * 0.2 * scale, 0.9 * scale, 0.68 * scale);
      root.add(eye);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045 * scale, 6, 6), pupilMat);
      pupil.position.set(side * 0.2 * scale, 0.9 * scale, 0.74 * scale);
      root.add(pupil);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.34 * scale, 5), accentMat);
      ear.position.set(side * 0.22 * scale, 1.22 * scale, 0.35 * scale);
      ear.rotation.z = side * -0.25;
      root.add(ear);

      if (isFlying) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.75 * scale, 0.08 * scale, 0.42 * scale), accentMat);
        wing.position.set(side * 0.62 * scale, 0.78 * scale, 0);
        wing.rotation.z = side * 0.3;
        root.add(wing);
      }
    }

    // Cola 3D
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16 * scale, 0.58 * scale, 5), accentMat);
    tail.position.set(0, 0.64 * scale, -0.58 * scale);
    tail.rotation.x = -Math.PI / 3;
    root.add(tail);

    // 4 Patas 3D articuladas
    const legs = [];
    const legOffsets = [
      [-0.24, 0.28],
      [0.24, 0.28],
      [-0.24, -0.28],
      [0.24, -0.28],
    ];
    for (const [lx, lz] of legOffsets) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, 0.36 * scale, 0.2 * scale), mainMat);
      leg.position.set(lx * scale, 0.18 * scale, lz * scale);
      root.add(leg);
      legs.push(leg);
    }

    return { root, mainMat, legs, tail };
  }

  /**
   * Descarga y clona modelos 3D reales (.glb) desde Pokemon-3D-api/assets con soporte de animaciones.
   */
  loadPokemon3dGlb(pokemonIdOrSpecies, { shiny = false, targetHeight = 1.45 } = {}, onReady) {
    const urls = getPokemonGlbCandidateUrls(pokemonIdOrSpecies, { shiny });
    const cacheKey = `${pokemonIdOrSpecies}:${shiny ? 'shiny' : 'reg'}`;

    const instantiateFromGltf = (gltf) => {
      const clone = SkeletonUtils.clone(gltf.scene);
      const box = new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      const maxDim = Math.max(0.001, size.y, size.x * 0.8, size.z * 0.8);
      const scale = targetHeight / maxDim;
      clone.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(clone);
      const scaledCenter = new THREE.Vector3();
      scaledBox.getCenter(scaledCenter);
      clone.position.x -= scaledCenter.x;
      clone.position.z -= scaledCenter.z;
      clone.position.y -= scaledBox.min.y;

      let mixer = null;
      if (Array.isArray(gltf.animations) && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(clone);
        const clip = gltf.animations[0];
        mixer.clipAction(clip).play();
        this.activeMixers.push(mixer);
      }
      onReady?.(clone, mixer);
    };

    if (this.glbCache.has(cacheKey)) {
      const cached = this.glbCache.get(cacheKey);
      if (cached) instantiateFromGltf(cached);
      return;
    }

    if (this.glbPending.has(cacheKey)) {
      this.glbPending.get(cacheKey).push(instantiateFromGltf);
      return;
    }

    this.glbPending.set(cacheKey, [instantiateFromGltf]);

    const tryNextUrl = (index) => {
      if (index >= urls.length) {
        this.glbCache.set(cacheKey, null);
        this.glbPending.delete(cacheKey);
        return;
      }
      this.gltfLoader.load(
        urls[index],
        (gltf) => {
          this.glbCache.set(cacheKey, gltf);
          const callbacks = this.glbPending.get(cacheKey) ?? [];
          this.glbPending.delete(cacheKey);
          for (const cb of callbacks) cb(gltf);
        },
        undefined,
        () => tryNextUrl(index + 1),
      );
    };

    tryNextUrl(0);
  }

  addPlayer(starter) {
    this.player = new THREE.Group();
    this.player.position.set(0, 0, 0);

    const isFlying = starter.types?.includes('Volador');
    const articulated = this.buildArticulated3dPokemonMesh({
      color: starter.color,
      accent: starter.accent,
      scale: 1.05,
      isFlying,
    });
    this.player.add(articulated.root);
    this.playerBodyMaterial = articulated.mainMat;
    this.playerArticulated = articulated;

    // Cargar el modelo 3D .glb real de tu Pokémon y reemplazar el chasis cuando esté listo
    this.loadPokemon3dGlb(
      starter.id,
      { shiny: Boolean(this.runConfig?.isShiny), targetHeight: 1.55 },
      (glbMesh) => {
        if (!this.player) return;
        articulated.root.visible = false;
        this.player.add(glbMesh);
      },
    );

    this.scene.add(this.player);

    this.playerShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.65, 28),
      new THREE.MeshBasicMaterial({ color: '#07100b', transparent: true, opacity: 0.42, depthWrite: false }),
    );
    this.playerShadow.rotation.x = -Math.PI / 2;
    this.playerShadow.position.y = 0.015;
    this.scene.add(this.playerShadow);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.038, 8, 36),
      new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.88 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    this.player.add(ring);
    this.playerRing = ring;

    // Barra de PS y Energía flotando bajo los pies del jugador (estilo Megabonk)
    const barGroup = new THREE.Group();
    barGroup.position.set(0, 0.12, 0.95);
    barGroup.rotation.x = -Math.PI / 3;

    const bgBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.18),
      new THREE.MeshBasicMaterial({ color: '#11161d', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    barGroup.add(bgBar);

    const shieldBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.055),
      new THREE.MeshBasicMaterial({ color: '#00d8ff', side: THREE.DoubleSide }),
    );
    shieldBar.position.set(0, 0.045, 0.004);
    barGroup.add(shieldBar);

    const hpBar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.085),
      new THREE.MeshBasicMaterial({ color: '#ff3b30', side: THREE.DoubleSide }),
    );
    hpBar.position.set(0, -0.03, 0.005);
    barGroup.add(hpBar);

    this.player.add(barGroup);
    this.playerWorldHpFill = hpBar;
  }

  addTargetMarker() {
    this.targetMarker = new THREE.Group();
    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.42, 28),
      new THREE.MeshBasicMaterial({ color: '#00e5ff', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
    );
    const innerDot = new THREE.Mesh(
      new THREE.CircleGeometry(0.08, 16),
      new THREE.MeshBasicMaterial({ color: '#ffcb05', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.targetMarker.add(outerRing);
    this.targetMarker.add(innerDot);
    this.targetMarker.position.set(0, 1.0, -8.5);
    this.scene.add(this.targetMarker);

    // Línea láser sutil de puntería TPS a la altura del pecho
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.95, 0),
      new THREE.Vector3(0, 0.95, -8.5),
    ]);
    const laserMat = new THREE.LineBasicMaterial({
      color: '#00e5ff',
      transparent: true,
      opacity: 0.38,
    });
    this.aimLaserLine = new THREE.Line(laserGeo, laserMat);
    this.scene.add(this.aimLaserLine);
  }

  performDash() {
    if (!this.running || this.paused || !this.session || this.session.status !== 'running') return;
    const movement = this.controls?.getMovementVector(this.cameraYaw);
    const aim = this.controls?.getAimDirection() ?? { x: 0, z: -1 };
    let dirX = movement?.x ?? 0;
    let dirZ = movement?.z ?? 0;
    if (Math.hypot(dirX, dirZ) < 0.001) {
      dirX = aim.x;
      dirZ = aim.z;
    }
    const result = this.session.dash({ x: dirX, z: dirZ });
    if (result.ok) {
      this.spawnDashEffect();
      this.player.position.set(this.session.player.x, this.height, this.session.player.z);
      this.emitHudUpdate(true);
    }
  }

  setMouseSensitivity(value) {
    this.mouseSensitivity = normalizeSensitivity(value);
    this.controls?.setMouseSensitivity(this.mouseSensitivity);
    return this.mouseSensitivity;
  }

  /** Solicita retirada táctica desde el menú de pausa. */
  requestExtract() {
    if (!this.session || this.session.isFinished) return null;
    this.session.extract();
    this.setPaused(false);
    this.finishRun();
    return this.session.buildRunResult();
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

  rerollChoices() {
    if (!this.running || !this.session || this.session.status !== 'level-up') return false;
    const res = this.session.rerollUpgradeChoices?.();
    if (!res?.ok) return false;
    this.emitHudUpdate(true);
    this.onLevelUp(this.session.pendingChoices);
    return true;
  }

  getTerrainHeight(x, z) {
    const distFromCenter = Math.hypot(x, z);
    const flattenCenter = Math.min(1, Math.max(0, (distFromCenter - 4) / 10));
    return (Math.sin(x * 0.085) * Math.cos(z * 0.085) * 1.45 + Math.sin((x + z) * 0.05) * 0.65) * flattenCenter;
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
      this.controls.consumeSpecialRequest();
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
    const wasAirborne = this.height > 0.05;
    const gliding = isFlying && this.height > 0 && this.controls.isJumpHeld();
    this.verticalVelocity -= (gliding ? 5.8 : 21) * delta;
    this.height = Math.max(0, this.height + this.verticalVelocity * delta);
    if (this.height === 0) {
      if (wasAirborne && isFlying) {
        const tornado = this.session.triggerLandingTornado?.();
        if (tornado?.triggered) {
          this.spawnRingEffect(this.player.position.x, this.player.position.z, '#7de6e0', tornado.radius * 0.4, 0.45, 2.5);
        }
      }
      this.verticalVelocity = 0;
    }

    if (this.controls.consumeStateSkill?.()) {
      const buff = this.session.castStateSkill?.();
      if (buff?.fired) {
        this.spawnLevelUpEffect('#ff9f43');
      }
    }

    this.cameraYaw = this.controls.cameraYaw;
    this.cameraPitch = this.controls.cameraPitch;
    // WASD usa siempre el yaw de la cámara capturado con Pointer Lock.
    const movement = this.controls.getMovementVector(this.cameraYaw);
    const aimDirection = this.controls.getAimDirection();
    const specialPressed = this.controls.consumeSpecialRequest();

    // Consumir el dash solicitado desde el teclado (Shift)
    if (this.controls.consumeDashRequest()) {
      this.performDash();
    }

    const events = this.session.update(delta, {
      movement,
      aimDirection,
      height: this.height,
      specialPressed,
    });

    if (events.attacks.length > 0) this.spawnAttackEffects(events.attacks);
    if (events.beams.length > 0) this.spawnBeamEffects(events.beams);
    if (events.hits.length > 0) this.spawnHitEffects(events.hits);
    if (events.defeated.length > 0) this.spawnDefeatEffects(events.defeated);
    if (events.orbsPicked.length > 0) this.spawnOrbPickupEffects(events.orbsPicked);
    if (events.playerDamaged) this.spawnPlayerHitEffect();
    if (events.playerDashed) this.spawnDashEffect();
    if (events.miniBossSpawned) {
      this.spawnLevelUpEffect('#ffd166');
      this.spawnAnnouncement('#ffd166', '¡Centinela!');
    }
    if (events.bossSpawned) {
      this.spawnLevelUpEffect('#ff7be5');
      this.spawnAnnouncement('#ff7be5', '¡Jefe regional!');
    }

    if (events.chestsOpened?.length > 0) {
      for (const opened of events.chestsOpened) {
        this.spawnRingEffect(opened.x, opened.z, '#ffd166', 1.4, 0.45, 2.8);
      }
    }
    if (events.shrinesCompleted?.length > 0) {
      for (const done of events.shrinesCompleted) {
        this.spawnRingEffect(done.x, done.z, '#4cd137', 2.6, 0.55, 3.2);
      }
    }

    const groundY = this.getTerrainHeight(this.session.player.x, this.session.player.z);
    this.player.position.set(
      this.session.player.x,
      groundY + this.height + Math.sin(this.elapsed * 3.2) * 0.045,
      this.session.player.z,
    );
    if (this.playerWorldHpFill) {
      const hpRatio = clamp01(this.session.player.hp / Math.max(1, this.session.player.maxHp));
      this.playerWorldHpFill.scale.x = Math.max(0.001, hpRatio);
      this.playerWorldHpFill.position.x = -(1 - hpRatio) * 1.2 * 0.5;
    }
    this.player.rotation.y = this.session.player.rotationY;

    if (this.playerBodyMaterial) {
      if (this.session.player.hitFlash > 0) {
        this.playerBodyMaterial.emissive.set('#ff5c77');
        this.playerBodyMaterial.emissiveIntensity = 0.85;
      } else if (this.session.player.dashTimer > 0 || this.session.player.invulnerableTimer > 0) {
        const blink = 0.3 + Math.abs(Math.sin(this.elapsed * 28)) * 0.55;
        this.playerBodyMaterial.emissive.set(
          this.session.player.dashTimer > 0 ? '#7be5ff' : this.runConfig.starter.accent,
        );
        this.playerBodyMaterial.emissiveIntensity = blink;
      } else {
        this.playerBodyMaterial.emissive.set(this.runConfig.starter.color);
        this.playerBodyMaterial.emissiveIntensity = 0.14;
      }
    }

    for (const mixer of this.activeMixers) {
      mixer.update(delta);
    }
    if (this.playerArticulated?.legs) {
      const moveSpeed = Math.hypot(movement.x, movement.z);
      const walkSwing = moveSpeed > 0.05 ? Math.sin(this.elapsed * 16) * 0.55 : 0;
      this.playerArticulated.legs[0].rotation.x = walkSwing;
      this.playerArticulated.legs[1].rotation.x = -walkSwing;
      this.playerArticulated.legs[2].rotation.x = -walkSwing;
      this.playerArticulated.legs[3].rotation.x = walkSwing;
      if (this.playerArticulated.tail) {
        this.playerArticulated.tail.rotation.z = Math.sin(this.elapsed * 8) * 0.25;
      }
    }

    const aimDist = 8.5;
    const aimX = this.session.player.x + aimDirection.x * aimDist;
    const aimZ = this.session.player.z + aimDirection.z * aimDist;
    const aimY = this.getTerrainHeight(aimX, aimZ) + this.height + 0.95;

    this.targetMarker.position.set(aimX, aimY, aimZ);
    if (this.camera) {
      this.targetMarker.lookAt(this.camera.position);
    }

    if (this.aimLaserLine) {
      const startY = this.player.position.y + 0.95;
      const positions = this.aimLaserLine.geometry.attributes.position;
      positions.setXYZ(0, this.player.position.x, startY, this.player.position.z);
      positions.setXYZ(1, aimX, aimY, aimZ);
      positions.needsUpdate = true;
    }

    this.playerShadow.position.set(this.player.position.x, groundY + 0.02, this.player.position.z);
    this.playerShadow.material.opacity = 0.42 - clamp01(this.height / 5) * 0.22;
    this.playerRing.rotation.z += delta * 0.55;

    this.updateCamera(delta);

    this.syncEnemies(delta);
    this.syncOrbs(delta);
    this.syncChests(delta);
    this.syncShrines(delta);
    this.updateWorldMarkers();
    this.emitHudUpdate(false);

    if (events.leveledUp && this.session.status === 'level-up') {
      this.controls.clearKeys();
      this.controls.releasePointerLock();
      this.spawnLevelUpEffect('#ffe07d');
      this.onLevelUp(this.session.pendingChoices);
    }

    if (this.session.isFinished) {
      this.finishRun();
    }
  }

  /** Cámara baja detrás del compañero, con suavizado. `snap` la coloca sin transición. */
  updateCamera(delta, snap = false) {
    if (!this.camera || !this.player) return;
    const groundY = this.getTerrainHeight(this.player.position.x, this.player.position.z);
    const pose = thirdPersonCameraPose(
      { x: this.player.position.x, z: this.player.position.z },
      this.cameraYaw,
      this.height,
      CAMERA_RIG,
      this.cameraPitch,
    );
    pose.position.y += groundY;
    pose.lookAt.y += groundY;
    const desired = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
    if (snap) {
      this.camera.position.copy(desired);
    } else {
      this.camera.position.lerp(desired, 1 - Math.exp(-delta * CAMERA_RIG.smoothing));
    }
    this.camera.lookAt(pose.lookAt.x, pose.lookAt.y, pose.lookAt.z);
  }

  /** Efectos de los movimientos: anillo de área (Bomba Lodo, Giro Fuego...) y pulso al lanzar un especial. */
  spawnAttackEffects(attacks) {
    if (!this.scene || !this.player) return;
    for (const attack of attacks) {
      if (attack.area) {
        this.spawnRingEffect(attack.area.x, attack.area.z, attack.area.color, attack.area.radius, 0.42, 1.2);
      }
      if (attack.slot === 'special') {
        this.spawnRingEffect(this.player.position.x, this.player.position.z, attack.color, 0.9, 0.3, 2.4);
      }
    }
  }

  spawnRingEffect(x, z, color = '#ffffff', radius = 1, ttl = 0.3, grow = 1.5) {
    if (!this.scene) return;
    const inner = Math.max(0.05, radius * 0.86);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, radius, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.07, z);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, ttl, remaining: ttl, grow });
  }

  updateWorldMarkers() {
    if (!this.scene) return;
    if (this.ashSystem && this.player) {
      const pos = this.ashSystem.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        let y = pos.getY(i) - 0.045;
        if (y < 0.1) y = 13.5;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.ashSystem.position.x = this.player.position.x * 0.65;
      this.ashSystem.position.z = this.player.position.z * 0.65;
    }

    this.seenVfxIds ??= new Set();
    for (const node of this.session?.frostNodes ?? []) {
      if (!this.seenVfxIds.has(node.id)) {
        this.seenVfxIds.add(node.id);
        this.spawnRingEffect(node.x, node.z, '#96d9d6', node.radius, node.duration, 0.15);
      }
    }
    for (const tele of this.session?.bossTelegraphs ?? []) {
      if (!this.seenVfxIds.has(tele.id)) {
        this.seenVfxIds.add(tele.id);
        this.spawnRingEffect(tele.x, tele.z, tele.color ?? '#ff5c77', tele.radius, tele.duration, 0.25);
      }
    }

    const miniBoss = this.session?.activeMiniBoss;
    const boss = this.session?.activeBoss;

    if (boss) {
      if (!this.bossMarker) {
        this.bossMarker = this.createRingMarker('#ff7be5', 1.6);
        this.scene.add(this.bossMarker);
      }
      this.bossMarker.position.set(boss.x, 0.04, boss.z);
      this.bossMarker.rotation.z += 0.02;
      this.bossMarker.visible = true;
    } else if (this.bossMarker) {
      this.bossMarker.visible = false;
    }

    if (miniBoss) {
      if (!this.miniBossMarker) {
        this.miniBossMarker = this.createRingMarker('#ffd166', 1.3);
        this.scene.add(this.miniBossMarker);
      }
      this.miniBossMarker.position.set(miniBoss.x, 0.03, miniBoss.z);
      this.miniBossMarker.rotation.z -= 0.025;
      this.miniBossMarker.visible = true;
    } else if (this.miniBossMarker) {
      this.miniBossMarker.visible = false;
    }
  }

  createRingMarker(color, radius) {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.85, radius, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const runes = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.6, radius * 0.72, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    runes.rotation.x = -Math.PI / 2;
    runes.position.y = 0.005;
    group.add(runes);
    return group;
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

      // Físicas Megabonk: si el enemigo sufre golpe/retroceso, salta por los aires en 3D
      if (enemy.hitFlash > 0.14 && visual.airY <= 0.02) {
        visual.airVelY = enemy.isBoss ? 2.8 : 5.6;
      }
      if (visual.airY > 0 || visual.airVelY > 0) {
        visual.airVelY -= 19.5 * 0.016;
        visual.airY = Math.max(0, visual.airY + visual.airVelY * 0.016);
        if (visual.airY === 0) visual.airVelY = 0;
      }

      const walkSwing = Math.sin(this.elapsed * 14 + enemy.x) * 0.45;
      if (visual.articulated?.legs) {
        visual.articulated.legs[0].rotation.x = walkSwing;
        visual.articulated.legs[1].rotation.x = -walkSwing;
        visual.articulated.legs[2].rotation.x = -walkSwing;
        visual.articulated.legs[3].rotation.x = walkSwing;
      }

      const bob = Math.sin(this.elapsed * (enemy.isBoss ? 3.5 : 6.2) + enemy.x * 0.5) * 0.05;
      const terrainY = this.getTerrainHeight(enemy.x, enemy.z);
      visual.group.position.set(enemy.x, terrainY + visual.airY + Math.max(0, bob), enemy.z);
      if (visual.crown) {
        visual.crown.rotation.y += 0.045;
      }
      visual.bodyGroup.rotation.y = enemy.rotationY;
      visual.bodyGroup.rotation.x = visual.airY > 0.05 ? -0.35 : 0;

      const hpRatio = clamp01(enemy.hp / enemy.maxHp);
      visual.hpFill.scale.x = Math.max(0.001, hpRatio);
      visual.hpFill.position.x = -(1 - hpRatio) * visual.barWidth * 0.5;
      visual.hpFill.material.color.set(hpRatio > 0.45 ? '#a9edbb' : hpRatio > 0.2 ? '#ffc66d' : '#ff6b7b');

      if (enemy.hitFlash > 0) {
        visual.bodyMaterial.emissive.set('#ffffff');
        visual.bodyMaterial.emissiveIntensity = 0.85;
        visual.bodyGroup.scale.setScalar(1.12);
        if (visual.enemySprite) visual.enemySprite.material.color.set('#ff9999');
      } else {
        visual.bodyMaterial.emissive.set(enemy.color);
        visual.bodyMaterial.emissiveIntensity = enemy.isBoss || enemy.isMiniBoss ? 0.32 : (enemy.isElite ? 0.22 : 0.12);
        visual.bodyGroup.scale.setScalar(1);
        if (visual.enemySprite) visual.enemySprite.material.color.set('#ffffff');
      }

      if (visual.auraRing) {
        visual.auraRing.rotation.z += 0.03;
        const auraColor = enemy.aura?.color ?? (enemy.isBoss ? '#ff7be5' : '#ffd166');
        visual.auraRing.material.color.set(auraColor);
        visual.auraRing.visible = !!(enemy.isElite || enemy.isMiniBoss || enemy.isBoss);
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
      emissiveIntensity: enemy.isBoss ? 0.32 : 0.12,
    });
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: enemy.accent,
      roughness: 0.35,
      emissive: enemy.accent,
      emissiveIntensity: 0.24,
    });

    const baseScale = enemy.isBoss ? 2.1 : (enemy.isMiniBoss ? 1.55 : (enemy.isElite ? 1.3 : 0.95));
    void accentMaterial;

    const articulated = this.buildArticulated3dPokemonMesh({
      color: enemy.color,
      accent: enemy.accent,
      scale: baseScale,
      isFlying: enemy.shape === 'flyer' || enemy.types?.includes('Volador'),
    });
    bodyGroup.add(articulated.root);

    // Cargar el modelo 3D .glb real de la especie enemiga/jefe (cacheado por especie)
    this.loadPokemon3dGlb(
      enemy.species,
      { shiny: false, targetHeight: 1.25 * baseScale },
      (glbMesh) => {
        articulated.root.visible = false;
        bodyGroup.add(glbMesh);
      },
    );

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(enemy.radius * 1.05, 20),
      new THREE.MeshBasicMaterial({ color: '#060d0a', transparent: true, opacity: 0.38, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.012;
    group.add(shadow);

    // Aura para élites / jefes
    const auraColor = enemy.aura?.color ?? (enemy.isBoss ? '#ff7be5' : (enemy.isMiniBoss ? '#ffd166' : '#7be5ff'));
    const auraRing = new THREE.Mesh(
      new THREE.RingGeometry(enemy.radius * 1.2, enemy.radius * 1.45, 24),
      new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    auraRing.rotation.x = -Math.PI / 2;
    auraRing.position.y = 0.02;
    auraRing.visible = !!(enemy.isElite || enemy.isMiniBoss || enemy.isBoss);
    group.add(auraRing);

    const barWidth = enemy.isBoss ? 1.6 : (enemy.isMiniBoss ? 1.3 : 0.86);
    const barHeight = enemy.isBoss ? 0.11 : 0.075;
    const barY = enemy.isBoss ? 2.25 : (enemy.isMiniBoss ? 1.8 : 1.18);

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

    let crown = null;
    if (enemy.isElite || enemy.isMiniBoss || enemy.isBoss) {
      crown = new THREE.Group();
      const crownMat = new THREE.MeshStandardMaterial({
        color: '#ffd700',
        emissive: '#ffae00',
        emissiveIntensity: 0.65,
        roughness: 0.2,
        metalness: 0.75,
      });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * baseScale, 0.2 * baseScale, 0.12 * baseScale, 6, 1, true), crownMat);
      crown.add(band);
      for (let p = 0; p < 4; p += 1) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06 * baseScale, 0.14 * baseScale, 4), crownMat);
        const a = (p / 4) * Math.PI * 2;
        spike.position.set(Math.cos(a) * 0.2 * baseScale, 0.1 * baseScale, Math.sin(a) * 0.2 * baseScale);
        crown.add(spike);
      }
      crown.position.set(0, barY + 0.24, 0);
      group.add(crown);
    }

    return {
      group,
      bodyGroup,
      bodyMaterial,
      auraRing,
      hpFill,
      barWidth,
      crown,
      articulated,
      airY: 0,
      airVelY: 0,
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

      const hover = this.getTerrainHeight(orb.x, orb.z) + 0.28 + Math.sin(this.elapsed * 4.5 + orb.age * 3) * 0.08;
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

  syncChests(delta) {
    if (!this.scene || !this.session) return;
    const activeIds = new Set();
    for (const chest of this.session.chests ?? []) {
      activeIds.add(chest.id);
      let visual = this.chestVisuals.get(chest.id);
      if (!visual) {
        visual = this.createChestVisual(chest);
        this.chestVisuals.set(chest.id, visual);
        this.scene.add(visual.group);
      }
      const ty = this.getTerrainHeight(chest.x, chest.z);
      visual.group.position.set(chest.x, ty + 0.25, chest.z);
      visual.group.rotation.y += delta * 0.9;
    }

    for (const [chestId, visual] of this.chestVisuals.entries()) {
      if (!activeIds.has(chestId)) {
        this.disposeObjectGroup(visual.group);
        this.chestVisuals.delete(chestId);
      }
    }
  }

  createChestVisual() {
    const group = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: '#8d5524', roughness: 0.65, metalness: 0.1 });
    const goldMat = new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffae00', emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.6 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.6), woodMat);
    group.add(base);

    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 10, 1, false, 0, Math.PI), woodMat);
    lid.rotation.z = Math.PI / 2;
    lid.position.y = 0.25;
    group.add(lid);

    const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.64), goldMat);
    strapL.position.x = -0.26;
    group.add(strapL);

    const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.56, 0.64), goldMat);
    strapR.position.x = 0.26;
    group.add(strapR);

    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), goldMat);
    lock.position.set(0, 0.12, 0.32);
    group.add(lock);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.78, 24),
      new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.22;
    group.add(ring);

    return { group };
  }

  syncShrines(delta) {
    if (!this.scene || !this.session) return;

    // Renderizar Santuarios de Carga (Altares Teracristal estilo Megabonk)
    for (const shrine of this.session.shrines ?? []) {
      let visual = this.shrineVisuals.get(shrine.id);
      if (!visual) {
        visual = this.createShrineVisual(shrine);
        this.shrineVisuals.set(shrine.id, visual);
        this.scene.add(visual.group);
      }
      const ty = this.getTerrainHeight(shrine.x, shrine.z);
      visual.group.position.set(shrine.x, ty, shrine.z);
      visual.crystal.rotation.y += delta * (shrine.completed ? 0.5 : 2.2);
      visual.crystal.position.y = 1.25 + Math.sin(this.elapsed * 3) * 0.15;

      const progress = Math.min(1, shrine.charge / Math.max(0.1, shrine.chargeRequired));
      visual.chargeRing.scale.setScalar(0.3 + progress * 0.7);
      visual.chargeRing.material.color.set(shrine.completed ? '#ffd700' : '#4cd137');
      visual.crystal.material.color.set(shrine.completed ? '#ffd700' : '#00e5ff');
    }

    // Renderizar el Portal del Jefe (Arco Ultraumbral estilo Megabonk)
    const portal = this.session.bossPortal;
    if (portal && !portal.activated && !this.session.bossSpawned) {
      if (!this.bossPortalMesh) {
        this.bossPortalMesh = this.createBossPortalVisual();
        this.scene.add(this.bossPortalMesh);
      }
      const py = this.getTerrainHeight(portal.x, portal.z);
      this.bossPortalMesh.position.set(portal.x, py, portal.z);
      this.bossPortalMesh.visible = true;
      this.bossPortalMesh.children[0].rotation.z += delta * 1.8;
    } else if (this.bossPortalMesh) {
      this.bossPortalMesh.visible = false;
    }
  }

  createShrineVisual(shrine) {
    const group = new THREE.Group();
    const pedMat = new THREE.MeshStandardMaterial({ color: '#4a5568', roughness: 0.8 });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: '#00e5ff',
      emissive: '#00b4d8',
      emissiveIntensity: 0.65,
      roughness: 0.15,
      metalness: 0.3,
    });

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.45, 6), pedMat);
    pedestal.position.y = 0.22;
    group.add(pedestal);

    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), crystalMat);
    crystal.position.y = 1.25;
    crystal.scale.set(0.85, 1.45, 0.85);
    group.add(crystal);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(shrine.radius * 0.92, shrine.radius, 36),
      new THREE.MeshBasicMaterial({ color: '#4cd137', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.05;
    group.add(outerRing);

    const chargeRing = new THREE.Mesh(
      new THREE.CircleGeometry(shrine.radius * 0.9, 32),
      new THREE.MeshBasicMaterial({ color: '#4cd137', transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }),
    );
    chargeRing.rotation.x = -Math.PI / 2;
    chargeRing.position.y = 0.04;
    group.add(chargeRing);

    return { group, crystal, chargeRing };
  }

  createBossPortalVisual() {
    const group = new THREE.Group();
    const vortex = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.14, 10, 32),
      new THREE.MeshStandardMaterial({ color: '#ff4757', emissive: '#ff1e42', emissiveIntensity: 0.85 }),
    );
    vortex.position.y = 1.65;
    group.add(vortex);

    const floorZone = new THREE.Mesh(
      new THREE.RingGeometry(2.0, 2.4, 36),
      new THREE.MeshBasicMaterial({ color: '#ff4757', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }),
    );
    floorZone.rotation.x = -Math.PI / 2;
    floorZone.position.y = 0.06;
    group.add(floorZone);

    return group;
  }

  spawnBeamEffects(beams) {
    if (!this.scene) return;

    for (const beamData of beams) {
      const startY = this.getTerrainHeight(beamData.startX, beamData.startZ) + this.height + 0.92;
      const endY = this.getTerrainHeight(beamData.endX, beamData.endZ) + 0.88;
      const start = new THREE.Vector3(beamData.startX, startY, beamData.startZ);
      const end = new THREE.Vector3(beamData.endX, endY, beamData.endZ);
      const delta = end.clone().sub(start);
      const length = Math.max(0.2, delta.length());
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.clone().normalize(),
      );

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

      const auraRadius = Math.max(0.12, beamData.width * 0.24);
      const auraMaterial = new THREE.MeshBasicMaterial({
        color: beamData.color ?? '#ff7be5',
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

  spawnFloatingText3D(x, y, z, text, color = '#ffcb05', scaleSize = 1.35) {
    if (!this.scene || typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '900 54px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#0b1324';
      ctx.strokeText(text, 128, 64);
      ctx.fillStyle = color;
      ctx.fillText(text, 128, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.set(scaleSize * 1.6, scaleSize * 0.8, 1);
    this.scene.add(sprite);
    this.effects.push({ mesh: sprite, ttl: 0.65, remaining: 0.65, floatUp: 2.2 });
  }

  spawnHitEffects(hits) {
    if (!this.scene) return;
    for (const hit of hits) {
      const ty = this.getTerrainHeight(hit.x, hit.z);
      this.spawnFloatingText3D(
        hit.x + (Math.random() - 0.5) * 0.4,
        ty + 1.55,
        hit.z,
        `${hit.damage}${hit.effectiveness > 1 ? '!' : ''}`,
        hit.effectiveness > 1 ? '#ffcb05' : '#ffffff',
        hit.effectiveness > 1 ? 1.45 : 1.1,
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.46, 20),
        new THREE.MeshBasicMaterial({
          color: hit.color ?? '#ff9ef0',
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(hit.x, 0.12, hit.z);
      this.scene.add(ring);
      const grow = hit.effectiveness > 1 ? 3.4 : 2.2;
      this.effects.push({ mesh: ring, ttl: 0.2, remaining: 0.2, grow });
    }
  }

  spawnDefeatEffects(defeated) {
    if (!this.scene) return;
    for (const enemy of defeated) {
      const ty = this.getTerrainHeight(enemy.x, enemy.z);
      const goldVal = enemy.isBoss ? 70 : (enemy.isMiniBoss ? 40 : (enemy.isElite ? 6 : 2));
      this.spawnFloatingText3D(enemy.x, ty + 1.95, enemy.z, `+$${goldVal}`, '#ffd700', 1.55);
      const color = enemy.isBoss ? '#ff7be5' : (enemy.isMiniBoss ? '#ffd166' : (enemy.color || '#c7f27b'));
      const burst = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.65, 24),
        new THREE.MeshBasicMaterial({
          color,
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

  spawnDashEffect() {
    if (!this.scene || !this.player) return;
    // Estela de esquiva
    for (let i = 0; i < 4; i += 1) {
      const trail = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.6, 24),
        new THREE.MeshBasicMaterial({
          color: '#7be5ff',
          transparent: true,
          opacity: 0.6 - i * 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      trail.rotation.x = -Math.PI / 2;
      trail.position.set(this.player.position.x, 0.05 + i * 0.02, this.player.position.z);
      this.scene.add(trail);
      this.effects.push({ mesh: trail, ttl: 0.28 - i * 0.04, remaining: 0.28 - i * 0.04, grow: 1.8 });
    }
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

  spawnAnnouncement(color, text) {
    // Efecto visual en el suelo (anillo expansivo grande) para anuncios como jefe/minijefe.
    if (!this.scene || !this.player) return;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.4, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(this.player.position.x, 0.06, this.player.position.z);
    this.scene.add(ring);
    this.effects.push({ mesh: ring, ttl: 0.55, remaining: 0.55, grow: 4.5 });
    // El texto se muestra vía HUD (onHudUpdate incluye status), el anillo es feedback visual.
    void text;
  }

  updateEffects(delta) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.remaining -= delta;
      const ratio = Math.max(0, effect.remaining / effect.ttl);
      effect.mesh.material.opacity = ratio;
      if (effect.floatUp) {
        effect.mesh.position.y += delta * effect.floatUp;
      }
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
      snapshot.eliteKills,
      snapshot.orbsCollected,
      snapshot.activeEnemies,
      snapshot.dashUnlocked ? 'dash-open' : 'dash-locked',
      snapshot.dashReady ? '1' : '0',
      snapshot.specialAttack?.unlocked ? 'special-open' : 'special-locked',
      Math.round((snapshot.dashCooldown ?? 0) * 10) / 10,
      Math.round((snapshot.basicAttack?.cooldownRemaining ?? 0) * 10),
      Math.round((snapshot.specialAttack?.cooldownRemaining ?? 0) * 10),
      snapshot.lastAttackSeq ?? 0,
      snapshot.miniBoss?.hp ?? 0,
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
    if (!this.session || this.session.isFinished) return null;
    this.session.extract();
    const result = this.session.buildRunResult();
    this.stop();
    return result;
  }

  setPaused(paused) {
    if (!this.running || this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      this.controls?.clearKeys();
      this.controls?.releasePointerLock();
    }
    // Una pulsación de Q hecha durante la pausa no debe disparar el especial al reanudar
    this.controls?.consumeSpecialRequest();
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
    this.chestVisuals.clear();
    this.shrineVisuals.clear();
    this.activeMixers = [];
    this.bossPortalMesh = null;
    if (this.bossMarker) {
      this.disposeObjectGroup(this.bossMarker);
      this.bossMarker = null;
    }
    if (this.miniBossMarker) {
      this.disposeObjectGroup(this.miniBossMarker);
      this.miniBossMarker = null;
    }
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
