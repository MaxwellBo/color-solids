import assert from 'node:assert/strict';
import test from 'node:test';
import { labToWorld } from './scale.js';
import {
  formatLch,
  formatLightness,
  labToLch,
  formatChromaHue,
  gamutRadiusAt,
  sliceLabelPoint,
  sliceLabelReach,
  sliceLevel,
  sliceLightness,
  SLICE_LABEL_CLEARANCE,
} from './lch.js';

test('oklch reads chroma and hue from a and b', () => {
  const neutral = labToLch(0.5, 0, 0);
  assert.equal(neutral.c, 0);
  assert.equal(neutral.h, 0);
  const red = labToLch(0.627955, 0.224863, 0.125846);
  assert.ok(Math.abs(red.c - Math.hypot(0.224863, 0.125846)) < 1e-9);
  assert.ok(Math.abs(red.h - Math.atan2(0.125846, 0.224863) * 180 / Math.PI) < 1e-6);
  const blue = labToLch(0.45, -0.03, -0.31);
  assert.ok(blue.h > 180);
  assert.equal(formatLightness(0.5), 'L 0.50');
  assert.equal(formatChromaHue(red), `c ${red.c.toFixed(3)}\nh ${Math.round(red.h)}°`);
  assert.match(formatLch(red), /^L 0\.63\nc 0\.258\nh 29°$/);
});

test('the slice label sits just outside the slice, in the plane, at that lightness', () => {
  const onPlane = labToWorld(0.42, 0.08, -0.05);
  const normal = { x: 0, y: 1, z: 0 };
  const level = sliceLevel(onPlane, normal);
  assert.ok(Math.abs(sliceLightness(onPlane, normal) - 0.42) < 1e-9);
  assert.ok(Math.abs(level.y - onPlane.y) < 1e-9);
  const half = 0.1;
  const reach = sliceLabelReach(0.42, half);
  const label = sliceLabelPoint(onPlane, normal, reach);
  const along = (label.x - onPlane.x) * normal.x
    + (label.y - onPlane.y) * normal.y
    + (label.z - onPlane.z) * normal.z;
  assert.ok(Math.abs(along) < 1e-9);
  const out = Math.hypot(label.x - level.x, label.y - level.y, label.z - level.z);
  const radius = gamutRadiusAt(0.42);
  assert.ok(Math.abs(out - (radius + half + SLICE_LABEL_CLEARANCE)) < 1e-9);
  assert.ok(out > radius);
  assert.ok(out < 1.2);
  assert.ok(Math.abs(label.y - level.y) < 1e-9);
  assert.ok(sliceLabelReach(0.02, half) < reach);
});

test('a tilted blade still labels the lightness where it crosses neutral', () => {
  const point = { x: 0.2, y: 1.2, z: -0.15 };
  const normal = { x: 0.2, y: 0.96, z: 0.2 };
  const length = Math.hypot(normal.x, normal.y, normal.z);
  normal.x /= length;
  normal.y /= length;
  normal.z /= length;
  const level = sliceLevel(point, normal);
  assert.equal(level.x, 0);
  assert.equal(level.z, 0);
  const gap = (level.x - point.x) * normal.x
    + (level.y - point.y) * normal.y
    + (level.z - point.z) * normal.z;
  assert.ok(Math.abs(gap) < 1e-9);
  const label = sliceLabelPoint(point, normal);
  const onPlane = (label.x - point.x) * normal.x
    + (label.y - point.y) * normal.y
    + (label.z - point.z) * normal.z;
  assert.ok(Math.abs(onPlane) < 1e-9);
});
