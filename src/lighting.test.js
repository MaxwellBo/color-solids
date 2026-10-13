import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareControllerMaterials } from './lighting.js';

function mesh(material) {
  return {
    isMesh: true,
    material,
    traverse(visit) { visit(this); },
  };
}

test('controller plastics keep diffuse light when glTF omitted the metalness', () => {
  const plastic = { isMeshStandardMaterial: true, metalness: 1, metalnessMap: null, envMapIntensity: 0, needsUpdate: false };
  const mapped = { isMeshStandardMaterial: true, metalness: 1, metalnessMap: {}, envMapIntensity: 0, needsUpdate: false };
  prepareControllerMaterials(mesh(plastic));
  prepareControllerMaterials(mesh(mapped));
  assert.equal(plastic.metalness, 0.14);
  assert.equal(plastic.envMapIntensity, 1);
  assert.equal(plastic.needsUpdate, true);
  assert.equal(mapped.metalness, 1);
});
