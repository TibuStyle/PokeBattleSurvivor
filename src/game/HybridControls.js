import {
  MOUSE_LOOK,
  applyMouseLook,
  cameraRelativeMovement,
  forwardFromYaw,
  normalizeSensitivity,
} from './cameraRig.js';

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
 * Controles de acción de tercera persona:
 * - WASD relativo al yaw de cámara.
 * - Pointer Lock para mirar con movimiento relativo del ratón, sin rotación del cuerpo directa.
 * - Q y Shift solo producen solicitudes si la habilidad correspondiente está desbloqueada.
 */
export class HybridControls {
  constructor({
    element,
    cameraYaw = Math.PI,
    cameraPitch = 0,
    mouseSensitivity = MOUSE_LOOK.defaultSensitivity,
    onPrimaryFire = () => {},
    onJump,
    onDash,
    onSpecial,
    onPause,
    onSelectUpgrade,
    onCameraLook = () => {},
    onPointerLockChange = () => {},
    onLockedAbility = () => {},
    canUseSpecial = () => true,
    canUseDash = () => true,
  }) {
    this.element = element;
    this.document = element.ownerDocument ?? document;
    this.window = this.document.defaultView ?? window;
    this.cameraYaw = Number.isFinite(cameraYaw) ? cameraYaw : Math.PI;
    this.cameraPitch = Number.isFinite(cameraPitch) ? cameraPitch : 0;
    this.mouseSensitivity = normalizeSensitivity(mouseSensitivity);
    this.onPrimaryFire = onPrimaryFire;
    this.onJump = onJump;
    this.onDash = onDash;
    this.onSpecial = onSpecial;
    this.onPause = onPause;
    this.onSelectUpgrade = onSelectUpgrade;
    this.onCameraLook = onCameraLook;
    this.onPointerLockChange = onPointerLockChange;
    this.onLockedAbility = onLockedAbility;
    this.canUseSpecial = canUseSpecial;
    this.canUseDash = canUseDash;

    this.keys = new Set();
    this.aimDirection = forwardFromYaw(this.cameraYaw);
    this.jumpRequested = false;
    this.dashRequested = false;
    this.specialRequested = false;
    this.primaryFireHeld = false;
    this.pointerLocked = this.document.pointerLockElement === this.element;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLockChange = this.handlePointerLockChange.bind(this);
    this.handlePointerLockError = this.handlePointerLockError.bind(this);

    this.window.addEventListener('keydown', this.handleKeyDown);
    this.window.addEventListener('keyup', this.handleKeyUp);
    this.window.addEventListener('blur', this.handleBlur);
    this.window.addEventListener('pointerup', this.handlePointerUp);
    this.window.addEventListener('pointercancel', this.handlePointerUp);
    this.document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.document.addEventListener('pointerlockerror', this.handlePointerLockError);
    this.document.addEventListener('mousemove', this.handlePointerMove);
    this.element.addEventListener('pointerdown', this.handlePointerDown);

    this.onPointerLockChange(this.pointerLocked);
  }

  handleKeyDown(event) {
    if (event.code in UPGRADE_KEY_INDEX && !event.repeat) {
      const handled = this.onSelectUpgrade?.(UPGRADE_KEY_INDEX[event.code]);
      if (handled) {
        event.preventDefault();
        return;
      }
    }

    if (event.target?.closest?.('button, input, textarea, select, [contenteditable="true"]')) return;

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
      event.preventDefault();
      if (event.repeat) return;
      if (!this.canUseDash()) {
        this.onLockedAbility('dash');
        return;
      }
      this.keys.add(event.code);
      this.dashRequested = true;
      this.onDash?.({ movement: this.getMovementVector(), aimDirection: this.getAimDirection() });
    }

    if (event.code === 'KeyQ' && !event.repeat) {
      event.preventDefault();
      if (!this.canUseSpecial()) {
        this.onLockedAbility('special');
        return;
      }
      this.specialRequested = true;
      this.onSpecial?.();
    }

    if (event.code === 'Escape' && !event.repeat) {
      // No cancelar el comportamiento nativo: Escape también libera Pointer Lock.
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
    if (!this.pointerLocked || this.document.pointerLockElement !== this.element) return;
    const look = applyMouseLook(
      this.cameraYaw,
      this.cameraPitch,
      event.movementX,
      event.movementY,
      this.mouseSensitivity,
    );
    this.cameraYaw = look.yaw;
    this.cameraPitch = look.pitch;
    this.aimDirection = forwardFromYaw(this.cameraYaw);
    this.onCameraLook({ ...look });
  }

  handlePointerDown(event) {
    if (event.button !== 0) return;
    this.primaryFireHeld = true;
    this.element.focus?.({ preventScroll: true });

    if (!this.pointerLocked && this.document.pointerLockElement !== this.element) {
      this.requestPointerLock();
    }

    this.onPrimaryFire?.({
      direction: this.getAimDirection(),
      target: this.getAimDirection(),
    });
  }

  handlePointerUp(event) {
    if (event.button === 0 || event.type === 'pointercancel') this.primaryFireHeld = false;
  }

  requestPointerLock() {
    if (typeof this.element.requestPointerLock !== 'function') {
      this.onPointerLockChange(false, { unsupported: true });
      return false;
    }
    try {
      const request = this.element.requestPointerLock();
      if (request && typeof request.catch === 'function') {
        request.catch(() => this.onPointerLockChange(false, { error: true }));
      }
      return true;
    } catch {
      this.onPointerLockChange(false, { error: true });
      return false;
    }
  }

  handlePointerLockChange() {
    this.pointerLocked = this.document.pointerLockElement === this.element;
    this.onPointerLockChange(this.pointerLocked);
  }

  handlePointerLockError() {
    this.pointerLocked = false;
    this.onPointerLockChange(false, { error: true });
  }

  releasePointerLock() {
    if (this.document.pointerLockElement === this.element) this.document.exitPointerLock?.();
  }

  setMouseSensitivity(value) {
    this.mouseSensitivity = normalizeSensitivity(value);
    return this.mouseSensitivity;
  }

  getMovementVector(cameraYaw = this.cameraYaw) {
    const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight'))
      - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
    const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown'))
      - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
    return cameraRelativeMovement({ x, z }, cameraYaw);
  }

  getAimDirection() {
    return { ...this.aimDirection };
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
    this.jumpRequested = false;
  }

  dispose() {
    this.window.removeEventListener('keydown', this.handleKeyDown);
    this.window.removeEventListener('keyup', this.handleKeyUp);
    this.window.removeEventListener('blur', this.handleBlur);
    this.window.removeEventListener('pointerup', this.handlePointerUp);
    this.window.removeEventListener('pointercancel', this.handlePointerUp);
    this.document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    this.document.removeEventListener('mousemove', this.handlePointerMove);
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    if (this.document.pointerLockElement === this.element) this.document.exitPointerLock?.();
    this.clearKeys();
  }
}
