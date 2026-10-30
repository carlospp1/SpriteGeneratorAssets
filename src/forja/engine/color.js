/* Colour conversions (sRGB <-> CIE Lab), colour differences, families and merging. */
const srgb2lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lin2srgb = c => { c = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(c * 255))); };
const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = srgb2lin(i);

function rgb2lab(r, g, b, out, o) {
  const R = LUT[r], G = LUT[g], B = LUT[b];
  let x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  let y = (R * 0.2126 + G * 0.7152 + B * 0.0722);
  let z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  x = f(x); y = f(y); z = f(z);
  out[o] = 116 * y - 16; out[o + 1] = 500 * (x - y); out[o + 2] = 200 * (y - z);
}
function lab2rgb(L, a, b) {
  let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
  const fi = t => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  x = fi(x) * 0.95047; y = fi(y); z = fi(z) * 1.08883;
  const R = x * 3.2406 + y * -1.5372 + z * -0.4986;
  const G = x * -0.9689 + y * 1.8758 + z * 0.0415;
  const B = x * 0.0557 + y * -0.2040 + z * 1.0570;
  return [lin2srgb(R), lin2srgb(G), lin2srgb(B)];
}
const hex = c => '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join('');
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

const toLab = c => { const l = new Float32Array(3); rgb2lab(c[0], c[1], c[2], l, 0); return l; };
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/* CIEDE2000: difference as the eye sees it (CIE76 overstates it for saturated blues and dark colours,
   which is why nearly identical blues were not being merged) */
function deltaE2000(l1, l2) {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2, Cm7 = Cm ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cm7 / (Cm7 + 6103515625)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = h2p - h1p;
  if (C1p * C2p === 0) dhp = 0; else if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2, Cpm7 = Cpm ** 7;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) { if (Math.abs(h1p - h2p) > 180) hpm += h1p + h2p < 360 ? 360 : -360; hpm /= 2; }
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTh = 30 * Math.exp(-(((hpm - 275) / 25) ** 2)), Rc = 2 * Math.sqrt(Cpm7 / (Cpm7 + 6103515625));
  const Sl = 1 + 0.015 * (Lpm - 50) ** 2 / Math.sqrt(20 + (Lpm - 50) ** 2), Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/* colour families by hue (Lab hue angle), in display order; very low chroma = greys */
// (in Lab pure red is ~40°, yellow ~100°, green ~135°, cyan ~200°, pure blue ~306°, magenta ~328°)
const FAMILIES = [
  ['Rojos', h => h < 45 || h >= 352], ['Naranjas', h => h >= 45 && h < 80, 'Naranjas, pieles y marrones'], ['Amarillos', h => h >= 80 && h < 110],
  ['Verdes', h => h >= 110 && h < 185], ['Cianes', h => h >= 185 && h < 245], ['Azules', h => h >= 245 && h < 312],
  ['Morados', h => h >= 312 && h < 335], ['Rosas', h => h >= 335 && h < 352]
];
/* group colours ([r,g,b,...]) into families, each from dark to light: [{ name, colors }] */
function groupColours(cols) {
  const groups = FAMILIES.map(([name, , title]) => ({ name, title: title || name, colors: [] })), greys = { name: 'Grises', title: 'Grises, blancos y negros', colors: [] };
  for (const c of cols) {
    const l = toLab(c), C = Math.hypot(l[1], l[2]);
    let g = greys;
    if (C >= 9) { const h = (Math.atan2(l[2], l[1]) * 180 / Math.PI + 360) % 360; g = groups[FAMILIES.findIndex(([, t]) => t(h))]; }
    g.colors.push({ c, L: l[0] });
  }
  return [...groups, greys].filter(g => g.colors.length)
    .map(g => ({ name: g.name, title: g.title, colors: g.colors.sort((a, b) => a.L - b.L).map(o => o.c) }));
}
/* merge colours closer than maxDE (CIEDE2000): the most used one of each close group survives.
   entries: [{ key, rgb, count }] -> Map key -> rgb of the colour it becomes (only changed ones) */
function mergeMap(entries, maxDE) {
  const out = new Map(); if (!(maxDE > 0)) return out;
  const kept = [];
  for (const e of [...entries].sort((a, b) => b.count - a.count)) {
    const l = toLab(e.rgb);
    let best = null, bd = maxDE;
    for (const k of kept) { const d = deltaE2000(l, k.l); if (d <= bd) { bd = d; best = k; } }
    if (best) out.set(e.key, best.rgb); else kept.push({ l, rgb: e.rgb });
  }
  return out;
}

export { rgb2lab, lab2rgb, hex, hex2rgb, toLab, deltaE, deltaE2000, groupColours, mergeMap };

/* deterministic RNG (k-means seeds) */
let seed = 7;
export const rng = {
  reset(s = 7) { seed = s; },
  next: () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
};
