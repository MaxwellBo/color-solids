import {
  applyStickToggle,
  DESKTOP_BUTTONS,
  handPose,
  rayPlanePoint,
  STICK_CONTROLS,
  togglePress,
} from './desktop-hands.js';
import { prepareControllerMaterials } from './lighting.js';
import {
  BAR_LENGTH,
  FACE_NORMAL,
  GIMBAL_OFFSET,
  MOVE_AXES,
  ROTATE_AXES,
  STICK_POSITION,
  colorStickDirection,
  lineParameter,
  projectOntoPlane,
  quantizeAxis,
  signedAngleAround,
  surfaceWidgets,
} from './spatial-controls.js';

const THREE = AFRAME.THREE;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const PRESSED_COLOR = 0xffb03a;
const controlById = new Map();
const sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };

function sceneInHeadset(scene) {
  return scene.is('vr-mode') || scene.is('ar-mode');
}

const CONTROLLER_MODEL = {
  left: 'https://cdn.aframe.io/controllers/oculus/oculus-touch-controller-gen2-left.gltf',
  right: 'https://cdn.aframe.io/controllers/oculus/oculus-touch-controller-gen2-right.gltf',
};

function buildStandIn() {
  const group = new THREE.Group();
  group.name = 'controller-proxy';
  group.scale.setScalar(1.45);
  const body = new THREE.MeshStandardMaterial({ color: 0xb7bcc6, roughness: 0.46, metalness: 0.08 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x3a404a, roughness: 0.62, metalness: 0.16 });
  const handleMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f0e8,
    roughness: 0.32,
    metalness: 0.04,
    emissive: 0x3a3428,
    emissiveIntensity: 0.45,
  });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.11, 20), grip);
  handle.rotation.x = Math.PI / 2.7;
  handle.position.set(0, -0.04, 0.05);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.024, 0.08), body);
  deck.position.set(0, 0.008, 0.012);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0045, 14, 32), body);
  ring.position.set(0, 0.006, -0.03);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 16), handleMaterial);
  knob.name = 'hand-handle';
  knob.position.set(0, -0.075, 0.1);

  group.add(handle, deck, ring, knob);
  return group;
}

function basicMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
}

function labelSprite(text, scale = 0.05, color = '#f7f4ee') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.font = '700 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 68);
  const map = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  sprite.scale.set(scale, scale * 0.5, 1);
  sprite.renderOrder = 4;
  sprite.raycast = () => {};
  return sprite;
}

function arrowMesh(length, radius, material) {
  const group = new THREE.Group();
  const shaftLength = length * 0.62;
  const headLength = length * 0.38;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, shaftLength, 10), material);
  shaft.position.y = shaftLength / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius, headLength, 12), material);
  head.position.y = shaftLength + headLength / 2;
  group.add(shaft, head);
  return group;
}

function paintControl(control, pressed) {
  control.pressed = pressed;
  if (!control.materials || !control.group) return;
  const color = pressed ? PRESSED_COLOR : control.color;
  for (const material of control.materials) material.color.setHex(color);
  control.group.scale.setScalar(pressed ? 1.14 : 1);
}

function controlOf(object) {
  let node = object;
  while (node) {
    if (node.userData && node.userData.control) return node.userData.control;
    node = node.parent;
  }
  return null;
}

function handEntity(name) {
  return document.getElementById(name === 'left' ? 'left-hand' : 'right-hand');
}

// A toggle or flick on a mesh emits the same event the headset button emits.
function activateControl(control) {
  const hand = handEntity(control.hand);
  if (!hand || sceneInHeadset(hand.sceneEl)) return;
  const button = DESKTOP_BUTTONS.find((item) => item.id === control.id);
  if (button) {
    const next = togglePress(control.pressed);
    paintControl(control, next.pressed);
    hand.emit(next.event === 'down' ? button.down : button.up);
    return;
  }
  const stick = STICK_CONTROLS.find((item) => item.id === control.id);
  if (!stick) return;
  if (stick.flick) {
    paintControl(control, true);
    hand.emit('thumbstickmoved', { x: stick.flick, y: 0 });
    hand.emit('thumbstickmoved', { x: 0, y: 0 });
    window.setTimeout(() => paintControl(control, false), 160);
    return;
  }
  const on = !control.pressed;
  sticks[stick.hand] = applyStickToggle(sticks[stick.hand], stick.axis, stick.value, on);
  paintControl(control, on);
  if (on) {
    for (const other of STICK_CONTROLS) {
      if (other === stick || other.hand !== stick.hand || other.axis !== stick.axis) continue;
      const widget = controlById.get(other.id);
      if (widget) paintControl(widget, false);
    }
  }
  hand.emit('thumbstickmoved', sticks[stick.hand]);
}

// The side panel presses the same widgets the meshes do.
export function activateDesktopControl(id) {
  const control = controlById.get(id);
  if (control) activateControl(control);
}

export function desktopControlPressed(id) {
  const control = controlById.get(id);
  return Boolean(control && control.pressed);
}

function registerControl(control) {
  if (control.group) control.group.userData.control = control;
  controlById.set(control.id, control);
  return control;
}

AFRAME.registerComponent('controller-proxy', {
  schema: { hand: { type: 'string', default: 'right' } },

  init() {
    this.proxy = buildStandIn();
    this.el.object3D.add(this.proxy);
    this.controls = [];
    this.ringLabels = [];
    this.buildSurface();
    this.buildCluster();
    this.buildStickPad();
    this.loadControllerModel();
    this.savedPosition = new THREE.Vector3();
    this.savedQuaternion = new THREE.Quaternion();
    this.frozenPos = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camUp = new THREE.Vector3();
    this.padQuat = new THREE.Quaternion();
    this.labelScratch = new THREE.Vector3();
    this.restoreFrames = 0;
    this.posed = false;
    this.heldRing = null;

    this.onEnterVR = () => {
      this.proxy.visible = false;
      this.cluster.visible = false;
      const model = this.el.getObject3D('mesh');
      if (model) model.visible = true;
    };
    this.onExitVR = () => {
      this.restoreFrames = 8;
      this.proxy.visible = true;
      this.cluster.visible = true;
      const model = this.el.getObject3D('mesh');
      if (model) model.visible = false;
    };
    this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);
  },

  play() {
    if (this.posed) return;
    this.posed = true;
    if (!sceneInHeadset(this.el.sceneEl)) this.applyPose(handPose(this.data.hand));
    this.savedPosition.copy(this.el.object3D.position);
    this.savedQuaternion.copy(this.el.object3D.quaternion);
    this.layoutCluster();
  },

  tick() {
    if (sceneInHeadset(this.el.sceneEl)) return;
    if (this.restoreFrames > 0) {
      this.el.object3D.position.copy(this.savedPosition);
      this.el.object3D.quaternion.copy(this.savedQuaternion);
      this.restoreFrames -= 1;
    } else {
      this.savedPosition.copy(this.el.object3D.position);
      this.savedQuaternion.copy(this.el.object3D.quaternion);
    }
    this.layoutCluster();
  },

  // The same Quest model a headset shows. The simple stand-in stays if the
  // model cannot be fetched, and the pale knob remains the drag handle.
  loadControllerModel() {
    const url = CONTROLLER_MODEL[this.data.hand];
    if (!url || !THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
      if (!this.proxy.parent) return;
      const model = gltf.scene;
      model.name = 'controller-model';
      model.position.set(0, -0.007, -0.021);
      model.rotation.set(-Math.PI / 4, 0, 0);
      prepareControllerMaterials(model);
      this.proxy.add(model);
      for (const child of this.proxy.children) {
        if (child !== model && child.name !== 'hand-handle' && child.name !== 'surface-control' && child.name !== 'stick-control') child.visible = false;
      }
      model.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(model);
      const knob = this.proxy.getObjectByName('hand-handle');
      const bottom = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.min.y,
        (box.min.z + box.max.z) / 2,
      );
      this.proxy.worldToLocal(bottom);
      knob.position.copy(bottom);
    });
  },

  applyPose(pose) {
    this.el.object3D.position.set(pose.position.x, pose.position.y, pose.position.z);
    this.el.object3D.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
    this.proxy.visible = true;
  },

  buildSurface() {
    for (const widget of surfaceWidgets(this.data.hand)) {
      const material = basicMaterial(widget.color);
      material.polygonOffset = true;
      material.polygonOffsetFactor = -2;
      material.polygonOffsetUnits = -2;
      const group = new THREE.Group();
      group.name = 'surface-control';
      group.position.set(widget.position.x, widget.position.y, widget.position.z);
      group.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(widget.direction.x, widget.direction.y, widget.direction.z).normalize());
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(widget.radius, widget.radius, 0.004, 22), material);
      const label = labelSprite(widget.label, 0.024);
      label.position.y = 0.01;
      group.add(disc, label);
      this.proxy.add(group);
      this.controls.push(registerControl({
        id: widget.id,
        kind: 'button',
        hand: this.data.hand,
        pressed: false,
        color: widget.color,
        material,
        materials: [material],
        group,
        owner: this,
      }));
    }
  },

  buildCluster() {
    const hand = this.data.hand;
    this.cluster = new THREE.Group();
    this.cluster.name = 'desktop-cluster';
    this.el.object3D.add(this.cluster);

    const barStart = ROTATE_AXES[ROTATE_AXES.length - 1].radius + 0.02;
    for (const axis of MOVE_AXES) {
      const material = basicMaterial(axis.color);
      const direction = new THREE.Vector3(axis.direction.x, axis.direction.y, axis.direction.z);
      const group = arrowMesh(BAR_LENGTH, 0.011, material);
      group.quaternion.setFromUnitVectors(Y_AXIS, direction);
      group.position.copy(direction).multiplyScalar(barStart);
      const label = labelSprite(axis.label, 0.04);
      label.position.y = BAR_LENGTH + 0.015;
      group.add(label);
      this.cluster.add(group);
      this.controls.push(registerControl({
        id: `${hand}-${axis.key}`,
        kind: 'axis',
        hand,
        key: axis.key,
        direction: axis.direction,
        pressed: false,
        color: axis.color,
        material,
        materials: [material],
        group,
        owner: this,
      }));
    }

    this.gimbal = new THREE.Group();
    this.gimbal.position.set(GIMBAL_OFFSET.x, GIMBAL_OFFSET.y, GIMBAL_OFFSET.z);
    this.cluster.add(this.gimbal);
    for (const axis of ROTATE_AXES) {
      const material = basicMaterial(axis.color);
      const group = new THREE.Group();
      group.userData.home = { x: 0, y: 0, z: 0 };
      const ring = new THREE.Mesh(new THREE.TorusGeometry(axis.radius, 0.0065, 12, 64), material);
      ring.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(axis.axis.x, axis.axis.y, axis.axis.z));
      // Spread the arrowheads so the three rings don't stack their tips.
      const headAngle = axis.component === 'x' ? 0.6 : axis.component === 'y' ? 2.4 : 4.2;
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.018, 8), material);
      head.position.set(Math.cos(headAngle) * axis.radius, Math.sin(headAngle) * axis.radius, 0);
      head.quaternion.setFromUnitVectors(
        Y_AXIS,
        new THREE.Vector3(-Math.sin(headAngle), Math.cos(headAngle), 0),
      );
      ring.add(head);
      const labelColor = axis.component === 'x' ? '#e24b4b' : axis.component === 'y' ? '#3cba6c' : '#3d7ee0';
      const label = labelSprite(axis.label, 0.04, labelColor);
      ring.add(label);
      group.add(ring);
      this.ringLabels.push({
        ring,
        label,
        radius: axis.radius + 0.018,
        prefer: axis.component === 'x' ? 'left' : axis.component === 'y' ? 'up' : 'right',
      });
      this.gimbal.add(group);
      this.controls.push(registerControl({
        id: `${hand}-${axis.key}`,
        kind: 'ring',
        hand,
        key: axis.key,
        component: axis.component,
        axis: axis.axis,
        pressed: false,
        color: axis.color,
        material,
        materials: [material],
        group,
        owner: this,
      }));
    }

  },

  // Hue and chroma arrows sit on the left thumbstick. Turning stays on the side panel,
  // so the right controller has no turn arcs.
  buildStickPad() {
    if (this.data.hand !== 'left') {
      this.registerPanelTurns();
      return;
    }
    const stick = STICK_POSITION.left;
    const normal = new THREE.Vector3(FACE_NORMAL.x, FACE_NORMAL.y, FACE_NORMAL.z);
    this.pad = new THREE.Group();
    this.pad.name = 'stick-control';
    this.pad.position.set(stick.x, stick.y, stick.z).addScaledVector(normal, 0.012);
    this.pad.quaternion.setFromUnitVectors(Y_AXIS, normal);
    this.proxy.add(this.pad);
    this.buildColorPad();
  },

  registerPanelTurns() {
    for (const control of STICK_CONTROLS) {
      if (!control.flick || control.hand !== this.data.hand) continue;
      this.controls.push(registerControl({
        id: control.id,
        kind: 'button',
        hand: control.hand,
        pressed: false,
      }));
    }
  },

  buildColorPad() {
    this.stickArrows = [];
    for (const control of STICK_CONTROLS) {
      if (control.hand !== 'left' || control.flick) continue;
      const material = basicMaterial(0xf4f0e8);
      const group = arrowMesh(0.022, 0.0055, material);
      const label = labelSprite(control.label, 0.018);
      label.position.set(0.014, 0.01, 0);
      group.add(label);
      this.pad.add(group);
      const widget = registerControl({
        id: control.id,
        kind: 'button',
        hand: 'left',
        stick: { x: control.axis === 'x' ? control.value : 0, y: control.axis === 'y' ? control.value : 0 },
        pressed: false,
        color: 0xf4f0e8,
        material,
        materials: [material],
        group,
        owner: this,
      });
      this.controls.push(widget);
      this.stickArrows.push(group);
    }
  },

  // Bars stay on the world axes and rings keep the hand's orientation.
  // Both are centered on the controller. Color arrows stay on the stick.
  layoutCluster() {
    const hand = this.el.object3D;
    this.cluster.quaternion.copy(hand.quaternion).invert();
    this.cluster.position.set(0, 0, 0);
    this.gimbal.position.set(GIMBAL_OFFSET.x, GIMBAL_OFFSET.y, GIMBAL_OFFSET.z);
    this.gimbal.quaternion.copy(hand.quaternion);
    if (this.heldRing) {
      this.heldRing.position.copy(this.frozenPos);
      this.heldRing.quaternion.copy(hand.quaternion);
    }
    this.layoutColorPad();
    this.layoutRingLabels();
  },

  // Pitch sits left of the gimbal, yaw above it, roll to the right, just
  // outside the ring so the name stays with that axis as the view changes.
  layoutRingLabels() {
    const camera = this.el.sceneEl.camera;
    if (!camera) return;
    this.gimbal.updateWorldMatrix(true, true);
    const center = this.gimbal.getWorldPosition(this.camPos);
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    this.camUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    for (const item of this.ringLabels) {
      const reach = item.radius + 0.02;
      this.labelScratch.copy(center);
      if (item.prefer === 'left') this.labelScratch.addScaledVector(this.right, -reach);
      else if (item.prefer === 'right') this.labelScratch.addScaledVector(this.right, reach);
      else {
        this.labelScratch.addScaledVector(this.camUp, reach * 0.85);
        this.labelScratch.addScaledVector(this.right, -reach * 0.45);
      }
      item.ring.worldToLocal(this.labelScratch);
      item.label.position.copy(this.labelScratch);
    }
  },

  layoutColorPad() {
    if (!this.stickArrows) return;
    for (const group of this.stickArrows) {
      const direction = colorStickDirection(group.userData.control.stick);
      this.labelScratch.set(direction.x, direction.y, direction.z);
      group.position.copy(this.labelScratch).multiplyScalar(0.014);
      group.quaternion.setFromUnitVectors(Y_AXIS, this.labelScratch);
    }
  },

  beginRingDrag(group) {
    group.getWorldPosition(this.frozenPos);
    this.el.sceneEl.object3D.attach(group);
    this.heldRing = group;
  },

  endRingDrag() {
    if (!this.heldRing) return;
    const group = this.heldRing;
    this.heldRing = null;
    this.gimbal.attach(group);
    const home = group.userData.home;
    group.position.set(home.x, home.y, home.z);
    group.quaternion.identity();
  },

  remove() {
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
    for (const control of this.controls) controlById.delete(control.id);
    this.endRingDrag();
    this.proxy.removeFromParent();
    this.cluster.removeFromParent();
  },
});

AFRAME.registerComponent('desktop-rig', {
  init() {
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.planePoint = new THREE.Vector3();
    this.planeNormal = new THREE.Vector3();
    this.offset = new THREE.Vector3();
    this.hitPoint = new THREE.Vector3();
    this.worldPoint = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.drag = null;

    this.onPointerDown = (event) => this.pointerDown(event);
    this.onPointerMove = (event) => this.pointerMove(event);
    this.onPointerUp = (event) => this.pointerUp(event);
    this.onContextMenu = (event) => {
      if (this.drag) event.preventDefault();
    };
  },

  play() {
    const canvas = this.el.sceneEl.canvas;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', this.onPointerDown, true);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('contextmenu', this.onContextMenu);
  },

  pause() {
    const canvas = this.el.sceneEl.canvas;
    if (canvas) canvas.removeEventListener('pointerdown', this.onPointerDown, true);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('contextmenu', this.onContextMenu);
  },

  proxies() {
    return ['left-hand', 'right-hand'].map((id) => {
      const entity = document.getElementById(id);
      const proxy = entity && entity.components['controller-proxy'];
      return proxy && proxy.proxy.visible ? proxy.proxy : null;
    }).filter(Boolean);
  },

  shell() {
    const solid = document.getElementById('solid');
    const component = solid && solid.components['oklab-rgb-solid'];
    return component && component.shellMesh;
  },

  setRay(event) {
    const canvas = this.el.sceneEl.canvas;
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const camera = this.el.sceneEl.camera;
    if (!camera) return false;
    this.raycaster.setFromCamera(this.ndc, camera);
    return true;
  },

  clusters() {
    return ['left-hand', 'right-hand'].map((id) => {
      const entity = document.getElementById(id);
      const proxy = entity && entity.components['controller-proxy'];
      return proxy && proxy.cluster && proxy.cluster.visible ? proxy.cluster : null;
    }).filter(Boolean);
  },

  // A widget on a controller, or the controller itself when the solid is not
  // in front of it. Buttons win over the controller body they sit on. The
  // solid still blocks a widget that is behind it.
  pick(event) {
    if (sceneInHeadset(this.el.sceneEl) || !this.setRay(event)) return null;
    const proxies = this.proxies();
    const clusters = this.clusters();
    if (!proxies.length && !clusters.length) return null;
    const shell = this.shell();
    const shellHit = shell ? this.raycaster.intersectObject(shell, true)[0] : null;
    const shellDistance = shellHit ? shellHit.distance : Infinity;
    const widgetHits = this.raycaster.intersectObjects(clusters.concat(proxies), true);
    for (const hit of widgetHits) {
      const control = controlOf(hit.object);
      if (!control) continue;
      if (hit.distance > shellDistance + 0.008) break;
      return { control, point: hit.point };
    }
    if (!proxies.length) return null;
    const bodyHits = this.raycaster.intersectObjects(proxies, true);
    for (const hit of bodyHits) {
      if (hit.distance > shellDistance + 0.001) break;
      if (controlOf(hit.object)) continue;
      let object = hit.object;
      while (object && object.name !== 'controller-proxy') object = object.parent;
      if (object) return { point: hit.point, hand: object.parent };
    }
    return null;
  },

  pointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    const picked = this.pick(event);
    if (!picked) return;
    if (picked.control) {
      event.preventDefault();
      event.stopPropagation();
      if (event.button !== 0) return;
      this.startControl(picked, event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rotating = event.button === 2 || event.shiftKey;
    const camera = this.el.sceneEl.camera;
    camera.getWorldDirection(this.planeNormal);
    this.planePoint.copy(picked.point);
    picked.hand.getWorldPosition(this.offset).sub(picked.point);
    this.drag = {
      kind: 'hand',
      hand: picked.hand,
      rotating,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    this.capture(event);
  },

  startControl(picked, event) {
    const control = picked.control;
    const hand = handEntity(control.hand).object3D;
    const ray = this.raycaster.ray;
    if (control.kind === 'button') {
      activateControl(control);
      this.drag = { kind: 'button', pointerId: event.pointerId };
      this.capture(event);
      return;
    }
    if (control.kind === 'axis') {
      const direction = new THREE.Vector3(control.direction.x, control.direction.y, control.direction.z).normalize();
      const linePoint = picked.point.clone();
      const startT = lineParameter(ray.origin, ray.direction, linePoint, direction);
      if (startT == null) return;
      const startWorld = new THREE.Vector3();
      hand.getWorldPosition(startWorld);
      this.drag = {
        kind: 'axis',
        pointerId: event.pointerId,
        hand,
        key: control.key,
        direction,
        linePoint,
        startT,
        startWorld,
      };
      this.capture(event);
      return;
    }
    control.owner.beginRingDrag(control.group);
    hand.updateWorldMatrix(true, false);
    const planePoint = control.owner.frozenPos.clone();
    const axis = new THREE.Vector3(control.axis.x, control.axis.y, control.axis.z).transformDirection(hand.matrixWorld).normalize();
    const hit = rayPlanePoint(ray.origin, ray.direction, planePoint, axis);
    if (!hit) {
      control.owner.endRingDrag();
      return;
    }
    const reference = projectOntoPlane({
      x: hit.x - planePoint.x,
      y: hit.y - planePoint.y,
      z: hit.z - planePoint.z,
    }, axis);
    this.drag = {
      kind: 'ring',
      pointerId: event.pointerId,
      hand,
      key: control.key,
      component: control.component,
      owner: control.owner,
      planePoint,
      axis,
      reference,
      startAngle: hand.rotation[control.component],
    };
    this.capture(event);
  },

  capture(event) {
    this.el.sceneEl.canvas.setPointerCapture(event.pointerId);
    this.el.sceneEl.canvas.style.cursor = 'grabbing';
  },

  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    if (this.drag.kind === 'button') return;
    if (this.drag.kind === 'axis') {
      this.moveAxis(event);
      return;
    }
    if (this.drag.kind === 'ring') {
      this.moveRing(event);
      return;
    }
    if (this.drag.rotating) {
      const dx = event.clientX - this.drag.lastX;
      const dy = event.clientY - this.drag.lastY;
      this.drag.hand.rotateOnWorldAxis(this.up, -dx * 0.008);
      this.drag.hand.rotateX(dy * 0.008);
      this.drag.lastX = event.clientX;
      this.drag.lastY = event.clientY;
      return;
    }
    if (!this.setRay(event)) return;
    const ray = this.raycaster.ray;
    const point = rayPlanePoint(ray.origin, ray.direction, this.planePoint, this.planeNormal);
    if (!point) return;
    this.worldPoint.set(point.x, point.y, point.z).add(this.offset);
    const parent = this.drag.hand.parent;
    if (parent) parent.worldToLocal(this.worldPoint);
    this.drag.hand.position.copy(this.worldPoint);
  },

  moveAxis(event) {
    if (!this.setRay(event)) return;
    const ray = this.raycaster.ray;
    const t = lineParameter(ray.origin, ray.direction, this.drag.linePoint, this.drag.direction);
    if (t == null) return;
    this.worldPoint.copy(this.drag.startWorld).addScaledVector(this.drag.direction, t - this.drag.startT);
    const parent = this.drag.hand.parent;
    if (parent) parent.worldToLocal(this.worldPoint);
    this.drag.hand.position[this.drag.key] = quantizeAxis(this.worldPoint[this.drag.key], this.drag.key);
  },

  moveRing(event) {
    if (!this.setRay(event)) return;
    const ray = this.raycaster.ray;
    const hit = rayPlanePoint(ray.origin, ray.direction, this.drag.planePoint, this.drag.axis);
    if (!hit) return;
    const to = projectOntoPlane({
      x: hit.x - this.drag.planePoint.x,
      y: hit.y - this.drag.planePoint.y,
      z: hit.z - this.drag.planePoint.z,
    }, this.drag.axis);
    const delta = signedAngleAround(this.drag.reference, to, this.drag.axis);
    const degrees = (this.drag.startAngle + delta) * (180 / Math.PI);
    this.drag.hand.rotation[this.drag.component] = quantizeAxis(degrees, this.drag.key) * (Math.PI / 180);
  },

  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    if (this.drag.kind === 'ring') this.drag.owner.endRingDrag();
    this.drag = null;
    const canvas = this.el.sceneEl.canvas;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (canvas) canvas.style.cursor = 'grab';
  },

  remove() {
    this.pause();
  },
});
