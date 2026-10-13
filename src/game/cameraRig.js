/**
 * Cámara de tercera persona para el campo 3D.
 *
 * El puntero capturado con Pointer Lock controla la cámara (yaw/pitch); WASD se
 * proyecta sobre el plano horizontal relativo a ese yaw. El compañero gira por
 * separado y de forma amortiguada en RunSession, nunca de golpe por el ratón.
 * Las funciones son puras para poder probar el control sin Three.js ni DOM.
 *
 * Convención de yaw: dirección horizontal = (sin(yaw), cos(yaw)). Yaw = π mira −Z.
 */

export const CAMERA_RIG = Object.freeze({
  fov: 52,
  distance: 7.4,
  baseHeight: 2.35,
  jumpLift: 0.3,
  lookAhead: 2.6,
  lookHeight: 1.05,
  defaultPitch: -0.08,
  minPitch: -0.52,
  maxPitch: 0.52,
  turnRate: 9.5,
  smoothing: 9,
  // Se conservan estos valores para consumidores antiguos; el seguimiento por cursor
  // ya no se usa: el yaw ahora viene directamente del movimiento relativo de Pointer Lock.
  deadZone: 0.32,
  followRate: 2.4,
  followWindow: 0.2,
});

export const MOUSE_LOOK = Object.freeze({
  radiansPerPixel: 0.0022,
  defaultSensitivity: 1,
  minSensitivity: 0.4,
  maxSensitivity: 2.4,
});

const TURN = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function normalizeAngle(angle) {
  return ((((angle + Math.PI) % TURN) + TURN) % TURN) - Math.PI;
}

export function normalizeSensitivity(value) {
  const numeric = Number(value);
  return clamp(
    Number.isFinite(numeric) ? numeric : MOUSE_LOOK.defaultSensitivity,
    MOUSE_LOOK.minSensitivity,
    MOUSE_LOOK.maxSensitivity,
  );
}

/** Dirección horizontal (unitaria) de un yaw. */
export function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/**
 * Aplica deltas de Pointer Lock. Mover el ratón a la derecha gira la vista a la derecha;
 * moverlo hacia arriba eleva la cámara. La sensibilidad es un multiplicador de usuario.
 */
export function applyMouseLook(currentYaw, currentPitch, movementX, movementY, sensitivity = 1) {
  const scale = MOUSE_LOOK.radiansPerPixel * normalizeSensitivity(sensitivity);
  const dx = Number.isFinite(Number(movementX)) ? Number(movementX) : 0;
  const dy = Number.isFinite(Number(movementY)) ? Number(movementY) : 0;
  return {
    yaw: normalizeAngle((Number(currentYaw) || 0) - dx * scale),
    pitch: clamp(
      (Number(currentPitch) || 0) - dy * scale,
      CAMERA_RIG.minPitch,
      CAMERA_RIG.maxPitch,
    ),
  };
}

/** Giro exponencial suave por el arco más corto; el resultado es estable ante wrap de ±π. */
export function smoothYaw(currentYaw, targetYaw, delta, rate = CAMERA_RIG.turnRate) {
  const current = Number.isFinite(Number(currentYaw)) ? Number(currentYaw) : 0;
  const target = Number.isFinite(Number(targetYaw)) ? Number(targetYaw) : current;
  const dt = Math.max(0, Number(delta) || 0);
  const turnRate = Math.max(0, Number(rate) || 0);
  const difference = normalizeAngle(target - current);
  return normalizeAngle(current + difference * (1 - Math.exp(-dt * turnRate)));
}

/**
 * Gira el yaw de la cámara hacia el apuntado; se conserva por compatibilidad con la
 * versión anterior, pero el control Pointer Lock ya no necesita este seguimiento.
 */
export function followCameraYaw(currentYaw, aimYaw, delta, {
  deadZone = CAMERA_RIG.deadZone,
  rate = CAMERA_RIG.followRate,
} = {}) {
  const diff = normalizeAngle(aimYaw - currentYaw);
  const excess = Math.abs(diff) - deadZone;
  if (excess <= 0) return currentYaw;
  const step = Math.sign(diff) * excess * (1 - Math.exp(-Math.max(0, delta) * rate));
  return normalizeAngle(currentYaw + step);
}

/**
 * Posición de cámara y punto de mira para un compañero en `target`.
 * @param {{x:number,z:number}} target posición horizontal del compañero
 * @param {number} yaw cámara detrás del compañero
 * @param {number} height salto actual
 * @param {object} rig parámetros geométricos de cámara
 * @param {number} pitch inclinación vertical ajustada con el ratón
 */
export function thirdPersonCameraPose(target, yaw, height = 0, rig = CAMERA_RIG, pitch = rig.defaultPitch ?? 0) {
  const forward = forwardFromYaw(yaw);
  const safePitch = clamp(Number(pitch) || 0, rig.minPitch ?? CAMERA_RIG.minPitch, rig.maxPitch ?? CAMERA_RIG.maxPitch);
  const lookDistance = rig.distance + rig.lookAhead;
  return {
    position: {
      x: target.x - forward.x * rig.distance,
      y: rig.baseHeight + Math.max(0, height) * rig.jumpLift,
      z: target.z - forward.z * rig.distance,
    },
    lookAt: {
      x: target.x + forward.x * rig.lookAhead,
      y: rig.lookHeight + Math.max(0, height) + Math.tan(safePitch) * lookDistance,
      z: target.z + forward.z * rig.lookAhead,
    },
    forward,
  };
}

/**
 * Convierte la entrada del teclado (ix = D − A; iz = S − W) en movimiento de mundo
 * relativo a la cámara. W (iz = −1) avanza hacia la dirección en la que mira la cámara.
 */
export function cameraRelativeMovement(input, yaw) {
  const ix = Number(input?.x) || 0;
  const iz = Number(input?.z) || 0;
  const forward = forwardFromYaw(yaw);
  const right = { x: -forward.z, z: forward.x };
  const forwardAmount = -iz;
  let x = forward.x * forwardAmount + right.x * ix;
  let z = forward.z * forwardAmount + right.z * ix;
  const length = Math.hypot(x, z);
  if (length > 1) {
    x /= length;
    z /= length;
  }
  return { x, z };
}

/**
 * Temporizador legado de seguimiento del cursor, retenido para no romper integraciones
 * que consuman la API v0.4 anterior. La cámara actual usa Pointer Lock.
 */
export function nextFollowTimer(timer, cursorMoved, delta, window = CAMERA_RIG.followWindow) {
  if (cursorMoved) return window;
  return Math.max(0, (Number(timer) || 0) - Math.max(0, Number(delta) || 0));
}
