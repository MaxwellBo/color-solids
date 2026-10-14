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
  CLUSTER_OFFSET,
  GIMBAL_OFFSET,
  MOVE_AXES,
  PAD_OFFSET,
  ROTATE_AXES,
  lineParameter,
  projectOntoPlane,
  quantizeAxis,
  signedAngleAround,
  surfaceWidgets,
  travelDirection,
  yawSweep,
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

function labelSprite(text, scale = 0.05) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f7f4ee';
  ctx.font = '700 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 68);
  const map = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false }));
  sprite.scale.set(scale, scale * 0.5, 1);
  sprite.renderOrder = 4;
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
  control.material.color.setHex(pressed ? PRESSED_COLOR : control.color);
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

function registerControl(control) {
  control.group.userData.control = control;
  controlById.set(control.id, control);
  return control;
}

AFRAME.registerComponent('controller-proxy', {
  schema: { hand: { type: 'string', default: 'right' } },

  init() {
    this.proxy = buildStandIn();
    this.el.object3D.add(this.proxy);
    this.controls = [];
    this.buildSurface();
    this.buildCluster();
    this.loadControllerModel();
    this.savedPosition = new THREE.Vector3();
    this.savedQuaternion = new THREE.Quaternion();
    this.frozenPos = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.restoreFrames = 0;
    this.posed = false;
    this.ringHeld = false;

    this.onEnterVR = () => {
      this.proxy.visible = false;
      this.cluster.visible = false;
      this.stem.visible = false;
      const model = this.el.getObject3D('mesh');
      if (model) model.visible = true;
    };
    this.onExitVR = () => {
      this.restoreFrames = 8;
      this.proxy.visible = true;
      this.cluster.visible = true;
      this.stem.visible = true;
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
        if (child !== model && child.name !== 'hand-handle' && child.name !== 'surface-control') child.visible = false;
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
      const group = new THREE.Group();
      group.name = 'surface-control';
      group.position.set(widget.position.x, widget.position.y, widget.position.z);
      group.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(widget.direction.x, widget.direction.y, widget.direction.z).normalize());
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(widget.radius, widget.radius, 0.004, 22), material);
      const label = labelSprite(widget.label, 0.03);
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

    const stemMaterial = basicMaterial(0x8d877c);
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6), stemMaterial);
    this.stem.raycast = () => {};
    this.el.object3D.add(this.stem);

    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.012, 14, 10), basicMaterial(0xf4f0e8));
    hub.raycast = () => {};
    this.cluster.add(hub);

    for (const axis of MOVE_AXES) {
      const material = basicMaterial(axis.color);
      const group = arrowMesh(BAR_LENGTH, 0.016, material);
      group.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(axis.direction.x, axis.direction.y, axis.direction.z));
      const label = labelSprite(axis.label, 0.045);
      label.position.y = BAR_LENGTH + 0.02;
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
      const ring = new THREE.Mesh(new THREE.TorusGeometry(axis.radius, 0.0075, 10, 32), material);
      ring.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(axis.axis.x, axis.axis.y, axis.axis.z));
      const label = labelSprite(axis.label, 0.055);
      label.position.set(axis.radius + 0.02, 0, 0);
      ring.add(label);
      group.add(ring);
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
        group,
        owner: this,
      }));
    }

    this.pad = new THREE.Group();
    this.pad.position.set(PAD_OFFSET.x, PAD_OFFSET.y, PAD_OFFSET.z);
    this.cluster.add(this.pad);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.003, 28), basicMaterial(0x2a3038));
    pad.raycast = () => {};
    this.pad.add(pad);

    if (hand === 'left') this.buildWalkPad();
    else this.buildTurnPad();
  },

  buildWalkPad() {
    this.walkArrows = [];
    for (const control of STICK_CONTROLS) {
      if (control.hand !== 'left' || control.flick) continue;
      const material = basicMaterial(0xf4f0e8);
      const group = arrowMesh(0.07, 0.016, material);
      this.pad.add(group);
      const widget = registerControl({
        id: control.id,
        kind: 'button',
        hand: 'left',
        stick: { x: control.axis === 'x' ? control.value : 0, y: control.axis === 'y' ? control.value : 0 },
        pressed: false,
        color: 0xf4f0e8,
        material,
        group,
        owner: this,
      });
      this.controls.push(widget);
      this.walkArrows.push(group);
    }
  },

  buildTurnPad() {
    for (const control of STICK_CONTROLS) {
      if (!control.flick) continue;
      const material = basicMaterial(0xf4f0e8);
      const group = yawArc(control.flick, material);
      group.position.x = control.flick > 0 ? 0.085 : -0.085;
      const label = labelSprite(control.flick > 0 ? 'Turn R' : 'Turn L', 0.05);
      label.position.y = 0.03;
      group.add(label);
      this.pad.add(group);
      this.controls.push(registerControl({
        id: control.id,
        kind: 'button',
        hand: 'right',
        pressed: false,
        color: 0xf4f0e8,
        material,
        group,
        owner: this,
      }));
    }
  },

  // The cluster follows the hand. Bars stay on the world axes, rings keep
  // the hand's orientation, and walk arrows point the way the viewer moves.
  layoutCluster() {
    const hand = this.el.object3D;
    const offset = CLUSTER_OFFSET[this.data.hand];
    this.cluster.quaternion.copy(hand.quaternion).invert();
    this.cluster.position.set(offset.x, offset.y, offset.z).applyQuaternion(this.cluster.quaternion);
    const span = this.cluster.position.length();
    if (span > 1e-4) {
      this.stem.position.copy(this.cluster.position).multiplyScalar(0.5);
      this.stem.quaternion.setFromUnitVectors(Y_AXIS, this.cluster.position.clone().normalize());
      this.stem.scale.set(1, span, 1);
      this.stem.visible = this.cluster.visible;
    }
    if (this.ringHeld) {
      this.gimbal.position.copy(this.frozenPos);
      this.gimbal.quaternion.copy(hand.quaternion);
    } else if (this.gimbal.parent === this.cluster) {
      this.gimbal.position.set(GIMBAL_OFFSET.x, GIMBAL_OFFSET.y, GIMBAL_OFFSET.z);
      this.gimbal.quaternion.copy(hand.quaternion);
    }
    this.layoutWalk();
  },

  layoutWalk() {
    if (!this.walkArrows) return;
    const camera = this.el.sceneEl.camera;
    if (!camera) return;
    camera.getWorldDirection(this.forward);
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-6) return;
    this.forward.normalize();
    this.right.crossVectors(this.forward, Y_AXIS).normalize();
    const travel = new THREE.Vector3();
    for (const group of this.walkArrows) {
      const stick = group.userData.control.stick;
      const direction = travelDirection(stick, this.forward, this.right);
      travel.set(direction.x, direction.y, direction.z);
      if (travel.lengthSq() < 1e-6) continue;
      travel.normalize();
      group.position.copy(travel).multiplyScalar(0.04);
      group.quaternion.setFromUnitVectors(Y_AXIS, travel);
    }
  },

  beginRingDrag() {
    this.gimbal.getWorldPosition(this.frozenPos);
    this.el.sceneEl.object3D.attach(this.gimbal);
    this.ringHeld = true;
  },

  endRingDrag() {
    if (!this.ringHeld) return;
    this.ringHeld = false;
    this.cluster.attach(this.gimbal);
  },

  remove() {
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
    for (const control of this.controls) controlById.delete(control.id);
    this.endRingDrag();
    this.proxy.removeFromParent();
    this.cluster.removeFromParent();
    this.stem.removeFromParent();
  },
});

function yawArc(flick, material) {
  const group = new THREE.Group();
  const radius = 0.05;
  const sweep = yawSweep(flick) * Math.PI * 0.72;
  const start = flick > 0 ? Math.PI * 0.85 : -Math.PI * 0.15;
  const points = [];
  const steps = 18;
  for (let i = 0; i <= steps; i += 1) {
    const angle = start + sweep * (i / steps);
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0065, 6, false), material));
  const tangent = new THREE.Vector3().subVectors(points[points.length - 1], points[points.length - 2]).normalize();
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.03, 10), material);
  head.position.copy(points[points.length - 1]);
  head.quaternion.setFromUnitVectors(Y_AXIS, tangent);
  group.add(head);
  return group;
}

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
  // in front of it. Decorative parts of a cluster are skipped.
  pick(event) {
    if (sceneInHeadset(this.el.sceneEl) || !this.setRay(event)) return null;
    const targets = this.clusters().concat(this.proxies());
    if (!targets.length) return null;
    const shell = this.shell();
    if (shell) targets.push(shell);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const hit of hits) {
      const control = controlOf(hit.object);
      if (control) return { control, point: hit.point };
      let object = hit.object;
      while (object && object.name !== 'controller-proxy' && object.name !== 'desktop-cluster') object = object.parent;
      if (object && object.name === 'desktop-cluster') continue;
      if (object && object.name === 'controller-proxy') return { point: hit.point, hand: object.parent };
      return null;
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
    control.owner.beginRingDrag();
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
