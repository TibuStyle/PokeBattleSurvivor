import * as THREE from 'three';
import { cameraRelativeMovement } from './cameraRig.js';

const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
const DASH_CODES = new Set(['ShiftLeft', 'ShiftRight']);
const UPGRADE_KEY_INDEX = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
};

/**
 * WASD + salto + esquiva (Shift) + especial (Q) + puntería de ratón convertida de pantalla a suelo 3D.
 * El movimiento puede ser relativo a la cámara de tercera persona (ver cameraRig.js).
 */
export class HybridControls {
  constructor({ element, camera, player, onPrimaryFire, onJump, onDash, onSpecial = () => {}, onPause, onSelectUpgrade }) {
    this.element = element;
    this.camera = camera;
    this.player = player;
    this.onPrimaryFire = onPrimaryFire;
    this.onJump = onJump;
    this.onDash = onDash;
    this.onSpecial = onSpecial;
    this.onPause = onPause;
    this.onSelectUpgrade = onSelectUpgrade;

    this.keys = new Set();
    this.mouseNdc = new THREE.Vector2(0, 0);
    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.rayHit = new THREE.Vector3();
    this.movement = new THREE.Vector3();
    this.aimPoint = new THREE.Vector3(0, 0, -7);
    this.aimDirection = new THREE.Vector3(0, 0, -1);
    this.jumpRequested = false;
    this.dashRequested = false;
    this.specialRequested = false;
    this.primaryFireHeld = false;
    this.pointerMoved = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    element.addEventListener('pointermove', this.handlePointerMove);
    element.addEventListener('pointerdown', this.handlePointerDown);
  }

  handleKeyDown(event) {
    if (event.code in UPGRADE_KEY_INDEX && !event.repeat) {
      const handled = this.onSelectUpgrade?.(UPGRADE_KEY_INDEX[event.code]);
      if (handled) {
        event.preventDefault();
        return;
      }
    }

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

    if (DASH_CODES.has(event.code)) {
      this.keys.add(event.code);
      event.preventDefault();
      if (!event.repeat) {
        this.dashRequested = true;
        this.onDash?.({
          movement: this.getMovementVector().clone(),
          aimDirection: this.aimDirection.clone(),
        });
      }
    }

    if (event.code === 'KeyQ' && !event.repeat) {
      event.preventDefault();
      this.specialRequested = true;
      this.onSpecial?.();
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
    this.pointerMoved = true;
  }

  /** Indica si el cursor se movió desde la última consulta (para seguir al apuntado con la cámara). */
  consumePointerMoved() {
    const moved = this.pointerMoved;
    this.pointerMoved = false;
    return moved;
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.primaryFireHeld = true;
    this.element.focus({ preventScroll: true });
    this.setPointer(event);
    this.updateAim();
    this.onPrimaryFire?.({
      direction: this.aimDirection.clone(),
      target: this.aimPoint.clone(),
    });
  }

  handlePointerUp(event) {
    if (event.button === 0 || event.type === 'pointercancel') {
      this.primaryFireHeld = false;
    }
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

  /**
   * Vector de movimiento en el plano. Con `cameraYaw` (radianes) el movimiento es relativo
   * a la cámara de tercera persona; sin él, usa los ejes del mundo.
   */
  getMovementVector(cameraYaw = null) {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
      - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
      - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));

    if (Number.isFinite(cameraYaw)) {
      const relative = cameraRelativeMovement({ x, z }, cameraYaw);
      this.movement.set(relative.x, 0, relative.z);
      return this.movement;
    }

    this.movement.set(x, 0, z);
    if (this.movement.lengthSq() > 1) this.movement.normalize();
    return this.movement;
  }

  isJumpHeld() {
    return this.keys.has('Space');
  }

  isPrimaryFireHeld() {
    return this.primaryFireHeld;
  }

  consumeJumpRequest() {
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  consumeDashRequest() {
    const requested = this.dashRequested;
    this.dashRequested = false;
    return requested;
  }

  consumeSpecialRequest() {
    const requested = this.specialRequested;
    this.specialRequested = false;
    return requested;
  }

  isDashHeld() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  clearKeys() {
    this.keys.clear();
    this.primaryFireHeld = false;
    this.dashRequested = false;
    this.specialRequested = false;
  }

  dispose() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.clearKeys();
  }
}
