/**
 * Cámara de tercera persona de v0.4: baja y detrás del compañero.
 *
 * Funciones puras (sin Three.js) para poder probarlas en Node:
 *  - La cámara se coloca detrás del compañero según un yaw horizontal.
 *  - El yaw solo sigue al apuntado mientras el cursor se mueve y el apuntado se aleja de la
 *    zona muerta central. Con el cursor quieto no gira: si siguiera al apuntado, un cursor
 *    fijo en un borde haría girar la cámara sin parar (el apuntado gira con ella).
 *  - El movimiento WASD es relativo a la cámara (W avanza hacia donde se mira).
 *
 * Convención de yaw (igual que `rotationY` del compañero): la dirección horizontal es
 * (sin(yaw), cos(yaw)). Yaw = π mira hacia −Z, que es el sentido inicial del prototipo.
 */

export const CAMERA_RIG = Object.freeze({
  fov: 52,
  distance: 7.4,      // distancia horizontal detrás del compañero
  baseHeight: 2.35,   // altura base: cámara baja
  jumpLift: 0.3,      // cuánto sube la cámara con los saltos (fracción de la altura)
  lookAhead: 2.6,     // punto de mira delante del compañero (hace que quede en la parte inferior)
  lookHeight: 1.05,   // altura del punto de mira
  deadZone: 0.32,     // radianes (~18°) que el apuntado puede desviarse sin girar la cámara
  followRate: 2.4,    // velocidad de giro hacia el apuntado fuera de la zona muerta (1/s)
  followWindow: 0.2,  // segundos que la cámara sigue girando tras el último movimiento del cursor
  smoothing: 9,       // suavizado de la posición de la cámara (1/s)
});

const TURN = Math.PI * 2;

export function normalizeAngle(angle) {
  return ((((angle + Math.PI) % TURN) + TURN) % TURN) - Math.PI;
}

/** Dirección horizontal (unitaria) de un yaw. */
export function forwardFromYaw(yaw) {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/**
 * Gira el yaw de la cámara hacia el apuntado, pero solo lo que excede la zona muerta.
 * Converge: si el apuntado queda dentro de la zona muerta, el yaw deja de cambiar.
 * La llamada solo tiene efecto mientras el seguimiento esté activo (ver nextFollowTimer).
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
 * @param {{x:number,z:number}} target  Posición horizontal del compañero.
 * @param {number} yaw                  Yaw de la cámara (detrás del compañero).
 * @param {number} height               Altura del compañero (salto).
 */
export function thirdPersonCameraPose(target, yaw, height = 0, rig = CAMERA_RIG) {
  const forward = forwardFromYaw(yaw);
  return {
    position: {
      x: target.x - forward.x * rig.distance,
      y: rig.baseHeight + Math.max(0, height) * rig.jumpLift,
      z: target.z - forward.z * rig.distance,
    },
    lookAt: {
      x: target.x + forward.x * rig.lookAhead,
      y: rig.lookHeight,
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
  // Vector derecha = forward × arriba, en el plano horizontal.
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
 * Temporizador de seguimiento de la cámara: se rearma con cada movimiento del cursor y
 * se agota `window` segundos después de que el cursor se detiene.
 */
export function nextFollowTimer(timer, cursorMoved, delta, window = CAMERA_RIG.followWindow) {
  if (cursorMoved) return window;
  return Math.max(0, (Number(timer) || 0) - Math.max(0, Number(delta) || 0));
}
