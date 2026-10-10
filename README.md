# sRGB solid in Oklab

An [A-Frame](https://aframe.io/) scene that draws the sRGB gamut as a solid in [Oklab](https://bottosson.github.io/posts/oklab/). Every color an sRGB display can show is placed at its Oklab coordinate: lightness up, green–red across, blue–yellow in depth. L, a, and b share one scale, so the shape is the gamut itself — narrow at black and white, wide through the saturated middle.

A horizontal cut opens the volume at one lightness. The cap is the slice of sRGB colors that live on that plane.

## Run

```bash
npm install
npm test
npm start
```

Open http://localhost:8080. Drag to orbit and scroll to zoom. The VR button enters a WebXR session when a headset is available.

## Controls

- Drag orbits the desktop camera. Scroll zooms. `R` resets the view.
- The slider, `↑` / `↓`, or the in-world lightness track move the cut.
- `F`, or the Full solid / Cutaway control, closes or opens the volume.
- In a headset, the left stick walks and the right stick moves the cut. Flicking the right stick sideways snap-turns. The trigger clicks the cut track and the mode button.

WebXR needs a secure context. Desktop Chrome can use a connected headset from localhost. A standalone headset needs the page served over HTTPS.
