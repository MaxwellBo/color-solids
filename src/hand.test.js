import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  activeSliceMode,
  bladeNormal,
  HAND_OFFSET_Z,
  HAND_SCALE,
  heldPoint,
  levelCutNormal,
  localCutFromWorld,
  planeClips,
  sliceClearsOnRelease,
  worldCutFromLocal,
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

test('a cut stored on the solid follows its translation and roll', () => {
  const solid = new THREE.Object3D();
  solid.position.set(0.2, 1.4, -0.5);
  solid.rotation.set(0.4, -0.2, 0.6);
  solid.scale.setScalar(0.2);
  solid.updateMatrixWorld();
  const tip = { x: 0.3, y: 1.5, z: -0.4 };
  const up = { x: 0.1, y: 0.9, z: 0.2 };
  const local = localCutFromWorld(tip, up, solid.matrixWorld.elements);
  const world = worldCutFromLocal(local.point, local.normal, solid.matrixWorld.elements);
  const expected = new THREE.Vector3(tip.x, tip.y, tip.z);
  const expectedNormal = new THREE.Vector3(up.x, up.y, up.z).normalize();
  assert.ok(new THREE.Vector3(world.point.x, world.point.y, world.point.z).distanceTo(expected) < 1e-5);
  assert.ok(Math.abs(new THREE.Vector3(world.normal.x, world.normal.y, world.normal.z).dot(expectedNormal) - 1) < 1e-5);

  solid.position.x += 0.35;
  solid.rotation.z += 0.8;
  solid.updateMatrixWorld();
  const moved = worldCutFromLocal(local.point, local.normal, solid.matrixWorld.elements);
  const movedPoint = new THREE.Vector3(local.point.x, local.point.y, local.point.z).applyMatrix4(solid.matrixWorld);
  const movedNormal = new THREE.Vector3(local.normal.x, local.normal.y, local.normal.z)
    .transformDirection(solid.matrixWorld)
    .normalize();
  assert.ok(new THREE.Vector3(moved.point.x, moved.point.y, moved.point.z).distanceTo(movedPoint) < 1e-5);
  assert.ok(Math.abs(new THREE.Vector3(moved.normal.x, moved.normal.y, moved.normal.z).dot(movedNormal) - 1) < 1e-5);
  assert.ok(new THREE.Vector3(moved.point.x, moved.point.y, moved.point.z).distanceTo(expected) > 0.2);
  assert.ok(Math.abs(new THREE.Vector3(moved.normal.x, moved.normal.y, moved.normal.z).dot(expectedNormal)) < 0.99);
});

test('a level cut stays on a lightness plane of the solid', () => {
  const solid = new THREE.Object3D();
  solid.position.set(0.2, 1.4, -0.5);
  solid.rotation.set(0.4, -0.2, 0.6);
  solid.scale.setScalar(0.2);
  solid.updateMatrixWorld();
  const normal = levelCutNormal(solid.matrixWorld.elements);
  const tip = { x: 0.3, y: 1.5, z: -0.4 };
  const local = localCutFromWorld(tip, normal, solid.matrixWorld.elements);
  assert.ok(Math.abs(local.normal.x) < 1e-5);
  assert.ok(Math.abs(local.normal.y - 1) < 1e-5);
  assert.ok(Math.abs(local.normal.z) < 1e-5);

  const basisX = new THREE.Vector3(1, 0, 0).transformDirection(solid.matrixWorld);
  const slid = {
    x: tip.x + basisX.x * 0.15,
    y: tip.y + basisX.y * 0.15,
    z: tip.z + basisX.z * 0.15,
  };
  const slidLocal = localCutFromWorld(slid, normal, solid.matrixWorld.elements);
  assert.ok(Math.abs(slidLocal.point.y - local.point.y) < 1e-5);

  const basisY = new THREE.Vector3(0, 1, 0).transformDirection(solid.matrixWorld);
  const raised = {
    x: tip.x + basisY.x * 0.1,
    y: tip.y + basisY.y * 0.1,
    z: tip.z + basisY.z * 0.1,
  };
  const raisedLocal = localCutFromWorld(raised, normal, solid.matrixWorld.elements);
  assert.ok(raisedLocal.point.y > local.point.y + 0.4);
});

test('the spatula blade contains the pointing ray and stays level when that ray is level', () => {
  const straight = bladeNormal({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 });
  assert.ok(Math.abs(straight.x) < 1e-8);
  assert.ok(Math.abs(straight.y - 1) < 1e-8);
  assert.ok(Math.abs(straight.z) < 1e-8);

  const point = new THREE.Vector3(0, -0.9, -1).normalize();
  const local = bladeNormal({ x: 0, y: 1, z: 0 }, point);
  const localNormal = new THREE.Vector3(local.x, local.y, local.z);
  assert.ok(Math.abs(localNormal.dot(point)) < 1e-6);
  assert.ok(local.y > 0);

  const hand = new THREE.Object3D();
  hand.quaternion.setFromUnitVectors(point, new THREE.Vector3(0, 0, -1));
  hand.updateMatrixWorld(true);
  const world = localNormal.clone().transformDirection(hand.matrixWorld);
  assert.ok(Math.abs(world.x) < 1e-5);
  assert.ok(Math.abs(world.y - 1) < 1e-5);
  assert.ok(Math.abs(world.z) < 1e-5);
});

test('B holds a level slice and a tap away from the solid closes it', () => {
  assert.equal(activeSliceMode(true, true, true), 'level');
  assert.equal(activeSliceMode(true, false, true), 'spatula');
  assert.equal(activeSliceMode(false, true, false), null);
  assert.equal(activeSliceMode(false, false, true), null);
  assert.equal(sliceClearsOnRelease(false, false), true);
  assert.equal(sliceClearsOnRelease(true, false), false);
  assert.equal(sliceClearsOnRelease(false, true), false);
});

test('a horizontal cut keeps the solid below the plane and clips the part above', () => {
  const planes = worldCutPlanes(1.25);
  assert.equal(planeClips(planes.keepBelow, 1.2), false);
  assert.equal(planeClips(planes.keepBelow, 1.25), false);
  assert.equal(planeClips(planes.keepBelow, 1.3), true);
  assert.equal(planeClips(planes.keepAbove, 1.2), true);
  assert.equal(planeClips(planes.keepAbove, 1.25), false);
  assert.equal(planeClips(planes.keepAbove, 1.3), false);
});
