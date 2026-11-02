import { HexGrid, offsetToAxial } from '../core/hex.js';
import { mulberry32, makeNoise } from '../core/rng.js';

// Terrain rules for battle hexes.
export const TERRAIN = {
  grass: { move: 1, pass: true, cover: 1, name: 'Open field' },
  forest: { move: 1.5, pass: true, cover: 0.55, burn: true, name: 'Forest' },
  hill: { move: 1.4, pass: true, cover: 0.85, high: true, name: 'Hill' },
  mountain: { move: Infinity, pass: false, cover: 1, name: 'Crag' },
  water: { move: Infinity, pass: false, cover: 1, name: 'Deep water' },
  river: { move: 2.2, pass: true, cover: 1.15, name: 'Ford' },
  road: { move: 0.75, pass: true, cover: 1, name: 'Road' },
  bridge: { move: 0.8, pass: true, cover: 1, name: 'Bridge' },
  town: { move: 1.2, pass: true, cover: 0.7, name: 'Village' },
  ash: { move: 1, pass: true, cover: 1, name: 'Burnt ground' },
  ruin: { move: 1.3, pass: true, cover: 0.75, name: 'Ruins' },
};

export const COLS = 11, ROWS = 15;

// Build a battlefield from a recipe: biome + features. Rows 0-2 are the Legion's deployment, 12-14 yours.
export function makeBattlefield(recipe = {}, seed = 1) {
  const rand = mulberry32(seed * 977 + 13);
  const noise = makeNoise(rand);
  const g = new HexGrid();
  const feat = new Set(recipe.features || []);
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) {
    const [q, r] = offsetToAxial(col, row);
    let type = 'grass';
    const n = noise(col * 0.45 + 3, row * 0.45 + 7);
    const forestDensity = recipe.forest ?? 0.25;
    if (n > 1 - forestDensity && row > 2 && row < 12) type = 'forest';
    g.set(q, r, { type, col, row, burn: 0, burnt: false, deco: rand() });
  }
  const cell = (col, row) => { const [q, r] = offsetToAxial(col, row); return g.get(q, r); };
  const setT = (col, row, t) => { const c = cell(col, row); if (c) c.type = t; };
  // flanking forests make the left/right meaningful
  if (feat.has('flankwoods')) for (let row = 4; row < 11; row++) { setT(0, row, 'forest'); setT(1, row, rand() < 0.6 ? 'forest' : 'grass'); setT(10, row, 'forest'); setT(9, row, rand() < 0.6 ? 'forest' : 'grass'); }
  if (feat.has('river')) {
    const rr = 7;
    for (let col = 0; col < COLS; col++) setT(col, rr, 'water');
    for (const col of recipe.fords || [2, 8]) setT(col, rr, 'river');
    for (const col of recipe.bridges || [5]) setT(col, rr, 'bridge');
    for (let row = 0; row < ROWS; row++) if (row !== rr && cell(5, row).type === 'grass' && feat.has('road')) setT(5, row, 'road');
  } else if (feat.has('road')) for (let row = 0; row < ROWS; row++) if (cell(5, row).type !== 'water') setT(5, row, 'road');
  if (feat.has('centerhill')) { setT(5, 7, 'hill'); setT(4, 7, 'hill'); setT(5, 6, 'hill'); setT(6, 8, 'hill'); }
  if (feat.has('ridges')) { setT(2, 5, 'hill'); setT(3, 5, 'hill'); setT(7, 9, 'hill'); setT(8, 9, 'hill'); }
  if (feat.has('crags')) { setT(3, 8, 'mountain'); setT(7, 6, 'mountain'); setT(0, 7, 'mountain'); setT(10, 7, 'mountain'); }
  if (feat.has('village')) { setT(4, 9, 'town'); setT(6, 9, 'town'); setT(5, 10, 'town'); }
  if (feat.has('ruins')) { setT(3, 4, 'ruin'); setT(7, 4, 'ruin'); setT(5, 3, 'ruin'); }
  if (feat.has('lake')) { setT(8, 5, 'water'); setT(9, 5, 'water'); setT(9, 4, 'water'); setT(8, 4, 'water'); }
  // keep deployment rows clear
  for (const row of [0, 1, 2, 12, 13, 14]) for (let col = 0; col < COLS; col++) { const c = cell(col, row); if (!TERRAIN[c.type].pass) c.type = 'grass'; }
  const banner = cell(5, 7);
  if (!TERRAIN[banner.type].pass || banner.type === 'river') banner.type = 'hill';
  return { grid: g, banner, recipe, cell, deploy: { ember: [12, 13, 14], ash: [0, 1, 2] }, night: !!recipe.night };
}

// Named battlefield recipes used by the campaign and skirmish.
export const RECIPES = {
  plains: { name: 'Open Plains', forest: 0.12, features: ['road', 'flankwoods'] },
  forest: { name: 'Whispering Wood', forest: 0.48, features: ['ruins'] },
  river: { name: 'Ashwater Ford', forest: 0.2, features: ['river', 'road', 'flankwoods'], fords: [1, 9], bridges: [5] },
  hills: { name: 'Cinder Ridge', forest: 0.2, features: ['centerhill', 'ridges', 'crags'] },
  village: { name: 'Hollow Village', forest: 0.15, features: ['village', 'road', 'flankwoods'] },
  marsh: { name: 'Blackmere', forest: 0.3, features: ['lake', 'ruins', 'crags'] },
  citadel: { name: 'Gates of the Citadel', forest: 0.1, features: ['ruins', 'ridges', 'road', 'crags'] },
};
