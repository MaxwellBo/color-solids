// Desktop poses for the same hand entities a headset tracks. The left
// controller's aim (−Z) points mostly up, so lightness on the held solid
// points up. The right controller aims at that solid.
export const LEFT_HAND_POSE = {
  position: { x: 0.1121, y: 1.185, z: 0.1314 },
  rotation: { x: 1.02, y: 0.42, z: 0.05 },
};

export const RIGHT_HAND_POSE = {
  position: { x: 0.42, y: 1.28, z: 0.42 },
  rotation: { x: 0.2761, y: 0.7661, z: -0.194 },
};

export function handPose(hand) {
  return hand === 'left' ? LEFT_HAND_POSE : RIGHT_HAND_POSE;
}

// The clickable stand-ins emit the same events a Quest controller emits.
export const DESKTOP_BUTTONS = [
  { id: 'btn-a', down: 'abuttondown', up: 'abuttonup' },
  { id: 'btn-b', down: 'bbuttondown', up: 'bbuttonup' },
  { id: 'btn-grip', down: 'gripdown', up: 'gripup' },
  { id: 'btn-trigger', down: 'triggerdown', up: 'triggerup' },
];

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
