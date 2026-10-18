import assert from 'node:assert/strict';
import test from 'node:test';
import {
  controllerEngaged,
  HUE_RATE,
  inGamutLch,
  INITIAL_CONTROLLER_COLOR,
  lchToLab,
  lchToLinearRgb,
  maxChroma,
  stepControllerColor,
  zoomAxis,
} from './controller-color.js';
import { labToLch } from './lch.js';

const idle = { axisX: 0, axisY: 0, lightnessUp: false, lightnessDown: false };

test('a controller color stays inside sRGB and round-trips through Lch', () => {
  const rgb = lchToLinearRgb(INITIAL_CONTROLLER_COLOR);
  assert.ok(inGamutLch(INITIAL_CONTROLLER_COLOR.L, INITIAL_CONTROLLER_COLOR.c, INITIAL_CONTROLLER_COLOR.h));
  const lab = lchToLab(INITIAL_CONTROLLER_COLOR.L, INITIAL_CONTROLLER_COLOR.c, INITIAL_CONTROLLER_COLOR.h);
  const back = labToLch(lab.L, lab.a, lab.b);
  assert.ok(Math.abs(back.c - INITIAL_CONTROLLER_COLOR.c) < 1e-9);
  assert.ok(Math.abs(back.h - INITIAL_CONTROLLER_COLOR.h) < 1e-6);
  assert.ok(rgb.r >= 0 && rgb.r <= 1);
});

test('stick axes change hue and chroma, and the triggers change lightness', () => {
  const right = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisX: 1 }, 1);
  assert.ok(Math.abs(right.h - (INITIAL_CONTROLLER_COLOR.h + HUE_RATE)) < 1e-9);
  assert.equal(right.L, INITIAL_CONTROLLER_COLOR.L);
  const wrapped = stepControllerColor({ L: 0.7, c: 0.05, h: 350 }, { ...idle, axisX: 1 }, 1);
  assert.ok(Math.abs(wrapped.h - 80) < 1e-9);
  const up = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisY: 1 }, 0.2);
  assert.ok(up.c > INITIAL_CONTROLLER_COLOR.c);
  const raised = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessUp: true }, 0.2);
  const lowered = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessDown: true }, 0.2);
  assert.ok(raised.L > INITIAL_CONTROLLER_COLOR.L);
  assert.ok(lowered.L < INITIAL_CONTROLLER_COLOR.L);
  const both = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, lightnessUp: true, lightnessDown: true }, 1);
  assert.equal(both.L, INITIAL_CONTROLLER_COLOR.L);
});

test('chroma stops at the sRGB boundary instead of leaving the solid', () => {
  const cap = maxChroma(0.7, 30);
  assert.ok(cap > 0.05);
  assert.ok(inGamutLch(0.7, cap, 30));
  assert.equal(inGamutLch(0.7, cap + 0.02, 30), false);
  const pushed = stepControllerColor({ L: 0.7, c: cap, h: 30 }, { ...idle, axisY: 1 }, 5);
  assert.ok(Math.abs(pushed.c - cap) < 1e-6);
  const idleStick = stepControllerColor(INITIAL_CONTROLLER_COLOR, { ...idle, axisX: 0.1, axisY: -0.1 }, 1);
  assert.equal(idleStick.h, INITIAL_CONTROLLER_COLOR.h);
  assert.equal(idleStick.c, INITIAL_CONTROLLER_COLOR.c);
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
