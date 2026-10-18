import assert from 'node:assert/strict';
import test from 'node:test';
import { inGamut, oklabToLinearSrgb } from './oklab.js';
import {
  AB_RATE,
  clampLabToGamut,
  controllerEngaged,
  inGamutLch,
  INITIAL_CONTROLLER_COLOR,
  lchToLab,
  maxChroma,
  stepControllerColor,
  zoomAxis,
} from './controller-color.js';
import { labToLch } from './lch.js';

const idle = { axisX: 0, axisY: 0, lightnessUp: false, lightnessDown: false };

test('a controller color stays inside sRGB and round-trips through Lch', () => {
  const { L, a, b } = INITIAL_CONTROLLER_COLOR;
  const rgb = oklabToLinearSrgb(L, a, b);
  assert.ok(inGamut(rgb));
  const back = labToLch(L, a, b);
  const again = lchToLab(back.L, back.c, back.h);
  assert.ok(Math.abs(again.a - a) < 1e-9);
  assert.ok(Math.abs(again.b - b) < 1e-9);
  assert.ok(rgb.r >= 0 && rgb.r <= 1);
});

test('the stick samples a and b, and the triggers change lightness', () => {
  const right = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisX: 1 }, 0.2);
  assert.ok(Math.abs(right.a - (INITIAL_CONTROLLER_COLOR.a + AB_RATE * 0.2)) < 1e-9);
  assert.equal(right.b, INITIAL_CONTROLLER_COLOR.b);
  assert.equal(right.L, INITIAL_CONTROLLER_COLOR.L);
  const up = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisY: 1 }, 0.2);
  assert.ok(Math.abs(up.b - (INITIAL_CONTROLLER_COLOR.b + AB_RATE * 0.2)) < 1e-9);
  assert.equal(up.a, INITIAL_CONTROLLER_COLOR.a);
  const raised = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessUp: true }, 0.2);
  const lowered = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessDown: true }, 0.2);
  assert.ok(raised.L > INITIAL_CONTROLLER_COLOR.L);
  assert.ok(lowered.L < INITIAL_CONTROLLER_COLOR.L);
  const both = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessUp: true, lightnessDown: true }, 1);
  assert.equal(both.L, INITIAL_CONTROLLER_COLOR.L);
});

test('a and b stop at the sRGB boundary instead of leaving the solid', () => {
  const cap = maxChroma(0.7, 30);
  assert.ok(cap > 0.05);
  assert.ok(inGamutLch(0.7, cap, 30));
  assert.equal(inGamutLch(0.7, cap + 0.02, 30), false);
  const pushed = stepControllerColor({ L: 0.7, a: 0.4, b: 0.4 }, { ...idle, axisX: 1, axisY: 1 }, 5);
  assert.ok(inGamut(oklabToLinearSrgb(pushed.L, pushed.a, pushed.b)));
  assert.ok(Math.abs(pushed.a - pushed.b) < 1e-6);
  assert.ok(Math.hypot(pushed.a, pushed.b) < Math.hypot(0.4, 0.4));
  const held = clampLabToGamut(0.7, 0.4, -0.2);
  assert.ok(inGamut(oklabToLinearSrgb(held.L, held.a, held.b)));
  assert.ok(held.a > 0 && held.b < 0);
  const idleStick = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisX: 0.1, axisY: -0.1 }, 1);
  assert.equal(idleStick.a, INITIAL_CONTROLLER_COLOR.a);
  assert.equal(idleStick.b, INITIAL_CONTROLLER_COLOR.b);
});

test('the stick or either trigger engages controller mode, and X and Y zoom', () => {
  assert.equal(controllerEngaged(idle), false);
  assert.equal(controllerEngaged({ ...idle, axisX: -1 }), true);
  assert.equal(controllerEngaged({ ...idle, axisY: 0.2 }), true);
  assert.equal(controllerEngaged({ ...idle, lightnessUp: true }), true);
  assert.equal(controllerEngaged({ ...idle, lightnessDown: true }), true);
  assert.equal(zoomAxis(false, true), 1);
  assert.equal(zoomAxis(true, false), -1);
  assert.equal(zoomAxis(true, true), 0);
  assert.equal(zoomAxis(false, false), 0);
});
