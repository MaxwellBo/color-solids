import { clamp01, oklabToLinearSrgb } from './oklab.js';
import { worldToLab } from './scale.js';

// Slightly looser than the shell gamut test so a pick on the rim of the
// cut, where the cap shader still draws a color, still resolves.
const PICK_EPSILON = 1.5e-3;
export const STROKE_RADIUS = 0.01;

// World-space pick marker. The solid is hand-scaled, so the ring stays a
// small point on the color rather than a disc across the cut.
export const PICK_FILL_RADIUS = 0.01;
export const PICK_RING_INNER = 0.012;
export const PICK_RING_OUTER = 0.016;

export function colorAtLocalPoint(x, y, z) {
  const lab = worldToLab(x, y, z);
  const rgb = oklabToLinearSrgb(lab.L, lab.a, lab.b);
  if (rgb.r < -PICK_EPSILON || rgb.g < -PICK_EPSILON || rgb.b < -PICK_EPSILON ||
      rgb.r > 1 + PICK_EPSILON || rgb.g > 1 + PICK_EPSILON || rgb.b > 1 + PICK_EPSILON) {
    return null;
  }
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}

// The closest color on a ray. A start that is already inside the solid is
// that point. Otherwise take the first hit that still carries a color.
export function selectPick(originInside, hits) {
  if (originInside) return { source: 'inside' };
  const index = hits.findIndex((hit) => hit.color && hit.onSolidSide);
  if (index < 0) return null;
  return { source: 'ray', index };
}

function firstDistance(hits, accept) {
  for (let index = 0; index < hits.length; index++) {
    if (!accept(hits[index])) continue;
    const distance = Number.isFinite(hits[index].distance) ? hits[index].distance : 0;
    return { index, distance };
  }
  return null;
}

// A painted stroke in front of the solid is the color the ray is touching.
// Inside the solid, the ray's start still wins.
export function selectColorTarget(originInside, solidHits, strokeHits = []) {
  if (originInside) return { source: 'inside' };
  const solid = firstDistance(solidHits, (hit) => hit.color && hit.onSolidSide);
  const stroke = firstDistance(strokeHits, (hit) => hit.color);
  if (stroke && (!solid || stroke.distance < solid.distance)) {
    return { source: 'stroke', index: stroke.index };
  }
  if (solid) return { source: 'solid', index: solid.index };
  return null;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function initialNormal(direction) {
  const axis = Math.abs(direction.x) <= Math.abs(direction.y) && Math.abs(direction.x) <= Math.abs(direction.z)
    ? { x: 1, y: 0, z: 0 }
    : Math.abs(direction.y) <= Math.abs(direction.z)
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };
  return normalize(cross(direction, axis));
}

function transportNormal(previous, direction) {
  const along = dot(previous, direction);
  const projected = {
    x: previous.x - along * direction.x,
    y: previous.y - along * direction.y,
    z: previous.z - along * direction.z,
  };
  if (Math.hypot(projected.x, projected.y, projected.z) < 1e-6) return initialNormal(direction);
  return normalize(projected);
}

// A round stroke through the given points. Fewer than two points has no ribbon.
export function buildStrokeArrays(points, radius = STROKE_RADIUS) {
  if (points.length < 2) return null;
  const radial = 5;
  const rings = points.length * radial;
  const positions = new Float32Array(rings * 3);
  const indices = new Uint32Array((points.length - 1) * radial * 6);
  let normal = null;

  for (let step = 0; step < points.length; step++) {
    const point = points[step];
    const next = points[Math.min(step + 1, points.length - 1)];
    const previous = points[Math.max(step - 1, 0)];
    const direction = normalize(step < points.length - 1
      ? { x: next.x - point.x, y: next.y - point.y, z: next.z - point.z }
      : { x: point.x - previous.x, y: point.y - previous.y, z: point.z - previous.z });
    normal = normal ? transportNormal(normal, direction) : initialNormal(direction);
    const binormal = normalize(cross(direction, normal));
    normal = normalize(cross(binormal, direction));

    for (let corner = 0; corner < radial; corner++) {
      const angle = (corner / radial) * Math.PI * 2;
      const offset = (step * radial + corner) * 3;
      positions[offset] = point.x + radius * (Math.cos(angle) * normal.x + Math.sin(angle) * binormal.x);
      positions[offset + 1] = point.y + radius * (Math.cos(angle) * normal.y + Math.sin(angle) * binormal.y);
      positions[offset + 2] = point.z + radius * (Math.cos(angle) * normal.z + Math.sin(angle) * binormal.z);
    }
  }

  let indexCursor = 0;
  for (let step = 0; step < points.length - 1; step++) {
    for (let corner = 0; corner < radial; corner++) {
      const nextCorner = (corner + 1) % radial;
      const a = step * radial + corner;
      const b = step * radial + nextCorner;
      const c = (step + 1) * radial + corner;
      const d = (step + 1) * radial + nextCorner;
      indices[indexCursor++] = a;
      indices[indexCursor++] = c;
      indices[indexCursor++] = b;
      indices[indexCursor++] = b;
      indices[indexCursor++] = c;
      indices[indexCursor++] = d;
    }
  }

  return { positions, indices };
}
