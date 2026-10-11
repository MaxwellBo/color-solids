# sRGB solid in Oklab

An [A-Frame](https://aframe.io/) scene that draws the sRGB gamut as a solid in [Oklab](https://bottosson.github.io/posts/oklab/). Every color an sRGB display can show is placed at its Oklab coordinate: lightness up, green–red across, blue–yellow in depth. L, a, and b share one scale, so the shape is the gamut itself — narrow at black and white, wide through the saturated middle.

A horizontal cut opens the volume at one lightness. The cap is the slice of sRGB colors that live on that plane. In a headset the solid leaves the plinth and sits on the left controller. The right controller's A button lays a level plane that leaves only the solid's edges above it. B picks a color from that cut, and the trigger paints with it.

## Run

```bash
npm install
npm test
npm start
```

Open http://localhost:8080. Drag to orbit and scroll to zoom. The VR button enters a WebXR session when a headset is available.

## Controls

- Drag orbits the desktop camera. Scroll zooms. `R` resets the view.
- The slider, `↑` / `↓`, or the in-world lightness track move the desktop cut.
- `F`, or the Full solid / Cutaway control, closes or opens the volume on the desktop.
- In a headset the solid attaches to the left controller. Point the controller up and lightness points up. Hold A on the right controller to project a level plane from that controller's tip. The solid below the plane stays opaque, the solid above keeps only the main edges of the gamut, and the plane shows the cross-section. Releasing A restores the whole solid.
- While the cut is open, B picks the color under the right tip. The trigger then paints that color into the room.
- The left stick walks. Flicking the right stick sideways snap-turns.

WebXR needs a secure context. Desktop Chrome can use a connected headset from localhost. A standalone headset needs the page served over HTTPS.
