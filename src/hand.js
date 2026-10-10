// The solid is parented to the left controller while a headset session is
// running. A-Frame controllers point along local -Z. The solid's lightness
// runs along its local +Y, so rotating -90° about X lays that axis along the
// aim: held upright, white is up. The black tip then sits just past the tip.
export const HAND_SCALE = 0.2;
export const HAND_OFFSET_Z = -0.02;
export const HAND_ROTATION_X = -Math.PI / 2;

// The cutting disc is wide enough to cover a hand-sized solid when the other
// controller's tip is anywhere on it, with a margin that reads as a plane.
export const PLANE_RADIUS = 0.5;
export const GHOST_OPACITY = 0.26;

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
// Both planes are horizontal in world space: the cut stays level when the
// solid tilts with the controller.
export function worldCutPlanes(planeY) {
  return {
    keepBelow: { normalY: -1, constant: planeY },
    keepAbove: { normalY: 1, constant: -planeY },
  };
}

export function planeClips(plane, y) {
  return plane.normalY * y + plane.constant < 0;
}
