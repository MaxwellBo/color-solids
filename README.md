# sRGB solid in Oklab

An [A-Frame](https://aframe.io/) scene that draws the sRGB gamut as a solid in [Oklab](https://bottosson.github.io/posts/oklab/). Every color an sRGB display can show is placed at its Oklab coordinate: lightness up, green–red across, blue–yellow in depth. L, a, and b share one scale, so the shape is the gamut itself — narrow at black and white, wide through the saturated middle.

A horizontal cut opens the volume at one lightness. The cap is the slice of sRGB colors that live on that plane. In a headset the real room shows through, and the solid leaves the plinth and sits on the left controller. The right controller's A button lays a blade that follows its tilt and roll and leaves only the solid's edges above it. The cut stays on the solid when you let go. Tap A while not pointing at the solid to close it. Hold B and move through the solid to pick a color, then paint it with the trigger.

## Run

```bash
npm install
npm test
npm start
```

Open http://localhost:8080. Drag to orbit and scroll to zoom. The VR button enters a WebXR session when a headset is available.

## Deploy

`npm run build` writes a static copy of the exhibit to `_site`, including the A-Frame build the page loads from `node_modules`. Pushes to `master` publish that folder with GitHub Actions.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions** once. The site is then at https://maxwellbo.github.io/color-solids/.

## Controls

- Drag orbits the desktop camera. Scroll zooms. `R` resets the view.
- The slider, `↑` / `↓`, or the in-world lightness track move the desktop cut.
- `F`, or the Full solid / Cutaway control, closes or opens the volume on the desktop.
- In a headset the session opens with camera passthrough when the device supports it, and the virtual floor steps aside so the room stays visible. The solid attaches to the left controller. Point the controller up and lightness points up. Hold A on the right controller while aiming at the solid to project a blade from that controller. The blade follows the controller's tilt and roll, like a spatula. The solid below the blade stays opaque, the solid above keeps only the main edges of the gamut, and the blade shows the cross-section. Letting go of A leaves the cut on the solid, so moving the left controller carries the slice with it. Tap A while not pointing at the solid to close it.
- Hold B and move the right tip through the solid. The color updates as the tip moves, and a white ring marks the chosen color. The trigger then paints that color into the room.
- The left stick walks. Flicking the right stick sideways snap-turns.

WebXR needs a secure context. Desktop Chrome can use a connected headset from localhost. A standalone headset needs the page served over HTTPS.
