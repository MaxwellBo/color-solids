// Quest controller models are physically based. With no lights and no
// environment they render black. The color solid is unlit, so these lights
// reach the controllers and leave the gamut colors alone.
export function prepareControllerMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || !material.isMeshStandardMaterial) continue;
      // glTF defaults metallicFactor to 1. A fully metal surface with no
      // metalness map ignores diffuse light and stays black without an
      // environment. The Touch models are plastic; keep authored maps.
      if (!material.metalnessMap && material.metalness > 0.9) material.metalness = 0.14;
      material.envMapIntensity = 1;
      material.needsUpdate = true;
    }
  });
}

function studioEnvironment(THREE) {
  const room = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  geometry.deleteAttribute('uv');
  const shell = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xf4f1ea,
      side: THREE.BackSide,
      roughness: 1,
      metalness: 0,
    }),
  );
  shell.scale.set(16, 12, 16);
  shell.position.y = 4;
  room.add(shell);

  const glow = new THREE.MeshStandardMaterial({
    color: 0xfff2e2,
    emissive: 0xfff2e2,
    emissiveIntensity: 4,
    roughness: 1,
    metalness: 0,
  });
  const windowLight = new THREE.Mesh(geometry, glow);
  windowLight.position.set(4, 5, 3);
  windowLight.scale.set(0.2, 3.5, 3.5);
  room.add(windowLight);

  const key = new THREE.PointLight(0xffffff, 90, 40, 2);
  key.position.set(2, 8, 4);
  room.add(key);
  const fill = new THREE.PointLight(0xd5e4ff, 40, 40, 2);
  fill.position.set(-5, 3, -2);
  room.add(fill);
  return room;
}

if (typeof AFRAME !== 'undefined') {
  const THREE = AFRAME.THREE;
  AFRAME.registerComponent('controller-lighting', {
    init() {
      this.onModel = (event) => {
        const model = event.target.getObject3D && event.target.getObject3D('mesh');
        if (model) prepareControllerMaterials(model);
      };
      this.el.addEventListener('controllermodelready', this.onModel);
    },

    play() {
      const renderer = this.el.renderer;
      if (!renderer || this.el.object3D.environment) return;
      const pmrem = new THREE.PMREMGenerator(renderer);
      const room = studioEnvironment(THREE);
      const target = pmrem.fromScene(room, 0.04);
      this.el.object3D.environment = target.texture;
      if ('environmentIntensity' in this.el.object3D) this.el.object3D.environmentIntensity = 0.7;
      pmrem.dispose();
    },

    remove() {
      this.el.removeEventListener('controllermodelready', this.onModel);
    },
  });
}
