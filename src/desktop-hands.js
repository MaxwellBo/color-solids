// Desktop poses for the same hand entities a headset tracks. The left
// controller's aim (−Z) points mostly up, so lightness on the held solid
// points up. The right controller's pointer aims at that solid.
export const LEFT_HAND_POSE = {
  position: { x: 0.1121, y: 1.185, z: 0.1314 },
  rotation: { x: 1.02, y: 0.42, z: 0.05 },
};

// Quest controllers point below the grip's −Z. This is the Quest 2 ray, and
// the angle the desktop controller and the A slice both use.
export const POINT_DIRECTION = { x: 0, y: -0.9, z: -1 };

export const RIGHT_HAND_POSE = {
  position: { x: 0.42, y: 1.28, z: 0.42 },
  // YXZ, matching A-Frame. The grip points up; the pointer aims at the solid.
  rotation: { x: 0.9305, y: 0.7854, z: 0 },
};

export function handPose(hand) {
  return hand === 'left' ? LEFT_HAND_POSE : RIGHT_HAND_POSE;
}

// The clickable stand-ins emit the same events a Quest controller emits.
// Toggles stand in for holding the button down.
export const DESKTOP_BUTTONS = [
  { id: 'btn-zoom-in', hand: 'left', down: 'ybuttondown', up: 'ybuttonup' },
  { id: 'btn-zoom-out', hand: 'left', down: 'xbuttondown', up: 'xbuttonup' },
  { id: 'btn-lightness-up', hand: 'left', down: 'triggerdown', up: 'triggerup' },
  { id: 'btn-lightness-down', hand: 'left', down: 'gripdown', up: 'gripup' },
  { id: 'btn-a', hand: 'right', down: 'abuttondown', up: 'abuttonup' },
  { id: 'btn-b', hand: 'right', down: 'bbuttondown', up: 'bbuttonup' },
  { id: 'btn-grip', hand: 'right', down: 'gripdown', up: 'gripup' },
  { id: 'btn-trigger', hand: 'right', down: 'triggerdown', up: 'triggerup' },
];

// Left stick left and right sample a, up and down sample b. Right stick
// flicks sideways to snap-turn. Positive x is right, positive y is up,
// matching the headset handlers.
export const STICK_CONTROLS = [
  { id: 'btn-a-left', hand: 'left', axis: 'x', value: -1, label: 'a−' },
  { id: 'btn-a-right', hand: 'left', axis: 'x', value: 1, label: 'a+' },
  { id: 'btn-b-down', hand: 'left', axis: 'y', value: -1, label: 'b−' },
  { id: 'btn-b-up', hand: 'left', axis: 'y', value: 1, label: 'b+' },
  { id: 'btn-turn-left', hand: 'right', flick: -1 },
  { id: 'btn-turn-right', hand: 'right', flick: 1 },
];

export function togglePress(pressed) {
  const next = !pressed;
  return { pressed: next, event: next ? 'down' : 'up' };
}

// A walk toggle replaces that stick axis. Releasing it clears the axis only
// when it still holds this toggle's value.
export function applyStickToggle(axes, axis, value, on) {
  const next = { x: axes.x, y: axes.y };
  if (on) next[axis] = value;
  else if (next[axis] === value) next[axis] = 0;
  return next;
}

// Local position in metres and YXZ rotation in degrees, the six axes of a hand.
export const POSE_AXES = [
  { key: 'x', min: -2, max: 2, step: 0.01 },
  { key: 'y', min: 0, max: 3, step: 0.01 },
  { key: 'z', min: -2, max: 2, step: 0.01 },
  { key: 'pitch', min: -180, max: 180, step: 1 },
  { key: 'yaw', min: -180, max: 180, step: 1 },
  { key: 'roll', min: -180, max: 180, step: 1 },
];

const DEG = 180 / Math.PI;

export function readHandAxes(position, euler) {
  return {
    x: position.x,
    y: position.y,
    z: position.z,
    pitch: euler.x * DEG,
    yaw: euler.y * DEG,
    roll: euler.z * DEG,
  };
}

export function handAxesToPose(axes) {
  const rad = Math.PI / 180;
  return {
    position: { x: axes.x, y: axes.y, z: axes.z },
    rotation: { x: axes.pitch * rad, y: axes.yaw * rad, z: axes.roll * rad },
  };
}

// Where a ray meets a plane. Null when the ray is parallel or points away.
export function rayPlanePoint(origin, direction, planePoint, planeNormal) {
  const denom = direction.x * planeNormal.x + direction.y * planeNormal.y + direction.z * planeNormal.z;
  if (Math.abs(denom) < 1e-6) return null;
  const t = (
    (planePoint.x - origin.x) * planeNormal.x +
    (planePoint.y - origin.y) * planeNormal.y +
    (planePoint.z - origin.z) * planeNormal.z
  ) / denom;
  if (t < 0) return null;
  return {
    x: origin.x + direction.x * t,
    y: origin.y + direction.y * t,
    z: origin.z + direction.z * t,
  };
}
