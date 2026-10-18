import { clamp01, inGamut, oklabToLinearSrgb } from './oklab.js';

// Oklab a and b, and lightness, per second at full input.
export const AB_RATE = 0.15;
export const LIGHTNESS_RATE = 0.25;
export const STICK_DEADZONE = 0.18;
const MAX_CHROMA = 0.4;

// A visible starting color, inside the gamut, until the stick or a pick moves it.
export const INITIAL_CONTROLLER_COLOR = { L: 0.7, a: 0.086602540378, b: 0.05 };

export function lchToLab(L, c, h) {
  const rad = (h * Math.PI) / 180;
  return { L, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function lchToLinearRgb({ L, c, h }) {
  const { a, b } = lchToLab(L, c, h);
  const rgb = oklabToLinearSrgb(L, a, b);
  return { r: clamp01(rgb.r), g: clamp01(rgb.g), b: clamp01(rgb.b) };
}

export function inGamutLch(L, c, h) {
  const { a, b } = lchToLab(L, c, h);
  return inGamut(oklabToLinearSrgb(L, a, b));
}

// Largest chroma that still fits in sRGB at this lightness and hue.
export function maxChroma(L, h) {
  if (!inGamutLch(L, 0, h)) return 0;
  let low = 0;
  let high = MAX_CHROMA;
  for (let step = 0; step < 16; step++) {
    const mid = (low + high) / 2;
    if (inGamutLch(L, mid, h)) low = mid;
    else high = mid;
  }
  return low;
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function stickPastDeadzone(axis) {
  return Math.abs(axis) >= STICK_DEADZONE;
}

// The stick, the index trigger, or the grip puts the picker into controller mode.
export function controllerEngaged({ axisX, axisY, lightnessUp, lightnessDown }) {
  return stickPastDeadzone(axisX) || stickPastDeadzone(axisY) || lightnessUp || lightnessDown;
}

// Y held grows the solid. X held shrinks it. Both together hold the size.
export function zoomAxis(xHeld, yHeld) {
  if (yHeld && !xHeld) return 1;
  if (xHeld && !yHeld) return -1;
  return 0;
}

// Keep a and b, pulling them toward neutral until the color is inside sRGB.
export function clampLabToGamut(L, a, b) {
  if (inGamut(oklabToLinearSrgb(L, a, b))) return { L, a, b };
  const span = Math.hypot(a, b);
  if (span < 1e-8) return { L, a: 0, b: 0 };
  let low = 0;
  let high = 1;
  for (let step = 0; step < 16; step++) {
    const mid = (low + high) / 2;
    if (inGamut(oklabToLinearSrgb(L, a * mid, b * mid))) low = mid;
    else high = mid;
  }
  return { L, a: a * low, b: b * low };
}

// Right on the stick raises a, up raises b. The index trigger raises
// lightness and the grip lowers it. The sample stays inside the gamut.
export function stepControllerColor(color, input, deltaSeconds) {
  const axisX = stickPastDeadzone(input.axisX) ? input.axisX : 0;
  const axisY = stickPastDeadzone(input.axisY) ? input.axisY : 0;
  let lightness = 0;
  if (input.lightnessUp) lightness += 1;
  if (input.lightnessDown) lightness -= 1;
  const L = clamp(color.L + lightness * LIGHTNESS_RATE * deltaSeconds, 0, 1);
  const a = color.a + axisX * AB_RATE * deltaSeconds;
  const b = color.b + axisY * AB_RATE * deltaSeconds;
  return clampLabToGamut(L, a, b);
}
