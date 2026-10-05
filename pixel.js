// Tiny pixel-art toolkit. Scenes are drawn at 192×108 and scaled up by CSS.
export const W = 192, H = 108;

export function rect(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
export const px = (c, x, y, col) => rect(c, x, y, 1, 1, col);
export const hline = (c, x, y, w, col) => rect(c, x, y, w, 1, col);
export const vline = (c, x, y, h, col) => rect(c, x, y, 1, h, col);

// Checkerboard of two colors, a classic pixel-art "gradient".
export function dither(c, x, y, w, h, col, phase = 0) {
  c.fillStyle = col;
  for (let j = 0; j < h; j++) for (let i = (j + phase) % 2; i < w; i += 2) c.fillRect(x + i, y + j, 1, 1);
}

// Sparse dither (1 of 4 pixels) for soft light.
export function speckle(c, x, y, w, h, col) {
  c.fillStyle = col;
  for (let j = 0; j < h; j += 2) for (let i = (j / 2) % 2 ? 1 : 3; i < w; i += 4) c.fillRect(x + i, y + j, 1, 1);
}

// Pixel-y filled circle.
export function disc(c, cx, cy, r, col) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    c.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

// Straight 1px line (Bresenham).
export function line(c, x0, y0, x1, y1, col) {
  c.fillStyle = col;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    c.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// rows: array of strings, pal: { char: color }, '.' or ' ' = transparent.
export function sprite(c, rows, pal, x, y, { scale = 1, alpha = 1, flip = false } = {}) {
  const prev = c.globalAlpha;
  c.globalAlpha = alpha;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i];
      const col = pal[ch];
      if (!col) continue;
      c.fillStyle = col;
      c.fillRect(Math.round(x + i * scale), Math.round(y + j * scale), scale, scale);
    }
  });
  c.globalAlpha = prev;
}

// Deterministic pseudo random so scenes don't reshuffle every frame.
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// Tiny label text; crisp enough at scene scale.
export function text(c, str, x, y, col, size = 5) {
  c.fillStyle = col;
  c.font = `${size}px monospace`;
  c.textBaseline = 'top';
  c.fillText(str, x, y);
}

export function setupCanvas(canvas) {
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  c.imageSmoothingEnabled = false;
  return c;
}
