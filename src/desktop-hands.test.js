import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { bladeNormal, heldPoint } from './hand.js';
import { labToWorld, VIEW_TARGET } from './scale.js';
import {
  applyStickToggle,
  DESKTOP_BUTTONS,
  handAxesToPose,
  LEFT_HAND_POSE,
  POINT_DIRECTION,
  POSE_AXES,
  readHandAxes,
  RIGHT_HAND_POSE,
  rayPlanePoint,
  STICK_CONTROLS,
  togglePress,
} from './desktop-hands.js';

function place(pose) {
  const object = new THREE.Object3D();
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
  return object;
}

test('the desktop left hand holds the solid up in view', () => {
  const hand = place(LEFT_HAND_POSE);
  const aim = new THREE.Vector3(0, 0, -1).applyQuaternion(hand.quaternion);
  assert.ok(aim.y > 0.7);
  const mid = heldPoint(labToWorld(0.5, 0, 0));
  const center = new THREE.Vector3(mid.x, mid.y, mid.z).applyQuaternion(hand.quaternion).add(hand.position);
  const target = new THREE.Vector3(VIEW_TARGET.x, VIEW_TARGET.y, VIEW_TARGET.z);
  assert.ok(center.distanceTo(target) < 0.02);
});

test('the desktop right hand aims at the held solid along the pointing ray', () => {
  const hand = place(RIGHT_HAND_POSE);
  // A-Frame entities rotate in YXZ order.
  hand.rotation.order = 'YXZ';
  hand.rotation.set(RIGHT_HAND_POSE.rotation.x, RIGHT_HAND_POSE.rotation.y, RIGHT_HAND_POSE.rotation.z);
  const aim = new THREE.Vector3(POINT_DIRECTION.x, POINT_DIRECTION.y, POINT_DIRECTION.z)
    .applyQuaternion(hand.quaternion)
    .normalize();
  const toward = new THREE.Vector3(VIEW_TARGET.x, VIEW_TARGET.y, VIEW_TARGET.z).sub(hand.position).normalize();
  assert.ok(aim.dot(toward) > 0.98);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(hand.quaternion);
  const blade = bladeNormal(up, aim);
  assert.ok(blade.y > 0.97);
});

test('a drag ray meets the camera-facing plane', () => {
  const hit = rayPlanePoint(
    { x: 0, y: 1, z: 2 },
    { x: 0, y: 0, z: -1 },
    { x: 0.2, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  );
  assert.deepEqual(hit, { x: 0, y: 1, z: 0 });
  assert.equal(rayPlanePoint(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
  ), null);
});

test('desktop buttons emit the quest controller events', () => {
  const right = DESKTOP_BUTTONS.filter((button) => button.hand === 'right');
  const left = DESKTOP_BUTTONS.filter((button) => button.hand === 'left');
  assert.deepEqual(right.map((button) => button.down), ['abuttondown', 'bbuttondown', 'gripdown', 'triggerdown']);
  assert.deepEqual(right.map((button) => button.up), ['abuttonup', 'bbuttonup', 'gripup', 'triggerup']);
  assert.deepEqual(left.map((button) => button.id), [
    'btn-zoom-in',
    'btn-zoom-out',
    'btn-lightness-up',
    'btn-lightness-down',
  ]);
  assert.deepEqual(togglePress(false), { pressed: true, event: 'down' });
  assert.deepEqual(togglePress(true), { pressed: false, event: 'up' });
});

test('color toggles share the headset stick axes, and a turn is a sideways flick', () => {
  let axes = { x: 0, y: 0 };
  axes = applyStickToggle(axes, 'y', 1, true);
  axes = applyStickToggle(axes, 'x', -1, true);
  assert.deepEqual(axes, { x: -1, y: 1 });
  axes = applyStickToggle(axes, 'y', -1, true);
  assert.deepEqual(axes, { x: -1, y: -1 });
  axes = applyStickToggle(axes, 'y', 1, false);
  assert.deepEqual(axes, { x: -1, y: -1 });
  axes = applyStickToggle(axes, 'y', -1, false);
  assert.deepEqual(axes, { x: -1, y: 0 });
  assert.deepEqual(STICK_CONTROLS.filter((control) => control.flick).map((control) => control.flick), [-1, 1]);
});

test('each controller has six pose axes and they round-trip', () => {
  assert.deepEqual(POSE_AXES.map((axis) => axis.key), ['x', 'y', 'z', 'pitch', 'yaw', 'roll']);
  const axes = readHandAxes(
    { x: -0.2, y: 1.4, z: 0.5 },
    { x: Math.PI / 2, y: -Math.PI / 4, z: 0.1 },
  );
  const pose = handAxesToPose(axes);
  assert.ok(Math.abs(pose.position.x + 0.2) < 1e-9);
  assert.ok(Math.abs(pose.position.y - 1.4) < 1e-9);
  assert.ok(Math.abs(pose.rotation.x - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(pose.rotation.y + Math.PI / 4) < 1e-9);
  assert.ok(Math.abs(pose.rotation.z - 0.1) < 1e-9);
});
