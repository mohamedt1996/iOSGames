// Pointy-top axial hex grid matching KayKit tiles (circumradius 2/sqrt(3), top at y=0).
export const SIZE = 2 / Math.sqrt(3);
export const W = 2; // flat-to-flat width
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const key = (q, r) => `${q},${r}`;
export function toWorld(q, r) { return [SIZE * Math.sqrt(3) * (q + r / 2), SIZE * 1.5 * r]; }
export function fromWorld(x, z) {
  const q = (Math.sqrt(3) / 3 * x - z / 3) / SIZE, r = (2 / 3 * z) / SIZE;
  return round(q, r);
}
export function round(q, r) {
  let s = -q - r, rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}
export const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[0] + a[1] - b[0] - b[1]) + Math.abs(a[1] - b[1])) / 2;
// offset (col,row) rectangle -> axial (odd-r layout)
export const offsetToAxial = (col, row) => [col - (row - (row & 1)) / 2, row];
export const axialToOffset = (q, r) => [q + (r - (r & 1)) / 2, r];

export class HexGrid {
  constructor() { this.cells = new Map(); }
  set(q, r, cell) { cell.q = q; cell.r = r; [cell.x, cell.z] = toWorld(q, r); this.cells.set(key(q, r), cell); return cell; }
  get(q, r) { return this.cells.get(key(q, r)); }
  at(x, z) { const [q, r] = fromWorld(x, z); return this.get(q, r); }
  neighbors(c) { const out = []; for (const [dq, dr] of DIRS) { const n = this.get(c.q + dq, c.r + dr); if (n) out.push(n); } return out; }
  *[Symbol.iterator]() { yield* this.cells.values(); }
  // A* over passable cells with per-cell cost
  path(from, to, costFn) {
    if (!from || !to) return null;
    const open = new Map([[key(from.q, from.r), { c: from, g: 0, f: dist([from.q, from.r], [to.q, to.r]), p: null }]]);
    const closed = new Map();
    let guard = 0;
    while (open.size && guard++ < 4000) {
      let best = null; for (const n of open.values()) if (!best || n.f < best.f) best = n;
      const k = key(best.c.q, best.c.r); open.delete(k); closed.set(k, best);
      if (best.c === to) { const out = []; for (let n = best; n; n = n.p) out.unshift(n.c); return out; }
      for (const nb of this.neighbors(best.c)) {
        const nk = key(nb.q, nb.r); if (closed.has(nk)) continue;
        const cost = costFn(nb, best.c); if (!isFinite(cost)) continue;
        const g = best.g + cost, ex = open.get(nk);
        if (!ex || g < ex.g) open.set(nk, { c: nb, g, f: g + dist([nb.q, nb.r], [to.q, to.r]), p: best });
      }
    }
    return null;
  }
}
