import { spawn } from 'node:child_process';
import { FFMPEG_PATH, FFPROBE_PATH } from './ffmpegPaths.js';

/**
 * Lado corto al que se cachean los frames de animacion.
 * Se guarda el aspecto original (no se recorta todavia) para que el usuario
 * pueda mover el recuadro 1:1 sin volver a procesar el video.
 */
export const ANIM_CACHE_SHORT_SIDE = 512;

function run(cmd, args, { capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true });
    const stdoutChunks = [];
    const stderrChunks = [];
    if (capture) proc.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    else proc.stdout.resume();
    proc.stderr.on('data', (chunk) => stderrChunks.push(chunk));
    proc.on('error', (err) => {
      if (err.code === 'ENOENT') {
        const error = new Error(`No se encontro "${cmd}" en el PATH.`);
        error.code = 'FFMPEG_MISSING';
        reject(error);
      } else {
        reject(err);
      }
    });
    proc.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(
          `${cmd} termino con codigo ${code}: ${Buffer.concat(stderrChunks).toString('utf8').slice(-1500)}`,
        );
        error.code = 'FFMPEG_FAILED';
        reject(error);
        return;
      }
      resolve(Buffer.concat(stdoutChunks));
    });
  });
}

/** Devuelve duracion, dimensiones y cantidad de frames del archivo. */
export async function probeMedia(filePath) {
  const out = await run(FFPROBE_PATH, [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,nb_frames,avg_frame_rate',
    '-show_entries', 'format=duration',
    '-of', 'json',
    filePath,
  ]);

  let parsed;
  try {
    parsed = JSON.parse(out.toString('utf8'));
  } catch {
    const error = new Error('No se pudo leer el archivo.');
    error.code = 'PROBE_FAILED';
    throw error;
  }

  const stream = parsed.streams?.[0];
  if (!stream) {
    const error = new Error('El archivo no contiene video.');
    error.code = 'NO_VIDEO_STREAM';
    throw error;
  }

  let duration = parseFloat(parsed.format?.duration);
  let nbFrames = parseInt(stream.nb_frames, 10);

  // Los GIF suelen no reportar duracion; la estimamos desde los frames y el framerate.
  if (!Number.isFinite(duration) || duration <= 0) {
    const [num, den] = String(stream.avg_frame_rate || '0/1').split('/').map(Number);
    const fps = den ? num / den : 0;
    duration = Number.isFinite(nbFrames) && fps > 0 ? nbFrames / fps : 0;
  }
  if (!Number.isFinite(nbFrames) || nbFrames <= 0) nbFrames = 0;

  return {
    width: stream.width,
    height: stream.height,
    duration: duration > 0 ? duration : 0,
    nbFrames,
  };
}

/** Filtro de recorte a partir de un rectangulo normalizado (0..1). */
function cropFilter(rect) {
  if (!rect) return null;
  const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
  const x = clamp01(rect.x);
  const y = clamp01(rect.y);
  const w = Math.max(0.01, Math.min(clamp01(rect.w), 1 - x));
  const h = Math.max(0.01, Math.min(clamp01(rect.h), 1 - y));
  return `crop=iw*${w.toFixed(6)}:ih*${h.toFixed(6)}:iw*${x.toFixed(6)}:ih*${y.toFixed(6)}`;
}

/** Genera un PNG de vista previa a partir de cualquier formato que lea FFmpeg. */
export async function renderPreviewPng(filePath, outPath, maxSize = 640) {
  await run(FFMPEG_PATH, [
    '-y',
    '-i', filePath,
    '-frames:v', '1',
    '-vf', `scale='min(${maxSize},iw)':'min(${maxSize},ih)':force_original_aspect_ratio=decrease`,
    outPath,
  ], { capture: false });
}

/**
 * Extrae un unico frame RGBA de una imagen, con recorte opcional.
 * @param {{x,y,w,h}|null} rect recorte normalizado; si es null, usa la imagen entera
 */
export async function extractImageRGBA(filePath, outWidth, outHeight, rect = null) {
  const filters = [];
  const crop = cropFilter(rect);
  if (crop) filters.push(crop);
  filters.push(`scale=${outWidth}:${outHeight}`);

  const buf = await run(FFMPEG_PATH, [
    '-y',
    '-i', filePath,
    '-frames:v', '1',
    '-vf', filters.join(','),
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    'pipe:1',
  ]);

  const expected = outWidth * outHeight * 4;
  if (buf.length < expected) {
    const error = new Error('No se pudo procesar la imagen.');
    error.code = 'DECODE_FAILED';
    throw error;
  }
  return buf.subarray(0, expected);
}

/**
 * Extrae frames candidatos de un video/gif, repartidos de forma pareja.
 * Los cachea con el aspecto original para poder recortarlos despues sin
 * volver a invocar FFmpeg, y escribe PNGs de vista previa en previewDir.
 */
export async function extractCandidateFrames(filePath, previewDir, maxCandidates = 30) {
  const info = await probeMedia(filePath);

  // Escalamos para que el lado corto llegue al tope, sin agrandar el original.
  const shortSide = Math.min(info.width, info.height);
  const scale = Math.min(1, ANIM_CACHE_SHORT_SIDE / shortSide);
  // Los lados pares evitan problemas con algunos codecs.
  const cacheW = Math.max(2, Math.round(info.width * scale / 2) * 2);
  const cacheH = Math.max(2, Math.round(info.height * scale / 2) * 2);

  let candidateCount = maxCandidates;
  if (info.nbFrames > 0) candidateCount = Math.min(maxCandidates, info.nbFrames);
  candidateCount = Math.max(candidateCount, 1);

  const sampleFps = info.duration > 0
    ? Math.max(candidateCount / info.duration, 0.05)
    : 10;

  const baseFilter = `fps=${sampleFps.toFixed(5)},scale=${cacheW}:${cacheH}`;

  const raw = await run(FFMPEG_PATH, [
    '-y',
    '-i', filePath,
    '-vf', baseFilter,
    '-frames:v', String(candidateCount),
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    'pipe:1',
  ]);

  const frameBytes = cacheW * cacheH * 4;
  const actualCount = Math.floor(raw.length / frameBytes);
  if (actualCount === 0) {
    const error = new Error('No se pudieron extraer frames.');
    error.code = 'DECODE_FAILED';
    throw error;
  }

  // Vistas previas para la grilla de seleccion y para el recortador.
  await run(FFMPEG_PATH, [
    '-y',
    '-i', filePath,
    '-vf', `${baseFilter},scale='min(256,iw)':-2`,
    '-frames:v', String(actualCount),
    `${previewDir}/frame_%03d.png`,
  ], { capture: false });

  const frames = [];
  for (let i = 0; i < actualCount; i++) {
    frames.push(raw.subarray(i * frameBytes, (i + 1) * frameBytes));
  }

  return { frames, width: cacheW, height: cacheH, info, count: actualCount };
}
