import { maxChroma } from './controller-color.js';
import { SCALE, worldToLab } from './scale.js';

const DEG = 180 / Math.PI;

// Oklch: chroma is the distance from the neutral axis, hue is the angle of a and b.
export function labToLch(L, a, b) {
  const c = Math.hypot(a, b);
  let h = Math.atan2(b, a) * DEG;
  if (c < 1e-4) h = 0;
  else if (h < 0) h += 360;
  return { L, c, h };
}

export function formatLightness(L) {
  return `L ${L.toFixed(2)}`;
}

export function formatLch({ L, c, h }) {
  return `L ${L.toFixed(2)}\nc ${c.toFixed(3)}\nh ${Math.round(h)}°`;
}

// Hand-local metres. The label is 9cm wide, so its inner edge sits just off
// the right side of the controller face.
export const CONTROLLER_LCH_OFFSET = { x: 0.075, y: 0.02, z: -0.02 };

// c and h at the picked color. Lightness is the slice label, not this one.
export function formatChromaHue({ c, h }) {
  return `c ${c.toFixed(3)}\nh ${Math.round(h)}°`;
}

// World metres. The label is parented to the solid, so its local size is
// this divided by the solid's scale.
export const SLICE_LABEL_WORLD_WIDTH = 0.075;
// World metres of air between the gamut and the label.
export const SLICE_LABEL_CLEARANCE = 0.035;

// The lightness the plane is cutting. A level blade shares one L. A tilted
// blade uses the L where that plane crosses the neutral axis.
export function sliceLevel(point, normal) {
  if (Math.abs(normal.y) < 0.2) return { x: point.x, y: point.y, z: point.z };
  const y = point.y + (point.x * normal.x + point.z * normal.z) / normal.y;
  return { x: 0, y, z: 0 };
}

export function sliceLightness(point, normal) {
  const level = sliceLevel(point, normal);
  return worldToLab(level.x, level.y, level.z).L;
}

// Local metres from the neutral axis to the widest in-gamut color at this L.
export function gamutRadiusAt(L) {
  let chroma = 0;
  for (let hue = 0; hue < 360; hue += 15) chroma = Math.max(chroma, maxChroma(L, hue));
  return chroma * SCALE;
}

// Just outside the slice. labelHalfWidth and the clearance are in the same
// local metres as the solid, so the text sits next to the rim.
export function sliceLabelReach(L, labelHalfWidth) {
  return gamutRadiusAt(L) + labelHalfWidth + SLICE_LABEL_CLEARANCE;
}

// A point in the slice plane, just outside the gamut, level with that L.
export function sliceLabelPoint(point, normal, reach) {
  const level = sliceLevel(point, normal);
  const distance = reach ?? sliceLabelReach(worldToLab(level.x, level.y, level.z).L, 0);
  let dx = 1 - normal.x * normal.x;
  let dy = -normal.y * normal.x;
  let dz = -normal.z * normal.x;
  let length = Math.hypot(dx, dy, dz);
  if (length < 0.25) {
    dx = -normal.x * normal.z;
    dy = -normal.y * normal.z;
    dz = 1 - normal.z * normal.z;
    length = Math.hypot(dx, dy, dz) || 1;
  }
  return {
    x: level.x + (dx / length) * distance,
    y: level.y + (dy / length) * distance,
    z: level.z + (dz / length) * distance,
  };
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawReadout(ctx, canvas, text) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const lines = text.split('\n');
  ctx.font = '700 64px sans-serif';
  ctx.textBaseline = 'middle';
  const lineHeight = 76;
  const padX = 28;
  const padY = 22;
  const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
  const boxWidth = textWidth + padX * 2;
  const boxHeight = lines.length * lineHeight + padY * 2;
  const x = (canvas.width - boxWidth) / 2;
  const y = (canvas.height - boxHeight) / 2;
  ctx.fillStyle = 'rgba(12, 14, 18, 0.82)';
  roundRect(ctx, x, y, boxWidth, boxHeight, 28);
  ctx.fill();
  ctx.fillStyle = '#f7f4ee';
  ctx.textAlign = 'left';
  lines.forEach((line, index) => {
    ctx.fillText(line, x + padX, y + padY + lineHeight * (index + 0.5));
  });
}

// A camera-facing label. setText redraws only when the string changes.
export function createReadout(THREE, { width = 512, height = 256, scale = 0.12 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  }));
  sprite.scale.set(scale, scale * (height / width), 1);
  sprite.renderOrder = 30;
  sprite.raycast = () => {};
  sprite.visible = false;
  sprite.name = 'lch-readout';
  let shown = '';
  sprite.userData.setText = (text) => {
    if (text === shown) return;
    shown = text;
    sprite.userData.text = text;
    drawReadout(ctx, canvas, text);
    map.needsUpdate = true;
  };
  return sprite;
}
