import * as THREE from 'three';

const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

/** WASD + salto + puntería de ratón convertida de pantalla a suelo 3D. */
export class HybridControls {
  constructor({ element, camera, player, onPrimaryFire, onJump, onPause }) {
    this.element = element;
    this.camera = camera;
    this.player = player;
    this.onPrimaryFire = onPrimaryFire;
    this.onJump = onJump;
    this.onPause = onPause;

    this.keys = new Set();
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.rayHit = new THREE.Vector3();
    this.movement = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3(0, 0, -7);
    this.aimDirection = new THREE.Vector3(0, 0, -1);
    this.jumpRequested = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerdown', this.handlePointerDown);
  }

  handleKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, textarea, select, [contenteditable="true"]')) {
      return;
    }

    if (MOVEMENT_CODES.has(event.code)) {
      this.keys.add(event.code);
      event.preventDefault();
    }

    if (event.code === 'Space') {
      this.keys.add('Space');
      event.preventDefault();
      if (!event.repeat) {
        this.jumpRequested = true;
        this.onJump?.();
      }
    }

    if (event.code === 'Escape' && !event.repeat) {
      event.preventDefault();
      this.onPause?.();
    }
  }

  handleKeyUp(event) {
    this.keys.delete(event.code);
  }

  handleBlur() {
    this.clearKeys();
  }

  handlePointerMove(event) {
    this.setPointer(event);
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.element.focus({ preventScroll: true });
    this.setPointer(event);
    this.updateAim();
    this.onPrimaryFire?.({
      direction: this.aimDirection.clone(),
      target: this.aimPoint.clone(),
    });
  }

  setPointer(event) {
    const rect = this.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.mouseNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** Recalcula el punto del suelo cuando la cámara sigue al jugador. */
  updateAim() {
    this.raycaster.setFromCamera(this.mouseNdc, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, this.rayHit);
    if (!hit) return;

    this.aimPoint.copy(hit);
    this.aimDirection.copy(hit).sub(this.player.position).setY(0);
    if (this.aimDirection.lengthSq() > 0.0001) this.aimDirection.normalize();
    else this.aimDirection.set(0, 0, -1);
  }

  getMovementVector() {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
      - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
      - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));

    this.movement.set(x, 0, z);
    if (this.movement.lengthSq() > 1) this.movement.normalize();
    return this.movement;
  }

  isJumpHeld() {
    return this.keys.has('Space');
  }

  consumeJumpRequest() {
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  clearKeys() {
    this.keys.clear();
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.clearKeys();
  }
}
