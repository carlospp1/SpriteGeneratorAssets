/* Grid reconstruction: turns the masked, clustered source into a TW×TH pixel sprite.
   Cell labels: -1 = empty, -2 = line, >= 0 = material index. */
import { rgb2lab, lab2rgb, mergeMap, rng } from './color.js';
import { kmeans, rampDe } from './clusters.js';

/* S: the generator state. deps: { bbox() (the character's box), lineArtLines() (lines of the Line art, or null) } */
export function createSprite(S, deps) {
const WHITE = [255, 255, 255];

function makeGrid(TW, TH) {
  const inG = (i, j) => i >= 0 && j >= 0 && i < TW && j < TH;
  return { TW, TH, N: TW * TH, inG, at: (a, i, j, def) => inG(i, j) ? a[j * TW + i] : def };
}
const put = (px, c, rgb) => { px[c * 4] = rgb[0]; px[c * 4 + 1] = rgb[1]; px[c * 4 + 2] = rgb[2]; px[c * 4 + 3] = 255; };
const mode = tally => [...tally].sort((a, b) => b[1] - a[1])[0][0];

/* per cell: count of source pixels per bin (0 = bg, 1 = line, 2.. materials) and Lab sums per material.
   Walk cells (not only source pixels): if the sprite is larger than the source, every cell still samples
   at least one source pixel (nearest). The old source→cell loop left empty holes when TW/TH > bbox. */
function binCells(g, b, K) {
  const { w, lab, matIdx } = S, { TW, TH, N } = g, NB = K + 2;
  const cw = (b.x1 - b.x0) / TW, ch = (b.y1 - b.y0) / TH;
  const cnt = new Float32Array(N * NB), sums = new Float32Array(N * K * 3), lineLsum = new Float32Array(N), lightMax = new Float32Array(N);
  const add = (c, p) => {
    const m = matIdx[p];
    if (m === -1) cnt[c * NB]++;
    else if (m === -2) { cnt[c * NB + 1]++; lineLsum[c] += lab[p * 3]; }
    else { cnt[c * NB + 2 + m]++; const o = (c * K + m) * 3; sums[o] += lab[p * 3]; sums[o + 1] += lab[p * 3 + 1]; sums[o + 2] += lab[p * 3 + 2]; if (lab[p * 3] > lightMax[c]) lightMax[c] = lab[p * 3]; }
  };
  for (let j = 0; j < TH; j++) {
    const y0 = Math.max(b.y0, Math.floor(b.y0 + j * ch));
    const y1 = Math.min(b.y1, Math.max(y0 + 1, Math.floor(b.y0 + (j + 1) * ch)));
    for (let i = 0; i < TW; i++) {
      const x0 = Math.max(b.x0, Math.floor(b.x0 + i * cw));
      const x1 = Math.min(b.x1, Math.max(x0 + 1, Math.floor(b.x0 + (i + 1) * cw)));
      const c = j * TW + i;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) add(c, y * w + x);
    }
  }
  return { cnt, sums, NB, cw, ch, lineLsum, lightMax };
}

/* dominant material and closest shade per cell */
function labelCells(g, bins, mats, K, cov) {
  const { N } = g, { cnt, sums, NB } = bins;
  const lbl = new Int16Array(N).fill(-1), lev = new Int16Array(N), lineFrac = new Float32Array(N);
  for (let c = 0; c < N; c++) {
    let tot = 0; for (let k = 0; k < NB; k++) tot += cnt[c * NB + k];
    if (!tot || cnt[c * NB] > tot * (1 - cov)) continue;
    lineFrac[c] = cnt[c * NB + 1] / tot;
    let bm = -1, bv = 0; for (let k = 0; k < K; k++) if (cnt[c * NB + 2 + k] > bv) { bv = cnt[c * NB + 2 + k]; bm = k; }
    lbl[c] = bm >= 0 && mats[bm] ? bm : -2;
    if (lbl[c] < 0) continue;
    const o = (c * K + bm) * 3, L = sums[o] / bv, a = sums[o + 1] / bv, bb = sums[o + 2] / bv;
    let best = 0, bd = Infinity;
    mats[bm].levels.forEach((l, s) => { const v = (l[0] - L) ** 2 + 0.3 * ((l[1] - a) ** 2 + (l[2] - bb) ** 2); if (v < bd) { bd = v; best = s; } });
    lev[c] = best;
  }
  return { lbl, lev, lineFrac };
}

/* material clusters: 3x3 mode filter */
function cleanMaterials(g, cells, mats, passes) {
  const { TW, TH, N, at } = g, { lbl, lev } = cells;
  for (let pass = 0; pass < passes; pass++) {
    const nl = lbl.slice();
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const c = j * TW + i, me = lbl[c], tally = new Map(); let filled = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const v = at(lbl, i + di, j + dj, -1); if (v !== -1) { filled++; tally.set(v, (tally.get(v) || 0) + 1); } }
      if (me === -1) { if (filled >= 6) nl[c] = mode(tally); continue; }
      if ((tally.get(me) || 0) <= 1 && tally.size) nl[c] = mode(tally);
    }
    for (let c = 0; c < N; c++) if (nl[c] !== lbl[c] && nl[c] >= 0 && lbl[c] < 0) lev[c] = Math.min(1, mats[nl[c]].levels.length - 1);
    lbl.set(nl);
  }
}

/* cells hanging by a single side */
function removeSpurs(g, lbl, passes) {
  const { TW, TH, at } = g;
  for (let pass = 0; pass < passes; pass++) for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i; if (lbl[c] === -1) continue;
    const k = [at(lbl, i - 1, j, -1), at(lbl, i + 1, j, -1), at(lbl, i, j - 1, -1), at(lbl, i, j + 1, -1)].filter(v => v !== -1).length;
    if (k <= 1) lbl[c] = -1;
  }
}

/* shade clusters: lonely shades take the most common shade of the same material around them */
function smoothShades(g, cells, passes) {
  const { TW, TH, at } = g, { lbl, lev } = cells;
  for (let pass = 0; pass < passes; pass++) {
    const nv = lev.slice();
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
      const c = j * TW + i; if (lbl[c] < 0) continue; const vals = [];
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; if (at(lbl, i + di, j + dj, -1) === lbl[c]) vals.push(lev[(j + dj) * TW + i + di]); }
      if (vals.length && vals.filter(v => v === lev[c]).length <= 1) { const t = {}; vals.forEach(v => t[v] = (t[v] || 0) + 1); nv[c] = +Object.entries(t).sort((a, b) => b[1] - a[1])[0][0]; }
    }
    lev.set(nv);
  }
}

/* internal lines (thin, non-max suppression) */
function detectLines(g, cells, thr, strong, bins, keep) {
  const { TW, TH, N, at } = g, { lbl, lineFrac: LF } = cells, isLine = new Uint8Array(N);
  const nearLight = (i, j) => { for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (at(bins.lightMax, i + di, j + dj, 0) >= 70) return true; return false; };
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i; if (lbl[c] === -1) continue;
    const f = LF[c], nmx = f >= at(LF, i - 1, j, 0) && f >= at(LF, i + 1, j, 0), nmy = f >= at(LF, i, j - 1, 0) && f >= at(LF, i, j + 1, 0);
    if ((f > thr && (nmx || nmy)) || f > strong || lbl[c] === -2) isLine[c] = 1;
    else if (keep && f > thr * 0.35 && (nmx || nmy) && nearLight(i, j)) isLine[c] = 1;
  }
  return isLine;
}

function compose(g, cells, isLine, mats, dark, colOut, outline, bins, keep) {
  const { TW, TH, N, at } = g, { lbl, lev } = cells, px = new Uint8ClampedArray(N * 4);
  const neighMats = (i, j) => { const r = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { if (!di && !dj) continue; const v = at(lbl, i + di, j + dj, -1); if (v >= 0) r.push(v); } return r; };
  const darkestFirst = ms => [...new Set(ms)].sort((a, b) => mats[a].baseL - mats[b].baseL)[0];
  const outFor = m => colOut && !mats[m].nearBlack ? mats[m].outRgb : dark;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i, m = lbl[c]; if (m === -1) continue;
    const edge = outline && (at(lbl, i - 1, j, -1) === -1 || at(lbl, i + 1, j, -1) === -1 || at(lbl, i, j - 1, -1) === -1 || at(lbl, i, j + 1, -1) === -1);
    if (edge) {
      if (m >= 0) put(px, c, outFor(m)); else { const nm = neighMats(i, j); put(px, c, nm.length ? outFor(darkestFirst(nm)) : dark); }
      continue;
    }
    if (isLine[c]) {
      const nm = neighMats(i, j), ln = bins.cnt[c * bins.NB + 1];
      if (keep && ln && bins.lineLsum[c] / ln < 40) { put(px, c, dark); continue; }
      if (!nm.length) put(px, c, dark);
      else if (nm.every(v => v === nm[0])) { const r = mats[nm[0]].rgb; put(px, c, r[r.length - 1]); }
      else put(px, c, outFor(darkestFirst(nm)));
      continue;
    }
    put(px, c, m >= 0 ? mats[m].rgb[Math.min(lev[c], mats[m].rgb.length - 1)] : dark);
  }
  return px;
}

/* detail areas (eyes): the cells inside the ellipse are rebuilt straight from the source with a small
   local palette instead of the material ramps. Votes favour colours that are rare in the area, so small
   features (pupil, iris ring, highlights) survive instead of being averaged away. */
/* Quality zones ('zone', rectangles) use the same routine with their own number of colours, a gentler bias
   and almost no snapping, so close colours (several whites) stay separate. Zones go first, eyes on top. */
const REGION = {
  eye: { minShare: 0.06, minCell: 0.15, snap: 6 },
  zone: { minShare: 0.015, minCell: 0.1, snap: 2.5, rare: 0.25 }
};
function stampDetail(g, px, b, bins, o) {
  const { TW, TH } = g, { cw, ch } = bins, { w, lab, mask } = S;
  const snaps = { eye: sharedColours(REGION.eye.snap), zone: sharedColours(REGION.zone.snap) };
  const regions = [...S.markers.filter(m => m.type === 'zone'), ...S.markers.filter(m => m.type === 'eye')];
  for (const mk of regions) {
    const R = REGION[mk.type], snapTo = snaps[mk.type], rare = mk.type === 'eye' ? o.eyeRare : R.rare;
    const inEll = mk.type === 'zone'
      ? (x, y) => Math.abs(x + 0.5 - mk.x) <= mk.rx && Math.abs(y + 0.5 - mk.y) <= mk.ry
      : (x, y) => ((x + 0.5 - mk.x) / mk.rx) ** 2 + ((y + 0.5 - mk.y) / mk.ry) ** 2 <= 1;
    const x0 = Math.max(b.x0, Math.floor(mk.x - mk.rx)), x1 = Math.min(b.x1, Math.ceil(mk.x + mk.rx));
    const y0 = Math.max(b.y0, Math.floor(mk.y - mk.ry)), y1 = Math.min(b.y1, Math.ceil(mk.y + mk.ry));
    const ids = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const p = y * w + x; if (mask[p] && inEll(x, y)) ids.push(p); }
    if (ids.length < 4) continue;

    // local palette
    const cells = (mk.rx * 2 / cw) * (mk.ry * 2 / ch);
    const K = mk.type === 'zone' ? Math.max(1, Math.min(Math.round(mk.colors || 8), ids.length))
      : Math.max(Math.min(3, o.eyeK), Math.min(o.eyeK, Math.round(Math.sqrt(cells)) + 1, ids.length));
    const stride = Math.max(1, Math.floor(ids.length / 4000)), pts = [];
    for (let n = 0; n < ids.length; n += stride) { const p = ids[n] * 3; pts.push(lab[p], lab[p + 1], lab[p + 2]); }
    rng.reset(11);
    const C = kmeans(new Float32Array(pts), 3, K, 12, [1, 1, 1]);
    const nearest = p => { let bk = 0, bd = Infinity; for (let k = 0; k < K; k++) { const dL = lab[p * 3] - C[k * 3], da = lab[p * 3 + 1] - C[k * 3 + 1], db = lab[p * 3 + 2] - C[k * 3 + 2], v = dL * dL + da * da + db * db; if (v < bd) { bd = v; bk = k; } } return bk; };
    const share = new Float32Array(K);
    for (const p of ids) share[nearest(p)]++;
    const pal = [];
    for (let k = 0; k < K; k++) { share[k] = Math.max(share[k] / ids.length, 1e-3); pal.push(snapTo([C[k * 3], C[k * 3 + 1], C[k * 3 + 2]])); }
    // small mid-tone clusters are usually anti-aliasing between two colours: they never win a cell.
    // The lightest and darkest clusters stay eligible however small (highlight, pupil).
    let kMin = 0, kMax = 0;
    for (let k = 1; k < K; k++) { if (C[k * 3] < C[kMin * 3]) kMin = k; if (C[k * 3] > C[kMax * 3]) kMax = k; }
    const eligible = Array.from({ length: K }, (_, k) => k === kMin || k === kMax || share[k] >= R.minShare);

    // per cell vote
    const i0 = Math.max(0, Math.floor((x0 - b.x0) / cw)), i1 = Math.min(TW - 1, Math.floor((x1 - 1 - b.x0) / cw));
    const j0 = Math.max(0, Math.floor((y0 - b.y0) / ch)), j1 = Math.min(TH - 1, Math.floor((y1 - 1 - b.y0) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const fx0 = Math.floor(b.x0 + i * cw), fx1 = Math.floor(b.x0 + (i + 1) * cw), fy0 = Math.floor(b.y0 + j * ch), fy1 = Math.floor(b.y0 + (j + 1) * ch);
      const cnt = new Float32Array(K); let inside = 0, total = 0;
      for (let y = fy0; y < fy1; y++) for (let x = fx0; x < fx1; x++) {
        total++; const p = y * w + x;
        if (!mask[p] || !inEll(x, y)) continue;
        inside++; cnt[nearest(p)]++;
      }
      if (!total || inside < total * 0.4) continue;
      let best = -1, bv = 0;
      for (let k = 0; k < K; k++) {
        if (!eligible[k] || cnt[k] < inside * R.minCell) continue;
        const v = cnt[k] / Math.pow(share[k], rare);
        if (v > bv) { bv = v; best = k; }
      }
      if (best >= 0) put(px, j * TW + i, pal[best]);
    }
  }
}

/* snap a Lab colour to an existing sprite colour when they are almost the same, to keep the palette small */
function sharedColours(maxDE) {
  const list = [];
  const add = rgb => { const l = new Float32Array(3); rgb2lab(rgb[0], rgb[1], rgb[2], l, 0); list.push([l, rgb]); };
  for (const m of S.clusters.mats) if (m) { m.rgb.forEach(add); add(m.outRgb); }
  add(S.clusters.dark); add(WHITE);
  return labC => {
    let best = null, bd = maxDE * maxDE;
    for (const [l, rgb] of list) { const v = (l[0] - labC[0]) ** 2 + (l[1] - labC[1]) ** 2 + (l[2] - labC[2]) ** 2; if (v < bd) { bd = v; best = rgb; } }
    return best || lab2rgb(labC[0], labC[1], labC[2]);
  };
}

/* lines of the line art page brought down to the sprite. Each sprite pixel looks at the part of the line art
   it covers and is line when enough of it is line. Then the shape is cleaned as chosen in the generator
   (step «Líneas del Line art»): thinned to 1 px, the outline put on the edge of the silhouette, L-shaped
   steps removed, 1 px gaps closed, loose bits dropped. They are not painted here: they become a layer of
   their own (kind per pixel: 1 outline, 2 inner line; zone: the dark shade of the area under each pixel;
   color: the line art's colour) that the sprite lines layer (spriteLines) puts over the sprite with its opacity, colour and hand
   retouches. Returns { la } or { note } when it cannot be done. */
function stampLineArt(g, px, b, bins, cells, mats, o) {
  const LA = deps.lineArtLines ? deps.lineArtLines() : null;
  if (!LA) return { note: 'Para usar las líneas del Line art, abre esa sección y pulsa «Usar la imagen del Generador» (tiene que ser la misma imagen).' };
  const { TW, TH, N, at } = g, { cw, ch } = bins, fr = S.frame, lf = LA.frame;
  const sx = LA.w / lf.w, sy = LA.h / lf.h;
  // working image x -> line art x (both measured from the original picture)
  const U = x => (fr.x + x / fr.k - lf.x) * sx, V = y => (fr.y + y / fr.k - lf.y) * sy;
  let cov = new Float32Array(N), out = new Float32Array(N);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const u0 = U(b.x0 + i * cw), u1 = U(b.x0 + (i + 1) * cw), v0 = V(b.y0 + j * ch), v1 = V(b.y0 + (j + 1) * ch);
    const area = Math.max(1, (u1 - u0) * (v1 - v0));
    let s = 0, so = 0;
    for (let v = Math.max(0, Math.floor(v0)), ve = Math.min(LA.h, Math.ceil(v1)); v < ve; v++)
      for (let u = Math.max(0, Math.floor(u0)), ue = Math.min(LA.w, Math.ceil(u1)); u < ue; u++) {
        const p = v * LA.w + u; s += LA.alpha[p]; if (LA.outer) so += LA.outer[p];
      }
    cov[j * TW + i] = s / area; out[j * TW + i] = so / area;
  }
  // «Suavizar antes de reducir»: each pixel takes part of the average around it (smoother, more joined lines)
  const sm = Math.max(0, Math.min(1, (o.laSmooth || 0) / 100));
  if (sm > 0) { cov = smooth3(g, cov, sm); out = smooth3(g, out, sm); }
  // a line of width wl crossing a pixel of side cs covers about wl / cs of it
  // «Cantidad de líneas» (0-100, 50 = as it was) scales that: each 25 more halves the coverage needed
  const cs = cw / fr.k * sx, amt = Number.isFinite(o.laAmount) ? o.laAmount : 50;
  const thr = Math.min(0.95, Math.min(0.45, Math.max(0.04, 0.4 * LA.width / cs)) * 2 ** ((50 - amt) / 25));
  const neighMats = (i, j) => { const r = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = at(cells.lbl, i + di, j + dj, -1); if (v >= 0) r.push(v); } return r; };
  const shadeOf = m => mats[m] && !mats[m].nearBlack ? mats[m].outRgb : LA.color;
  const kind = new Uint8Array(N), zone = new Uint8ClampedArray(N * 3);
  // the shade of the zone for every pixel (also where there is no line: lines can be drawn by hand)
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i, m = cells.lbl[c], nm = m >= 0 ? null : neighMats(i, j);
    zone.set(m >= 0 ? shadeOf(m) : nm.length ? shadeOf([...new Set(nm)].sort((a, b2) => mats[a].baseL - mats[b2].baseL)[0]) : LA.color, c * 3);
  }
  const solid = (i, j) => g.inG(i, j) && px[(j * TW + i) * 4 + 3] > 0;
  const edge = c => { const i = c % TW, j = (c / TW) | 0; return !solid(i - 1, j) || !solid(i + 1, j) || !solid(i, j - 1) || !solid(i, j + 1); };
  const outerish = c => LA.outer && out[c] >= cov[c] * 0.35;   // mostly outline in the line art
  const thin = o.laThin || 'thin', onEdge = o.laEdge !== false;
  const line = new Uint8Array(N);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i, f = cov[c];
    if (!px[c * 4 + 3] || f <= thr) continue;
    if (thin === 'ridge') {   // only the middle of thick lines
      const ridge = (f >= at(cov, i - 1, j, 0) && f >= at(cov, i + 1, j, 0)) || (f >= at(cov, i, j - 1, 0) && f >= at(cov, i, j + 1, 0));
      if (!ridge && f < Math.min(0.6, thr * 2.5)) continue;
    }
    // the outline of the silhouette comes from the sprite's own edge instead (it lands on the edge, 1 px)
    if (onEdge && outerish(c)) continue;
    line[c] = 1;
  }
  if (o.laGaps) closeGaps(g, line, solid);
  if (thin === 'thin') thinLines(g, line);
  if (onEdge) for (let c = 0; c < N; c++) if (px[c * 4 + 3] && edge(c)) line[c] = 1;
  if (o.laPerfect !== false) for (let k = 0; k < 4 && pixelPerfect(g, line); k++);   // a removed corner can uncover another
  if (o.laMinPiece > 1) dropPieces(g, line, o.laMinPiece);
  for (let c = 0; c < N; c++) if (line[c]) kind[c] = edge(c) || (!onEdge && outerish(c)) ? 1 : 2;
  return { la: { kind, zone, color: [...LA.color] } };
}

/* line clean-up on a sprite-sized 0/1 grid */
function smooth3(g, a, s) {
  const { TW, TH, at } = g, r = new Float32Array(a.length);
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    let sum = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += at(a, i + di, j + dj, 0);
    const c = j * TW + i; r[c] = a[c] * (1 - s) + sum / 9 * s;
  }
  return r;
}
/* Zhang-Suen thinning: thick lines become their 1 px middle, keeping them joined */
function thinLines(g, a) {
  const { TW, TH, at } = g, P = (i, j) => at(a, i, j, 0) ? 1 : 0;
  for (let changed = true; changed;) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const del = [];
      for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
        if (!a[j * TW + i]) continue;
        const p = [P(i, j - 1), P(i + 1, j - 1), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), P(i - 1, j + 1), P(i - 1, j), P(i - 1, j - 1)];
        const B = p.reduce((s, v) => s + v, 0); if (B < 2 || B > 6) continue;
        let A = 0; for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) A++;
        if (A !== 1) continue;
        const [p2, , p4, , p6, , p8] = p;
        if (step === 0 ? (p2 * p4 * p6 || p4 * p6 * p8) : (p2 * p4 * p8 || p2 * p6 * p8)) continue;
        del.push(j * TW + i);
      }
      for (const c of del) a[c] = 0;
      if (del.length) changed = true;
    }
  }
}
/* the corner pixel of an L-shaped step goes (the two ends stay joined diagonally): «pixel perfect» lines */
function pixelPerfect(g, a) {
  const { TW, TH, at } = g, P = (i, j) => !!at(a, i, j, 0);
  let changed = false;
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    const c = j * TW + i; if (!a[c]) continue;
    const n = P(i, j - 1), s = P(i, j + 1), w = P(i - 1, j), e = P(i + 1, j);
    if ((n && w && !s && !e && !P(i + 1, j + 1)) || (n && e && !s && !w && !P(i - 1, j + 1)) ||
        (s && w && !n && !e && !P(i + 1, j - 1)) || (s && e && !n && !w && !P(i - 1, j - 1))) { a[c] = 0; changed = true; }
  }
  return changed;
}
/* a 1 px gap between the ends of two lines is filled (only between line ends, not between parallel lines) */
function closeGaps(g, a, solid) {
  const { TW, TH, at } = g, P = (i, j) => at(a, i, j, 0) ? 1 : 0, add = [];
  for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) {
    if (a[j * TW + i] || !solid(i, j)) continue;
    let k = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) k += P(i + di, j + dj);
    if (k !== 2) continue;
    if ((P(i, j - 1) && P(i, j + 1)) || (P(i - 1, j) && P(i + 1, j)) || (P(i - 1, j - 1) && P(i + 1, j + 1)) || (P(i + 1, j - 1) && P(i - 1, j + 1))) add.push(j * TW + i);
  }
  for (const c of add) a[c] = 1;
}
/* loose bits of line smaller than min pixels (joined also diagonally) go */
function dropPieces(g, a, min) {
  const { TW, N, inG } = g, seen = new Uint8Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    if (!a[c0] || seen[c0]) continue;
    const comp = [c0]; seen[c0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k], i = c % TW, j = (c / TW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (!inG(ii, jj)) continue; const q = jj * TW + ii; if (!seen[q] && a[q]) { seen[q] = 1; comp.push(q); } }
    }
    if (comp.length < min) for (const c of comp) a[c] = 0;
  }
}

/* user details: dark strokes and shine pixels */
function stampMarkers(g, px, b, bins, dark, o) {
  const dotCol = o.dotAuto ? dark : o.dotColor;
  const { TW, inG } = g, { cw, ch } = bins;
  const toG = (x, y) => [(x - b.x0) / cw, (y - b.y0) / ch];
  for (const mk of S.markers.filter(m => m.type === 'dot')) {
    const [a0, b0] = toG(mk.x, mk.y), [a1, b1] = toG(mk.x2, mk.y2);
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(a1 - a0), Math.abs(b1 - b0))));
    for (let t = 0; t <= steps; t++) { const i = Math.floor(a0 + (a1 - a0) * t / steps), j = Math.floor(b0 + (b1 - b0) * t / steps); if (inG(i, j)) put(px, j * TW + i, dotCol); }
  }
  for (const mk of S.markers.filter(m => m.type === 'shine')) {
    const [a0, b0] = toG(mk.x, mk.y), i = Math.floor(a0), j = Math.floor(b0);
    if (inG(i, j) && px[(j * TW + i) * 4 + 3] > 0) put(px, j * TW + i, o.shineColor);
  }
}

/* tiny floating specks (8-connected groups under 6 px) */
function removeSpecks(g, px, minSize) {
  if (minSize < 2) return;
  const { TW, N, inG } = g, inside = c => px[c * 4 + 3] > 0, seen = new Uint8Array(N);
  for (let c0 = 0; c0 < N; c0++) {
    if (!inside(c0) || seen[c0]) continue;
    const comp = [c0]; seen[c0] = 1;
    for (let k = 0; k < comp.length; k++) {
      const c = comp[k], i = c % TW, j = (c / TW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (!inG(ii, jj)) continue; const q = jj * TW + ii; if (!seen[q] && inside(q)) { seen[q] = 1; comp.push(q); } }
    }
    if (comp.length < minSize) for (const c of comp) px[c * 4 + 3] = 0;
  }
}

/* colours that are nearly the same (difference below maxDE) become one: the most used of them */
function mergeSimilar(px, maxDE) {
  if (!(maxDE > 0)) return;
  const counts = new Map();
  for (let o = 0; o < px.length; o += 4) if (px[o + 3]) { const k = (px[o] << 16) | (px[o + 1] << 8) | px[o + 2]; counts.set(k, (counts.get(k) || 0) + 1); }
  const map = mergeMap([...counts].map(([key, count]) => ({ key, count, rgb: [key >> 16, (key >> 8) & 255, key & 255] })), maxDE);
  if (!map.size) return;
  for (let o = 0; o < px.length; o += 4) {
    if (!px[o + 3]) continue;
    const to = map.get((px[o] << 16) | (px[o + 1] << 8) | px[o + 2]);
    if (to) { px[o] = to[0]; px[o + 1] = to[1]; px[o + 2] = to[2]; }
  }
}

/* a material chosen by hand gets exactly the tones asked for (mat.tonos), all of them visible. Its pixels are split
   light to dark into that many equal groups, each tone the average of its group; tones closer than TONO_L in
   lightness are spread apart. (Taken from the sprite's pixels, not the drawing's: a sprite pixel is the average
   of a patch of the drawing and never reaches its extreme shades, so most tones of the drawing would not show.) */
const TONO_L = 7;
function tonosAMano(g, bins, cells, mat, m, K, o) {
  const cs = [];
  for (let c = 0; c < g.N; c++) {
    if (cells.lbl[c] !== m) continue;
    const nc = bins.cnt[c * bins.NB + 2 + m], q = (c * K + m) * 3;
    cs.push({ c, lab: [bins.sums[q] / nc, bins.sums[q + 1] / nc, bins.sums[q + 2] / nc] });
  }
  if (!cs.length) return;
  cs.sort((a, b) => b.lab[0] - a.lab[0]);
  const N = Math.max(1, Math.min(mat.tonos, cs.length)), levels = [];
  for (let s = 0; s < N; s++) {
    const grupo = cs.slice(Math.floor(s * cs.length / N), Math.floor((s + 1) * cs.length / N)), l = [0, 0, 0];
    for (const x of grupo) { cells.lev[x.c] = s; for (let d = 0; d < 3; d++) l[d] += x.lab[d] / grupo.length; }
    levels.push(l);
  }
  const falta = TONO_L * (N - 1);
  if (N > 1 && levels[0][0] - levels[N - 1][0] < falta) {
    const medio = (levels[0][0] + levels[N - 1][0]) / 2, top = Math.min(97, Math.max(3 + falta, medio + falta / 2));
    levels.forEach((l, s) => { l[0] = top - TONO_L * s; });
  }
  Object.assign(mat, rampDe(levels, o));
}

/* o: the generator settings (readSettings). Needs S.mask and S.clusters. */
function generate(o) {
  const b = deps.bbox(); if (!b || !S.clusters) return null;
  const g = makeGrid(Math.max(4, o.TW | 0), Math.max(4, o.TH | 0));
  const { mats, K, dark } = S.clusters;
  const bins = binCells(g, b, K);
  const cells = labelCells(g, bins, mats, K, o.cellCov);
  for (let m = 0; m < K; m++) if (mats[m] && mats[m].mano) tonosAMano(g, bins, cells, mats[m], m, K, o);
  cleanMaterials(g, cells, mats, o.clean);
  removeSpurs(g, cells.lbl, o.spurs);
  smoothShades(g, cells, o.clean + 1);
  const isLine = detectLines(g, cells, o.lineThr, o.lineStrong, bins, o.lineKeep);
  const px = compose(g, cells, isLine, mats, dark, o.colOut, o.outline, bins, o.lineKeep);
  stampDetail(g, px, b, bins, o);
  const { la = null, note = '' } = o.useLineArt ? stampLineArt(g, px, b, bins, cells, mats, o) : {};
  const before = la && px.slice();
  stampMarkers(g, px, b, bins, dark, o);
  removeSpecks(g, px, o.speck);
  // dark strokes and shines marked by hand go over the line art; what the speck clean-up removed has no line
  if (la) for (let c = 0; c < g.N; c++) {
    const q = c * 4;
    if (!px[q + 3] || px[q] !== before[q] || px[q + 1] !== before[q + 1] || px[q + 2] !== before[q + 2]) la.kind[c] = 0;
  }
  mergeSimilar(px, o.mergeDE);
  return { px, TW: g.TW, TH: g.TH, note, la };
}

return { generate };
}
