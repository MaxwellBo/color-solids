import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '_site');
const aframe = 'aframe-v1.8.0.min.js';

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'node_modules/aframe/dist'), { recursive: true });
await cp(path.join(root, 'index.html'), path.join(out, 'index.html'));
await cp(path.join(root, 'src'), path.join(out, 'src'), {
  recursive: true,
  filter: (source) => !source.endsWith('.test.js'),
});
await cp(
  path.join(root, 'node_modules/aframe/dist', aframe),
  path.join(out, 'node_modules/aframe/dist', aframe),
);
await writeFile(path.join(out, '.nojekyll'), '');
