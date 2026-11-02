import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f);
  console.log('==', f.split('/').pop());
  const walk = (n, d) => { if (n.getMesh() || /slot|hand/i.test(n.getName())) console.log(' '.repeat(d) + n.getName() + (n.getMesh() ? ` [mesh ${n.getMesh().getName()}]` : '') + (n.getSkin() ? ' skinned' : '')); for (const c of n.listChildren()) walk(c, d + 1); };
  for (const n of doc.getRoot().getDefaultScene().listChildren()) walk(n, 0);
}
