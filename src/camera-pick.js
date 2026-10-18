import { encodedSrgbToOklab, linearSrgbToOklab, srgbToLinear } from './oklab.js';
import { labToLch } from './lch.js';

// A pixel with almost no coverage is the clear color, not a surface.
const MIN_ALPHA = 16;

// The camera surface is in front of the color model, so its color is the one on view.
export function cameraPickWins(cameraDistance, modelDistance) {
  return Number.isFinite(cameraDistance) && cameraDistance + 1e-4 < modelDistance;
}

export function colorFromLinear(r, g, b) {
  const lab = linearSrgbToOklab(r, g, b);
  return {
    rgb: { r, g, b },
    lch: labToLch(lab.L, lab.a, lab.b),
  };
}

// Encoded sRGB bytes, as the linear color and its Oklch place.
export function colorFromCameraPixel(r, g, b, a) {
  if (a < MIN_ALPHA) return null;
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const lab = encodedSrgbToOklab(red, green, blue);
  return {
    rgb: { r: srgbToLinear(red), g: srgbToLinear(green), b: srgbToLinear(blue) },
    lch: labToLch(lab.L, lab.a, lab.b),
  };
}

// One texel of a canvas or image. v grows up in the mesh and down in the canvas.
export function imagePixel(image, u, v, flipY = true) {
  const width = image.width;
  const height = image.height;
  if (!width || !height) return null;
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor((flipY ? 1 - v : v) * height)));
  if (typeof image.getContext === 'function') {
    const data = image.getContext('2d').getImageData(x, y, 1, 1).data;
    return [data[0], data[1], data[2], data[3]];
  }
  return null;
}
