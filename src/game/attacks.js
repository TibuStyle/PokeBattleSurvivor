/**
 * Geometría de los ataques de v0.4 (haz, abanico y área).
 *
 * Estas funciones solo calculan a qué enemigos alcanza un movimiento.
 * No aplican daño ni tocan el estado de la partida: eso lo hace RunSession.
 * Así se pueden probar en Node sin Three.js ni DOM.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const DEFAULT_AIM = Object.freeze({ x: 0, z: -1 });

export function normalizeAngle(angle) {
  const turn = Math.PI * 2;
  return ((((angle + Math.PI) % turn) + turn) % turn) - Math.PI;
}

export function normalizeDirection(direction = DEFAULT_AIM) {
  const x = Number(direction?.x) || 0;
  const z = Number(direction?.z) || 0;
  const length = Math.hypot(x, z);
  if (length > 0.0001) return { x: x / length, z: z / length };
  return { x: DEFAULT_AIM.x, z: DEFAULT_AIM.z };
}

/**
 * @param {object} params
 * @param {object} params.move     Movimiento de moves.js (usa `shape` y `color`).
 * @param {object} params.derived  Valores ya escalados por mejoras: range, width, pierce, beams,
 *                                 spreadRadians, arc, maxTargets, radius, knockback.
 * @param {{x:number,z:number}} params.origin     Posición del compañero.
 * @param {{x:number,z:number}} params.direction  Dirección de disparo (normalizada aquí).
 * @param {Array} params.enemies   Enemigos atacables (ya filtrados si son inmunes).
 * @returns {{ beams: object[], targets: object[], area: object|null }}
 *  - targets: { enemy, distance, repeatIndex, direction? }. repeatIndex 0 = primer impacto;
 *    en haces, impactos repetidos sobre el mismo enemigo reducen su daño (como en v0.3).
 */
export function resolveAttackShape({ move, derived, origin, direction, enemies }) {
  const dir = normalizeDirection(direction);
  const shape = move?.shape ?? 'beam';
  if (shape === 'cone') return resolveCone({ move, derived, origin, dir, enemies });
  if (shape === 'burst') return resolveBurst({ move, derived, origin, enemies });
  return resolveBeam({ derived, origin, dir, enemies });
}

function resolveBeam({ derived, origin, dir, enemies }) {
  const baseAngle = Math.atan2(dir.z, dir.x);
  const beamCount = Math.max(1, Math.floor(derived.beams ?? 1));
  const spread = derived.spreadRadians ?? 0.18;
  const range = derived.range;
  const halfWidth = derived.width * 0.5;
  const pierce = Math.max(1, Math.floor(derived.pierce ?? 1));

  const beams = [];
  const targets = [];
  const hitCountByEnemy = new Map();

  for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
    const offsetIndex = beamIndex - (beamCount - 1) / 2;
    const angle = baseAngle + offsetIndex * spread;
    const rayX = Math.cos(angle);
    const rayZ = Math.sin(angle);

    const candidates = [];
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      const relX = enemy.x - origin.x;
      const relZ = enemy.z - origin.z;
      const projection = relX * rayX + relZ * rayZ;
      if (projection < -enemy.radius * 0.5 || projection > range + enemy.radius) continue;

      const clampedProj = clamp(projection, 0, range);
      const closestX = origin.x + rayX * clampedProj;
      const closestZ = origin.z + rayZ * clampedProj;
      const distSq = (enemy.x - closestX) ** 2 + (enemy.z - closestZ) ** 2;
      const hitRadius = enemy.radius + halfWidth;

      if (distSq <= hitRadius * hitRadius) {
        candidates.push({ enemy, distance: Math.max(0, projection) });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    const pierced = candidates.slice(0, pierce);
    const effectiveLength = pierced.length >= pierce
      ? clamp(pierced[pierced.length - 1].distance + 0.4, 1.5, range)
      : range;

    beams.push({
      startX: origin.x,
      startZ: origin.z,
      endX: origin.x + rayX * effectiveLength,
      endZ: origin.z + rayZ * effectiveLength,
      dirX: rayX,
      dirZ: rayZ,
      length: effectiveLength,
      width: derived.width,
    });

    for (const { enemy, distance } of pierced) {
      const priorHits = hitCountByEnemy.get(enemy.id) ?? 0;
      hitCountByEnemy.set(enemy.id, priorHits + 1);
      targets.push({
        enemy,
        distance,
        repeatIndex: priorHits,
        direction: { x: rayX, z: rayZ },
      });
    }
  }

  return { beams, targets, area: null };
}

function resolveCone({ derived, origin, dir, enemies }) {
  const arc = derived.arc ?? 0.9;
  const range = derived.range;
  const maxTargets = Math.max(1, Math.floor(derived.maxTargets ?? 4));
  const facing = Math.atan2(dir.z, dir.x);
  // Margen extra para que los enemigos a medio cuerpo dentro del arco también cuenten.
  const halfArc = arc / 2 + 0.12;

  const candidates = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - origin.x;
    const dz = enemy.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > range + enemy.radius) continue;

    const offAxis = Math.abs(normalizeAngle(Math.atan2(dz, dx) - facing));
    const touchesCore = distance <= enemy.radius + 0.6;
    if (offAxis <= halfArc || touchesCore) {
      candidates.push({ enemy, distance, repeatIndex: 0 });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const targets = candidates.slice(0, maxTargets);

  // Rayos visuales distribuidos a lo largo del arco.
  const rayCount = 5;
  const beams = [];
  for (let index = 0; index < rayCount; index += 1) {
    const t = rayCount === 1 ? 0.5 : index / (rayCount - 1);
    const angle = facing + (t - 0.5) * arc;
    const rayX = Math.cos(angle);
    const rayZ = Math.sin(angle);
    beams.push({
      startX: origin.x,
      startZ: origin.z,
      endX: origin.x + rayX * range,
      endZ: origin.z + rayZ * range,
      dirX: rayX,
      dirZ: rayZ,
      length: range,
      width: 0.42,
    });
  }

  return { beams, targets, area: null };
}

function resolveBurst({ move, derived, origin, enemies }) {
  const radius = derived.radius ?? 2.5;
  const targets = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    const distance = Math.hypot(enemy.x - origin.x, enemy.z - origin.z);
    if (distance <= radius + enemy.radius) {
      targets.push({ enemy, distance, repeatIndex: 0 });
    }
  }
  targets.sort((a, b) => a.distance - b.distance);

  return {
    beams: [],
    targets,
    area: { x: origin.x, z: origin.z, radius, color: move?.color ?? '#ffffff' },
  };
}
