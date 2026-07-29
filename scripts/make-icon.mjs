/**
 * Dibuja el icono de la app en RGBA crudo y lo convierte a PNG con FFmpeg.
 * Se hace a mano para no sumar una dependencia de dibujo solo para esto.
 */
import { spawn } from 'node:child_process';
import { FFMPEG_PATH } from '../src/ffmpegPaths.js';

const S = 512;
const buf = new Uint8Array(S * S * 4);

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#14151a');
const ACCENT = hex('#ff7a1a');
const ACCENT2 = hex('#ff9142');
const LIGHT = hex('#eceef2');
const GREY = hex('#9aa0ac');

function px(x, y, [r, g, b], a = 1) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  const inv = 1 - a;
  buf[i] = buf[i] * inv + r * a;
  buf[i + 1] = buf[i + 1] * inv + g * a;
  buf[i + 2] = buf[i + 2] * inv + b * a;
  buf[i + 3] = 255;
}

/** Circulo con bordes suavizados. */
function circle(cx, cy, radius, color, alpha = 1) {
  for (let y = Math.floor(cy - radius - 2); y <= cy + radius + 2; y++) {
    for (let x = Math.floor(cx - radius - 2); x <= cx + radius + 2; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const edge = radius - d;
      if (edge > 0) px(x, y, color, alpha * Math.min(1, edge));
    }
  }
}

/** Rectangulo de esquinas redondeadas. */
function roundRect(x0, y0, w, h, radius, color, alpha = 1) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const dx = Math.max(x0 + radius - x, x - (x0 + w - radius - 1), 0);
      const dy = Math.max(y0 + radius - y, y - (y0 + h - radius - 1), 0);
      const d = Math.hypot(dx, dy);
      const edge = radius - d;
      if (dx === 0 && dy === 0) px(x, y, color, alpha);
      else if (edge > 0) px(x, y, color, alpha * Math.min(1, edge));
    }
  }
}

// Fondo
roundRect(0, 0, S, S, 96, BG);

// Salpicaduras del spray
circle(256, 272, 130, ACCENT);
circle(192, 208, 34, ACCENT2, 0.9);
circle(336, 336, 26, ACCENT2, 0.85);
circle(146, 336, 20, ACCENT, 0.75);
circle(340, 196, 15, ACCENT, 0.65);
circle(256, 404, 12, ACCENT, 0.6);

// Lata
roundRect(196, 92, 120, 62, 16, LIGHT);
roundRect(230, 56, 54, 44, 12, GREY);

const ff = spawn(FFMPEG_PATH, [
  '-y',
  '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${S}x${S}`, '-i', 'pipe:0',
  '-frames:v', '1',
  process.argv[2] || 'build/icon.png',
], { stdio: ['pipe', 'inherit', 'inherit'] });

ff.stdin.end(Buffer.from(buf));
ff.on('close', (code) => process.exit(code));
