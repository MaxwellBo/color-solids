import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStrokeArrays,
  colorAtLocalPoint,
  PICK_FILL_RADIUS,
  PICK_RING_INNER,
  PICK_RING_OUTER,
  selectPick,
} from './brush.js';
import { labToWorld } from './scale.js';

test('a point on the solid picks its sRGB color, and a point outside does not', () => {
  const red = labToWorld(0.627955, 0.224863, 0.125846);
  const picked = colorAtLocalPoint(red.x, red.y, red.z);
  assert.ok(Math.abs(picked.r - 1) < 1e-3);
  assert.ok(Math.abs(picked.g) < 1e-3);
  assert.ok(Math.abs(picked.b) < 1e-3);
  assert.equal(colorAtLocalPoint(4, red.y, 0), null);
});

test('a pick ray uses the start when it is already inside, otherwise the first solid hit', () => {
  const hits = [
    { color: true, onSolidSide: false },
    { color: true, onSolidSide: true },
  ];
  assert.deepEqual(selectPick(true, hits), { source: 'inside' });
  assert.deepEqual(selectPick(false, hits), { source: 'ray', index: 1 });
  assert.equal(selectPick(false, [{ color: false, onSolidSide: true }]), null);
});

test('the pick ring is a small outline around the color', () => {
  assert.ok(PICK_FILL_RADIUS < PICK_RING_INNER);
  assert.ok(PICK_RING_INNER < PICK_RING_OUTER);
  assert.ok(PICK_RING_OUTER <= 0.016);
  assert.ok(PICK_RING_OUTER - PICK_RING_INNER <= 0.005);
});

test('a paint stroke is a tube of the requested radius', () => {
  const radius = 0.01;
  const stroke = buildStrokeArrays([
    { x: 0, y: 0, z: 0 },
    { x: 0.2, y: 0, z: 0 },
    { x: 0.4, y: 0, z: 0 },
  ], radius);
  assert.equal(stroke.positions.length, 3 * 5 * 3);
  assert.equal(stroke.indices.length, 2 * 5 * 6);
  for (let index = 0; index < stroke.positions.length; index += 3) {
    const y = stroke.positions[index + 1];
    const z = stroke.positions[index + 2];
    assert.ok(Math.abs(Math.hypot(y, z) - radius) < 1e-5);
  }
  assert.equal(buildStrokeArrays([{ x: 0, y: 0, z: 0 }]), null);
});
