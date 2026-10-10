// One meter per Oklab unit on L, a, and b, so the solid is the real shape
// of the sRGB gamut rather than a chroma-exaggerated plot.
export const SCALE = 1.55;
export const BASE_Y = 0.5;

export const VIEW_TARGET = {
  x: 0,
  y: BASE_Y + 0.58 * SCALE,
  z: 0,
};

export function labToWorld(L, a, b) {
  return {
    x: a * SCALE,
    y: BASE_Y + L * SCALE,
    z: b * SCALE,
  };
}

export function worldToLab(x, y, z) {
  return {
    L: (y - BASE_Y) / SCALE,
    a: x / SCALE,
    b: z / SCALE,
  };
}
