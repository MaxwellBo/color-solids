import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLUSTER_OFFSET,
  FACE_NORMAL,
  MOVE_AXES,
  ROTATE_AXES,
  TIP_DIRECTION,
  dot,
  lineParameter,
  projectOntoPlane,
  quantizeAxis,
  signedAngleAround,
  surfaceWidgets,
  travelDirection,
  yawSweep,
} from './spatial-controls.js';

test('move bars follow world axes and rings follow the hand euler', () => {
  assert.deepEqual(MOVE_AXES.map((axis) => axis.direction), [
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]);
  assert.deepEqual(ROTATE_AXES.map((axis) => [axis.key, axis.component]), [
    ['pitch', 'x'],
    ['yaw', 'y'],
    ['roll', 'z'],
  ]);
  assert.ok(CLUSTER_OFFSET.left.x < 0);
  assert.ok(CLUSTER_OFFSET.right.x > 0);
});

test('a drag along a bar reads distance along that axis', () => {
  const hit = lineParameter(
    { x: 2, y: 5, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
  );
  assert.ok(Math.abs(hit - 2) < 1e-6);
  assert.equal(lineParameter(
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 2, y: 0, z: 0 },
  ), null);
});

test('a ring drag measures the turn around its axis', () => {
  const quarter = signedAngleAround({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(quarter - Math.PI / 2) < 1e-6);
  const back = signedAngleAround({ x: 1, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(back + Math.PI / 2) < 1e-6);
  const flat = projectOntoPlane({ x: 1, y: 2, z: 3 }, { x: 0, y: 1, z: 0 });
  assert.deepEqual(flat, { x: 1, y: 0, z: 3 });
});

test('pose drags stay inside the axis range', () => {
  assert.ok(Math.abs(quantizeAxis(1.226, 'x') - 1.23) < 1e-9);
  assert.equal(quantizeAxis(5, 'z'), 2);
  assert.equal(quantizeAxis(-1, 'y'), 0);
  assert.equal(quantizeAxis(190, 'yaw'), 180);
});

test('buttons sit on the controller in the order the Quest face uses', () => {
  const widgets = surfaceWidgets('right');
  const tip = Object.fromEntries(widgets.map((widget) => [widget.id, dot(widget.position, TIP_DIRECTION)]));
  assert.ok(tip['btn-b'] > tip['btn-a']);
  assert.ok(tip['btn-trigger'] > tip['btn-b']);
  assert.ok(tip['btn-grip'] < tip['btn-a']);
  for (const widget of widgets) {
    const along = widget.direction.x * FACE_NORMAL.x
      + widget.direction.y * FACE_NORMAL.y
      + widget.direction.z * FACE_NORMAL.z;
    assert.ok(along > 0.99);
  }
  assert.deepEqual(surfaceWidgets('left'), []);
});

test('stick arrows point the way that reading moves the viewer', () => {
  const forward = { x: 0, y: 0, z: -1 };
  const right = { x: 1, y: 0, z: 0 };
  const near = (actual, expected) => {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9);
    assert.ok(Math.abs(actual.y - expected.y) < 1e-9);
    assert.ok(Math.abs(actual.z - expected.z) < 1e-9);
  };
  near(travelDirection({ x: 0, y: 1 }, forward, right), { x: 0, y: 0, z: 1 });
  near(travelDirection({ x: 1, y: 0 }, forward, right), { x: 1, y: 0, z: 0 });
  near(travelDirection({ x: -1, y: 0 }, forward, right), { x: -1, y: 0, z: 0 });
  assert.equal(yawSweep(1), -1);
  assert.equal(yawSweep(-1), 1);
});
