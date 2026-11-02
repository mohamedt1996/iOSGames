import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/core';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const scene = doc.getRoot().getDefaultScene();
for (const n of scene.listChildren()) { if (process.argv[3] && !new RegExp(process.argv[3]).test(n.getName())) continue; const b = getBounds(n); console.log(n.getName(), b.min.map(v=>v.toFixed(2)).join(','), '|', b.max.map(v=>v.toFixed(2)).join(',')); }
