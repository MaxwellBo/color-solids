// Quest shows the real room behind a session only when that session is
// immersive-ar and the pixels we do not draw stay transparent. immersive-vr
// is opaque, so the headset entry asks for passthrough first.

export function shouldFallbackToVR(error) {
  let current = error;
  while (current) {
    if (current.name === 'NotSupportedError') return true;
    current = current.cause;
  }
  return false;
}

export function installScenePassthrough(target, xr = globalThis.navigator && globalThis.navigator.xr) {
  if (!target || target.__scenePassthrough || typeof target.enterVR !== 'function') return target;
  const enterVR = target.enterVR;
  target.__scenePassthrough = true;

  target.enterVR = function requestPassthrough(useAR, useOfferSession) {
    const scene = this;
    const request = (ar) => {
      let attempt;
      try {
        attempt = enterVR.call(scene, !!ar, useOfferSession);
      } catch (error) {
        if (!ar || !shouldFallbackToVR(error)) throw error;
        scene.usedOfferSession = false;
        return enterVR.call(scene, false, useOfferSession);
      }
      return Promise.resolve(attempt).catch((error) => {
        if (!shouldFallbackToVR(error)) throw error;
        scene.usedOfferSession = false;
        return enterVR.call(scene, false, useOfferSession);
      });
    };

    if (useAR) return request(true);
    if (!xr || typeof xr.isSessionSupported !== 'function') return request(false);
    return Promise.resolve(xr.isSessionSupported('immersive-ar')).then(
      (supported) => request(!!supported),
      () => request(false),
    );
  };

  return target;
}
