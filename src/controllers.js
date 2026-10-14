import {
  applyStickToggle,
  DESKTOP_BUTTONS,
  handAxesToPose,
  handPose,
  POSE_AXES,
  rayPlanePoint,
  readHandAxes,
  STICK_CONTROLS,
  togglePress,
} from './desktop-hands.js';
import { prepareControllerMaterials } from './lighting.js';

const THREE = AFRAME.THREE;

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

AFRAME.registerComponent('controller-proxy', {
  schema: { hand: { type: 'string', default: 'right' } },

  init() {
    this.proxy = buildStandIn();
    this.el.object3D.add(this.proxy);
    this.loadControllerModel();
    this.savedPosition = new THREE.Vector3();
    this.savedQuaternion = new THREE.Quaternion();
    this.restoreFrames = 0;
    this.posed = false;

    this.onEnterVR = () => {
      this.proxy.visible = false;
      const model = this.el.getObject3D('mesh');
      if (model) model.visible = true;
    };
    this.onExitVR = () => {
      this.restoreFrames = 8;
      this.proxy.visible = true;
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
  },

  tick() {
    if (sceneInHeadset(this.el.sceneEl)) return;
    if (this.restoreFrames > 0) {
      this.el.object3D.position.copy(this.savedPosition);
      this.el.object3D.quaternion.copy(this.savedQuaternion);
      this.restoreFrames -= 1;
      return;
    }
    this.savedPosition.copy(this.el.object3D.position);
    this.savedQuaternion.copy(this.el.object3D.quaternion);
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
        if (child !== model && child.name !== 'hand-handle') child.visible = false;
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

  remove() {
    this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
    this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
    this.proxy.removeFromParent();
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

  // The handle under the cursor, when the solid is not in front of it.
  pickHandle(event) {
    if (sceneInHeadset(this.el.sceneEl) || !this.setRay(event)) return null;
    const proxies = this.proxies();
    if (!proxies.length) return null;
    const targets = proxies.slice();
    const shell = this.shell();
    if (shell) targets.push(shell);
    const hits = this.raycaster.intersectObjects(targets, true);
    const hit = hits[0];
    if (!hit) return null;
    let object = hit.object;
    while (object && object.name !== 'controller-proxy') object = object.parent;
    if (!object) return null;
    return { proxy: object, point: hit.point, hand: object.parent };
  },

  pointerDown(event) {
    if (event.button !== 0 && event.button !== 2) return;
    const picked = this.pickHandle(event);
    if (!picked) return;
    event.preventDefault();
    event.stopPropagation();
    const rotating = event.button === 2 || event.shiftKey;
    const camera = this.el.sceneEl.camera;
    camera.getWorldDirection(this.planeNormal);
    this.planePoint.copy(picked.point);
    picked.hand.getWorldPosition(this.offset).sub(picked.point);
    this.drag = {
      hand: picked.hand,
      rotating,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
    };
    this.el.sceneEl.canvas.setPointerCapture(event.pointerId);
    this.el.sceneEl.canvas.style.cursor = 'grabbing';
  },

  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
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

  pointerUp(event) {
    if (!this.drag || event.pointerId !== this.drag.pointerId) return;
    this.drag = null;
    const canvas = this.el.sceneEl.canvas;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (canvas) canvas.style.cursor = 'grab';
  },

  tick() {
    if (sceneInHeadset(this.el.sceneEl)) return;
    syncPoseSliders();
  },

  remove() {
    this.pause();
  },
});

function handEntity(name) {
  return document.getElementById(name === 'left' ? 'left-hand' : 'right-hand');
}

function syncPoseSliders() {
  for (const name of ['left', 'right']) {
    const hand = handEntity(name);
    if (!hand || !hand.object3D) continue;
    const axes = readHandAxes(hand.object3D.position, hand.object3D.rotation);
    for (const axis of POSE_AXES) {
      const input = document.getElementById(`${name}-${axis.key}`);
      if (!input || document.activeElement === input) continue;
      const steps = Math.round(axes[axis.key] / axis.step);
      input.value = String(steps * axis.step);
    }
  }
}

function applyPoseSlider(input) {
  const hand = handEntity(input.dataset.hand);
  if (!hand || !hand.object3D || sceneInHeadset(hand.sceneEl)) return;
  const axes = readHandAxes(hand.object3D.position, hand.object3D.rotation);
  axes[input.dataset.axis] = Number(input.value);
  const pose = handAxesToPose(axes);
  hand.object3D.position.set(pose.position.x, pose.position.y, pose.position.z);
  hand.object3D.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
}

export function bindDesktopControls() {
  for (const button of DESKTOP_BUTTONS) {
    const element = document.getElementById(button.id);
    const hand = handEntity(button.hand);
    if (!element || !hand) continue;
    element.addEventListener('click', (event) => {
      if (sceneInHeadset(hand.sceneEl)) return;
      event.preventDefault();
      const next = togglePress(element.getAttribute('aria-pressed') === 'true');
      element.setAttribute('aria-pressed', String(next.pressed));
      hand.emit(next.event === 'down' ? button.down : button.up);
    });
  }

  const sticks = { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } };
  for (const control of STICK_CONTROLS) {
    const element = document.getElementById(control.id);
    const hand = handEntity(control.hand);
    if (!element || !hand) continue;
    element.addEventListener('click', (event) => {
      if (sceneInHeadset(hand.sceneEl)) return;
      event.preventDefault();
      if (control.flick) {
        hand.emit('thumbstickmoved', { x: control.flick, y: 0 });
        hand.emit('thumbstickmoved', { x: 0, y: 0 });
        return;
      }
      const on = element.getAttribute('aria-pressed') !== 'true';
      sticks[control.hand] = applyStickToggle(sticks[control.hand], control.axis, control.value, on);
      element.setAttribute('aria-pressed', String(on));
      if (on) {
        for (const other of STICK_CONTROLS) {
          if (other === control || other.hand !== control.hand || other.axis !== control.axis) continue;
          const node = document.getElementById(other.id);
          if (node) node.setAttribute('aria-pressed', 'false');
        }
      }
      hand.emit('thumbstickmoved', sticks[control.hand]);
    });
  }

  for (const name of ['left', 'right']) {
    for (const axis of POSE_AXES) {
      const input = document.getElementById(`${name}-${axis.key}`);
      if (!input) continue;
      input.addEventListener('input', () => applyPoseSlider(input));
    }
  }
}
