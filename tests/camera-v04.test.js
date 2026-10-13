import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAMERA_RIG,
  cameraRelativeMovement,
  followCameraYaw,
  forwardFromYaw,
  nextFollowTimer,
  thirdPersonCameraPose,
} from '../src/game/cameraRig.js';

const near = (actual, expected, epsilon = 1e-6, message = '') =>
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message} esperado ${expected}, recibido ${actual}`);

test('v0.4 cámara: queda detrás del compañero, baja y mirando hacia delante', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -2.1, 2.7]) {
    const target = { x: 3, z: -4 };
    const pose = thirdPersonCameraPose(target, yaw, 0);
    const toCamera = { x: pose.position.x - target.x, z: pose.position.z - target.z };
    const forward = forwardFromYaw(yaw);
    // La cámara está en sentido contrario a la dirección de mira del compañero
    const along = toCamera.x * forward.x + toCamera.z * forward.z;
    near(along, -CAMERA_RIG.distance, 1e-9, `yaw ${yaw}: distancia detrás`);
    // Altura baja (muy por debajo de la vista cenital de v0.3, que era 18)
    assert.ok(pose.position.y < 4, `la cámara debe ser baja (y=${pose.position.y})`);
    assert.ok(pose.position.y < 18, 'la cámara ya no es cenital');
    // El punto de mira está delante del compañero
    const lookAlong = (pose.lookAt.x - target.x) * forward.x + (pose.lookAt.z - target.z) * forward.z;
    assert.ok(lookAlong > 0, 'la cámara mira hacia delante del compañero');
  }
});

test('v0.4 cámara: al saltar, la cámara sube un poco, pero se mantiene baja', () => {
  const grounded = thirdPersonCameraPose({ x: 0, z: 0 }, Math.PI, 0);
  const jumping = thirdPersonCameraPose({ x: 0, z: 0 }, Math.PI, 6);
  assert.ok(jumping.position.y > grounded.position.y, 'sube con el salto');
  assert.ok(jumping.position.y - grounded.position.y < 3, 'el seguimiento del salto es moderado');
});

test('v0.4 cámara: el yaw no cambia si el apuntado está dentro de la zona muerta', () => {
  const yaw = 0.4;
  const aim = yaw + CAMERA_RIG.deadZone * 0.5;
  assert.equal(followCameraYaw(yaw, aim, 0.5), yaw);
});

test('v0.4 cámara: el yaw converge a la zona muerta y se queda quieto con el apuntado fijo', () => {
  let yaw = 0;
  const aim = 1.2;
  for (let frame = 0; frame < 600; frame += 1) {
    yaw = followCameraYaw(yaw, aim, 1 / 60);
  }
  const remaining = Math.abs(aim - yaw);
  near(remaining, CAMERA_RIG.deadZone, 1e-3, 'diferencia final');
  const settled = yaw;
  for (let frame = 0; frame < 120; frame += 1) {
    yaw = followCameraYaw(yaw, aim, 1 / 60);
  }
  near(yaw, settled, 1e-9, 'no debe seguir girando');
});

test('v0.4 cámara: con el cursor quieto no hay giro infinito aunque el apuntado esté desplazado', () => {
  // Un cursor fijo en un borde hace que el apuntado gire con la cámara: si la cámara siguiera
  // siempre, el yaw crecería sin límite. El temporizador corta el seguimiento al quedar quieto.
  let yaw = 0;
  let timer = 0;
  const offset = 0.6; // el apuntado está 0,6 rad a la derecha de la cámara
  for (let frame = 0; frame < 1200; frame += 1) {
    const cursorMoved = frame < 6; // el cursor se mueve solo al principio
    timer = nextFollowTimer(timer, cursorMoved, 1 / 60);
    const aim = yaw + offset;
    if (timer > 0) yaw = followCameraYaw(yaw, aim, 1 / 60);
  }
  assert.ok(Math.abs(yaw) < 1, `el yaw debe quedarse acotado (yaw=${yaw.toFixed(3)})`);
  const settled = yaw;
  for (let frame = 0; frame < 300; frame += 1) {
    timer = nextFollowTimer(timer, false, 1 / 60);
    if (timer > 0) yaw = followCameraYaw(yaw, yaw + offset, 1 / 60);
  }
  near(yaw, settled, 1e-9, 'sin movimiento del cursor la cámara no gira');
});

test('v0.4 cámara: el temporizador de seguimiento se rearma con el cursor y luego se agota', () => {
  let timer = nextFollowTimer(0, true, 0.016);
  assert.equal(timer, CAMERA_RIG.followWindow);
  timer = nextFollowTimer(timer, false, 0.1);
  assert.ok(timer > 0 && timer < CAMERA_RIG.followWindow);
  timer = nextFollowTimer(timer, false, 1);
  assert.equal(timer, 0);
});

test('v0.4 controles: W avanza hacia donde mira la cámara, D a su derecha', () => {
  // Cámara con yaw π mira hacia −Z: W debe mover hacia −Z y D hacia +X
  const forward = cameraRelativeMovement({ x: 0, z: -1 }, Math.PI);
  near(forward.x, 0, 1e-9);
  near(forward.z, -1, 1e-9, 'W hacia −Z');
  const right = cameraRelativeMovement({ x: 1, z: 0 }, Math.PI);
  near(right.x, 1, 1e-9, 'D hacia +X');
  near(right.z, 0, 1e-9);
});

test('v0.4 controles: el movimiento diagonal se normaliza y la entrada vacía no mueve', () => {
  const diagonal = cameraRelativeMovement({ x: 1, z: -1 }, 0.3);
  near(Math.hypot(diagonal.x, diagonal.z), 1, 1e-9, 'diagonal unitaria');
  const idle = cameraRelativeMovement({ x: 0, z: 0 }, 1.1);
  near(idle.x, 0, 1e-12, 'sin entrada, sin movimiento en X');
  near(idle.z, 0, 1e-12, 'sin entrada, sin movimiento en Z');
});

test('v0.4 controles: la dirección de W sigue al giro de la cámara', () => {
  const yaw = Math.PI / 2;
  const forward = forwardFromYaw(yaw);
  const moved = cameraRelativeMovement({ x: 0, z: -1 }, yaw);
  near(moved.x, forward.x, 1e-9);
  near(moved.z, forward.z, 1e-9);
});
