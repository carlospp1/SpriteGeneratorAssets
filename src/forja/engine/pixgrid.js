/* Pixel grid around the pointer and outline of the pixels a tool is about to touch (Photoshop style).
   Shared by the pixel editor and the brushes of the generator and line art. Everything is drawn in
   screen (CSS) px: ox, oy = where pixel 0,0 starts, k = screen px per image px. */
export const MIN_CELL = 4;   // smaller cells are too dense for a grid to help
const LEVELS = 6;     // alpha steps of the fading grid (one path each)

/* grid lines of the cells within R cells of (cx, cy) (image px), fading out with the distance;
   a dark and a light line side by side so it reads on any colour */
export function grid(ctx, { ox, oy, k, cx, cy, R, w, h }) {
  if (k < MIN_CELL) return;
  const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w, Math.ceil(cx + R));
  const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h, Math.ceil(cy + R));
  const paths = Array.from({ length: LEVELS }, () => new Path2D());
  const seg = (mx, my, ax, ay, bx, by) => {
    const a = 1 - Math.hypot(mx - cx, my - cy) / R; if (a <= 0) return;
    const p = paths[Math.min(LEVELS - 1, Math.floor(a * LEVELS))];
    p.moveTo(ox + ax * k, oy + ay * k); p.lineTo(ox + bx * k, oy + by * k);
  };
  for (let i = x0; i <= x1; i++) for (let j = y0; j < y1; j++) seg(i, j + 0.5, i, j, i, j + 1);
  for (let j = y0; j <= y1; j++) for (let i = x0; i < x1; i++) seg(i + 0.5, j, i, j, i + 1, j);
  paths.forEach((p, n) => {
    const a = (n + 1) / LEVELS;
    ctx.save(); ctx.setLineDash([]); ctx.lineWidth = 1;
    ctx.translate(0.5, 0.5); ctx.strokeStyle = `rgba(0,0,0,${0.4 * a})`; ctx.stroke(p);
    ctx.translate(1, 1); ctx.strokeStyle = `rgba(255,255,255,${0.3 * a})`; ctx.stroke(p);
    ctx.restore();
  });
}

/* outline of a set of pixels ([[x, y]], image px) as screen segments */
function outline(pts, ox, oy, k) {
  const set = new Set(pts.map(([x, y]) => x + ',' + y)), has = (x, y) => set.has(x + ',' + y), p = new Path2D();
  const line = (ax, ay, bx, by) => { p.moveTo(ox + ax * k, oy + ay * k); p.lineTo(ox + bx * k, oy + by * k); };
  for (const [x, y] of pts) {
    if (!has(x, y - 1)) line(x, y, x + 1, y);
    if (!has(x, y + 1)) line(x, y + 1, x + 1, y + 1);
    if (!has(x - 1, y)) line(x, y, x, y + 1);
    if (!has(x + 1, y)) line(x + 1, y, x + 1, y + 1);
  }
  return p;
}
/* the pixels the tool will touch: dark outline with a white line inside it */
export function cursor(ctx, pts, ox, oy, k) {
  if (!pts.length) return;
  const p = outline(pts, ox, oy, k);
  ctx.save(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; ctx.stroke(p);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(p);
  ctx.restore();
}
/* round brush outline when the pixels are too small (or too many) to draw one by one */
export function ring(ctx, x, y, r) {
  ctx.save(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(x, y, Math.max(r, 2), 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

/* a screen-resolution layer over a canvas shown scaled (the canvas itself is at image resolution), for the
   hover feedback: draw(fn) calls fn(ctx, k) with ctx in CSS px from the canvas's top-left corner and
   k = CSS px per canvas px. The canvas's parent must be positioned (.stage, .fwin-body). */
export function overlay(canvas) {
  let o = null;
  const hide = () => { if (o) o.hidden = true; };
  function draw(fn) {
    if (canvas.hidden || !canvas.width || !canvas.isConnected) { hide(); return; }
    if (!o) { o = document.createElement('canvas'); o.className = 'px-over'; o.setAttribute('aria-hidden', 'true'); }
    if (o.parentElement !== canvas.parentElement) canvas.parentElement.appendChild(o);
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    Object.assign(o.style, { left: canvas.offsetLeft + 'px', top: canvas.offsetTop + 'px', width: r.width + 'px', height: r.height + 'px' });
    o.width = Math.round(r.width * dpr); o.height = Math.round(r.height * dpr);
    const cx = o.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    o.hidden = false; fn(cx, r.width / canvas.width);
  }
  return { draw, hide };
}
