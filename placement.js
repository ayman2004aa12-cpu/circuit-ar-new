// Accept actual engine surface hits only; never invent a pose in front of the camera.
export function chooseSurfaceHit(hits) {
  if (!Array.isArray(hits)) return null;
  return hits.filter(hit =>
    ['DETECTED_SURFACE', 'ESTIMATED_SURFACE'].includes(hit?.type) &&
    ['x', 'y', 'z'].every(axis => Number.isFinite(hit.position?.[axis])) &&
    Number.isFinite(hit.distance) && hit.distance >= 0.25 && hit.distance <= 4
  ).sort((a, b) => a.distance - b.distance)[0] || null;
}
