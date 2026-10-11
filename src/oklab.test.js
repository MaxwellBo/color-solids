import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encodedSrgbToOklab,
  inGamut,
  linearSrgbToOklab,
  linearToSrgb,
  oklabToLinearSrgb,
  srgbToLinear,
} from './oklab.js';

const PRIMARIES = {
  white: { encoded: [1, 1, 1], lab: [1, 0, 0] },
  black: { encoded: [0, 0, 0], lab: [0, 0, 0] },
  red: { encoded: [1, 0, 0], lab: [0.627955, 0.224863, 0.125846] },
  green: { encoded: [0, 1, 0], lab: [0.866440, -0.233888, 0.179498] },
  blue: { encoded: [0, 0, 1], lab: [0.452014, -0.032457, -0.311528] },
  yellow: { encoded: [1, 1, 0], lab: [0.967983, -0.071369, 0.198570] },
  cyan: { encoded: [0, 1, 1], lab: [0.905399, -0.149444, -0.039398] },
  magenta: { encoded: [1, 0, 1], lab: [0.701674, 0.274566, -0.169156] },
};

test('sRGB primaries land on the known Oklab coordinates', () => {
  for (const [name, sample] of Object.entries(PRIMARIES)) {
    const lab = encodedSrgbToOklab(...sample.encoded);
    assert.ok(Math.abs(lab.L - sample.lab[0]) < 1e-5, name);
    assert.ok(Math.abs(lab.a - sample.lab[1]) < 1e-5, name);
    assert.ok(Math.abs(lab.b - sample.lab[2]) < 1e-5, name);
  }
});

test('the sRGB transfer inverts', () => {
  for (const value of [0, 0.02, 0.2, 0.5, 0.8, 1]) {
    assert.ok(Math.abs(srgbToLinear(linearToSrgb(value)) - value) < 1e-6);
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(value)) - value) < 1e-6);
  }
});

test('linear sRGB round-trips through Oklab', () => {
  const samples = [
    [0, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.2, 0.4, 0.6],
    [0.05, 0.9, 0.15],
  ];
  for (const [r, g, b] of samples) {
    const lab = linearSrgbToOklab(r, g, b);
    const back = oklabToLinearSrgb(lab.L, lab.a, lab.b);
    assert.ok(Math.abs(back.r - r) < 2e-4);
    assert.ok(Math.abs(back.g - g) < 2e-4);
    assert.ok(Math.abs(back.b - b) < 2e-4);
  }
});

test('gamut test accepts the neutral axis and rejects a far Oklab point', () => {
  assert.equal(inGamut(oklabToLinearSrgb(0.5, 0, 0)), true);
  assert.equal(inGamut(oklabToLinearSrgb(0.5, 0.5, 0.5)), false);
  assert.equal(srgbToLinear(1), 1);
  assert.equal(srgbToLinear(0), 0);
});
