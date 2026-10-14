# sRGB solid in Oklab

An [A-Frame](https://aframe.io/) scene that draws the sRGB gamut as a solid in [Oklab](https://bottosson.github.io/posts/oklab/). Every color an sRGB display can show is placed at its Oklab coordinate: lightness up, green–red across, blue–yellow in depth. L, a, and b share one scale, so the shape is the gamut itself — narrow at black and white, wide through the saturated middle.

A horizontal cut opens the volume at one lightness. The cap is the slice of sRGB colors that live on that plane. In a headset the real room shows through, and the solid sits on the left controller. The same two controllers are on screen without a headset. Bars and rings beside each one move and turn it, and the buttons sit on the controller where the headset uses them. The right controller's A button lays a blade along its pointing angle. Tilt and roll tip that blade, and only the solid's edges stay above it. B lays a blade that stays flat in a and b, so moving it only changes lightness. The cut stays on the solid when you let go. Tap A or B while not pointing at the solid to close it. Hold the back trigger, the grip behind the index finger, to cast a ray into the solid and pick a color, then paint it with the index trigger.

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

- Drag empty space to orbit the camera. Scroll zooms. `R` resets the view.
- Without a headset, each controller carries its own controls. Red, green, and blue bars move it along world X, Y, and Z. Rings in those colors pitch, yaw, and roll it around its own axes. Drag a pale knob to move the hand freely, or right-drag (or shift-drag) to aim it. A and B sit on those buttons: A slices along the pointer, B slices flat in a and b. Paint sits on the trigger and Pick sits on the grip. Arrows beside the left controller walk in the direction they point. Arcs beside the right controller turn.
- In a headset the session opens with camera passthrough when the device supports it, and the virtual floor steps aside so the room stays visible. The solid attaches to the left controller. Point the controller up and lightness points up. Hold A on the right controller while aiming at the solid to project a blade along that controller's pointer. The blade follows the pointer's tilt and roll, like a spatula. Hold B instead and the blade stays flat across a and b, so sliding the controller along lightness is the only thing that moves the cut. The solid below the blade stays opaque, the solid above keeps only the main edges of the gamut, and the cut shows the cross-section without a plane of its own. Letting go leaves the cut on the solid, so moving the left controller carries the slice with it. Tap A or B while not pointing at the solid to close it.
- Hold the back trigger (the grip behind the index finger). A ray runs out of the right controller. Where it meets the solid, a circle of that color with a white outline marks the point. If the ray starts inside the solid, that closest point is the start of the ray, and the same circle is drawn there so it stays visible through the shell. The index trigger then paints that color into the room.
- The left stick walks. Flicking the right stick sideways snap-turns.

WebXR needs a secure context. Desktop Chrome can use a connected headset from localhost. A standalone headset needs the page served over HTTPS.
