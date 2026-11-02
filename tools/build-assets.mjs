// Builds optimized CC0 game assets (KayKit by Kay Lousberg) into shared-assets/.
// Usage: node build-assets.mjs <path-to-kaykit-clones>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, mergeDocuments, textureCompress, resample, meshopt, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(process.argv[2] || '../../assets_src');
const OUT = path.resolve('../shared-assets/models');
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const find = (pattern) => {
  const out = [];
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (pattern.test(p)) out.push(p); } };
  walk(SRC); return out;
};

const KEEP = new Set([
  'Idle', 'Idle_Combat', '2H_Melee_Idle', 'Walking_A', 'Running_A', 'Running_B', 'Walking_D_Skeletons',
  '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Stab', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Attack_Slice',
  '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Spellcast_Raise', 'Spellcast_Summon', 'Spellcasting', 'Throw',
  'Block', 'Block_Hit', 'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Death_A_Pose', 'Death_C_Skeletons', 'Skeletons_Awaken_Floor', 'Spawn_Ground_Skeletons',
  'Cheer', 'Taunt', 'Dodge_Forward', 'Interact', 'Sit_Floor_Idle', 'Use_Item', 'Unarmed_Idle',
]);

async function finish(doc, file, tex = 512) {
  await doc.transform(
    dedup(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [tex, tex], quality: 88 }),
    resample(), unpartition(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(OUT, file), doc);
  console.log('wrote', file, Math.round(fs.statSync(path.join(OUT, file)).size / 1024), 'KB');
}

// --- characters ---
for (const f of find(/Characters[\\/]gltf[\\/][^\\/]+\.glb$/)) {
  const doc = await io.read(f);
  for (const a of doc.getRoot().listAnimations()) if (!KEEP.has(a.getName())) a.dispose();
  await finish(doc, path.basename(f).replace('.glb', '.glb').toLowerCase(), 512);
}

// --- world kit: tiles, buildings, nature, props, weapons merged into named nodes ---
async function kit(list, file) {
  const target = new (await import('@gltf-transform/core')).Document();
  const scene = target.createScene('kit');
  for (const f of list) {
    const name = path.basename(f).replace(/\.gltf$/, '');
    const src = await io.read(f);
    const before = new Set(target.getRoot().listScenes());
    mergeDocuments(target, src);
    const added = target.getRoot().listScenes().filter((s) => !before.has(s));
    const holder = target.createNode(name);
    for (const s of added) { for (const n of s.listChildren()) { s.removeChild(n); holder.addChild(n); } s.dispose(); }
    scene.addChild(holder);
  }
  target.getRoot().setDefaultScene(scene);
  for (const b of target.getRoot().listBuffers().slice(1)) b.dispose();
  const buf = target.getRoot().listBuffers()[0] || target.createBuffer();
  for (const acc of target.getRoot().listAccessors()) acc.setBuffer(buf);
  await finish(target, file, 1024);
}

const hex = find(/Medieval-Hexagon.*[\\/]gltf[\\/].*\.gltf$/).filter((f) => !/waterless/.test(f));
await kit(hex, 'hexkit.glb');
const props = find(/Character-Pack.*[\\/]Assets[\\/]gltf[\\/].*\.gltf$/);
await kit(props, 'weapons.glb');
fs.copyFileSync(path.join(SRC, fs.readdirSync(SRC).find((d) => /Hexagon/.test(d)), 'LICENSE.txt'), path.join(OUT, 'KAYKIT_LICENSE.txt'));
console.log('done');
