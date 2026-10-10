import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HAND_OFFSET_Z,
  HAND_SCALE,
  heldPoint,
  planeClips,
  worldCutPlanes,
} from './hand.js';

test('lightness aims along the controller pointing axis', () => {
  const origin = heldPoint({ x: 0, y: 0, z: 0 });
  const up = heldPoint({ x: 0, y: 1, z: 0 });
  assert.ok(Math.abs(up.x - origin.x) < 1e-9);
  assert.ok(Math.abs(up.y - origin.y) < 1e-9);
  assert.ok(Math.abs((up.z - origin.z) - (-HAND_SCALE)) < 1e-9);
});

test('the black tip sits just past the controller tip, and white is further along the aim', () => {
  const black = heldPoint({ x: 0, y: 0.5, z: 0 });
  const white = heldPoint({ x: 0, y: 2.05, z: 0 });
  assert.ok(Math.abs(black.x) < 1e-9);
  assert.ok(Math.abs(black.y) < 1e-9);
  assert.ok(black.z < HAND_OFFSET_Z);
  assert.ok(black.z < -0.08 && black.z > -0.2);
  assert.ok(white.z < black.z);
});

test('a horizontal cut keeps the solid below the plane and ghosts the part above', () => {
  const planes = worldCutPlanes(1.25);
  assert.equal(planeClips(planes.keepBelow, 1.2), false);
  assert.equal(planeClips(planes.keepBelow, 1.25), false);
  assert.equal(planeClips(planes.keepBelow, 1.3), true);
  assert.equal(planeClips(planes.keepAbove, 1.2), true);
  assert.equal(planeClips(planes.keepAbove, 1.25), false);
  assert.equal(planeClips(planes.keepAbove, 1.3), false);
});
