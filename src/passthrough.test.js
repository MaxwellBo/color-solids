import assert from 'node:assert/strict';
import test from 'node:test';
import { installScenePassthrough, shouldFallbackToVR } from './passthrough.js';

function unsupported(message = 'unsupported') {
  return Object.assign(new Error(message), { name: 'NotSupportedError' });
}

test('a wrapped session failure still counts as unsupported', () => {
  const error = new Error('Failed to enter AR mode', { cause: unsupported() });
  assert.equal(shouldFallbackToVR(error), true);
  assert.equal(shouldFallbackToVR(Object.assign(new Error('denied'), { name: 'NotAllowedError' })), false);
});

test('a headset that supports passthrough is asked for it', async () => {
  const calls = [];
  const scene = {
    enterVR(ar, offer) {
      calls.push([ar, offer]);
      return Promise.resolve('session');
    },
  };
  installScenePassthrough(scene, {
    isSessionSupported: async (mode) => mode === 'immersive-ar',
  });

  await scene.enterVR(false, true);

  assert.deepEqual(calls, [[true, true]]);
});

test('a headset without passthrough stays on immersive-vr', async () => {
  const calls = [];
  const scene = {
    enterVR(ar, offer) {
      calls.push([ar, offer]);
      return Promise.resolve('session');
    },
  };
  installScenePassthrough(scene, { isSessionSupported: async () => false });

  await scene.enterVR(false, true);

  assert.deepEqual(calls, [[false, true]]);
});

test('an unsupported passthrough request falls back to immersive-vr', async () => {
  const calls = [];
  const scene = {
    usedOfferSession: false,
    enterVR(ar, offer) {
      calls.push([ar, offer, this.usedOfferSession]);
      this.usedOfferSession = true;
      if (ar) return Promise.reject(new Error('Failed to enter AR mode', { cause: unsupported() }));
      return Promise.resolve('vr');
    },
  };
  installScenePassthrough(scene, { isSessionSupported: async () => true });

  await scene.enterVR(false, true);

  assert.deepEqual(calls, [
    [true, true, false],
    [false, true, false],
  ]);
});

test('dismissing the passthrough prompt does not open a second session', async () => {
  let calls = 0;
  const scene = {
    enterVR() {
      calls += 1;
      return Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
    },
  };
  installScenePassthrough(scene, { isSessionSupported: async () => true });

  await assert.rejects(() => scene.enterVR(false, false), { name: 'NotAllowedError' });
  assert.equal(calls, 1);
});
