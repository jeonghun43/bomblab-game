// Pixel art: portraits (16×16) and scene backgrounds (192×108), all drawn in code.
import { W, H, rect, px, hline, vline, speckle, disc, line, sprite, text } from './pixel.js';

// ---------- portraits ----------
export const PORTRAITS = {
  chief: {
    rows: [
      '....kkkkkkkk....',
      '...khhhhhhHHk...',
      '..khhhhhhhhHHk..',
      '..khhhhhhhhhhk..',
      '.kkkkkkkkkkkkkk.',
      '..kssssssssssk..',
      '..ksbbsssbbsSk..',
      '..kseesssseesk..',
      '..kssssSSssssk..',
      '..ksmmmmmmmmsk..',
      '..kssssrrssssk..',
      '...kssssssssk...',
      '....kSSSSSSk....',
      '..kvvvvoovvvvk..',
      '.kvvvvvoovvvvvk.',
      'kvvggvvoovvvvvvk',
    ],
    pal: { k: '#141414', h: '#56663a', H: '#7f9150', s: '#e3aa7c', S: '#b87c52', b: '#3a2a1c',
      e: '#1a1a1a', m: '#3a2a1c', r: '#8a3f30', v: '#2e3a24', o: '#ff6a1f', g: '#5a5f63' },
  },
};

export function drawPortrait(canvas, id, { alpha = 1 } = {}) {
  const p = PORTRAITS[id];
  canvas.width = 16; canvas.height = 16;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 16, 16);
  if (p) sprite(c, p.rows, p.pal, 0, 0, { alpha });
}

// ---------- shared props ----------
function rackUnit(c, x, y, w, t, seed) {
  rect(c, x, y, w, 5, '#1f252e');
  hline(c, x, y, w, '#2a313b');
  for (let k = 0; k < 3; k++) {
    const on = ((seed * 7 + k * 13 + Math.floor(t / (2 + k))) % 5) !== 0;
    px(c, x + w - 3 - k * 2, y + 2, on ? (k === 2 && seed % 3 === 0 ? '#f2b33d' : '#3dff8f') : '#1d3b2a');
  }
}
function rack(c, x, w, t, seed) {
  rect(c, x, 14, w, 74, '#0b0e12');
  rect(c, x + 1, 15, w - 2, 72, '#161b22');
  for (let u = 0; u < 11; u++) rackUnit(c, x + 2, 17 + u * 6, w - 4, t, seed + u);
}
function lcd(c, x, y, str, on) {
  rect(c, x, y, str.length * 4 + 2, 7, '#1a0505');
  if (on) text(c, str, x + 1, y + 1, '#ff3b30', 6);
}

// ---------- scenes ----------
export const SCENES = {
  // 폭탄 해체반 A
  van: {
    name: 'EOD 지휘 차량',
    spots: { radio: [4, 40, 22, 22], manual: [80, 20, 32, 16], map: [144, 12, 44, 36], bomb: [64, 52, 30, 16], laptop: [102, 46, 34, 22] },
    draw(c, t) {
      rect(c, 0, 0, W, H, '#26292b');
      for (let x = 0; x < W; x += 24) {
        vline(c, x, 6, 78, '#1d2022');
        for (let y = 10; y < 84; y += 18) { px(c, x + 2, y, '#3a3e41'); px(c, x + 21, y, '#3a3e41'); }
      }
      rect(c, 0, 0, W, 6, '#161819');
      rect(c, 64, 2, 64, 3, '#e9e4c4');
      speckle(c, 56, 5, 80, 10, 'rgba(233,228,196,.18)');
      rect(c, 0, 84, W, 24, '#1a1c1d');
      hline(c, 0, 84, W, '#3b3f42');
      for (let y = 87; y < H; y += 4) for (let x = (y % 8 ? 0 : 4); x < W; x += 8) { px(c, x, y, '#2c2f31'); px(c, x + 1, y + 1, '#2c2f31'); }
      // monitor bank
      for (let i = 0; i < 3; i++) {
        const x = 6 + i * 22;
        rect(c, x, 14, 20, 17, '#0c0d0e');
        rect(c, x + 1, 15, 18, 14, '#0b2416');
        for (let k = 0; k < 18; k++) {
          const y = 22 + Math.round(Math.sin((k + t * 1.5 + i * 5) / 2.2) * (i === 1 ? 4 : 2.5));
          px(c, x + 1 + k, y, '#46e38a');
        }
        rect(c, x + 8, 31, 4, 3, '#0c0d0e');
      }
      rect(c, 4, 34, 68, 5, '#33373a');
      for (let i = 0; i < 8; i++) px(c, 8 + i * 8, 36, (t + i) % 5 === 0 ? '#ff4d3d' : '#f2b33d');
      // radio
      rect(c, 8, 50, 16, 11, '#2f3336');
      rect(c, 10, 52, 7, 7, '#1b1d1f');
      for (let j = 0; j < 3; j++) hline(c, 11, 53 + j * 2, 5, '#33373a');
      vline(c, 21, 43, 7, '#6a6f73');
      px(c, 21, 42, t % 4 < 2 ? '#ff4d3d' : '#552222');
      // shelf with manual binders
      rect(c, 80, 34, 36, 2, '#4a4f53');
      ['#ff6a1f', '#3b6ea5', '#caa53b', '#6c7a4a', '#8a3f30'].forEach((col, i) => {
        rect(c, 82 + i * 6, 22, 5, 12, col);
        hline(c, 82 + i * 6, 25, 5, 'rgba(0,0,0,.35)');
      });
      // campus map
      rect(c, 146, 14, 40, 32, '#d8cfa6');
      hline(c, 146, 26, 40, '#a99c70'); vline(c, 160, 14, 32, '#a99c70'); vline(c, 174, 14, 32, '#a99c70');
      rect(c, 149, 17, 8, 6, '#b9ae84'); rect(c, 163, 29, 8, 10, '#b9ae84'); rect(c, 177, 17, 6, 6, '#b9ae84'); rect(c, 177, 30, 7, 12, '#b9ae84');
      if (t % 6 < 4) { disc(c, 167, 33, 1, '#e0302a'); vline(c, 167, 34, 3, '#7a1a16'); }
      // table
      rect(c, 56, 66, 100, 4, '#5b4a36');
      rect(c, 56, 70, 100, 2, '#3e3226');
      rect(c, 60, 72, 3, 14, '#3e3226'); rect(c, 149, 72, 3, 14, '#3e3226');
      // dummy bomb
      rect(c, 66, 55, 26, 11, '#6b5a3a'); hline(c, 66, 55, 26, '#85704a');
      lcd(c, 69, 57, '0:27', t % 8 < 5);
      line(c, 92, 58, 104, 63, '#e0302a'); line(c, 92, 61, 104, 65, '#3b6ea5');
      // laptop
      rect(c, 104, 64, 30, 2, '#8b9096');
      rect(c, 106, 48, 26, 16, '#2a2e33');
      rect(c, 108, 50, 22, 12, '#10202a');
      hline(c, 110, 52, 10, '#6fd3ff'); hline(c, 110, 55, 16, '#3a8ab0'); hline(c, 110, 58, 8, '#3a8ab0');
      if (t % 4 < 2) rect(c, 119, 58, 2, 1, '#6fd3ff');
    },
  },

  // 폭탄 해체반 B
  server: {
    name: '공대 5층 서버실',
    spots: { poster: [60, 16, 28, 36], rack: [132, 14, 56, 74], bomb: [92, 30, 32, 38] },
    draw(c, t) {
      rect(c, 0, 0, W, H, '#12161c');
      rect(c, 0, 0, W, 8, '#0c0f13');
      hline(c, 0, 8, W, '#3a78c8');
      speckle(c, 0, 9, W, 12, 'rgba(58,120,200,.16)');
      rect(c, 0, 88, W, 20, '#1a1f26');
      for (let x = 0; x < W; x += 12) vline(c, x, 88, 20, '#232a33');
      hline(c, 0, 96, W, '#232a33');
      rack(c, 4, 26, t, 1); rack(c, 32, 26, t, 4); rack(c, 132, 26, t, 9); rack(c, 162, 26, t, 13);
      // calling-convention poster
      rect(c, 62, 18, 24, 32, '#e6e2d3');
      rect(c, 62, 18, 24, 5, '#c0392b');
      ['%rdi', '%rsi', '%rdx', '%rcx'].forEach((r, i) => { text(c, r, 64, 25 + i * 6, '#1a1a1a', 5); hline(c, 78, 28 + i * 6, 6, '#8a8577'); });
      // bomb rack
      rack(c, 94, 28, t, 20);
      rect(c, 97, 38, 22, 26, '#3b3b3b');
      rect(c, 97, 38, 22, 2, '#555');
      lcd(c, 99, 41, t % 8 < 5 ? '9:59' : '9:58', true);
      rect(c, 99, 52, 8, 9, '#c8b27a'); rect(c, 109, 52, 8, 9, '#c8b27a');
      hline(c, 99, 56, 18, '#2a2a2a');
      line(c, 101, 50, 97, 60, '#e0302a'); line(c, 115, 50, 119, 60, '#3b6ea5');
      if (t % 3 === 0) px(c, 117, 41, '#ff3b30');
      // laptop cart wired to the bomb
      rect(c, 62, 76, 26, 3, '#4a4f55'); vline(c, 64, 79, 9, '#4a4f55'); vline(c, 85, 79, 9, '#4a4f55');
      rect(c, 64, 64, 22, 12, '#2a2e33'); rect(c, 66, 66, 18, 8, '#10202a');
      hline(c, 67, 68, 10, '#6fd3ff'); hline(c, 67, 71, 14, '#3a8ab0');
      line(c, 86, 70, 97, 60, '#888');
    },
  },

};
