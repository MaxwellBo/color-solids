// Desktop stand-ins for the six pose axes and the controller buttons.
// Translation bars stay on the world axes. Rotation rings use the hand's
// local axes. Stick arrows point the way that stick value moves the viewer.

import { POSE_AXES } from './desktop-hands.js';

export const MOVE_AXES = [
  { key: 'x', direction: { x: 1, y: 0, z: 0 }, color: 0xe24b4b, label: 'X' },
  { key: 'y', direction: { x: 0, y: 1, z: 0 }, color: 0x3cba6c, label: 'Y' },
  { key: 'z', direction: { x: 0, y: 0, z: 1 }, color: 0x3d7ee0, label: 'Z' },
];

// Pitch, yaw, and roll are the YXZ euler components, matching A-Frame.
export const ROTATE_AXES = [
  { key: 'pitch', component: 'x', axis: { x: 1, y: 0, z: 0 }, radius: 0.07, offset: { x: -0.18, y: 0, z: 0 }, color: 0xe24b4b, label: 'Pitch' },
  { key: 'yaw', component: 'y', axis: { x: 0, y: 1, z: 0 }, radius: 0.07, offset: { x: 0, y: 0, z: 0 }, color: 0x3cba6c, label: 'Yaw' },
  { key: 'roll', component: 'z', axis: { x: 0, y: 0, z: 1 }, radius: 0.07, offset: { x: 0.18, y: 0, z: 0 }, color: 0x3d7ee0, label: 'Roll' },
];

// World-space offset from the hand to its move/rotate cluster.
export const CLUSTER_OFFSET = {
  left: { x: -0.28, y: 0.05, z: 0.08 },
  right: { x: 0.2, y: 0.2, z: -0.02 },
};

// Inside the world-aligned cluster. Rings sit off the arrows. The pad sits
// beside the arrows so it stays in the desktop frame.
export const GIMBAL_OFFSET = { x: 0, y: 0.22, z: 0 };
export const PAD_OFFSET = {
  left: { x: 0.02, y: 0.02, z: 0.16 },
  right: { x: 0.16, y: 0.02, z: 0.02 },
};
export const BAR_LENGTH = 0.13;

// Proxy-local. The face looks up at the desktop camera when the pointer aims
// at the solid. The tip runs along that pointer.
export const FACE_NORMAL = { x: 0, y: 0.70710678, z: -0.70710678 };
export const TIP_DIRECTION = { x: 0, y: -0.70710678, z: -0.70710678 };

const SURFACE = {
  a: { x: 0.0015, y: -0.0047, z: -0.0166 },
  b: { x: -0.0025, y: -0.013, z: -0.028 },
  trigger: { x: 0.0095, y: -0.036, z: -0.0227 },
  grip: { x: -0.0035, y: -0.0106, z: 0.0146 },
};

function add(point, direction, scale) {
  return {
    x: point.x + direction.x * scale,
    y: point.y + direction.y * scale,
    z: point.z + direction.z * scale,
  };
}

export function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function unit(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

export function axisSpec(key) {
  return POSE_AXES.find((axis) => axis.key === key);
}

export function quantizeAxis(value, key) {
  const axis = axisSpec(key);
  const steps = Math.round(value / axis.step);
  return Math.min(axis.max, Math.max(axis.min, steps * axis.step));
}

// Parameter of the point on the line closest to the ray. Null when the two
// are parallel. Directions do not need to be unit length.
export function lineParameter(rayOrigin, rayDirection, linePoint, lineDirection) {
  const ray = unit(rayDirection);
  const line = unit(lineDirection);
  const parallel = dot(line, ray);
  const denom = 1 - parallel * parallel;
  if (Math.abs(denom) < 1e-4) return null;
  const offset = {
    x: linePoint.x - rayOrigin.x,
    y: linePoint.y - rayOrigin.y,
    z: linePoint.z - rayOrigin.z,
  };
  return (parallel * dot(ray, offset) - dot(line, offset)) / denom;
}

export function projectOntoPlane(vector, normal) {
  const along = dot(vector, normal);
  return {
    x: vector.x - normal.x * along,
    y: vector.y - normal.y * along,
    z: vector.z - normal.z * along,
  };
}

// Right-hand angle from `from` to `to` around `axis`, in radians.
export function signedAngleAround(from, to, axis) {
  const cross = {
    x: from.y * to.z - from.z * to.y,
    y: from.z * to.x - from.x * to.z,
    z: from.x * to.y - from.y * to.x,
  };
  return Math.atan2(dot(cross, axis), dot(from, to));
}

// Where a stick reading carries the viewer. The world slides the other way,
// so forward on the stick (positive y) walks back along the view direction
// and positive x walks to the viewer's right.
export function travelDirection(stick, forward, right) {
  return {
    x: right.x * stick.x - forward.x * stick.y,
    y: right.y * stick.x - forward.y * stick.y,
    z: right.z * stick.x - forward.z * stick.y,
  };
}

// Positive yaw turns the viewer right, which is clockwise from above and a
// negative sweep around world up.
export function yawSweep(flick) {
  return flick > 0 ? -1 : 1;
}

// Discs that sit on the Quest buttons a desktop user can press. Positions
// are proxy-local metres. The left controller's actions live on its cluster.
export function surfaceWidgets(hand) {
  if (hand !== 'right') return [];
  const lift = 0.014;
  // The controller points toward the desktop camera, so sliding along the
  // tip barely separates the buttons on screen. Nudge them across the face
  // as well, keeping each one beside the Quest control it stands in for.
  const across = { x: 1, y: 0, z: 0 };
  return [
    { id: 'btn-a', label: 'A', color: 0xf4f0e8, radius: 0.008, position: add(add(SURFACE.a, FACE_NORMAL, lift), across, -0.018), direction: FACE_NORMAL },
    { id: 'btn-b', label: 'B', color: 0xd9d3c7, radius: 0.008, position: add(add(SURFACE.b, FACE_NORMAL, lift), across, 0.012), direction: FACE_NORMAL },
    { id: 'btn-trigger', label: 'Paint', color: 0x9ec2ff, radius: 0.009, position: add(add(SURFACE.trigger, FACE_NORMAL, lift), across, 0.028), direction: FACE_NORMAL },
    { id: 'btn-grip', label: 'Pick', color: 0xf7f7f7, radius: 0.009, position: add(add(SURFACE.grip, FACE_NORMAL, lift), across, -0.022), direction: FACE_NORMAL },
  ];
}
