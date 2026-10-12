import * as THREE from 'three';
import { HybridControls } from './HybridControls.js';

const WORLD_LIMIT = 52;
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/** Escena de prueba Three.js: bosque procedural, companion original y control híbrido. */
export class GameApp {
  constructor(container, { onPauseChange = () => {}, onHudUpdate = () => {} } = {}) {
    this.container = container;
    this.onPauseChange = onPauseChange;
    this.onHudUpdate = onHudUpdate;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.className = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Arena 3D: WASD mueve, el ratón apunta y el clic dispara');
    this.renderer.domElement.tabIndex = 0;
    this.container.appendChild(this.renderer.domElement);

    this.scene = null;
    this.camera = null;
    this.player = null;
    this.controls = null;
    this.running = false;
    this.paused = false;
    this.frameId = 0;
    this.elapsed = 0;
    this.hudElapsed = -1;
    this.height = 0;
    this.verticalVelocity = 0;
    this.effects = [];
    this.clock = new THREE.Clock();

    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
  }

  start(runConfig) {
    this.stop();
    this.runConfig = runConfig;
    this.createScene(runConfig);
    this.container.classList.add('is-active');
    this.container.setAttribute('aria-hidden', 'false');
    this.running = true;
    this.paused = false;
    this.elapsed = 0;
    this.hudElapsed = -1;
    this.height = 0;
    this.verticalVelocity = 0;
    this.effects = [];

    this.controls = new HybridControls({
      element: this.renderer.domElement,
      camera: this.camera,
      player: this.player,
      onPrimaryFire: ({ direction }) => this.fireAimedMove(direction),
      onJump: () => {},
      onPause: () => this.setPaused(!this.paused),
    });

    this.clock.start();
    this.renderer.domElement.focus({ preventScroll: true });
    this.onPauseChange(false);
    this.frameId = requestAnimationFrame(() => this.frame());
  }

  createScene(runConfig) {
    const region = runConfig;
    const palette = region.palette ?? ['#9bdc83', '#477956', '#dec17e'];
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

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: starter.color,
      roughness: 0.3,
      metalness: 0.08,
      emissive: starter.color,
      emissiveIntensity: 0.12,
    });
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.58, 1), bodyMaterial);
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
    if (!this.running || this.paused) return;

    const start = new THREE.Vector3(this.player.position.x, 0.83 + this.height, this.player.position.z);
    const end = start.clone().add(new THREE.Vector3(direction.x, 0, direction.z).normalize().multiplyScalar(9));
    const delta = end.clone().sub(start);
    const length = delta.length();
    const material = new THREE.MeshBasicMaterial({
      color: this.runConfig.starter.accent,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.11, length, 8, 1, true), material);
    beam.position.copy(start).add(end).multiplyScalar(0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    this.scene.add(beam);
    this.effects.push({ mesh: beam, ttl: 0.15, remaining: 0.15 });
  }

  frame() {
    if (!this.running) return;
    this.frameId = requestAnimationFrame(() => this.frame());

    const delta = Math.min(this.clock.getDelta(), 0.05);
    if (!this.paused) this.update(delta);
    this.renderer.render(this.scene, this.camera);

    if (Math.floor(this.elapsed) !== this.hudElapsed) {
      this.hudElapsed = Math.floor(this.elapsed);
      this.onHudUpdate({ elapsedSeconds: this.hudElapsed });
    }
  }

  update(delta) {
    if (!this.controls || !this.player) return;
    this.elapsed += delta;

    if (this.controls.consumeJumpRequest() && this.height <= 0.001) {
      this.verticalVelocity = 8.6;
    }

    const isFlying = this.runConfig.starter.types.includes('Volador');
    const gliding = isFlying && this.height > 0 && this.controls.isJumpHeld();
    this.verticalVelocity -= (gliding ? 5.8 : 21) * delta;
    this.height = Math.max(0, this.height + this.verticalVelocity * delta);
    if (this.height === 0) this.verticalVelocity = 0;

    const movement = this.controls.getMovementVector();
    const moveRank = this.runConfig.upgrades?.moveSpeed ?? 0;
    const movementSpeed = 6.5 * (1 + moveRank * 0.03);
    this.player.position.addScaledVector(movement, movementSpeed * delta);
    this.player.position.x = THREE.MathUtils.clamp(this.player.position.x, -WORLD_LIMIT, WORLD_LIMIT);
    this.player.position.z = THREE.MathUtils.clamp(this.player.position.z, -WORLD_LIMIT, WORLD_LIMIT);
    this.player.position.y = this.height + Math.sin(this.elapsed * 3.2) * 0.045;

    this.controls.updateAim();
    this.targetMarker.position.set(this.controls.aimPoint.x, 0.035, this.controls.aimPoint.z);

    const direction = this.controls.aimDirection;
    this.player.rotation.y = Math.atan2(direction.x, direction.z);
    this.playerShadow.position.set(this.player.position.x, 0.015, this.player.position.z);
    this.playerShadow.material.opacity = 0.42 - clamp01(this.height / 5) * 0.22;
    this.playerRing.rotation.z += delta * 0.55;

    const cameraTarget = new THREE.Vector3(
      this.player.position.x,
      0,
      this.player.position.z,
    );
    const desiredCameraPosition = new THREE.Vector3(
      this.player.position.x,
      18 + this.height * 0.3,
      this.player.position.z + 14,
    );
    this.camera.position.lerp(desiredCameraPosition, 1 - Math.exp(-delta * 4.5));
    this.camera.lookAt(cameraTarget);

    this.updateEffects(delta);
  }

  updateEffects(delta) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.remaining -= delta;
      effect.mesh.material.opacity = Math.max(0, effect.remaining / effect.ttl);
      if (effect.remaining <= 0) {
        this.scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        this.effects.splice(index, 1);
      }
    }
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

  stop() {
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    this.running = false;
    this.paused = false;
    this.controls?.dispose();
    this.controls = null;
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
