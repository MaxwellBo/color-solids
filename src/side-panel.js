import { activateDesktopControl, desktopControlPressed } from './controllers.js';
import {
  DESKTOP_BUTTONS,
  handAxesToPose,
  POSE_AXES,
  readHandAxes,
  STICK_CONTROLS,
} from './desktop-hands.js';
import { quantizeAxis } from './spatial-controls.js';

const AXIS_LABEL = {
  x: 'X',
  y: 'Y',
  z: 'Z',
  pitch: 'Pitch',
  yaw: 'Yaw',
  roll: 'Roll',
};

const BUTTON_LABEL = {
  'btn-a': 'A',
  'btn-b': 'B',
  'btn-grip': 'Pick',
  'btn-trigger': 'Paint',
  'btn-zoom-in': 'Zoom in',
  'btn-zoom-out': 'Zoom out',
  'btn-lightness-up': 'Lightness up',
  'btn-lightness-down': 'Lightness down',
  'btn-hue-left': 'Hue left',
  'btn-hue-right': 'Hue right',
  'btn-chroma-up': 'Chroma up',
  'btn-chroma-down': 'Chroma down',
  'btn-turn-left': 'Turn left',
  'btn-turn-right': 'Turn right',
};

const HANDS = [
  {
    name: 'left',
    title: 'Left controller',
    groups: [
      { title: 'Zoom', controls: DESKTOP_BUTTONS.filter((item) => item.id.startsWith('btn-zoom')) },
      { title: 'Color', controls: [
        ...STICK_CONTROLS.filter((item) => item.hand === 'left'),
        ...DESKTOP_BUTTONS.filter((item) => item.id.startsWith('btn-lightness')),
      ] },
    ],
  },
  {
    name: 'right',
    title: 'Right controller',
    groups: [
      { title: 'Buttons', controls: DESKTOP_BUTTONS.filter((item) => item.hand === 'right') },
      { title: 'Turn', controls: STICK_CONTROLS.filter((item) => item.hand === 'right') },
    ],
  },
];

function handElement(name) {
  return document.getElementById(name === 'left' ? 'left-hand' : 'right-hand');
}

function formatAxis(key, value) {
  if (key === 'pitch' || key === 'yaw' || key === 'roll') return `${value.toFixed(0)}°`;
  return value.toFixed(2);
}

function sliderValue(key, value) {
  if (key === 'pitch' || key === 'yaw' || key === 'roll') return String(Math.round(value));
  return value.toFixed(2);
}

// Write one axis and leave the other five, and the euler order, alone.
function writeAxis(name, key, raw) {
  const hand = handElement(name);
  if (!hand || !hand.object3D) return;
  const object = hand.object3D;
  const axes = readHandAxes(object.position, object.rotation);
  axes[key] = quantizeAxis(Number(raw), key);
  const pose = handAxesToPose(axes);
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.rotation.set(pose.rotation.x, pose.rotation.y, pose.rotation.z);
}

function addSlider(parent, name, axis) {
  const label = document.createElement('label');
  label.htmlFor = `${name}-${axis.key}`;
  label.append(AXIS_LABEL[axis.key], ' ');
  const output = document.createElement('output');
  output.id = `${name}-${axis.key}-value`;
  label.append(output);
  const input = document.createElement('input');
  input.id = `${name}-${axis.key}`;
  input.type = 'range';
  input.min = String(axis.min);
  input.max = String(axis.max);
  input.step = String(axis.step);
  input.addEventListener('input', () => {
    writeAxis(name, axis.key, input.value);
    const hand = handElement(name);
    if (!hand || !hand.object3D) return;
    const axes = readHandAxes(hand.object3D.position, hand.object3D.rotation);
    output.textContent = formatAxis(axis.key, axes[axis.key]);
  });
  parent.append(label, input);
  return { key: axis.key, input, output };
}

function addButtons(parent, controls) {
  const row = document.createElement('div');
  row.className = 'actions';
  const buttons = [];
  for (const control of controls) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = control.id;
    button.textContent = BUTTON_LABEL[control.id] || control.id;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      activateDesktopControl(control.id);
      for (const other of parent.closest('#controls').querySelectorAll('button')) {
        const pressed = desktopControlPressed(other.id) ? 'true' : 'false';
        if (other.getAttribute('aria-pressed') !== pressed) other.setAttribute('aria-pressed', pressed);
      }
    });
    row.append(button);
    buttons.push(button);
  }
  parent.append(row);
  return buttons;
}

function syncPanel(panel, sliders, buttons) {
  if (panel.hidden) return;
  for (const slider of sliders) {
    const hand = handElement(slider.hand);
    if (!hand || !hand.object3D) continue;
    const axes = readHandAxes(hand.object3D.position, hand.object3D.rotation);
    const value = axes[slider.key];
    if (document.activeElement !== slider.input) {
      const next = sliderValue(slider.key, value);
      if (slider.input.value !== next) slider.input.value = next;
    }
    slider.output.textContent = formatAxis(slider.key, value);
  }
  for (const button of buttons) {
    const pressed = desktopControlPressed(button.id) ? 'true' : 'false';
    if (button.getAttribute('aria-pressed') !== pressed) button.setAttribute('aria-pressed', pressed);
  }
}

export function bindSidePanel() {
  const panel = document.getElementById('controls');
  const scene = document.querySelector('a-scene');
  if (!panel || !scene || panel.dataset.bound === 'true') return;
  panel.dataset.bound = 'true';

  const sliders = [];
  const buttons = [];
  const columns = document.createElement('div');
  columns.className = 'hands';
  for (const hand of HANDS) {
    const section = document.createElement('section');
    const title = document.createElement('h2');
    title.textContent = hand.title;
    section.append(title);
    for (const axis of POSE_AXES) {
      sliders.push({ hand: hand.name, ...addSlider(section, hand.name, axis) });
    }
    for (const group of hand.groups) {
      const heading = document.createElement('h3');
      heading.textContent = group.title;
      section.append(heading);
      buttons.push(...addButtons(section, group.controls));
    }
    columns.append(section);
  }
  panel.append(columns);

  const frame = () => {
    syncPanel(panel, sliders, buttons);
    window.requestAnimationFrame(frame);
  };
  syncPanel(panel, sliders, buttons);
  window.requestAnimationFrame(frame);

  scene.addEventListener('enter-vr', () => {
    panel.hidden = true;
  });
  scene.addEventListener('exit-vr', () => {
    panel.hidden = false;
  });
  if (scene.is('vr-mode') || scene.is('ar-mode')) panel.hidden = true;
}
