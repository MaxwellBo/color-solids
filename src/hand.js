// The solid is parented to the left controller while a headset session is
// running. A-Frame controllers point along local -Z. The solid's lightness
// runs along its local +Y, so rotating -90° about X lays that axis along the
// aim: held upright, white is up. The black tip then sits just past the tip.
export const HAND_SCALE = 0.2;
// How large the held solid may get. Y on the left controller grows it, X shrinks it.
export const HELD_SCALE_MIN = 0.06;
export const HELD_SCALE_MAX = 0.8;
// Full deflection doubles the solid in a little over a second.
export const HELD_SCALE_RATE = 0.65;

export function nextHeldScale(scale, axisY, deltaSeconds) {
  const next = scale * Math.exp(axisY * HELD_SCALE_RATE * deltaSeconds);
  if (next < HELD_SCALE_MIN) return HELD_SCALE_MIN;
  if (next > HELD_SCALE_MAX) return HELD_SCALE_MAX;
  return next;
}
export const HAND_OFFSET_Z = -0.02;
export const HAND_ROTATION_X = -Math.PI / 2;

// The colored cap is wide enough to cover a hand-sized solid wherever the
// other controller's tip sits on it.
export const PLANE_RADIUS = 0.5;

// B holds a lightness-level blade. A holds the spatula. Either one moves an
// existing cut only while the controller is aimed at the solid.
export function activeSliceMode(aHeld, bHeld, pointing) {
  if (!pointing) return null;
  if (bHeld) return 'level';
  if (aHeld) return 'spatula';
  return null;
}

// Releasing the last slice button while aimed elsewhere closes the cut.
export function sliceClearsOnRelease(otherHeld, pointing) {
  return !otherHeld && !pointing;
}

// The spatula's blade contains the pointing ray. Its normal is the
// controller's up with the part along that ray removed, so a natural point
// lays the blade flat and roll still tips it.
export function bladeNormal(up, direction) {
  const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / length;
  const dy = direction.y / length;
  const dz = direction.z / length;
  const along = up.x * dx + up.y * dy + up.z * dz;
  const normal = {
    x: up.x - dx * along,
    y: up.y - dy * along,
    z: up.z - dz * along,
  };
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  if (normalLength < 1e-8) return { x: up.x, y: up.y, z: up.z };
  return {
    x: normal.x / normalLength,
    y: normal.y / normalLength,
    z: normal.z / normalLength,
  };
}

export function rotateX(point, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: point.x,
    y: point.y * cos - point.z * sin,
    z: point.y * sin + point.z * cos,
  };
}

// Local solid point, in the controller's space, after the hold transform.
export function heldPoint(local) {
  const scaled = {
    x: local.x * HAND_SCALE,
    y: local.y * HAND_SCALE,
    z: local.z * HAND_SCALE,
  };
  const rotated = rotateX(scaled, HAND_ROTATION_X);
  return {
    x: rotated.x,
    y: rotated.y,
    z: rotated.z + HAND_OFFSET_Z,
  };
}

// Three.js clips a fragment when normal·point + constant is negative.
// keepBelow drops everything above planeY. keepAbove drops everything below.
export function worldCutPlanes(planeY) {
  return {
    keepBelow: { normalY: -1, constant: planeY },
    keepAbove: { normalY: 1, constant: -planeY },
  };
}

export function planeClips(plane, y) {
  return plane.normalY * y + plane.constant < 0;
}

function columnScale(elements) {
  return Math.hypot(elements[0], elements[1], elements[2]) || 1;
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

// The controller cut lives in the solid's local frame: a point on the blade
// and a normal pointing to the side that becomes edges. elements is the
// solid's column-major world matrix, with uniform scale.
export function localCutFromWorld(worldPoint, worldNormal, elements) {
  const scale = columnScale(elements);
  const r0x = elements[0] / scale;
  const r0y = elements[1] / scale;
  const r0z = elements[2] / scale;
  const r1x = elements[4] / scale;
  const r1y = elements[5] / scale;
  const r1z = elements[6] / scale;
  const r2x = elements[8] / scale;
  const r2y = elements[9] / scale;
  const r2z = elements[10] / scale;
  const dx = worldPoint.x - elements[12];
  const dy = worldPoint.y - elements[13];
  const dz = worldPoint.z - elements[14];
  return {
    point: {
      x: (r0x * dx + r0y * dy + r0z * dz) / scale,
      y: (r1x * dx + r1y * dy + r1z * dz) / scale,
      z: (r2x * dx + r2y * dy + r2z * dz) / scale,
    },
    normal: normalize({
      x: r0x * worldNormal.x + r0y * worldNormal.y + r0z * worldNormal.z,
      y: r1x * worldNormal.x + r1y * worldNormal.y + r1z * worldNormal.z,
      z: r2x * worldNormal.x + r2y * worldNormal.y + r2z * worldNormal.z,
    }),
  };
}

// World direction of the solid's lightness axis. A level cut uses this as
// its normal, so the blade stays in the a–b plane.
export function levelCutNormal(elements) {
  const scale = columnScale(elements);
  return normalize({
    x: elements[4] / scale,
    y: elements[5] / scale,
    z: elements[6] / scale,
  });
}

export function worldCutFromLocal(localPoint, localNormal, elements) {
  const scale = columnScale(elements);
  const r0x = elements[0] / scale;
  const r0y = elements[1] / scale;
  const r0z = elements[2] / scale;
  const r1x = elements[4] / scale;
  const r1y = elements[5] / scale;
  const r1z = elements[6] / scale;
  const r2x = elements[8] / scale;
  const r2y = elements[9] / scale;
  const r2z = elements[10] / scale;
  return {
    point: {
      x: elements[12] + scale * (r0x * localPoint.x + r1x * localPoint.y + r2x * localPoint.z),
      y: elements[13] + scale * (r0y * localPoint.x + r1y * localPoint.y + r2y * localPoint.z),
      z: elements[14] + scale * (r0z * localPoint.x + r1z * localPoint.y + r2z * localPoint.z),
    },
    normal: normalize({
      x: r0x * localNormal.x + r1x * localNormal.y + r2x * localNormal.z,
      y: r0y * localNormal.x + r1y * localNormal.y + r2y * localNormal.z,
      z: r0z * localNormal.x + r1z * localNormal.y + r2z * localNormal.z,
    }),
  };
}
