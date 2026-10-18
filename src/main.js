import { clamp01, linearToSrgb, oklabToLinearSrgb } from './oklab.js';
import { BASE_Y, SCALE, VIEW_TARGET, labToWorld, worldToLab } from './scale.js';
import { buildEdgeTubeArrays, buildShellArrays, buildSliceArrays } from './geometry.js';
import {
  buildStrokeArrays,
  colorAtLocalPoint,
  PICK_FILL_RADIUS,
  PICK_RING_INNER,
  PICK_RING_OUTER,
  selectPick,
  STROKE_RADIUS,
} from './brush.js';
import {
  activeSliceMode,
  bladeNormal,
  HAND_OFFSET_Z,
  HAND_ROTATION_X,
  HAND_SCALE,
  nextHeldScale,
  levelCutNormal,
  localCutFromWorld,
  PLANE_RADIUS,
  sliceClearsOnRelease,
  worldCutFromLocal,
} from './hand.js';
import { installScenePassthrough } from './passthrough.js';
import { EXHIBIT_VERSION } from './version.js';
import {
  createReadout,
  formatLch,
  formatLightness,
  labToLch,
  sliceLabelPoint,
  sliceLightness,
} from './lch.js';
import { DESKTOP_BUTTONS } from './desktop-hands.js';
import './controllers.js';
import { bindSidePanel } from './side-panel.js';
import './lighting.js';

const THREE = AFRAME.THREE;
const SHELL_SEGMENTS = 96;
const EDGE_SEGMENTS = 48;
const EDGE_RADIUS = 0.02;
const SLICE_DIVISIONS = 160;
const SLIDER_X = 1.18;
const DEFAULT_LIGHTNESS = 0.68;

const ORBIT = {
  yaw: 0.55,
  polar: 1.15,
  radius: 1.55,
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sceneInHeadset(scene) {
  return scene.is('vr-mode') || scene.is('ar-mode');
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

function linearColor(rgb) {
  const color = new THREE.Color();
  color.setRGB(clamp01(rgb.r), clamp01(rgb.g), clamp01(rgb.b), THREE.LinearSRGBColorSpace);
  return color;
}

// Coefficients match oklabToLinearSrgb. The cap is a disc in the cut plane;
// each fragment is tested in the solid's local frame, so the cut stays a true
// cross-section when the solid rotates with the controller.
const SECTION_VERTEX = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const SECTION_FRAGMENT = `
  uniform mat4 solidInverse;
  uniform float solidScale;
  uniform float baseY;
  varying vec3 vWorldPosition;
  void main() {
    vec3 local = (solidInverse * vec4(vWorldPosition, 1.0)).xyz;
    float L = (local.y - baseY) / solidScale;
    float a = local.x / solidScale;
    float b = local.z / solidScale;
    float lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
    float mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
    float sRoot = L - 0.0894841775 * a - 1.2914855480 * b;
    float lmsL = lRoot * lRoot * lRoot;
    float lmsM = mRoot * mRoot * mRoot;
    float lmsS = sRoot * sRoot * sRoot;
    float red = 4.0767416621 * lmsL - 3.3077115913 * lmsM + 0.2309699292 * lmsS;
    float green = -1.2684380046 * lmsL + 2.6097574011 * lmsM - 0.3413193965 * lmsS;
    float blue = -0.0041960863 * lmsL - 0.7034186147 * lmsM + 1.7076147010 * lmsS;
    if (red < -0.0015 || green < -0.0015 || blue < -0.0015 ||
        red > 1.0015 || green > 1.0015 || blue > 1.0015) discard;
    gl_FragColor = vec4(red, green, blue, 1.0);
    #include <colorspace_fragment>
  }
`;

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
    this.held = false;
    this.heldScale = HAND_SCALE;
    this.handEl = null;
    this.cutActive = false;
    this.cutLocalPoint = new THREE.Vector3();
    this.cutLocalNormal = new THREE.Vector3(0, 1, 0);
    this.sliceReadout = createReadout(THREE, { width: 512, height: 160, scale: 0.14 });
    this.sliceReadout.name = 'slice-readout';
    this.el.sceneEl.object3D.add(this.sliceReadout);
    this.yAxis = new THREE.Vector3(0, 1, 0);

    const renderer = this.el.sceneEl.renderer;
    renderer.localClippingEnabled = true;

    const root = new THREE.Group();
    root.name = 'oklab-rgb-solid';
    this.exhibitRoot = root;
    this.el.setObject3D('mesh', root);

    this.heldRoot = new THREE.Group();
    this.heldRoot.name = 'oklab-held';
    root.add(this.heldRoot);

    const shellArrays = buildShellArrays(SHELL_SEGMENTS);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
    this.ghostClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
    this.shellMaterial = vertexColorMaterial({
      side: THREE.FrontSide,
      clippingPlanes: [this.clipPlane],
    });
    this.shellMesh = new THREE.Mesh(geometryFromArrays(shellArrays), this.shellMaterial);
    this.shellMesh.name = 'oklab-shell';
    this.heldRoot.add(this.shellMesh);

    this.ghostMaterial = vertexColorMaterial({
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      clippingPlanes: [this.ghostClipPlane],
    });
    this.ghostMesh = new THREE.Mesh(
      geometryFromArrays(buildEdgeTubeArrays(EDGE_SEGMENTS, EDGE_RADIUS)),
      this.ghostMaterial,
    );
    this.ghostMesh.name = 'oklab-edges';
    this.ghostMesh.renderOrder = 3;
    this.ghostMesh.visible = false;
    this.heldRoot.add(this.ghostMesh);

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
    this.heldRoot.add(this.sliceMesh);

    this.buildCutPlane();
    this.buildSlider();
    this.buildPanel();
    this.refreshSlice();
    this.updateClipPlane();
  },

  remove() {
    if (this.planeAnchor) this.planeAnchor.removeFromParent();
    if (this.previewHand) this.previewHand.removeFromParent();
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

  setHeldScale(scale) {
    this.heldScale = scale;
    if (this.held && this.heldRoot) this.heldRoot.scale.setScalar(scale);
  },

  // Parent the colored solid to a controller (or a stand-in object). The
  // slider and plinth stay where they are.
  attachToObject(object3D) {
    this.held = true;
    object3D.add(this.heldRoot);
    this.heldRoot.position.set(0, 0, HAND_OFFSET_Z);
    this.heldRoot.rotation.set(HAND_ROTATION_X, 0, 0);
    this.heldRoot.scale.setScalar(this.heldScale);
    this.setExhibitChromeVisible(false);
    this.endControllerCut();
    this.el.sceneEl.emit('solid-held', { held: true });
  },

  attachToHand(handEl) {
    this.handEl = handEl;
    this.attachToObject(handEl.object3D);
    handEl.setAttribute('raycaster', 'showLine', false);
  },

  releaseFromHand() {
    const handEl = this.handEl;
    this.handEl = null;
    this.held = false;
    this.cutActive = false;
    this.exhibitRoot.add(this.heldRoot);
    this.heldRoot.position.set(0, 0, 0);
    this.heldRoot.rotation.set(0, 0, 0);
    this.heldRoot.scale.set(1, 1, 1);
    this.setExhibitChromeVisible(true);
    this.updateClipPlane();
    if (handEl) handEl.setAttribute('raycaster', 'showLine', true);
    if (this.previewHand) this.previewHand.removeFromParent();
    this.el.sceneEl.emit('solid-held', { held: false });
  },

  setExhibitChromeVisible(visible) {
    if (this.slider) this.slider.setAttribute('visible', visible);
  },

  // Store the spatula blade on the solid. worldNormal points to the side
  // that becomes edges, which is the controller's up. Later motion of the
  // solid carries this plane with it.
  setControllerCut(worldPoint, worldNormal) {
    if (!this.heldRoot) return;
    this.heldRoot.updateWorldMatrix(true, false);
    const local = localCutFromWorld(worldPoint, worldNormal, this.heldRoot.matrixWorld.elements);
    this.cutActive = true;
    this.cutLocalPoint.set(local.point.x, local.point.y, local.point.z);
    this.cutLocalNormal.set(local.normal.x, local.normal.y, local.normal.z);
    if (this.cutLocalNormal.lengthSq() < 1e-8) this.cutLocalNormal.set(0, 1, 0);
    this.poseCutAnchor();
    this.updateClipPlane();
  },

  endControllerCut() {
    this.cutActive = false;
    this.updateClipPlane();
  },

  poseCutAnchor() {
    this.planeAnchor.position.copy(this.cutLocalPoint);
    this.planeAnchor.quaternion.setFromUnitVectors(this.yAxis, this.cutLocalNormal);
    const scale = this.heldRoot.scale.x || 1;
    this.planeAnchor.scale.setScalar(1 / scale);
  },

  // Pose the solid as if the left controller were holding it, and open a
  // level cut through it. Used to check the gesture without a headset.
  previewHeldCut({ tilt = 0.4, yaw = 0.25, cut = 0.5 } = {}) {
    if (!this.previewHand) {
      this.previewHand = new THREE.Group();
      this.previewHand.name = 'preview-hand';
    }
    this.el.sceneEl.object3D.add(this.previewHand);
    this.previewHand.position.set(0, 0, 0);
    this.previewHand.rotation.set(Math.PI / 2 - tilt, yaw, 0);
    this.attachToObject(this.previewHand);
    this.previewHand.updateWorldMatrix(true, true);
    const center = new THREE.Box3().setFromObject(this.shellMesh).getCenter(new THREE.Vector3());
    this.previewHand.position.set(
      VIEW_TARGET.x - center.x,
      VIEW_TARGET.y - center.y,
      VIEW_TARGET.z - center.z,
    );
    this.previewHand.updateWorldMatrix(true, true);
    const placed = new THREE.Box3().setFromObject(this.shellMesh);
    const planeY = placed.min.y + (placed.max.y - placed.min.y) * cut;
    const tip = placed.getCenter(new THREE.Vector3());
    tip.y = planeY;
    this.setControllerCut(tip, new THREE.Vector3(0, 1, 0));
    return planeY;
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

  // Color inside the solid at a world position. Null outside the gamut.
  colorAtWorldPoint(worldPoint) {
    if (!this.shellMesh) return null;
    this.shellMesh.updateWorldMatrix(true, false);
    const local = this.shellMesh.worldToLocal(worldPoint.clone());
    return colorAtLocalPoint(local.x, local.y, local.z);
  },

  labAtWorldPoint(worldPoint) {
    if (!this.shellMesh) return null;
    this.shellMesh.updateWorldMatrix(true, false);
    const local = this.shellMesh.worldToLocal(worldPoint.clone());
    return worldToLab(local.x, local.y, local.z);
  },

  updateSliceReadout() {
    if (!this.sliceReadout) return;
    let point = null;
    let normal = null;
    if (this.cutActive) {
      point = this.cutLocalPoint;
      normal = this.cutLocalNormal;
    } else if (!this.held && this.cutaway) {
      const level = labToWorld(this.lightness, 0, 0);
      point = level;
      normal = { x: 0, y: 1, z: 0 };
    }
    if (!point) {
      this.sliceReadout.visible = false;
      return;
    }
    const label = sliceLabelPoint(point, normal);
    this.sliceReadout.userData.setText(formatLightness(sliceLightness(point, normal)));
    this.heldRoot.updateWorldMatrix(true, false);
    this.sliceReadout.position.set(label.x, label.y, label.z);
    this.heldRoot.localToWorld(this.sliceReadout.position);
    this.sliceReadout.visible = true;
  },

  updateClipPlane() {
    if (!this.shellMesh) return;
    const cutting = this.cutActive;
    this.ghostMesh.visible = cutting;
    this.planeAnchor.visible = cutting;
    if (cutting) {
      this.sliceMesh.visible = false;
      this.heldRoot.updateWorldMatrix(true, false);
      const world = worldCutFromLocal(
        this.cutLocalPoint,
        this.cutLocalNormal,
        this.heldRoot.matrixWorld.elements,
      );
      this.planePoint.set(world.point.x, world.point.y, world.point.z);
      this.planeNormal.set(world.normal.x, world.normal.y, world.normal.z);
      this.ghostClipPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.planePoint);
      this.clipPlane.setFromNormalAndCoplanarPoint(this.planeNormal.clone().negate(), this.planePoint);
      this.poseCutAnchor();
      this.shellMesh.updateWorldMatrix(true, false);
      this.sectionMaterial.uniforms.solidInverse.value.copy(this.shellMesh.matrixWorld).invert();
      this.updateSliceReadout();
      return;
    }

    this.updateSliceReadout();

    this.sliceMesh.visible = !this.held && this.cutaway;
    if (this.held || !this.cutaway) {
      this.clipPlane.normal.set(0, -1, 0);
      this.clipPlane.constant = 1e6;
      return;
    }

    this.shellMesh.updateWorldMatrix(true, false);
    const yCut = labToWorld(this.lightness, 0, 0).y;
    this.planePoint.set(0, yCut, 0);
    this.planeNormal.set(0, -1, 0);
    this.shellMesh.localToWorld(this.planePoint);
    this.planeNormal.transformDirection(this.shellMesh.matrixWorld);
    this.clipPlane.setFromNormalAndCoplanarPoint(this.planeNormal, this.planePoint);
  },

  buildCutPlane() {
    this.sectionMaterial = new THREE.ShaderMaterial({
      toneMapped: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      uniforms: {
        solidInverse: { value: new THREE.Matrix4() },
        solidScale: { value: SCALE },
        baseY: { value: BASE_Y },
      },
      vertexShader: SECTION_VERTEX,
      fragmentShader: SECTION_FRAGMENT,
    });

    this.planeAnchor = new THREE.Group();
    this.planeAnchor.name = 'cut-plane';
    this.planeAnchor.visible = false;
    this.heldRoot.add(this.planeAnchor);

    // Only the colored cross-section is drawn. The blade itself stays invisible.
    this.sectionMesh = new THREE.Mesh(
      new THREE.CircleGeometry(PLANE_RADIUS - 0.001, 72),
      this.sectionMaterial,
    );
    this.sectionMesh.name = 'oklab-section';
    this.sectionMesh.rotation.x = -Math.PI / 2;
    this.sectionMesh.renderOrder = 2;
    this.planeAnchor.add(this.sectionMesh);
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
    backing.setAttribute('width', 1.12);
    backing.setAttribute('height', 2.36);
    backing.setAttribute('position', { x: 0, y: -1.06, z: -0.02 });
    backing.setAttribute('material', { color: '#141820', shader: 'flat', opacity: 0.88 });
    this.panel.appendChild(backing);

    const body = document.createElement('a-text');
    body.setAttribute('value', [
      `v${EXHIBIT_VERSION}`,
      '',
      'The solid sits on the',
      'left controller.',
      'Lightness follows its aim.',
      'Your room shows through.',
      '',
      'Hold A on the solid.',
      'The blade follows where',
      'it points, like a',
      'spatula. Below stays',
      'solid. Above, only the',
      'edges. The cut sticks',
      'to the solid.',
      '',
      'Hold B for a level cut.',
      'It stays flat in a and b,',
      'so sliding it only',
      'changes lightness.',
      '',
      'Tap A or B while',
      'pointing away to close',
      'the cut. Its L floats',
      'beside the slice.',
      '',
      'Hold the back trigger.',
      'Its ray picks the solid.',
      'A ring shows the color',
      'where it meets, or',
      'inside the volume,',
      'with L, c, and h.',
      'Let go and that reading',
      'stays on this controller.',
      '',
      'Hold the trigger to paint',
      'with the picked color.',
      '',
      'Left stick up grows',
      'the solid. Down shrinks',
      'it. Left and right walk.',
      'Flick the right stick',
      'sideways to turn.',
    ].join('\n'));
    body.setAttribute('color', '#f4f0e8');
    body.setAttribute('width', 0.98);
    body.setAttribute('wrap-count', 26);
    body.setAttribute('align', 'left');
    body.setAttribute('baseline', 'top');
    body.setAttribute('position', { x: -0.46, y: 0.05, z: 0 });
    this.panel.appendChild(body);
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
      if (event.button !== 0 || sceneInHeadset(this.el.sceneEl)) return;
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
      if (sceneInHeadset(this.el.sceneEl)) return;
      event.preventDefault();
      this.radius = clamp(this.radius * Math.exp(event.deltaY * 0.002), 0.2, 8);
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
    if (sceneInHeadset(this.el.sceneEl)) return;
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
    const dt = deltaMs / 1000;
    if (Math.abs(this.axisY) >= 0.18) {
      const solid = document.getElementById('solid').components['oklab-rgb-solid'];
      if (solid) solid.setHeldScale(nextHeldScale(solid.heldScale, this.axisY, dt));
    }
    if (Math.abs(this.axisX) < 0.18) return;
    const camera = this.el.sceneEl.camera;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) return;
    this.forward.normalize();
    this.right.crossVectors(this.forward, this.up);
    const distance = this.data.speed * dt;
    const world = document.getElementById('world').object3D;
    world.position.addScaledVector(this.right, -this.axisX * distance);
    const horizontal = Math.hypot(world.position.x, world.position.z);
    if (horizontal > 12) {
      world.position.x *= 12 / horizontal;
      world.position.z *= 12 / horizontal;
    }
  },
});

AFRAME.registerComponent('turn-stick', {
  init() {
    this.turned = false;
    this.el.addEventListener('thumbstickmoved', (event) => {
      const x = event.detail.x;
      const y = event.detail.y;
      if (Math.abs(x) > Math.abs(y) && Math.abs(x) > 0.75) {
        if (!this.turned) {
          this.turned = true;
          turnWorld(Math.sign(x) * (Math.PI / 6));
        }
        return;
      }
      if (Math.abs(x) < 0.3) this.turned = false;
    });
  },
});

AFRAME.registerComponent('hold-solid', {
  init() {
    this.onEnterVR = () => this.hold();
    this.onExitVR = () => {
      const solid = document.getElementById('solid').components['oklab-rgb-solid'];
      if (solid && !solid.held) this.hold();
    };
    this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
  },
  play() {
    this.holdWhenReady();
  },
  // The solid entity can finish loading after this hand. Wait for it, then
  // keep it on the controller outside a headset the same way enter-vr does.
  holdWhenReady() {
    const el = document.getElementById('solid');
    if (!el) return;
    const attach = () => {
      if (!sceneInHeadset(this.el.sceneEl)) this.hold();
    };
    if (el.hasLoaded) attach();
    else el.addEventListener('loaded', attach, { once: true });
  },
  hold() {
    const solid = document.getElementById('solid').components['oklab-rgb-solid'];
    if (solid) solid.attachToHand(this.el);
  },
  tick() {
    const data = this.el.getAttribute('raycaster');
    if (data && data.showLine) this.el.setAttribute('raycaster', 'showLine', false);
  },
  remove() {
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
  },
});

const PAINT_STEP = 0.007;

AFRAME.registerComponent('quest-brush', {
  init() {
    this.cutting = false;
    this.painting = false;
    this.hidLine = false;
    this.brush = null;
    this.stroke = null;
    this.tip = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.paintRoot = new THREE.Group();
    this.paintRoot.name = 'paint-strokes';
    document.getElementById('world').object3D.add(this.paintRoot);

    this.nib = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    );
    this.nib.position.set(0, 0, -0.045);
    this.nib.visible = false;
    this.nib.name = 'brush-nib';
    this.el.object3D.add(this.nib);

    this.pickMarker = new THREE.Group();
    this.pickMarker.name = 'pick-marker';
    this.pickMarker.visible = false;
    this.pickMarker.renderOrder = 20;
    const markerMaterial = {
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    };
    this.pickFill = new THREE.Mesh(
      new THREE.CircleGeometry(PICK_FILL_RADIUS, 32),
      new THREE.MeshBasicMaterial({ ...markerMaterial, color: 0xffffff }),
    );
    this.pickRing = new THREE.Mesh(
      new THREE.RingGeometry(PICK_RING_INNER, PICK_RING_OUTER, 48),
      new THREE.MeshBasicMaterial({ ...markerMaterial, color: 0xffffff }),
    );
    this.pickFill.renderOrder = 20;
    this.pickRing.renderOrder = 21;
    this.pickMarker.add(this.pickFill, this.pickRing);
    this.el.sceneEl.object3D.add(this.pickMarker);
    this.pickReadout = createReadout(THREE, { width: 512, height: 320, scale: 0.12 });
    this.pickReadout.name = 'pick-readout';
    this.el.sceneEl.object3D.add(this.pickReadout);
    this.controllerReadout = createReadout(THREE, { width: 512, height: 320, scale: 0.055 });
    this.controllerReadout.name = 'controller-readout';
    this.controllerReadout.position.set(0.03, 0.028, -0.045);
    this.el.object3D.add(this.controllerReadout);
    this.pickedLch = null;
    this.cameraPosition = new THREE.Vector3();
    this.readoutRight = new THREE.Vector3();
    this.readoutUp = new THREE.Vector3();

    this.aHeld = false;
    this.bHeld = false;
    this.gripHeld = false;
    this.onADown = () => {
      this.aHeld = true;
      this.followSlice();
    };
    this.onAUp = () => {
      if (!this.aHeld) return;
      this.releaseSlice('a');
    };
    this.onBDown = () => {
      this.bHeld = true;
      this.followSlice();
    };
    this.onBUp = () => {
      if (!this.bHeld) return;
      this.releaseSlice('b');
    };
    this.onGripDown = () => {
      this.gripHeld = true;
      this.syncPick();
    };
    this.onGripUp = () => {
      this.gripHeld = false;
      this.pickMarker.visible = false;
      this.pickReadout.visible = false;
      this.showControllerReadout();
    };
    this.onTriggerDown = () => {
      if (!this.brush) return;
      this.painting = true;
      this.stroke = null;
      this.syncPaint();
    };
    this.onTriggerUp = () => {
      this.painting = false;
      this.stroke = null;
      this.syncLine();
    };
    this.disarmCursor = () => {
      this.el.setAttribute('cursor', {
        fuse: false,
        downEvents: ['quest-brush-unused'],
        upEvents: ['quest-brush-unused'],
      });
    };

    this.buttonHandlers = {
      abuttondown: this.onADown,
      abuttonup: this.onAUp,
      bbuttondown: this.onBDown,
      bbuttonup: this.onBUp,
      gripdown: this.onGripDown,
      gripup: this.onGripUp,
      triggerdown: this.onTriggerDown,
      triggerup: this.onTriggerUp,
    };
    for (const button of DESKTOP_BUTTONS) {
      this.el.addEventListener(button.down, this.buttonHandlers[button.down]);
      this.el.addEventListener(button.up, this.buttonHandlers[button.up]);
    }
    this.el.addEventListener('controllerconnected', this.disarmCursor);
    this.el.addEventListener('controllermodelready', this.disarmCursor);
  },

  solid() {
    const solid = document.getElementById('solid');
    return solid && solid.components['oklab-rgb-solid'];
  },

  tick() {
    this.followSlice();
    if (this.gripHeld) this.syncPick();
    if (this.painting) this.syncPaint();
    this.syncLine();
  },

  followSlice() {
    if (!this.aHeld && !this.bHeld) return;
    const mode = activeSliceMode(this.aHeld, this.bHeld, this.pointingAtSolid());
    if (mode) {
      this.cutting = true;
      this.syncCut(mode);
    } else if (this.aHeld || this.bHeld) {
      this.cutting = false;
    }
  },

  // Letting go while aimed at the solid leaves the cut where it is. A tap
  // of the last slice button while aimed elsewhere closes it.
  releaseSlice(which) {
    if (which === 'a') this.aHeld = false;
    else this.bHeld = false;
    const otherHeld = which === 'a' ? this.bHeld : this.aHeld;
    if (activeSliceMode(this.aHeld, this.bHeld, this.pointingAtSolid())) {
      this.followSlice();
    } else {
      this.cutting = false;
      if (sliceClearsOnRelease(otherHeld, this.pointingAtSolid())) this.clearSlice();
    }
    this.syncLine();
  },

  clearSlice() {
    const solid = this.solid();
    if (solid) solid.endControllerCut();
  },

  pointingAtSolid() {
    const solid = this.solid();
    if (!solid || !solid.shellMesh) return false;
    this.readAim();
    if (!this.aimRay) this.aimRay = new THREE.Raycaster();
    this.aimRay.set(this.tip, this.forward, 0, 8);
    const hits = this.aimRay.intersectObjects([solid.shellMesh, solid.ghostMesh], false);
    if (hits.length > 0) return true;
    if (solid.sectionMesh && solid.sectionMesh.visible) {
      const capHits = this.aimRay.intersectObject(solid.sectionMesh, false);
      for (const hit of capHits) {
        if (solid.colorAtWorldPoint(hit.point)) return true;
      }
    }
    solid.shellMesh.updateWorldMatrix(true, false);
    if (!this.solidBox) this.solidBox = new THREE.Box3();
    this.solidBox.setFromObject(solid.shellMesh);
    return this.solidBox.containsPoint(this.tip);
  },

  syncCut(mode) {
    const solid = this.solid();
    if (!solid) return;
    this.readAim();
    if (mode === 'level') {
      solid.heldRoot.updateWorldMatrix(true, false);
      const normal = levelCutNormal(solid.heldRoot.matrixWorld.elements);
      this.up.set(normal.x, normal.y, normal.z);
    } else {
      this.up.set(0, 1, 0).transformDirection(this.el.object3D.matrixWorld);
      const normal = bladeNormal(this.up, this.forward);
      this.up.set(normal.x, normal.y, normal.z);
    }
    solid.setControllerCut(this.tip, this.up);
  },

  // The back trigger casts this ray. Inside the solid, the closest color
  // is the ray's start. From outside, it is the first point the ray meets.
  syncPick() {
    const solid = this.solid();
    if (!solid || !solid.shellMesh) {
      this.pickMarker.visible = false;
      return null;
    }
    this.readAim();
    const sample = this.sampleRay(solid);
    if (!sample) {
      this.pickMarker.visible = false;
      this.pickReadout.visible = false;
      return null;
    }
    const lab = solid.labAtWorldPoint(sample.point);
    this.showPick(sample.point, sample.rgb, lab ? labToLch(lab.L, lab.a, lab.b) : null);
    return sample.rgb;
  },

  sampleRay(solid) {
    const here = solid.colorAtWorldPoint(this.tip);
    if (!this.aimRay) this.aimRay = new THREE.Raycaster();
    this.aimRay.set(this.tip, this.forward, 0, 8);
    // The cut moves during this frame's earlier tick, so the cap's world
    // matrix is still the previous pose until something asks it to update.
    solid.shellMesh.updateWorldMatrix(true, false);
    const targets = [solid.shellMesh];
    if (solid.sectionMesh && solid.sectionMesh.visible && solid.planeAnchor.visible) {
      solid.sectionMesh.updateWorldMatrix(true, false);
      targets.push(solid.sectionMesh);
    }
    // The shell faces outward. A ray that enters through the clipped side
    // has to see the far wall of the kept half, which is the inside of those faces.
    const previousSide = solid.shellMaterial.side;
    solid.shellMaterial.side = THREE.DoubleSide;
    const rawHits = this.aimRay.intersectObjects(targets, false);
    solid.shellMaterial.side = previousSide;
    const hits = rawHits.map((hit) => {
      const rgb = solid.colorAtWorldPoint(hit.point);
      return {
        point: hit.point,
        color: Boolean(rgb),
        onSolidSide: this.hitOnSolidSide(solid, hit),
        rgb,
      };
    });
    const choice = selectPick(Boolean(here), hits);
    if (!choice) return null;
    if (choice.source === 'inside') return { point: this.tip.clone(), rgb: here };
    const hit = hits[choice.index];
    return { point: hit.point.clone(), rgb: hit.rgb };
  },

  hitOnSolidSide(solid, hit) {
    if (!solid.cutActive || hit.object === solid.sectionMesh) return true;
    return solid.clipPlane.distanceToPoint(hit.point) >= -0.004;
  },

  showPick(point, rgb, lch) {
    this.setBrushColor(rgb);
    if (lch) this.pickedLch = lch;
    this.pickFill.material.color.copy(linearColor(rgb));
    this.pickMarker.position.copy(point);
    const camera = this.el.sceneEl.camera;
    if (camera) {
      camera.getWorldPosition(this.cameraPosition);
      this.pickMarker.lookAt(this.cameraPosition);
      const towardCamera = this.cameraPosition.sub(point);
      if (towardCamera.lengthSq() > 1e-8) {
        this.pickMarker.position.addScaledVector(towardCamera.normalize(), 0.012);
      }
    }
    this.pickMarker.visible = true;
    if (lch) {
      this.pickReadout.userData.setText(formatLch(lch));
      this.readoutRight.set(1, 0, 0).applyQuaternion(this.pickMarker.quaternion);
      this.readoutUp.set(0, 1, 0).applyQuaternion(this.pickMarker.quaternion);
      this.pickReadout.position.copy(this.pickMarker.position)
        .addScaledVector(this.readoutRight, 0.07)
        .addScaledVector(this.readoutUp, 0.02);
      this.pickReadout.visible = true;
      this.controllerReadout.visible = false;
    }
  },

  showControllerReadout() {
    if (!this.pickedLch) {
      this.controllerReadout.visible = false;
      return;
    }
    this.controllerReadout.userData.setText(formatLch(this.pickedLch));
    this.controllerReadout.visible = true;
  },

  pickFromTip() {
    return this.syncPick();
  },

  setBrushColor(rgb) {
    this.brush = { r: rgb.r, g: rgb.g, b: rgb.b };
    this.nib.material.color.copy(linearColor(rgb));
    this.nib.visible = true;
    this.el.sceneEl.emit('brush-changed', this.brush);
  },

  syncPaint() {
    if (!this.brush) return;
    this.readTip(this.tip);
    const world = document.getElementById('world').object3D;
    world.updateWorldMatrix(true, false);
    const local = world.worldToLocal(this.tip.clone());
    if (!this.stroke) this.startStroke(local);
    else this.extendStroke(local);
  },

  startStroke(localPoint) {
    const material = new THREE.MeshBasicMaterial({
      color: linearColor(this.brush),
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(STROKE_RADIUS, 14, 10), material);
    mesh.position.copy(localPoint);
    mesh.name = 'paint-stroke';
    this.paintRoot.add(mesh);
    this.stroke = { points: [localPoint.clone()], mesh };
  },

  extendStroke(localPoint) {
    const points = this.stroke.points;
    if (points[points.length - 1].distanceTo(localPoint) < PAINT_STEP) return;
    points.push(localPoint.clone());
    const arrays = buildStrokeArrays(points, STROKE_RADIUS);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(arrays.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(arrays.indices, 1));
    geometry.computeBoundingSphere();
    this.stroke.mesh.geometry.dispose();
    this.stroke.mesh.geometry = geometry;
    this.stroke.mesh.position.set(0, 0, 0);
  },

  // Draw a finished stroke through world-space points. Used to check the
  // brush without a headset.
  strokeThrough(worldPoints) {
    if (!this.brush || worldPoints.length === 0) return;
    const world = document.getElementById('world').object3D;
    world.updateWorldMatrix(true, false);
    const local = worldPoints.map((point) => world.worldToLocal(point.clone()));
    this.startStroke(local[0]);
    for (const point of local.slice(1)) this.extendStroke(point);
    this.stroke = null;
  },

  syncLine() {
    const hide = this.cutting || this.painting;
    const data = this.el.getAttribute('raycaster');
    if (hide && data && data.showLine) {
      this.el.setAttribute('raycaster', 'showLine', false);
      this.hidLine = true;
    } else if (!hide && this.hidLine) {
      this.el.setAttribute('raycaster', 'showLine', true);
      this.hidLine = false;
    }
  },

  readAim() {
    const component = this.el.components.raycaster;
    if (component && component.raycaster) {
      component.updateOriginDirection();
      this.tip.copy(component.raycaster.ray.origin);
      this.forward.copy(component.raycaster.ray.direction).normalize();
      return;
    }
    this.el.object3D.updateWorldMatrix(true, false);
    this.forward.set(0, 0, -1).transformDirection(this.el.object3D.matrixWorld).normalize();
    this.el.object3D.getWorldPosition(this.tip);
    this.tip.addScaledVector(this.forward, 0.12);
  },

  readTip(target) {
    this.readAim();
    return target.copy(this.tip);
  },

  remove() {
    for (const button of DESKTOP_BUTTONS) {
      this.el.removeEventListener(button.down, this.buttonHandlers[button.down]);
      this.el.removeEventListener(button.up, this.buttonHandlers[button.up]);
    }
    this.el.removeEventListener('controllerconnected', this.disarmCursor);
    this.el.removeEventListener('controllermodelready', this.disarmCursor);
    this.pickMarker.removeFromParent();
    this.pickReadout.removeFromParent();
    this.controllerReadout.removeFromParent();
    this.paintRoot.removeFromParent();
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
    const component = solid();
    status.textContent = component && component.held
      ? 'The solid sits on the left controller.'
      : cutaway
        ? 'The top of the solid is cut away at this lightness.'
        : 'The complete sRGB surface, with no cut.';
  });
  scene.addEventListener('solid-held', (event) => {
    if (event.detail.held) status.textContent = 'The solid sits on the left controller.';
  });

  const swatch = document.getElementById('brush-swatch');
  const brushValue = document.getElementById('brush-value');
  scene.addEventListener('brush-changed', (event) => {
    const { r, g, b } = event.detail;
    const channel = (value) => Math.round(clamp01(linearToSrgb(value)) * 255).toString(16).padStart(2, '0');
    const hex = `#${channel(r)}${channel(g)}${channel(b)}`;
    swatch.style.background = hex;
    brushValue.textContent = hex;
  });
}

const sceneClass = customElements.get('a-scene');
if (sceneClass) installScenePassthrough(sceneClass.prototype);

// The scene stays in a template until passthrough is installed on the
// prototype. A-Frame offers the headset session as soon as the element connects.
const exhibit = document.getElementById('exhibit');
if (exhibit && exhibit.content) {
  const hud = document.getElementById('hud');
  (hud ? hud.parentNode : document.body).insertBefore(exhibit.content, hud);
}

bindHud();
bindSidePanel();
