// Accept actual engine surface hits only; never invent a pose in front of the camera.
export function chooseSurfaceHit(hits) {
  if (!Array.isArray(hits)) return null;
  return hits.filter(hit =>
    ['DETECTED_SURFACE', 'ESTIMATED_SURFACE'].includes(hit?.type) &&
    ['x', 'y', 'z'].every(axis => Number.isFinite(hit.position?.[axis])) &&
    Number.isFinite(hit.distance) && hit.distance >= 0.25 && hit.distance <= 4
  ).sort((a, b) => a.distance - b.distance)[0] || null;
}

// XR8 World Tracking maintains one horizontal ground plane at world Y=0.
// This is an intersection with that tracked world plane after tracking is
// NORMAL, not a pose invented in front of the camera. In absolute scale the
// camera's world Y is its estimated physical height above this ground plane.
// https://8thwall.org/docs/troubleshooting/world-tracking-issues
export function intersectTrackedGround(options) {
  const {origin, direction, tracking} = options || {};
  const finiteVector = vector => ['x', 'y', 'z'].every(axis => Number.isFinite(vector?.[axis]));
  if (tracking !== 'NORMAL' || !finiteVector(origin) || !finiteVector(direction) ||
      origin.y <= 0.1 || direction.y >= 0) return null;

  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length === 0) return null;
  const t = -origin.y / direction.y;
  const distance = t * length;
  if (!Number.isFinite(distance) || distance < 0.25 || distance > 4) return null;

  const position = {x: origin.x + t * direction.x, y: 0, z: origin.z + t * direction.z};
  if (!finiteVector(position)) return null;
  return {type: 'TRACKED_GROUND', position, distance, source: 'xr8-world-ground'};
}
