/**
 * src/game/HybridControls.js
 * Compatible al 100% con los tests unitarios actuales de PokeBattleSurvivor (camera-v04 / skills-v05)
 * y ampliado con las mecánicas del GDD 3D:
 * - WASD relativo a la cámara.
 * - Puntería con el cursor del mouse en 3D (Raycasting / plano del suelo) + Clic Izquierdo para disparar habilidades direccionales.
 * - Salto (Espacio) y Planeo / Glide (mantener Espacio en el aire para Tipo Volador).
 * - Habilidad de Estado / Buff activo (Tecla E o Clic Derecho, ej. Danza Espada, bloqueable por Cinta Elegida).
 * - Esquiva / Dash (Shift) y selección de mejoras (1, 2, 3).
 */
import {
  MOUSE_LOOK,
  applyMouseLook,
  cameraRelativeMovement,
  forwardFromYaw,
  normalizeSensitivity,
} from './cameraRig.js';

const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);
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
    cameraPitch = -0.22,
    sensitivity = MOUSE_LOOK.SENSITIVITY_DEFAULT,
    useCursorAim = true,
    enabled = true,
  } = {}) {
    this.element = element || (typeof document !== 'undefined' ? document.body : null);
    this.enabled = Boolean(enabled);
    this.useCursorAim = Boolean(useCursorAim);

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

    // Estado de equipamiento que afecta controles (ej. Cinta Elegida bloquea Movimientos de Estado)
    this.blocksStateMoves = false;

    this.cameraYaw = cameraYaw;
    this.cameraPitch = cameraPitch;
    this.mouseLookMode = MOUSE_LOOK.MODE_NONE;
    this.mouseSensitivity = normalizeSensitivity(sensitivity);

    // Coordenadas del cursor normalizadas (-1 a +1) y vector de puntería en el plano XZ
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

  requestPointerLock() {
    if (
      !this.useCursorAim &&
      typeof document !== 'undefined' &&
      document.pointerLockElement !== this.element &&
      this.element?.requestPointerLock
    ) {
      try {
        this.element.requestPointerLock();
      } catch {
        // Ignorar rechazo del navegador
      }
    }
  }

  exitPointerLock() {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.element && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  handlePointerLockChange() {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.element) {
      this.mouseLookMode = MOUSE_LOOK.MODE_LOCKED;
    } else {
      this.mouseLookMode = MOUSE_LOOK.MODE_NONE;
    }
  }

  handlePointerLockError() {
    this.mouseLookMode = MOUSE_LOOK.MODE_NONE;
  }

  handleKeyDown(e) {
    if (!this.enabled) return;

    if (MOVEMENT_CODES.has(e.code)) {
      this.activeKeys.add(e.code);
    }

    if (JUMP_CODES.has(e.code)) {
      if (!this.activeKeys.has(e.code)) {
        this.pendingJump = true;
      }
      this.activeKeys.add(e.code);
    }

    if (e.code === 'KeyQ' && this.unlocks.attack) {
      this.pendingAttack = true;
    }

    if (STATE_BUFF_CODES.has(e.code) && this.unlocks.stateSkill && !this.blocksStateMoves) {
      this.pendingStateSkill = true;
    }

    if (DASH_CODES.has(e.code) && this.unlocks.dash) {
      this.pendingDash = true;
    }

    if (e.code in UPGRADE_KEY_INDEX) {
      this.pendingUpgradeIndex = UPGRADE_KEY_INDEX[e.code];
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
      if (this.unlocks.attack) {
        this.pendingAttack = true;
        this.pendingAimedShot = true;
      }
    } else if (e.button === 2) {
      // Clic Derecho: Activar habilidad de Estado (ej. Danza Espada) si no está bloqueada por Cinta Elegida
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

    // Actualizar coordenadas del cursor para puntería libre 3D sobre el mapa
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

    this.updateAimFromCursorNDC();
  }

  /**
   * Convierte la posición del cursor en pantalla en un vector unitario 3D (x, z)
   * orientado respecto al ángulo actual de la cámara.
   */
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

  getMovementVector() {
    let forward = 0;
    let right = 0;

    if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) forward += 1;
    if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) forward -= 1;
    if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) right += 1;
    if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) right -= 1;

    return cameraRelativeMovement(forward, right, this.cameraYaw);
  }

  getForwardVector() {
    return this.useCursorAim ? this.aimDirection : forwardFromYaw(this.cameraYaw);
  }

  getAimDirection() {
    return { ...this.aimDirection };
  }

  /**
   * Indica si el jugador está manteniendo Espacio en el aire para planear (Pasiva Tipo Volador).
   */
  isGlideHeld() {
    return this.activeKeys.has('Space');
  }

  consumeJump() {
    const val = this.pendingJump;
    this.pendingJump = false;
    return val;
  }

  consumeAttack() {
    const val = this.pendingAttack;
    this.pendingAttack = false;
    return val;
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

  consumeDash() {
    const val = this.pendingDash;
    this.pendingDash = false;
    return val;
  }

  consumeUpgradeSelection() {
    const val = this.pendingUpgradeIndex;
    this.pendingUpgradeIndex = null;
    return val;
  }

  updateCameraFromMouse(movementX, movementY) {
    const updated = applyMouseLook(
      { yaw: this.cameraYaw, pitch: this.cameraPitch },
      movementX,
      movementY,
      this.mouseSensitivity
    );
    this.cameraYaw = updated.yaw;
    this.cameraPitch = updated.pitch;
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

  destroy() {
    this.detach();
  }
}
