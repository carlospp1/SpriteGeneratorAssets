/* Materials: k-means in Lab over the character, then a light-to-dark ramp per material. */
import { lab2rgb, deltaE, deltaE2000, rng } from './color.js';

const rnd = rng.next;

/* init: optional starting centres (K of them); without it, k-means++ */
export function kmeans(pts, dim, K, iters, weights, init) {
  const n = pts.length / dim, C = new Float32Array(K * dim);
  const dist = (p, c) => { let s = 0; for (let d = 0; d < dim; d++) { const v = (pts[p * dim + d] - C[c * dim + d]) * weights[d]; s += v * v; } return s; };
  if (init) init.forEach((c, k) => { for (let d = 0; d < dim; d++) C[k * dim + d] = c[d]; });
  else {
    const first = Math.floor(rnd() * n); for (let d = 0; d < dim; d++) C[d] = pts[first * dim + d];
    const D = new Float32Array(n).fill(Infinity);
    for (let k = 1; k < K; k++) {
      let sum = 0; for (let p = 0; p < n; p++) { D[p] = Math.min(D[p], dist(p, k - 1)); sum += D[p]; }
      let r = rnd() * sum, pick = 0; for (let p = 0; p < n; p++) { r -= D[p]; if (r <= 0) { pick = p; break; } }
      for (let d = 0; d < dim; d++) C[k * dim + d] = pts[pick * dim + d];
    }
  }
  const asg = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let p = 0; p < n; p++) { let b = 0, bd = Infinity; for (let k = 0; k < K; k++) { const v = dist(p, k); if (v < bd) { bd = v; b = k; } } asg[p] = b; }
    const sums = new Float64Array(K * dim), cnt = new Int32Array(K);
    for (let p = 0; p < n; p++) { cnt[asg[p]]++; for (let d = 0; d < dim; d++) sums[asg[p] * dim + d] += pts[p * dim + d]; }
    for (let k = 0; k < K; k++) if (cnt[k]) for (let d = 0; d < dim; d++) C[k * dim + d] = sums[k * dim + d] / cnt[k];
  }
  return C;
}

/* 1-D k-means on L, then per-level Lab means, sorted light to dark. lab: flat Lab array, ids: the entries to use */
function ramp(lab, ids, SH, o) {
  const Ls = ids.map(i => lab[i * 3]).sort((a, b) => a - b);
  let cent = Array.from({ length: SH }, (_, s) => Ls[Math.min(Ls.length - 1, Math.floor((s + 0.5) / SH * Ls.length))]);
  const nearest = L => { let b = 0; for (let s = 1; s < SH; s++) if (Math.abs(L - cent[s]) < Math.abs(L - cent[b])) b = s; return b; };
  for (let it = 0; it < 10; it++) {
    const sum = new Array(SH).fill(0), cnt = new Array(SH).fill(0);
    for (const L of Ls) { const b = nearest(L); sum[b] += L; cnt[b]++; }
    cent = cent.map((c, s) => cnt[s] ? sum[s] / cnt[s] : c);
  }
  const acc = cent.map(() => [0, 0, 0, 0]);
  for (const i of ids) { const b = nearest(lab[i * 3]); acc[b][0] += lab[i * 3]; acc[b][1] += lab[i * 3 + 1]; acc[b][2] += lab[i * 3 + 2]; acc[b][3]++; }
  let lv = acc.filter(a => a[3]).map(a => ({ lab: [a[0] / a[3], a[1] / a[3], a[2] / a[3]], n: a[3] })).sort((a, b) => b.lab[0] - a.lab[0]);
  // asking for more tones than the material really has must not invent near-identical shades
  if (o.minTone > 0) {
    const merged = [];
    for (const l of lv) {
      const last = merged[merged.length - 1];
      if (last && deltaE2000(last.lab, l.lab) < o.minTone) {
        const n = last.n + l.n;
        last.lab = last.lab.map((v, i) => (v * last.n + l.lab[i] * l.n) / n); last.n = n;
      } else merged.push({ lab: [...l.lab], n: l.n });
    }
    lv = merged;
  }
  return rampDe(lv.map(l => l.lab), o);
}

/* a material's tones from its levels (Lab, light to dark): colours and outline. The sprite uses it too, for the
   materials chosen by hand */
export function rampDe(levels, o) {
  // gentle pixel-art stylisation: darker steps a touch more saturated
  levels = levels.map((l, s) => { const f = 1 + o.shadeSat * s; return [l[0], l[1] * f, l[2] * f]; });
  const dk = levels[levels.length - 1];
  // coloured outline: a very dark tone of the material (never lighter than outMaxL);
  // darkening keeps the hue but lowers the chroma with the light, so it does not turn neon
  const L0 = Math.max(o.outDark > 0 ? 8 : 0, dk[0] * o.outDark), L = Math.min(L0, o.outMaxL ?? Infinity);
  const cf = o.outSat * (L0 > 0 ? Math.min(1, L / L0) : 1);
  const outline = [L, dk[1] * cf, dk[2] * cf];
  // so close to black that it reads as black: the outline uses the line colour instead
  const nearBlack = o.outBlack > 0 && deltaE2000(outline, [0, 0, 0]) < o.outBlack;
  return { levels, rgb: levels.map(l => lab2rgb(...l)), outline, outRgb: lab2rgb(...outline), nearBlack, baseL: levels[0][0] };
}

/* S: a state object like the generator's (lab, mask, w, h; the result goes to S.clusters) */
export function createClusters(S) {
/* automatic number of materials: the smallest K whose groups are uniform enough. Distances are measured in
   the same weighted Lab as the grouping: the average (RMS) must be at most o.kSens, and 97 % of the colours
   must lie within 3 × o.kSens of their group, so small but distinct materials (an iris, a belt) count too. */
function detectK(sample, W8, o) {
  const n = sample.length / 3; if (n < 2) return 1;
  const step = Math.max(1, Math.floor(n / 4000)), pts = [];
  for (let i = 0; i < n; i += step) pts.push(sample[i * 3], sample[i * 3 + 1], sample[i * 3 + 2]);
  const P = new Float32Array(pts), m = P.length / 3, KMAX = Math.min(24, m);
  for (let K = 1; K <= KMAX; K++) {
    rng.reset(o.seed);
    const C = kmeans(P, 3, K, 10, W8);
    const ds = new Float32Array(m); let sse = 0;
    for (let p = 0; p < m; p++) {
      let bd = Infinity;
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let d = 0; d < 3; d++) { const v = (P[p * 3 + d] - C[k * 3 + d]) * W8[d]; s += v * v; }
        if (s < bd) bd = s;
      }
      ds[p] = bd; sse += bd;
    }
    if (Math.sqrt(sse / m) > o.kSens) continue;
    ds.sort();
    if (Math.sqrt(ds[Math.min(m - 1, Math.floor(m * 0.97))]) <= 3 * o.kSens) return K;
  }
  return KMAX;
}

/* line test by contrast: L below lineL, or L below 50 with a pixel at least o.lineContrast lighter
   within 3 px (max filter over the lightness, background included) */
function contrastLines(o) {
  const { w, h, lab } = S, n = w * h, R = 3, L = new Float32Array(n), tmp = new Float32Array(n), mx = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = lab[i * 3];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let d = Math.max(0, x - R); d <= Math.min(w - 1, x + R); d++) m = Math.max(m, L[y * w + d]); tmp[y * w + x] = m;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 0; for (let d = Math.max(0, y - R); d <= Math.min(h - 1, y + R); d++) m = Math.max(m, tmp[d * w + x]); mx[y * w + x] = m;
  }
  return i => L[i] < o.lineL || (L[i] < 50 && mx[i] - L[i] >= o.lineContrast);
}

/* o: K materials, SH shades per material, lineL (L below which a pixel counts as line), lWeight (weight of
   lightness vs hue when grouping), kIter, seed, shadeSat, outDark, outSat (colour outline relative to darkest shade) */
function build(o) {
  const { w, h, lab, mask } = S, n = w * h, { K, lineL } = o;
  const matIdx = new Int16Array(n).fill(-1);
  const sample = [], lineSum = [0, 0, 0]; let lineN = 0;
  // a dark pixel with a light colour close by is a drawn line even if it is not pure black
  const isLine = o.lineKeep ? contrastLines(o) : i => lab[i * 3] < lineL;
  const step = Math.max(1, Math.floor(Math.sqrt(n / 25000)));
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    if (isLine(i)) { matIdx[i] = -2; lineSum[0] += lab[i * 3]; lineSum[1] += lab[i * 3 + 1]; lineSum[2] += lab[i * 3 + 2]; lineN++; continue; }
    const x = i % w, y = (i / w) | 0;
    if (x % step === 0 && y % step === 0) sample.push(lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]);
  }
  const W8 = [o.lWeight, 1, 1];
  // materials chosen by hand (S.matsMano): exactly those, in their order, and each pixel goes to the one whose
  // colour is the most similar; nothing is detected, moved or joined
  const mano = S.matsMano || [];
  if (mano.length) {
    const C = new Float32Array(mano.flatMap(m => m.centro));
    return finish(o, mano.length, C, mano.map((_, k) => k), mano.length, matIdx, lineSum, lineN, mano);
  }
  // automatic: one material per colour the AI found (o.kIA: their Lab means), otherwise counted by colours
  const ia = o.kAuto && o.kIA?.length ? o.kIA : null;
  const Kwant = o.kAuto ? (ia ? ia.length : detectK(sample, W8, o)) : K;
  rng.reset(o.seed);
  const Kr = Math.max(1, Math.min(Kwant, sample.length / 3));
  const C = kmeans(new Float32Array(sample), 3, Kr, o.kIter, W8, ia && ia.slice(0, Kr));
  // asking for more materials than the image has colours must not split one colour into near-duplicates:
  // groups whose centres are closer than o.minMat (ΔE) become one material
  const root = Array.from({ length: Kr }, (_, k) => k);
  const find = k => root[k] === k ? k : (root[k] = find(root[k]));
  const cen = k => [C[k * 3], C[k * 3 + 1], C[k * 3 + 2]], dE = deltaE;
  if (o.minMat > 0) {
    for (let a = 0; a < Kr; a++) for (let b = a + 1; b < Kr; b++) if (deltaE2000(cen(a), cen(b)) < o.minMat) root[find(b)] = find(a);
    // anti-aliasing: a small group whose colour lies between two others (a blend along their border, or
    // a blend with the dark lines) is not a material of its own: it joins the nearer of the two
    const share = new Float32Array(Kr), m = sample.length / 3;
    for (let q = 0; q < m; q++) {
      let bk = 0, bd = Infinity;
      for (let k = 0; k < Kr; k++) { const dL = (sample[q * 3] - C[k * 3]) * W8[0], da = sample[q * 3 + 1] - C[k * 3 + 1], db = sample[q * 3 + 2] - C[k * 3 + 2], v = dL * dL + da * da + db * db; if (v < bd) { bd = v; bk = k; } }
      share[bk] += 1 / m;
    }
    // judge whole groups (duplicates already joined above), not the pieces: asking for 8 materials can split
    // one flat colour into several small pieces, and each piece alone would look like a border blend
    const grp = new Map();
    for (let k = 0; k < Kr; k++) {
      const r = find(k), g = grp.get(r) || { share: 0, sum: [0, 0, 0] };
      g.share += share[k]; for (let d = 0; d < 3; d++) g.sum[d] += C[k * 3 + d] * share[k];
      grp.set(r, g);
    }
    for (const g of grp.values()) g.c = g.sum.map(v => v / Math.max(g.share, 1e-9));
    const ends = [];
    for (const [r, g] of grp) if (g.share >= 0.03) ends.push({ k: r, c: g.c });
    if (lineN) ends.push({ k: -1, c: [lineSum[0] / lineN, lineSum[1] / lineN, lineSum[2] / lineN] });
    for (const [r, g] of grp) {
      if (g.share >= 0.03) continue;
      const c = g.c;
      let into = -1, best = Infinity;
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
        const A = ends[i], B = ends[j], ab = dE(A.c, B.c);
        if (ab <= o.minMat) continue;
        const da = dE(c, A.c), db = dE(c, B.c);
        if (da + db > ab * 1.12) continue;                      // not on the way from A to B
        const near = A.k < 0 ? B : B.k < 0 ? A : (da <= db ? A : B);
        if (near.k >= 0 && da + db < best) { best = da + db; into = near.k; }
      }
      if (into >= 0) root[find(r)] = find(into);
    }
  }
  const compact = new Map(), remap = Array.from({ length: Kr }, (_, k) => { const r = find(k); if (!compact.has(r)) compact.set(r, compact.size); return compact.get(r); });
  S.clusters = finish(o, Kr, C, remap, compact.size, matIdx, lineSum, lineN, null);
  S.clusters.requested = Kwant; S.clusters.detected = o.kAuto ? Kwant : null; S.clusters.porIA = !!ia;
}

/* every pixel of the character to its group (Kr centres C, joined by remap into Ku materials), then each
   material's colour and tones: the general ones, or the ones chosen by hand (mano) */
function finish(o, Kr, C, remap, Ku, matIdx, lineSum, lineN, mano) {
  const { w, h, lab, mask } = S, n = w * h, W8 = [o.lWeight, 1, 1];
  const per = Array.from({ length: Ku }, () => []);
  for (let i = 0; i < n; i++) {
    if (matIdx[i] !== -1 || !mask[i]) continue;
    let b = 0, bd = Infinity;
    for (let k = 0; k < Kr; k++) { const dL = (lab[i * 3] - C[k * 3]) * W8[0], da = lab[i * 3 + 1] - C[k * 3 + 1], db = lab[i * 3 + 2] - C[k * 3 + 2]; const v = dL * dL + da * da + db * db; if (v < bd) { bd = v; b = k; } }
    b = remap[b]; matIdx[i] = b; if (per[b].length < 60000) per[b].push(i);
  }
  // with materials chosen by hand the tones are exactly the ones asked: similar shades are not joined
  const oMano = { ...o, minTone: 0 };
  const mats = per.map((ids, k) => {
    if (!ids.length) return null;
    const c = [0, 0, 0]; for (const i of ids) { c[0] += lab[i * 3]; c[1] += lab[i * 3 + 1]; c[2] += lab[i * 3 + 2]; }
    if (!mano) return { ...ramp(lab, ids, o.SH, o), centro: c.map(v => v / ids.length), tonos: o.SH };
    const tonos = Math.max(1, Math.round(mano[k].tonos));
    return { ...ramp(lab, ids, tonos, oMano), centro: mano[k].centro, tonos, mano: true };
  });
  const dark = lineN ? [Math.min(14, lineSum[0] / lineN), lineSum[1] / lineN * 0.6, lineSum[2] / lineN * 0.6] : [10, 6, 4];
  S.matIdx = matIdx;
  const r = { mats, K: Ku, requested: Ku, detected: null, porIA: false, mano: !!mano, dark: lab2rgb(...dark) };
  if (mano) S.clusters = r;
  return r;
}

return { build, detectK };
}
