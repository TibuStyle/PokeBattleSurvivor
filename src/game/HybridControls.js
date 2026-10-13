/**
 * src/game/HybridControls.js
 * Controles Híbridos 3D (WASD + Mouse Pointer Lock / Cursor Aim + Salto/Planeo + Estado):
 * - 100% compatible con todas las llamadas de GameApp.js y cameraRig.js:
 *   getMovementVector(yaw), getAimDirection(), consumeJumpRequest(), isJumpHeld(),
 *   consumeSpecialRequest(), consumeDashRequest(), clearKeys(), releasePointerLock(),
 *   setMouseSensitivity(), dispose().
 * - Incluye soporte para Habilidades de Estado (Tecla E / Clic Derecho, ej. Danza Espada),
 *   bloqueables cuando el jugador equipa Cinta Elegida.
 */
import {
  MOUSE_LOOK,
  applyMouseLook,
  cameraRelativeMovement,
  forwardFromYaw,
  normalizeSensitivity,
} from './cameraRig.js';

const MOVEMENT_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
]);
const DASH_CODES = new Set(['ShiftLeft', 'ShiftRight']);
const JUMP_CODES = new Set(['Space']);
const STATE_BUFF_CODES = new Set(['KeyE']);
const UPGRADE_KEY_INDEX = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
};

export class HybridControls {
  constructor({
    element,
    cameraYaw = Math.PI,
    cameraPitch = -0.08,
    mouseSensitivity = MOUSE_LOOK.defaultSensitivity,
    sensitivity,
    onPointerLockChange = () => {},
    onCameraLook = () => {},
    canUseSpecial = () => true,
    canUseDash = () => true,
    onLockedAbility = () => {},
    onPause = () => {},
    onSelectUpgrade = () => {},
    useCursorAim = false,
    enabled = true,
  } = {}) {
    this.element = element || (typeof document !== 'undefined' ? document.body : null);
    this.enabled = Boolean(enabled);
    this.useCursorAim = Boolean(useCursorAim);

    this.onPointerLockChange = onPointerLockChange;
    this.onCameraLook = onCameraLook;
    this.canUseSpecial = canUseSpecial;
    this.canUseDash = canUseDash;
    this.onLockedAbility = onLockedAbility;
    this.onPause = onPause;
    this.onSelectUpgrade = onSelectUpgrade;

    this.activeKeys = new Set();
    this.pendingAttack = false;
    this.pendingAimedShot = false;
    this.pendingStateSkill = false;
    this.pendingDash = false;
    this.pendingJump = false;
    this.isPrimaryMouseDown = false;
    this.pendingUpgradeIndex = null;

    this.unlocks = {
      attack: true,
      dash: false,
      stateSkill: true,
    };

    // Restricción de Cinta Elegida (bloquea Movimientos de Estado)
    this.blocksStateMoves = false;

    this.cameraYaw = cameraYaw;
    this.cameraPitch = cameraPitch;
    this.mouseSensitivity = normalizeSensitivity(sensitivity ?? mouseSensitivity);

    this.cursorNDC = { x: 0, y: 0 };
    this.aimDirection = forwardFromYaw(cameraYaw);

    this.boundPointerLockChange = this.handlePointerLockChange.bind(this);
    this.boundPointerLockError = this.handlePointerLockError.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundContextMenu = (e) => e.preventDefault();

    this.attach();
  }

  attach() {
    if (!this.enabled || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('mousemove', this.boundMouseMove);
    if (this.element) {
      this.element.addEventListener('mousedown', this.boundMouseDown);
      this.element.addEventListener('contextmenu', this.boundContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('pointerlockchange', this.boundPointerLockChange);
      document.addEventListener('pointerlockerror', this.boundPointerLockError);
    }
  }

  detach() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
      window.removeEventListener('mouseup', this.boundMouseUp);
      window.removeEventListener('mousemove', this.boundMouseMove);
    }
    if (this.element) {
      this.element.removeEventListener('mousedown', this.boundMouseDown);
      this.element.removeEventListener('contextmenu', this.boundContextMenu);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
      document.removeEventListener('pointerlockerror', this.boundPointerLockError);
    }
    this.resetInputState();
  }

  setUnlocks(unlocks = {}) {
    this.unlocks = {
      attack: unlocks.attack ?? this.unlocks.attack,
      dash: unlocks.dash ?? this.unlocks.dash,
      stateSkill: unlocks.stateSkill ?? this.unlocks.stateSkill,
    };
  }

  setEquippedItemConstraints({ blocksStateMoves = false } = {}) {
    this.blocksStateMoves = Boolean(blocksStateMoves);
  }

  setMouseSensitivity(value) {
    this.mouseSensitivity = normalizeSensitivity(value);
    return this.mouseSensitivity;
  }

  requestPointerLock() {
    if (typeof document === 'undefined' || !this.element) return;
    if (!this.element.requestPointerLock) {
      this.onPointerLockChange(false, { unsupported: true });
      return;
    }
    if (document.pointerLockElement !== this.element) {
      try {
        this.element.requestPointerLock();
      } catch {
        this.onPointerLockChange(false, { error: true });
      }
    }
  }

  releasePointerLock() {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.element && document.exitPointerLock) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignorar
      }
    }
  }

  exitPointerLock() {
    this.releasePointerLock();
  }

  handlePointerLockChange() {
    const locked = typeof document !== 'undefined' && document.pointerLockElement === this.element;
    this.onPointerLockChange(locked, {});
  }

  handlePointerLockError() {
    this.onPointerLockChange(false, { error: true });
  }

  handleKeyDown(e) {
    if (!this.enabled) return;

    if (e.code === 'Escape') {
      this.onPause?.();
      return;
    }

    if (MOVEMENT_CODES.has(e.code)) {
      this.activeKeys.add(e.code);
    }

    if (JUMP_CODES.has(e.code)) {
      e.preventDefault?.();
      if (!this.activeKeys.has(e.code)) {
        this.pendingJump = true;
      }
      this.activeKeys.add(e.code);
    }

    if (e.code === 'KeyQ') {
      if (this.canUseSpecial() && this.unlocks.attack) {
        this.pendingAttack = true;
      } else {
        this.onLockedAbility?.('special');
      }
    }

    if (STATE_BUFF_CODES.has(e.code)) {
      if (this.unlocks.stateSkill && !this.blocksStateMoves) {
        this.pendingStateSkill = true;
      } else {
        this.onLockedAbility?.('state');
      }
    }

    if (DASH_CODES.has(e.code)) {
      e.preventDefault?.();
      if (this.canUseDash() || this.unlocks.dash) {
        this.pendingDash = true;
      } else {
        this.onLockedAbility?.('dash');
      }
    }

    if (e.code in UPGRADE_KEY_INDEX) {
      const idx = UPGRADE_KEY_INDEX[e.code];
      this.pendingUpgradeIndex = idx;
      this.onSelectUpgrade?.(idx);
    }
  }

  handleKeyUp(e) {
    if (MOVEMENT_CODES.has(e.code) || JUMP_CODES.has(e.code)) {
      this.activeKeys.delete(e.code);
    }
  }

  handleMouseDown(e) {
    if (!this.enabled) return;
    if (e.button === 0) {
      this.isPrimaryMouseDown = true;
      this.requestPointerLock();
      this.pendingAimedShot = true;
    } else if (e.button === 2) {
      if (this.unlocks.stateSkill && !this.blocksStateMoves) {
        this.pendingStateSkill = true;
      }
    }
  }

  handleMouseUp(e) {
    if (e.button === 0) {
      this.isPrimaryMouseDown = false;
    }
  }

  handleMouseMove(e) {
    if (!this.enabled) return;

    if (typeof document !== 'undefined' && document.pointerLockElement === this.element) {
      this.updateCameraFromMouse(e.movementX, e.movementY);
      return;
    }

    const rect = this.element?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: (typeof window !== 'undefined' && window.innerWidth) || 1,
      height: (typeof window !== 'undefined' && window.innerHeight) || 1,
    };

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    this.cursorNDC.x = ((e.clientX - rect.left) / width) * 2 - 1;
    this.cursorNDC.y = -((e.clientY - rect.top) / height) * 2 + 1;

    if (this.useCursorAim) {
      this.updateAimFromCursorNDC();
    }
  }

  updateAimFromCursorNDC() {
    const forward = forwardFromYaw(this.cameraYaw);
    const right = { x: -forward.z, z: forward.x };
    const aimX = forward.x * (-this.cursorNDC.y + 0.35) + right.x * this.cursorNDC.x;
    const aimZ = forward.z * (-this.cursorNDC.y + 0.35) + right.z * this.cursorNDC.x;
    const length = Math.hypot(aimX, aimZ);

    if (length > 1e-4) {
      this.aimDirection = { x: aimX / length, z: aimZ / length };
    } else {
      this.aimDirection = forward;
    }
    return this.aimDirection;
  }

  /**
   * Devuelve el vector de movimiento (x, z) relativo al yaw de la cámara,
   * usando la firma exacta de cameraRelativeMovement({ x: ix, z: iz }, yaw).
   */
  getMovementVector(yaw = this.cameraYaw) {
    const ix =
      (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight') ? 1 : 0) -
      (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft') ? 1 : 0);
    const iz =
      (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown') ? 1 : 0) -
      (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp') ? 1 : 0);

    return cameraRelativeMovement({ x: ix, z: iz }, yaw);
  }

  getForwardVector() {
    return forwardFromYaw(this.cameraYaw);
  }

  getAimDirection() {
    if (this.useCursorAim && (typeof document === 'undefined' || document.pointerLockElement !== this.element)) {
      return { ...this.aimDirection };
    }
    return forwardFromYaw(this.cameraYaw);
  }

  isJumpHeld() {
    return this.activeKeys.has('Space');
  }

  isGlideHeld() {
    return this.isJumpHeld();
  }

  consumeJumpRequest() {
    const val = this.pendingJump;
    this.pendingJump = false;
    return val;
  }

  consumeJump() {
    return this.consumeJumpRequest();
  }

  consumeSpecialRequest() {
    const val = this.pendingAttack;
    this.pendingAttack = false;
    return val;
  }

  consumeAttack() {
    return this.consumeSpecialRequest();
  }

  consumeAimedShot() {
    const val = this.pendingAimedShot || this.isPrimaryMouseDown;
    this.pendingAimedShot = false;
    return val;
  }

  consumeStateSkill() {
    if (this.blocksStateMoves) {
      this.pendingStateSkill = false;
      return false;
    }
    const val = this.pendingStateSkill;
    this.pendingStateSkill = false;
    return val;
  }

  consumeDashRequest() {
    const val = this.pendingDash;
    this.pendingDash = false;
    return val;
  }

  consumeDash() {
    return this.consumeDashRequest();
  }

  consumeUpgradeSelection() {
    const val = this.pendingUpgradeIndex;
    this.pendingUpgradeIndex = null;
    return val;
  }

  updateCameraFromMouse(movementX, movementY) {
    const updated = applyMouseLook(
      this.cameraYaw,
      this.cameraPitch,
      movementX,
      movementY,
      this.mouseSensitivity
    );
    this.cameraYaw = updated.yaw;
    this.cameraPitch = updated.pitch;
    this.aimDirection = forwardFromYaw(this.cameraYaw);
    this.onCameraLook?.({ yaw: this.cameraYaw, pitch: this.cameraPitch });
  }

  clearKeys() {
    this.resetInputState();
  }

  resetInputState() {
    this.activeKeys.clear();
    this.pendingAttack = false;
    this.pendingAimedShot = false;
    this.pendingStateSkill = false;
    this.pendingDash = false;
    this.pendingJump = false;
    this.isPrimaryMouseDown = false;
    this.pendingUpgradeIndex = null;
  }

  dispose() {
    this.detach();
  }

  destroy() {
    this.detach();
  }
}
