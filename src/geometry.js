import { clamp01, inGamut, linearSrgbToOklab, oklabToLinearSrgb, srgbToLinear } from './oklab.js';
import { labToWorld } from './scale.js';

// The boundary of the sRGB solid is the image of the RGB cube's six faces.
// Each face is gridded in encoded sRGB, then placed at its Oklab position.
const FACES = [
  { fixed: 0, value: 0, u: 2, v: 1 },
  { fixed: 0, value: 1, u: 1, v: 2 },
  { fixed: 1, value: 0, u: 0, v: 2 },
  { fixed: 1, value: 1, u: 2, v: 0 },
  { fixed: 2, value: 0, u: 1, v: 0 },
  { fixed: 2, value: 1, u: 0, v: 1 },
];

export function buildShellArrays(segments) {
  const side = segments + 1;
  const verticesPerFace = side * side;
  const vertexCount = FACES.length * verticesPerFace;
  const triangleCount = FACES.length * segments * segments * 2;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(triangleCount * 3);

  let vertexBase = 0;
  let indexCursor = 0;

  for (const face of FACES) {
    for (let j = 0; j <= segments; j++) {
      const v = j / segments;
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        const encoded = [0, 0, 0];
        encoded[face.fixed] = face.value;
        encoded[face.u] = u;
        encoded[face.v] = v;

        const linear = [
          srgbToLinear(encoded[0]),
          srgbToLinear(encoded[1]),
          srgbToLinear(encoded[2]),
        ];
        const lab = linearSrgbToOklab(linear[0], linear[1], linear[2]);
        const world = labToWorld(lab.L, lab.a, lab.b);
        const offset = (vertexBase + j * side + i) * 3;
        positions[offset] = world.x;
        positions[offset + 1] = world.y;
        positions[offset + 2] = world.z;
        colors[offset] = linear[0];
        colors[offset + 1] = linear[1];
        colors[offset + 2] = linear[2];
      }
    }

    for (let j = 0; j < segments; j++) {
      for (let i = 0; i < segments; i++) {
        const a = vertexBase + j * side + i;
        const b = a + 1;
        const c = a + side;
        const d = c + 1;
        indices[indexCursor++] = a;
        indices[indexCursor++] = c;
        indices[indexCursor++] = b;
        indices[indexCursor++] = b;
        indices[indexCursor++] = c;
        indices[indexCursor++] = d;
      }
    }

    vertexBase += verticesPerFace;
  }

  return { positions, colors, indices };
}

// The ridges of the solid are the twelve edges of the RGB cube. Oklab bends
// each one into a curve. These are the only edges drawn above a controller cut.
const CUBE_CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

function cubeEdges() {
  const edges = [];
  for (let i = 0; i < CUBE_CORNERS.length; i++) {
    for (let j = i + 1; j < CUBE_CORNERS.length; j++) {
      const start = CUBE_CORNERS[i];
      const end = CUBE_CORNERS[j];
      const changed = (start[0] !== end[0]) + (start[1] !== end[1]) + (start[2] !== end[2]);
      if (changed === 1) edges.push([start, end]);
    }
  }
  return edges;
}

export function buildGamutEdgePolylines(segments) {
  return cubeEdges().map(([start, end]) => {
    const points = [];
    for (let step = 0; step <= segments; step++) {
      const t = step / segments;
      const encoded = [
        start[0] + (end[0] - start[0]) * t,
        start[1] + (end[1] - start[1]) * t,
        start[2] + (end[2] - start[2]) * t,
      ];
      const linear = encoded.map(srgbToLinear);
      const lab = linearSrgbToOklab(linear[0], linear[1], linear[2]);
      const world = labToWorld(lab.L, lab.a, lab.b);
      points.push({
        x: world.x,
        y: world.y,
        z: world.z,
        r: linear[0],
        g: linear[1],
        b: linear[2],
      });
    }
    return points;
  });
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function initialNormal(direction) {
  const axis = Math.abs(direction.x) <= Math.abs(direction.y) && Math.abs(direction.x) <= Math.abs(direction.z)
    ? { x: 1, y: 0, z: 0 }
    : Math.abs(direction.y) <= Math.abs(direction.z)
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };
  return normalize(cross(direction, axis));
}

function transportNormal(previous, direction) {
  const along = dot(previous, direction);
  const projected = {
    x: previous.x - along * direction.x,
    y: previous.y - along * direction.y,
    z: previous.z - along * direction.z,
  };
  if (Math.hypot(projected.x, projected.y, projected.z) < 1e-6) return initialNormal(direction);
  return normalize(projected);
}

// A thin tube around each gamut edge, so the stroke stays visible in VR.
// radius is in the same local units as the shell.
export function buildEdgeTubeArrays(segments, radius) {
  const radial = 3;
  const polylines = buildGamutEdgePolylines(segments);
  const rings = (segments + 1) * radial;
  const positions = new Float32Array(polylines.length * rings * 3);
  const colors = new Float32Array(polylines.length * rings * 3);
  const indices = new Uint32Array(polylines.length * segments * radial * 6);

  let vertexBase = 0;
  let indexCursor = 0;

  for (const points of polylines) {
    let normal = null;
    for (let step = 0; step < points.length; step++) {
      const point = points[step];
      const next = points[Math.min(step + 1, points.length - 1)];
      const previous = points[Math.max(step - 1, 0)];
      const direction = normalize(step < points.length - 1
        ? { x: next.x - point.x, y: next.y - point.y, z: next.z - point.z }
        : { x: point.x - previous.x, y: point.y - previous.y, z: point.z - previous.z });
      normal = normal ? transportNormal(normal, direction) : initialNormal(direction);
      const binormal = normalize(cross(direction, normal));
      normal = normalize(cross(binormal, direction));

      for (let corner = 0; corner < radial; corner++) {
        const angle = (corner / radial) * Math.PI * 2;
        const offset = vertexBase + step * radial + corner;
        positions[offset * 3] = point.x + radius * (Math.cos(angle) * normal.x + Math.sin(angle) * binormal.x);
        positions[offset * 3 + 1] = point.y + radius * (Math.cos(angle) * normal.y + Math.sin(angle) * binormal.y);
        positions[offset * 3 + 2] = point.z + radius * (Math.cos(angle) * normal.z + Math.sin(angle) * binormal.z);
        colors[offset * 3] = point.r;
        colors[offset * 3 + 1] = point.g;
        colors[offset * 3 + 2] = point.b;
      }
    }

    for (let step = 0; step < segments; step++) {
      for (let corner = 0; corner < radial; corner++) {
        const nextCorner = (corner + 1) % radial;
        const a = vertexBase + step * radial + corner;
        const b = vertexBase + step * radial + nextCorner;
        const c = vertexBase + (step + 1) * radial + corner;
        const d = vertexBase + (step + 1) * radial + nextCorner;
        indices[indexCursor++] = a;
        indices[indexCursor++] = c;
        indices[indexCursor++] = b;
        indices[indexCursor++] = b;
        indices[indexCursor++] = c;
        indices[indexCursor++] = d;
      }
    }

    vertexBase += rings;
  }

  return { positions, colors, indices };
}

// A filled lightness slice. Marching squares on an a–b grid, with edge
// crossings pinned to the sRGB gamut boundary so the cap meets the shell.
export function buildSliceArrays(L, divisions) {
  const minimum = -0.4;
  const maximum = 0.4;
  const count = divisions + 1;
  const step = (maximum - minimum) / divisions;
  const inside = new Uint8Array(count * count);
  const sampleA = new Float32Array(count * count);
  const sampleB = new Float32Array(count * count);
  const sampleR = new Float32Array(count * count);
  const sampleG = new Float32Array(count * count);
  const sampleBlue = new Float32Array(count * count);

  for (let j = 0; j < count; j++) {
    const b = minimum + j * step;
    for (let i = 0; i < count; i++) {
      const a = minimum + i * step;
      const index = j * count + i;
      const rgb = oklabToLinearSrgb(L, a, b);
      inside[index] = inGamut(rgb) ? 1 : 0;
      sampleA[index] = a;
      sampleB[index] = b;
      sampleR[index] = clamp01(rgb.r);
      sampleG[index] = clamp01(rgb.g);
      sampleBlue[index] = clamp01(rgb.b);
    }
  }

  const maxVertices = divisions * divisions * 9;
  const positions = new Float32Array(maxVertices * 3);
  const colors = new Float32Array(maxVertices * 3);
  let vertexCount = 0;
  const edgeCache = new Map();

  function corner(i, j) {
    const index = j * count + i;
    return {
      a: sampleA[index],
      b: sampleB[index],
      r: sampleR[index],
      g: sampleG[index],
      blue: sampleBlue[index],
    };
  }

  function crossing(i0, j0, i1, j1) {
    let leftI = i0;
    let leftJ = j0;
    let rightI = i1;
    let rightJ = j1;
    if (leftI > rightI || (leftI === rightI && leftJ > rightJ)) {
      leftI = i1;
      leftJ = j1;
      rightI = i0;
      rightJ = j0;
    }
    const key = `${leftI},${leftJ},${rightI},${rightJ}`;
    const cached = edgeCache.get(key);
    if (cached) return cached;

    const leftIndex = leftJ * count + leftI;
    const rightIndex = rightJ * count + rightI;
    if (inside[leftIndex] === inside[rightIndex]) {
      throw new Error(`Slice edge ${key} is not a gamut crossing.`);
    }

    let insideA = sampleA[leftIndex];
    let insideB = sampleB[leftIndex];
    let outsideA = sampleA[rightIndex];
    let outsideB = sampleB[rightIndex];
    if (!inside[leftIndex]) {
      insideA = sampleA[rightIndex];
      insideB = sampleB[rightIndex];
      outsideA = sampleA[leftIndex];
      outsideB = sampleB[leftIndex];
    }

    for (let stepIndex = 0; stepIndex < 14; stepIndex++) {
      const midA = (insideA + outsideA) / 2;
      const midB = (insideB + outsideB) / 2;
      if (inGamut(oklabToLinearSrgb(L, midA, midB))) {
        insideA = midA;
        insideB = midB;
      } else {
        outsideA = midA;
        outsideB = midB;
      }
    }

    const rgb = oklabToLinearSrgb(L, insideA, insideB);
    const point = {
      a: insideA,
      b: insideB,
      r: clamp01(rgb.r),
      g: clamp01(rgb.g),
      blue: clamp01(rgb.b),
    };
    edgeCache.set(key, point);
    return point;
  }

  function pushVertex(point) {
    const world = labToWorld(L, point.a, point.b);
    const offset = vertexCount * 3;
    positions[offset] = world.x;
    positions[offset + 1] = world.y;
    positions[offset + 2] = world.z;
    colors[offset] = point.r;
    colors[offset + 1] = point.g;
    colors[offset + 2] = point.blue;
    vertexCount += 1;
  }

  for (let j = 0; j < divisions; j++) {
    for (let i = 0; i < divisions; i++) {
      const southwest = inside[j * count + i];
      const southeast = inside[j * count + (i + 1)];
      const northeast = inside[(j + 1) * count + (i + 1)];
      const northwest = inside[(j + 1) * count + i];
      const mask = southwest | (southeast << 1) | (northeast << 2) | (northwest << 3);
      if (mask === 0) continue;

      let centerInside = false;
      if (mask === 5 || mask === 10) {
        const centerA = minimum + (i + 0.5) * step;
        const centerB = minimum + (j + 0.5) * step;
        centerInside = inGamut(oklabToLinearSrgb(L, centerA, centerB));
      }

      const points = {
        sw: () => corner(i, j),
        se: () => corner(i + 1, j),
        ne: () => corner(i + 1, j + 1),
        nw: () => corner(i, j + 1),
        bottom: () => crossing(i, j, i + 1, j),
        right: () => crossing(i + 1, j, i + 1, j + 1),
        top: () => crossing(i, j + 1, i + 1, j + 1),
        left: () => crossing(i, j, i, j + 1),
      };

      for (const triangle of trianglesFor(mask, centerInside)) {
        for (const key of triangle) pushVertex(points[key]());
      }
    }
  }

  return {
    positions: positions.slice(0, vertexCount * 3),
    colors: colors.slice(0, vertexCount * 3),
  };
}

function fan(polygon) {
  const triangles = [];
  for (let index = 1; index < polygon.length - 1; index++) {
    triangles.push([polygon[0], polygon[index], polygon[index + 1]]);
  }
  return triangles;
}

function trianglesFor(mask, centerInside) {
  switch (mask) {
    case 1: return [['sw', 'bottom', 'left']];
    case 2: return [['se', 'right', 'bottom']];
    case 3: return fan(['sw', 'se', 'right', 'left']);
    case 4: return [['ne', 'top', 'right']];
    case 5:
      return centerInside
        ? fan(['sw', 'bottom', 'right', 'ne', 'top', 'left'])
        : [['sw', 'bottom', 'left'], ['ne', 'top', 'right']];
    case 6: return fan(['se', 'ne', 'top', 'bottom']);
    case 7: return fan(['sw', 'se', 'ne', 'top', 'left']);
    case 8: return [['nw', 'left', 'top']];
    case 9: return fan(['sw', 'bottom', 'top', 'nw']);
    case 10:
      return centerInside
        ? fan(['se', 'right', 'top', 'nw', 'left', 'bottom'])
        : [['se', 'right', 'bottom'], ['nw', 'left', 'top']];
    case 11: return fan(['sw', 'se', 'right', 'top', 'nw']);
    case 12: return fan(['right', 'ne', 'nw', 'left']);
    case 13: return fan(['sw', 'bottom', 'right', 'ne', 'nw']);
    case 14: return fan(['bottom', 'se', 'ne', 'nw', 'left']);
    case 15: return [['sw', 'se', 'ne'], ['sw', 'ne', 'nw']];
    default: return [];
  }
}
