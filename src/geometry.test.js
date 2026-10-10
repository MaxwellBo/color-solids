import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShellArrays, buildSliceArrays } from './geometry.js';
import { oklabToLinearSrgb } from './oklab.js';
import { labToWorld, worldToLab } from './scale.js';

function outwardRatio(positions, indices) {
  const interior = labToWorld(0.55, 0, 0);
  let positive = 0;
  let total = 0;
  const triangleCount = indices.length / 3;
  const stride = Math.max(1, Math.floor(triangleCount / 500));

  for (let triangle = 0; triangle < triangleCount; triangle += stride) {
    const i0 = indices[triangle * 3] * 3;
    const i1 = indices[triangle * 3 + 1] * 3;
    const i2 = indices[triangle * 3 + 2] * 3;
    const ax = positions[i1] - positions[i0];
    const ay = positions[i1 + 1] - positions[i0 + 1];
    const az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0];
    const by = positions[i2 + 1] - positions[i0 + 1];
    const bz = positions[i2 + 2] - positions[i0 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const cx = (positions[i0] + positions[i1] + positions[i2]) / 3 - interior.x;
    const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3 - interior.y;
    const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3 - interior.z;
    const dot = nx * cx + ny * cy + nz * cz;
    if (Math.abs(dot) < 1e-10) continue;
    total += 1;
    if (dot > 0) positive += 1;
  }

  return positive / total;
}

test('the shell is the sRGB cube embedded in Oklab, facing outward', () => {
  const shell = buildShellArrays(8);
  assert.equal(shell.indices.length, 6 * 8 * 8 * 6);

  const white = labToWorld(1, 0, 0);
  const black = labToWorld(0, 0, 0);
  let foundWhite = false;
  let foundBlack = false;

  for (let index = 0; index < shell.positions.length; index += 3) {
    const x = shell.positions[index];
    const y = shell.positions[index + 1];
    const z = shell.positions[index + 2];
    assert.ok(Number.isFinite(x + y + z));
    const lab = worldToLab(x, y, z);
    const rgb = oklabToLinearSrgb(lab.L, lab.a, lab.b);
    assert.ok(Math.abs(rgb.r - shell.colors[index]) < 2e-4);
    assert.ok(Math.abs(rgb.g - shell.colors[index + 1]) < 2e-4);
    assert.ok(Math.abs(rgb.b - shell.colors[index + 2]) < 2e-4);
    if ((x - white.x) ** 2 + (y - white.y) ** 2 + (z - white.z) ** 2 < 1e-8) foundWhite = true;
    if ((x - black.x) ** 2 + (y - black.y) ** 2 + (z - black.z) ** 2 < 1e-8) foundBlack = true;
  }

  assert.equal(foundWhite, true);
  assert.equal(foundBlack, true);
  const ratio = outwardRatio(shell.positions, shell.indices);
  assert.ok(ratio > 0.9, `outward ratio ${ratio}`);
});

test('a mid lightness slice fills the gamut and stays inside it', () => {
  const slice = buildSliceArrays(0.7, 40);
  assert.ok(slice.positions.length > 1000);
  assert.equal(slice.positions.length % 9, 0);

  let minRadius = Infinity;
  let maxRadius = 0;
  let area = 0;

  for (let index = 0; index < slice.positions.length; index += 9) {
    const triangle = [0, 3, 6].map((offset) => {
      const x = slice.positions[index + offset];
      const y = slice.positions[index + offset + 1];
      const z = slice.positions[index + offset + 2];
      const lab = worldToLab(x, y, z);
      const rgb = oklabToLinearSrgb(lab.L, lab.a, lab.b);
      assert.ok(Math.abs(lab.L - 0.7) < 1e-6);
      assert.ok(rgb.r >= -1e-3 && rgb.r <= 1 + 1e-3);
      assert.ok(rgb.g >= -1e-3 && rgb.g <= 1 + 1e-3);
      assert.ok(rgb.b >= -1e-3 && rgb.b <= 1 + 1e-3);
      assert.ok(Math.abs(slice.colors[index + offset] - Math.min(1, Math.max(0, rgb.r))) < 2e-4);
      const radius = Math.hypot(lab.a, lab.b);
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      return lab;
    });
    area += Math.abs(
      (triangle[1].a - triangle[0].a) * (triangle[2].b - triangle[0].b) -
      (triangle[2].a - triangle[0].a) * (triangle[1].b - triangle[0].b),
    ) * 0.5;
  }

  assert.ok(minRadius < 1e-4, `neutral axis missing, min radius ${minRadius}`);
  assert.ok(maxRadius > 0.18 && maxRadius < 0.4, `chroma extent ${maxRadius}`);
  assert.ok(area > 0.05 && area < 0.4, `slice area ${area}`);
});
