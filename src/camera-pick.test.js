import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraPickWins, colorFromCameraPixel, colorFromLinear, imagePixel } from './camera-pick.js';

test('a nearer camera surface wins, and a clear pixel is not a color', () => {
  assert.equal(cameraPickWins(0.2, 1), true);
  assert.equal(cameraPickWins(1, 0.2), false);
  assert.equal(cameraPickWins(0.4, Infinity), true);
  assert.equal(cameraPickWins(Number.NaN, 1), false);
  assert.equal(colorFromCameraPixel(10, 10, 10, 0), null);
});

test('an encoded camera pixel becomes a dark Oklch color', () => {
  const picked = colorFromCameraPixel(34, 38, 46, 255);
  assert.ok(picked.lch.L < 0.35);
  assert.ok(picked.lch.c < 0.05);
  assert.ok(picked.rgb.r < picked.rgb.b);
  const linear = colorFromLinear(picked.rgb.r, picked.rgb.g, picked.rgb.b);
  assert.ok(Math.abs(linear.lch.L - picked.lch.L) < 1e-9);
});

test('a canvas texel is read with v growing up', () => {
  const canvas = {
    width: 2,
    height: 2,
    getContext() {
      return {
        getImageData(x, y) {
          return { data: [x, y, 0, 255] };
        },
      };
    },
  };
  assert.deepEqual(imagePixel(canvas, 0.6, 0.1, true), [1, 1, 0, 255]);
  assert.deepEqual(imagePixel(canvas, 0.1, 0.1, false), [0, 0, 0, 255]);
  assert.equal(imagePixel({ width: 0, height: 0 }, 0, 0), null);
});
