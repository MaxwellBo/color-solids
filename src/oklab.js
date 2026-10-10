// sRGB ↔ Oklab, using Björn Ottosson's matrices updated 2021-01-25.
// https://bottosson.github.io/posts/oklab/

const GAMUT_EPSILON = 1e-4;

export function clamp01(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function srgbToLinear(channel) {
  if (channel <= 0.04045) return channel / 12.92;
  return ((channel + 0.055) / 1.055) ** 2.4;
}

export function linearSrgbToOklab(r, g, b) {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    L: 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  };
}

export function oklabToLinearSrgb(L, a, b) {
  const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  };
}

export function encodedSrgbToOklab(r, g, b) {
  return linearSrgbToOklab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
}

export function inGamut(rgb) {
  return rgb.r >= -GAMUT_EPSILON && rgb.g >= -GAMUT_EPSILON && rgb.b >= -GAMUT_EPSILON &&
    rgb.r <= 1 + GAMUT_EPSILON && rgb.g <= 1 + GAMUT_EPSILON && rgb.b <= 1 + GAMUT_EPSILON;
}
