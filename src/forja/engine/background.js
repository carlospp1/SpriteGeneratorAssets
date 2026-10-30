/* Background removal: flood fill from the borders (and from points the user marks as background),
   then manual brush edits on top. Edits and points survive tolerance changes and crops.
   Points marked as "not background" (type 'keep') grow at the same time as the background and hold
   their area, so a white shirt next to a white background is not eaten through a small gap.
   createBg(state) works on a state object (the generator's or the line art's). */
export function createBg(S) {
const neighbours = (i, w, h) => { const x = i % w, y = (i / w) | 0; return [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]; };
const seedIndex = sd => Math.min(S.h - 1, Math.max(0, Math.floor(sd.y))) * S.w + Math.min(S.w - 1, Math.max(0, Math.floor(sd.x)));

const POINT_TOL = 14;   // tolerance of marked points when the background tolerance is 0
const HALO_PX = 2;      // rings of edge pixels around what a background point removed that are looked at again
const HALO_TOL = 2;     // × tolerance: an edge pixel this close to the point's colour also goes

/* o: remove (false = keep the background: no automatic removal; marked points and brushes still work),
      tol (0: no automatic removal; marked points then use POINT_TOL), drift (gradient reach, × tol), frame (peel frames), island (% of the biggest piece kept),
      alphaMin (transparent images), globalTol (× tol, for "whole image" background points) */
function compute(o) {
  if (o.remove && o.aiMask && o.aiMask.length === S.w * S.h) { computeAI(o); return; }
  const { w, h, rgba } = S, n = w * h, tol = o.tol;
  const mask = new Uint8Array(n).fill(1);
  const seedOf = new Int32Array(n).fill(-1), q = new Int32Array(n), keep = new Uint8Array(n);
  let t2 = tol * tol, g2 = (tol * o.drift) ** 2;
  // marked points (background / not background) still work with tolerance 0
  const ptol = tol > 0 ? tol : POINT_TOL, pointTol = () => { t2 = ptol * ptol; g2 = (ptol * o.drift) ** 2; };
  const d2 = (i, j) => { const a = i * 4, b = j * 4; const dr = rgba[a] - rgba[b], dg = rgba[a + 1] - rgba[b + 1], db = rgba[a + 2] - rgba[b + 2]; return dr * dr + dg * dg + db * db; };
  // each pixel grows from its neighbour (small step) but never drifts too far from the seed colour.
  // "not background" points grow in the same pass and claim pixels for the character (keep), which
  // later floods cannot take.
  const keepSeeds = S.bgSeeds.filter(sd => sd.type === 'keep').map(seedIndex);
  const flood = (seeds, kept = []) => {
    let qh = 0, qt = 0;
    for (const i of kept) if (mask[i] && seedOf[i] < 0) { seedOf[i] = i; keep[i] = 1; q[qt++] = i; }
    for (const i of seeds) if (mask[i] && seedOf[i] < 0) { seedOf[i] = i; mask[i] = 0; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], s = seedOf[i], k = keep[i];
      for (const j of neighbours(i, w, h)) if (j >= 0 && mask[j] && seedOf[j] < 0 && d2(i, j) <= t2 && d2(j, s) <= g2) { seedOf[j] = s; if (k) keep[j] = 1; else mask[j] = 0; q[qt++] = j; }
    }
  };

  let transparentBorder = 0, borderCount = 0;
  const aMin = Math.max(1, o.alphaMin);
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { borderCount++; if (rgba[(y * w + x) * 4 + 3] < aMin) transparentBorder++; }
  if (!o.remove || !(tol > 0)) {
    // keep the background (also with tolerance 0): only pixels that are already transparent stay empty
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < aMin) { mask[i] = 0; seedOf[i] = i; }
    pointTol(); flood([], keepSeeds);
  } else if (transparentBorder > borderCount * 0.5) {
    for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < aMin) { mask[i] = 0; seedOf[i] = i; }
    pointTol(); flood([], keepSeeds);
  } else {
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) border.push(y * w, y * w + w - 1);
    flood(border, keepSeeds);
    if (o.frame) peelFrame(mask, seedOf, flood, keep);
  }

  // points the user marked as background: flood from there; "global" also seeds every pixel of that tone
  const antes = Uint8Array.from(mask);
  pointTol();
  const gt = (ptol * o.globalTol) ** 2;
  for (const sd of S.bgSeeds) {
    if (sd.type === 'cut' || sd.type === 'keep') continue;
    const i = seedIndex(sd), seeds = [i];
    if (sd.global) for (let j = 0; j < n; j++) if (mask[j] && d2(i, j) <= gt) seeds.push(j);
    flood(seeds);
  }
  halo(mask, seedOf, keep, antes, d2, ptol);

  // "Quitar zona" rectangles: nothing inside them is character
  for (const sd of S.bgSeeds) {
    if (sd.type !== 'cut') continue;
    const x0 = Math.max(0, Math.floor(sd.x - sd.rx)), x1 = Math.min(w, Math.ceil(sd.x + sd.rx)), y0 = Math.max(0, Math.floor(sd.y - sd.ry)), y1 = Math.min(h, Math.ceil(sd.y + sd.ry));
    for (let y = y0; y < y1; y++) mask.fill(0, y * w + x0, y * w + Math.max(x0, x1));
  }
  S.mask = mask;
  // what the user took out on purpose (points, «Quitar zona», brushes): nobody may fill it back
  S.quitado = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (antes[i] && !mask[i]) S.quitado[i] = 1;
  if (o.remove) keepBigComponents(o.island, keep);
  applyEdits();
}

/* the background worked out by the AI (o.aiMask: 1 drawing, 0 background), then the «Quitar zona» rectangles,
   the loose specks and the brush / AI-click retouches on top, as with the flood */
function computeAI(o) {
  const { w, h } = S, mask = new Uint8Array(o.aiMask);
  for (const sd of S.bgSeeds) {
    if (sd.type !== 'cut') continue;
    const x0 = Math.max(0, Math.floor(sd.x - sd.rx)), x1 = Math.min(w, Math.ceil(sd.x + sd.rx)), y0 = Math.max(0, Math.floor(sd.y - sd.ry)), y1 = Math.min(h, Math.ceil(sd.y + sd.ry));
    for (let y = y0; y < y1; y++) mask.fill(0, y * w + x0, y * w + Math.max(x0, x1));
  }
  S.mask = mask;
  S.quitado = new Uint8Array(w * h);
  for (let i = 0; i < mask.length; i++) if (o.aiMask[i] && !mask[i]) S.quitado[i] = 1;
  keepBigComponents(o.island, new Uint8Array(w * h));
  applyEdits();
}

/* the soft edge left around what the background points removed: the pixels next to it (HALO_PX rings, contiguous)
   that are close to the point's colour (HALO_TOL × tolerance), or that are a blend of it and the drawing beside
   them with more background than drawing (antialias), are background too. Never the «no es fondo» areas. */
function halo(mask, seedOf, keep, antes, d2, ptol) {
  const { w, h, rgba } = S, n = w * h, h2 = (ptol * HALO_TOL) ** 2, r2 = Math.max(ptol, 20) ** 2;
  let ring = [];
  for (let i = 0; i < n; i++) if (antes[i] && !mask[i]) for (const j of neighbours(i, w, h)) if (j >= 0 && mask[j] && !keep[j]) { ring.push(j); }
  for (let pass = 0; pass < HALO_PX && ring.length; pass++) {
    const fuera = [];
    for (const j of ring) {
      if (!mask[j]) continue;
      // the background colour: the point that removed a neighbour; the drawing: the neighbour least like it
      let s = -1, c = -1, dc = -1;
      for (const k of neighbours(j, w, h)) {
        if (k < 0) continue;
        if (!mask[k] && antes[k] && seedOf[k] >= 0) s = seedOf[k];
      }
      if (s < 0) continue;
      for (const k of neighbours(j, w, h)) if (k >= 0 && mask[k]) { const d = d2(k, s); if (d > dc) { dc = d; c = k; } }
      let sale = d2(j, s) <= h2;
      if (!sale && c >= 0 && dc > 0) {
        // j = background + a·(drawing − background): a blend with a < ½ is more background than drawing
        const B = s * 4, C = c * 4, P = j * 4;
        let dot = 0, res = 0;
        for (let t = 0; t < 3; t++) dot += (rgba[P + t] - rgba[B + t]) * (rgba[C + t] - rgba[B + t]);
        const a = dot / dc;
        for (let t = 0; t < 3; t++) res += (rgba[P + t] - rgba[B + t] - a * (rgba[C + t] - rgba[B + t])) ** 2;
        sale = a < 0.5 && res <= r2;
      }
      if (sale) fuera.push([j, s]);
    }
    ring = [];
    for (const [j, s] of fuera) { mask[j] = 0; seedOf[j] = s; }
    for (const [j] of fuera) for (const k of neighbours(j, w, h)) if (k >= 0 && mask[k] && !keep[k]) ring.push(k);
  }
}

/* framed images: if what is left still touches all four edges, peel the frame and flood again from inside it */
function peelFrame(mask, seedOf, flood, keep) {
  const { w, h } = S, n = w * h;
  for (let pass = 0; pass < 3; pass++) {
    let top = false, bot = false, lef = false, rig = false;
    for (let x = 0; x < w; x++) { if (mask[x]) top = true; if (mask[(h - 1) * w + x]) bot = true; }
    for (let y = 0; y < h; y++) { if (mask[y * w]) lef = true; if (mask[y * w + w - 1]) rig = true; }
    const touching = top && bot && lef && rig;
    let bgCount = 0; for (let i = 0; i < n; i++) if (!mask[i]) bgCount++;
    if (!touching && bgCount > n * 0.12) break;
    const seeds = [];
    for (let i = 0; i < n; i++) {
      if (!mask[i] || keep[i]) continue; const x = i % w, y = (i / w) | 0;
      const edgeOfImg = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const nextToBg = (x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (y > 0 && !mask[i - w]) || (y < h - 1 && !mask[i + w]);
      if (edgeOfImg || (nextToBg && (x < w * 0.04 || x > w * 0.96 || y < h * 0.04 || y > h * 0.96))) seeds.push(i);
    }
    if (!seeds.length) break;
    for (const i of seeds) { mask[i] = 0; seedOf[i] = i; }
    const inner = [];
    for (const i of seeds) for (const j of neighbours(i, w, h)) if (j >= 0 && mask[j]) inner.push(j);
    flood(inner.filter(j => { const x = j % w, y = (j / w) | 0; return x < w * 0.06 || x > w * 0.94 || y < h * 0.06 || y > h * 0.94; }));
  }
}

/* drop loose pieces smaller than pct % of the biggest one (pct 0 keeps everything); pieces with a
   pixel claimed by a "not background" point always stay */
function keepBigComponents(pct, keep) {
  if (!(pct > 0)) return;
  const { w, h, mask } = S, n = w * h, comp = new Int32Array(n).fill(-1), sizes = [];
  const q = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    if (!mask[i] || comp[i] >= 0) continue;
    let qh = 0, qt = 0; q[qt++] = i; comp[i] = sizes.length; let sz = 0;
    while (qh < qt) {
      const p = q[qh++]; sz++;
      for (const j of neighbours(p, w, h)) if (j >= 0 && mask[j] && comp[j] < 0) { comp[j] = sizes.length; q[qt++] = j; }
    }
    sizes.push(sz);
  }
  const big = sizes.reduce((a, v) => Math.max(a, v), 0), minSize = Math.max(20, big * pct / 100);
  const kept = new Uint8Array(sizes.length);
  for (let i = 0; i < n; i++) if (mask[i] && keep[i]) kept[comp[i]] = 1;
  for (let i = 0; i < n; i++) if (mask[i] && sizes[comp[i]] < minSize && !kept[comp[i]]) mask[i] = 0;
}

function applyEdits() {
  const { mask, edits, quitado } = S; if (!edits) return;
  for (let i = 0; i < mask.length; i++) {
    if (edits[i] === 1) { mask[i] = 1; if (quitado) quitado[i] = 0; }
    else if (edits[i] === 2) { mask[i] = 0; if (quitado) quitado[i] = 1; }
  }
}

/* the pixels a brush of radius r at x, y covers (also its hover outline) */
function brushEach(x, y, r, fn) {
  const { w, h } = S;
  for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(h - 1, Math.ceil(y + r)); yy++)
    for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(w - 1, Math.ceil(x + r)); xx++)
      if ((xx - x) ** 2 + (yy - y) ** 2 <= r * r) fn(xx, yy);
}
function brushPixels(x, y, r) { const pts = []; brushEach(x, y, r, (a, b) => pts.push([a, b])); return pts; }
/* brush: keep = true restores character, false removes it */
function paint(x, y, keep, r) {
  const { w, mask, edits } = S;
  brushEach(x, y, r, (xx, yy) => { const i = yy * w + xx; mask[i] = keep ? 1 : 0; edits[i] = keep ? 1 : 2; if (S.quitado) S.quitado[i] = keep ? 0 : 1; });
}

function addSeed(x, y, global) { S.bgSeeds.push({ x, y, global }); }
function addKeep(x, y) { S.bgSeeds.push({ type: 'keep', x, y }); }
function seedColor(sd) { const o = seedIndex(sd) * 4; return [S.rgba[o], S.rgba[o + 1], S.rgba[o + 2]]; }
function clearRetouch() { S.bgSeeds = []; if (S.edits) S.edits.fill(0); }

function bbox() {
  const { w, h, mask } = S; if (!mask) return null;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

return { compute, paint, brushPixels, addSeed, addKeep, seedColor, clearRetouch, bbox };
}
