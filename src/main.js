import { clamp01, inGamut, oklabToLinearSrgb } from './oklab.js';
import { BASE_Y, SCALE, VIEW_TARGET, labToWorld } from './scale.js';
import { buildShellArrays, buildSliceArrays } from './geometry.js';

const THREE = AFRAME.THREE;
const SHELL_SEGMENTS = 96;
const SLICE_DIVISIONS = 160;
const SLIDER_X = 1.18;
const DEFAULT_LIGHTNESS = 0.68;

const ORBIT = {
  yaw: 0.72,
  polar: 1.16,
  radius: 2.15,
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function geometryFromArrays(arrays) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(arrays.colors, 3));
  if (arrays.indices) geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function vertexColorMaterial(options) {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    ...options,
  });
}

function chromaColor(a, b) {
  const lightness = 0.66;
  if (inGamut(oklabToLinearSrgb(lightness, a, b))) {
    return oklabToLinearSrgb(lightness, a, b);
  }
  let inside = 0;
  let outside = 1;
  let rgb = oklabToLinearSrgb(lightness, 0, 0);
  for (let step = 0; step < 14; step++) {
    const mid = (inside + outside) / 2;
    const candidate = oklabToLinearSrgb(lightness, a * mid, b * mid);
    if (inGamut(candidate)) {
      inside = mid;
      rgb = candidate;
    } else {
      outside = mid;
    }
  }
  return rgb;
}

function linearColor(rgb) {
  const color = new THREE.Color();
  color.setRGB(clamp01(rgb.r), clamp01(rgb.g), clamp01(rgb.b), THREE.LinearSRGBColorSpace);
  return color;
}

AFRAME.registerComponent('gallery', {
  init() {
    const group = new THREE.Group();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ map: floorTexture(), toneMapped: false }),
    );
    floor.rotation.x = -Math.PI / 2;
    group.add(floor);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 0.045, 72),
      new THREE.MeshBasicMaterial({ color: 0x22262e, toneMapped: false }),
    );
    plinth.position.y = 0.0225;
    group.add(plinth);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.006, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0x3c4250, toneMapped: false }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.046;
    group.add(ring);

    this.el.setObject3D('gallery', group);
  },
});

function floorTexture() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  context.fillStyle = '#101218';
  context.fillRect(0, 0, size, size);
  context.strokeStyle = 'rgba(255,255,255,0.045)';
  context.lineWidth = 1;
  const cells = 20;
  for (let index = 0; index <= cells; index++) {
    const position = (index / cells) * size;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, size);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(size, position);
    context.stroke();
  }
  const fade = context.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.52);
  fade.addColorStop(0, 'rgba(16,18,24,0)');
  fade.addColorStop(1, 'rgba(16,18,24,1)');
  context.fillStyle = fade;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

AFRAME.registerComponent('oklab-rgb-solid', {
  init() {
    this.lightness = DEFAULT_LIGHTNESS;
    this.cutaway = true;
    this.refreshQueued = false;
    this.planePoint = new THREE.Vector3();
    this.planeNormal = new THREE.Vector3();
    this.cameraWorld = new THREE.Vector3();
    this.panelWorld = new THREE.Vector3();
    this.parentQuaternion = new THREE.Quaternion();
    this.parentEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.rayOrigin = new THREE.Vector3();
    this.rayDirection = new THREE.Vector3();
    this.rayPoint = new THREE.Vector3();

    const renderer = this.el.sceneEl.renderer;
    renderer.localClippingEnabled = true;

    const root = new THREE.Group();
    root.name = 'oklab-rgb-solid';
    this.el.setObject3D('mesh', root);

    const shellArrays = buildShellArrays(SHELL_SEGMENTS);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.shellMaterial = vertexColorMaterial({
      side: THREE.FrontSide,
      clippingPlanes: [this.clipPlane],
    });
    this.shellMesh = new THREE.Mesh(geometryFromArrays(shellArrays), this.shellMaterial);
    this.shellMesh.name = 'oklab-shell';
    root.add(this.shellMesh);

    this.sliceMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      vertexColorMaterial({
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.sliceMesh.position.y = -0.0015;
    this.sliceMesh.renderOrder = 1;
    this.sliceMesh.name = 'oklab-slice';
    root.add(this.sliceMesh);

    root.add(buildChromaAxes());
    this.buildSlider();
    this.buildPanel();
    this.refreshSlice();
    this.updateClipPlane();
  },

  play() {
    this.onEnterVR = () => { this.panel.object3D.visible = true; };
    this.onExitVR = () => { this.panel.object3D.visible = false; };
    this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
    this.onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowUp') {
        this.setLightness(this.lightness + 0.01);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        this.setLightness(this.lightness - 0.01);
        event.preventDefault();
      } else if (event.key === 'f' || event.key === 'F') {
        this.toggleCutaway();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  },

  pause() {
    window.removeEventListener('keydown', this.onKeyDown);
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
  },

  tick() {
    this.updateClipPlane();
    this.billboardPanel();
    if (this.sliderDrag) this.applySliderRay();
  },

  setLightness(value) {
    const next = clamp(value, 0, 1);
    if (Math.abs(next - this.lightness) < 0.0004) return;
    this.lightness = next;
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.refreshSlice();
    });
  },

  addLightness(delta) {
    this.setLightness(this.lightness + delta);
  },

  toggleCutaway() {
    this.setCutaway(!this.cutaway);
  },

  setCutaway(cutaway) {
    this.cutaway = cutaway;
    this.sliceMesh.visible = cutaway;
    this.updateClipPlane();
    if (this.modeButtonText) {
      this.modeButtonText.setAttribute('value', cutaway ? 'Full solid' : 'Cutaway');
    }
    this.emitChange();
  },

  refreshSlice() {
    const arrays = buildSliceArrays(this.lightness, SLICE_DIVISIONS);
    const geometry = geometryFromArrays(arrays);
    if (this.sliceMesh.geometry) this.sliceMesh.geometry.dispose();
    this.sliceMesh.geometry = geometry;

    const thumbY = labToWorld(this.lightness, 0, 0).y;
    this.thumb.position.y = thumbY;
    this.thumb.material.color.copy(linearColor(oklabToLinearSrgb(this.lightness, 0, 0)));
    if (this.cutReadout) {
      this.cutReadout.setAttribute('value', `Lightness cut   ${this.lightness.toFixed(2)}`);
    }
    this.updateClipPlane();
    this.emitChange();
  },

  emitChange() {
    this.el.sceneEl.emit('oklab-changed', {
      lightness: this.lightness,
      cutaway: this.cutaway,
    });
  },

  updateClipPlane() {
    if (!this.shellMesh) return;
    this.shellMesh.updateWorldMatrix(true, false);
    const yCut = this.cutaway
      ? labToWorld(this.lightness, 0, 0).y
      : BASE_Y + SCALE + 5;
    this.planePoint.set(0, yCut, 0);
    this.planeNormal.set(0, -1, 0);
    this.shellMesh.localToWorld(this.planePoint);
    this.planeNormal.transformDirection(this.shellMesh.matrixWorld);
    this.clipPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.planePoint);
  },

  billboardPanel() {
    const camera = this.el.sceneEl.camera;
    if (!camera || !this.panel || !this.panel.object3D || !this.panel.object3D.parent) return;
    this.panel.object3D.parent.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.cameraWorld);
    this.panel.object3D.getWorldPosition(this.panelWorld);
    const dx = this.cameraWorld.x - this.panelWorld.x;
    const dz = this.cameraWorld.z - this.panelWorld.z;
    this.panel.object3D.parent.getWorldQuaternion(this.parentQuaternion);
    this.parentEuler.setFromQuaternion(this.parentQuaternion, 'YXZ');
    this.panel.object3D.rotation.set(0, Math.atan2(dx, dz) - this.parentEuler.y, 0);
  },

  buildSlider() {
    this.slider = document.createElement('a-entity');
    this.slider.setAttribute('class', 'clickable');
    this.slider.setAttribute('position', { x: SLIDER_X, y: 0, z: 0 });
    this.el.appendChild(this.slider);

    const group = new THREE.Group();
    const track = new THREE.Mesh(lightnessTrackGeometry(), vertexColorMaterial());
    track.position.y = BASE_Y + SCALE / 2;
    group.add(track);

    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, SCALE, 0.32),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, toneMapped: false }),
    );
    hit.position.y = BASE_Y + SCALE / 2;
    group.add(hit);

    this.thumb = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.058, 0.007, 8, 28),
      new THREE.MeshBasicMaterial({ color: 0xf4f0e8, toneMapped: false }),
    );
    this.thumb.add(halo);
    group.add(this.thumb);
    this.slider.setObject3D('mesh', group);

    const caption = document.createElement('a-text');
    caption.setAttribute('value', 'L');
    caption.setAttribute('align', 'center');
    caption.setAttribute('color', '#f4f0e8');
    caption.setAttribute('width', 0.6);
    caption.setAttribute('position', { x: 0, y: BASE_Y + SCALE + 0.12, z: 0 });
    this.slider.appendChild(caption);

    this.slider.addEventListener('mousedown', (event) => {
      this.sliderDrag = event.detail.cursorEl;
      this.applySliderRay();
    });
    this.slider.addEventListener('mouseup', () => {
      this.sliderDrag = null;
    });
  },

  applySliderRay() {
    const cursor = this.sliderDrag;
    const raycaster = cursor && cursor.components.raycaster && cursor.components.raycaster.raycaster;
    if (!raycaster || !this.slider.object3D) return;
    this.slider.object3D.updateWorldMatrix(true, false);
    this.slider.object3D.getWorldPosition(this.rayOrigin);
    this.rayDirection.set(0, 1, 0).transformDirection(this.slider.object3D.matrixWorld).normalize();
    closestPointOnRayToLine(raycaster.ray, this.rayOrigin, this.rayDirection, this.rayPoint);
    this.slider.object3D.worldToLocal(this.rayPoint);
    this.setLightness((this.rayPoint.y - BASE_Y) / SCALE);
  },

  buildPanel() {
    this.panel = document.createElement('a-entity');
    this.panel.setAttribute('position', { x: -1.5, y: 1.7, z: 0.15 });
    this.panel.setAttribute('visible', false);
    this.el.appendChild(this.panel);

    const backing = document.createElement('a-plane');
    backing.setAttribute('width', 1.05);
    backing.setAttribute('height', 1.05);
    backing.setAttribute('position', { x: 0, y: -0.42, z: -0.02 });
    backing.setAttribute('material', { color: '#141820', shader: 'flat', opacity: 0.88 });
    this.panel.appendChild(backing);

    const body = document.createElement('a-text');
    body.setAttribute('value', [
      'sRGB solid in Oklab',
      '',
      'Every displayable color,',
      'at its Oklab position.',
      'L, a, and b share a scale.',
      '',
      'Left stick walks.',
      'Right stick moves the cut.',
      'Flick sideways to turn.',
    ].join('\n'));
    body.setAttribute('color', '#f4f0e8');
    body.setAttribute('width', 1.05);
    body.setAttribute('wrap-count', 28);
    body.setAttribute('align', 'left');
    body.setAttribute('baseline', 'top');
    body.setAttribute('position', { x: -0.48, y: 0, z: 0 });
    this.panel.appendChild(body);

    this.cutReadout = document.createElement('a-text');
    this.cutReadout.setAttribute('color', '#f4f0e8');
    this.cutReadout.setAttribute('width', 1.05);
    this.cutReadout.setAttribute('align', 'left');
    this.cutReadout.setAttribute('baseline', 'top');
    this.cutReadout.setAttribute('position', { x: -0.46, y: -0.7, z: 0 });
    this.panel.appendChild(this.cutReadout);

    const button = document.createElement('a-entity');
    button.setAttribute('class', 'clickable');
    button.setAttribute('geometry', { primitive: 'plane', width: 0.72, height: 0.16 });
    button.setAttribute('material', { color: '#2c3140', shader: 'flat' });
    button.setAttribute('position', { x: 0, y: -0.86, z: 0.01 });
    button.addEventListener('click', () => this.toggleCutaway());
    this.modeButtonText = document.createElement('a-text');
    this.modeButtonText.setAttribute('value', 'Full solid');
    this.modeButtonText.setAttribute('align', 'center');
    this.modeButtonText.setAttribute('color', '#f4f0e8');
    this.modeButtonText.setAttribute('width', 0.66);
    this.modeButtonText.setAttribute('position', '0 0 0.01');
    button.appendChild(this.modeButtonText);
    this.panel.appendChild(button);

    this.addAxisLabel('+a  red', 0.92, 0.14, 0.18, 0);
    this.addAxisLabel('-a  green', -0.92, 0.14, 0.18, 0);
    this.addAxisLabel('+b  yellow', 0.18, 0.14, 0.98, 0);
    this.addAxisLabel('-b  blue', -0.18, 0.14, -0.98, 180);
  },

  addAxisLabel(value, x, y, z, yaw) {
    const label = document.createElement('a-text');
    label.setAttribute('value', value);
    label.setAttribute('align', 'center');
    label.setAttribute('color', '#f4f0e8');
    label.setAttribute('width', 1.1);
    label.setAttribute('side', 'double');
    label.setAttribute('position', { x, y, z });
    label.setAttribute('rotation', { x: 0, y: yaw, z: 0 });
    this.el.appendChild(label);
  },
});

function lightnessTrackGeometry() {
  const geometry = new THREE.CylinderGeometry(0.016, 0.016, SCALE, 16, 32);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index++) {
    const lightness = (position.getY(index) + SCALE / 2) / SCALE;
    const rgb = oklabToLinearSrgb(clamp(lightness, 0, 1), 0, 0);
    colors[index * 3] = clamp01(rgb.r);
    colors[index * 3 + 1] = clamp01(rgb.g);
    colors[index * 3 + 2] = clamp01(rgb.b);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildChromaAxes() {
  const group = new THREE.Group();
  group.add(axisRibbon(-0.48, 0, 0.48, 0));
  group.add(axisRibbon(0, -0.5, 0, 0.5));
  addArrow(group, 0.48, 0, 1, 0);
  addArrow(group, -0.48, 0, -1, 0);
  addArrow(group, 0, 0.5, 0, 1);
  addArrow(group, 0, -0.5, 0, -1);
  return group;
}

function axisRibbon(a0, b0, a1, b1) {
  const steps = 64;
  const width = 0.028;
  const positions = new Float32Array((steps + 1) * 6);
  const colors = new Float32Array((steps + 1) * 6);
  const indices = new Uint32Array(steps * 6);
  const worldX = (a1 - a0) * SCALE;
  const worldZ = (b1 - b0) * SCALE;
  const length = Math.hypot(worldX, worldZ) || 1;
  const px = (-worldZ / length) * width / 2;
  const pz = (worldX / length) * width / 2;

  for (let index = 0; index <= steps; index++) {
    const t = index / steps;
    const a = a0 + (a1 - a0) * t;
    const b = b0 + (b1 - b0) * t;
    const rgb = chromaColor(a, b);
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const offset = (index * 2 + side) * 3;
      positions[offset] = a * SCALE + sign * px;
      positions[offset + 1] = 0.055;
      positions[offset + 2] = b * SCALE + sign * pz;
      colors[offset] = clamp01(rgb.r);
      colors[offset + 1] = clamp01(rgb.g);
      colors[offset + 2] = clamp01(rgb.b);
    }
  }

  for (let index = 0; index < steps; index++) {
    const vertex = index * 2;
    const offset = index * 6;
    indices[offset] = vertex;
    indices[offset + 1] = vertex + 1;
    indices[offset + 2] = vertex + 2;
    indices[offset + 3] = vertex + 1;
    indices[offset + 4] = vertex + 3;
    indices[offset + 5] = vertex + 2;
  }

  return new THREE.Mesh(geometryFromArrays({ positions, colors, indices }), vertexColorMaterial({ side: THREE.DoubleSide }));
}

function addArrow(group, a, b, directionA, directionB) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.034, 0.09, 14),
    new THREE.MeshBasicMaterial({ color: linearColor(chromaColor(a, b)), toneMapped: false }),
  );
  const direction = new THREE.Vector3(directionA, 0, directionB).normalize();
  cone.position.set(a * SCALE, 0.055, b * SCALE);
  cone.position.addScaledVector(direction, 0.045);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  group.add(cone);
}

function closestPointOnRayToLine(ray, lineOrigin, lineDirection, target) {
  const difference = new THREE.Vector3().subVectors(ray.origin, lineOrigin);
  const a = ray.direction.dot(ray.direction);
  const b = ray.direction.dot(lineDirection);
  const d = ray.direction.dot(difference);
  const e = lineDirection.dot(difference);
  const denominator = a - b * b;
  const distance = Math.abs(denominator) < 1e-6 ? 0 : (a * e - b * d) / denominator;
  return target.copy(lineOrigin).addScaledVector(lineDirection, distance);
}

AFRAME.registerComponent('orbit-view', {
  init() {
    this.yaw = ORBIT.yaw;
    this.polar = ORBIT.polar;
    this.radius = ORBIT.radius;
    this.dragging = false;
    this.onPointerDown = (event) => {
      if (event.button !== 0 || this.el.sceneEl.is('vr-mode')) return;
      this.dragging = true;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.el.sceneEl.canvas.setPointerCapture(event.pointerId);
      this.el.sceneEl.canvas.style.cursor = 'grabbing';
    };
    this.onPointerMove = (event) => {
      if (!this.dragging) return;
      const dx = event.clientX - this.lastX;
      const dy = event.clientY - this.lastY;
      this.lastX = event.clientX;
      this.lastY = event.clientY;
      this.yaw -= dx * 0.005;
      this.polar = clamp(this.polar + dy * 0.004, 0.25, 1.55);
    };
    this.onPointerUp = () => {
      this.dragging = false;
      if (this.el.sceneEl.canvas) this.el.sceneEl.canvas.style.cursor = 'grab';
    };
    this.onWheel = (event) => {
      if (this.el.sceneEl.is('vr-mode')) return;
      event.preventDefault();
      this.radius = clamp(this.radius * Math.exp(event.deltaY * 0.001), 1.2, 8);
    };
    this.onKeyDown = (event) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'r' || event.key === 'R') {
        this.yaw = ORBIT.yaw;
        this.polar = ORBIT.polar;
        this.radius = ORBIT.radius;
      }
    };
    this.onEnterVR = () => {
      const world = document.getElementById('world').object3D;
      world.position.set(0, 0, -2.15);
      world.rotation.set(0, 0, 0);
      const cameraEl = document.getElementById('camera');
      cameraEl.object3D.rotation.set(0, 0, 0);
      const camera = cameraEl.getObject3D('camera');
      if (camera) camera.rotation.set(0, 0, 0);
      cameraEl.setAttribute('look-controls', 'enabled', true);
    };
    this.onExitVR = () => {
      const world = document.getElementById('world').object3D;
      world.position.set(0, 0, 0);
      world.rotation.set(0, 0, 0);
      document.getElementById('camera').setAttribute('look-controls', 'enabled', false);
    };
  },

  play() {
    const canvas = this.el.sceneEl.canvas;
    canvas.style.cursor = 'grab';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
  },

  pause() {
    const canvas = this.el.sceneEl.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
  },

  tick() {
    if (this.el.sceneEl.is('vr-mode')) return;
    const cameraEl = document.getElementById('camera');
    const rig = cameraEl.object3D;
    const camera = cameraEl.getObject3D('camera');
    if (!camera) return;
    const target = VIEW_TARGET;
    const sinPolar = Math.sin(this.polar);
    // The entity is a group. Aim the PerspectiveCamera child: lookAt on a
    // plain group points +Z at the target, and cameras look down -Z.
    rig.rotation.set(0, 0, 0);
    rig.position.set(
      target.x + this.radius * sinPolar * Math.sin(this.yaw),
      Math.max(0.35, target.y + this.radius * Math.cos(this.polar)),
      target.z + this.radius * sinPolar * Math.cos(this.yaw),
    );
    camera.lookAt(target.x, target.y, target.z);
  },
});

AFRAME.registerComponent('exhibit-ray', {
  init() {
    const apply = () => {
      this.el.setAttribute('raycaster', {
        objects: '.clickable',
        far: 8,
        lineColor: '#f4f0e8',
        lineOpacity: 0.4,
      });
    };
    this.el.addEventListener('controllerconnected', apply);
    this.el.addEventListener('controllermodelready', apply);
  },
});

AFRAME.registerComponent('locomotion', {
  schema: { speed: { default: 1.25 } },
  init() {
    this.axisX = 0;
    this.axisY = 0;
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.el.addEventListener('thumbstickmoved', (event) => {
      this.axisX = event.detail.x;
      this.axisY = event.detail.y;
    });
  },
  tick(_time, deltaMs) {
    if (!this.el.sceneEl.is('vr-mode')) return;
    if (Math.abs(this.axisX) < 0.18 && Math.abs(this.axisY) < 0.18) return;
    const camera = this.el.sceneEl.camera;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) return;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up);
    const distance = this.data.speed * (deltaMs / 1000);
    const world = document.getElementById('world').object3D;
    world.position.addScaledVector(this.forward, this.axisY * distance);
    world.position.addScaledVector(this.right, -this.axisX * distance);
    const horizontal = Math.hypot(world.position.x, world.position.z);
    if (horizontal > 12) {
      world.position.x *= 12 / horizontal;
      world.position.z *= 12 / horizontal;
    }
  },
});

AFRAME.registerComponent('lightness-stick', {
  init() {
    this.turned = false;
    this.el.addEventListener('thumbstickmoved', (event) => {
      if (!this.el.sceneEl.is('vr-mode')) return;
      const x = event.detail.x;
      const y = event.detail.y;
      const solid = document.getElementById('solid').components['oklab-rgb-solid'];
      if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 0.75) {
        if (!this.turned) {
          this.turned = true;
          turnWorld(Math.sign(x) * (Math.PI / 6));
        }
        return;
      }
      if (Math.abs(x) < 0.3) this.turned = false;
      if (Math.abs(y) > 0.2) solid.addLightness(-y * 0.008);
    });
  },
});

function turnWorld(angle) {
  const world = document.getElementById('world').object3D;
  const camera = document.querySelector('a-scene').camera;
  const head = new THREE.Vector3();
  camera.getWorldPosition(head);
  const dx = world.position.x - head.x;
  const dz = world.position.z - head.z;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  world.position.x = head.x + dx * cos - dz * sin;
  world.position.z = head.z + dx * sin + dz * cos;
  world.rotation.y += angle;
}

function bindHud() {
  const scene = document.querySelector('a-scene');
  const slider = document.getElementById('lightness');
  const readout = document.getElementById('lightness-value');
  const mode = document.getElementById('mode');
  const status = document.getElementById('status');

  const solid = () => document.getElementById('solid').components['oklab-rgb-solid'];

  slider.addEventListener('input', () => {
    const component = solid();
    if (component) component.setLightness(Number(slider.value));
  });
  mode.addEventListener('click', () => {
    const component = solid();
    if (component) component.toggleCutaway();
  });
  scene.addEventListener('oklab-changed', (event) => {
    const { lightness, cutaway } = event.detail;
    const text = lightness.toFixed(2);
    if (document.activeElement !== slider) slider.value = String(lightness);
    readout.textContent = text;
    mode.textContent = cutaway ? 'Full solid' : 'Cutaway';
    status.textContent = cutaway
      ? 'The top of the solid is cut away at this lightness.'
      : 'The complete sRGB surface, with no cut.';
  });
}

bindHud();
