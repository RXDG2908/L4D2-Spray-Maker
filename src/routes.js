import express, { Router } from 'express';
import multer from 'multer';
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  extractImageRGBA,
  extractCandidateFrames,
  renderPreviewPng,
} from './ffmpegUtils.js';
import { buildVtf, cropRgba } from './vtfBuilder.js';
import { buildVmt, buildUiVmt, buildLogoCommand, ENGINE_SPRAY_FPS } from './vmtBuilder.js';
import { encodeTga32 } from './tgaEncoder.js';
import { locateL4D2, setGamePath, clearGamePath } from './steamLocator.js';
import { createSession, getSession, destroySession } from './sessionStore.js';
import {
  listInstalledSprays,
  listSprayFiles,
  resolveSprayFile,
  renameSpray,
  deleteSpray,
} from './sprayLibrary.js';
import { readVtfFrames } from './vtfReader.js';
import { sanitizeName } from './sprayName.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

export const MAX_ANIM_FRAMES = 10;

/** Lados validos: potencia de dos, como exige "Nearest Power Of 2" de VTFEdit. */
const VALID_SIDES = new Set([64, 128, 256, 512, 1024]);
const ANIM_SIDES = new Set([64, 128, 256]);
const QUALITIES = new Set(['uncompressed', 'dxt5', 'dxt1']);

/** Los sprays propios van en logos/custom, separados de los de Valve. */
const SPRAY_FOLDER = 'custom';

/** Normaliza el rectangulo de recorte que manda la interfaz. */
function parseCrop(raw) {
  if (!raw) return null;
  const rect = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!rect) return null;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const x = num(rect.x); const y = num(rect.y);
  const w = num(rect.w); const h = num(rect.h);
  if ([x, y, w, h].some((v) => v === null)) return null;
  if (w <= 0 || h <= 0) return null;

  // Un recorte que cubre todo no hace falta aplicarlo.
  if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) return null;
  return { x, y, w, h };
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function fail(res, status, code, message) {
  res.status(status).json({ error: code, message });
}

export const router = Router();

/* ---------------------------------------------------------------- Steam --- */

router.get('/api/steam', async (_req, res) => {
  try {
    res.json(await locateL4D2());
  } catch (err) {
    console.error(err);
    res.json({ found: false });
  }
});

/** Guarda la carpeta del juego elegida a mano. */
router.post('/api/steam/locate', express.json(), (req, res) => {
  const result = setGamePath(req.body?.path);
  if (!result.ok) {
    return fail(res, 400, 'INVALID_GAME_PATH',
      'Esa carpeta no parece una instalacion de Left 4 Dead 2.');
  }
  res.json(result);
});

/** Vuelve a la deteccion automatica. */
router.post('/api/steam/auto', async (_req, res, next) => {
  try {
    clearGamePath();
    res.json(await locateL4D2());
  } catch (err) {
    next(err);
  }
});

/**
 * Nombres de sprays ya instalados, para que la interfaz proponga uno libre
 * y no pise el trabajo anterior del usuario.
 */
router.get('/api/sprays', async (_req, res) => {
  try {
    const location = await locateL4D2();
    if (!location.found) return res.json({ names: [] });

    const names = new Set();
    const folders = [
      path.join(location.logosDir, SPRAY_FOLDER),
      location.spraysDir,
    ];

    for (const dir of folders) {
      try {
        for (const entry of await readdir(dir)) {
          const ext = path.extname(entry).toLowerCase();
          if (['.vtf', '.vmt', '.tga', '.bmp', '.jpg', '.png'].includes(ext)) {
            names.add(path.basename(entry, path.extname(entry)).toLowerCase());
          }
        }
      } catch {
        // La carpeta puede no existir todavia; no es un error.
      }
    }

    res.json({ names: [...names] });
  } catch (err) {
    console.error(err);
    res.json({ names: [] });
  }
});

/* --------------------------------------------------- sprays instalados --- */

/** Lados admitidos para la vista previa, para no decodificar de mas por capricho. */
const PREVIEW_MAX_SIDES = new Set([64, 128, 256, 512]);

/** Inventario completo de lo que hay en las carpetas del juego. */
router.get('/api/sprays/installed', async (_req, res) => {
  try {
    res.json(await listInstalledSprays());
  } catch (err) {
    console.error(err);
    res.json({ found: false, sprays: [] });
  }
});

/**
 * Pixeles RGBA crudos de un spray instalado, listos para volcarlos en un canvas.
 *
 * Se manda binario en vez de PNG porque el VTF ya trae hecha la cadena de
 * mipmaps: se lee el nivel que corresponde al tamaño pedido y no hay que
 * reescalar ni recomprimir nada.
 */
router.get('/api/sprays/pixels', async (req, res) => {
  const file = await resolveSprayFile(String(req.query.location || ''), req.query.name);
  if (!file) {
    return fail(res, 404, 'SPRAY_NOT_FOUND', 'Ese spray ya no esta en la carpeta.');
  }

  const requested = Number(req.query.max);
  const maxSide = PREVIEW_MAX_SIDES.has(requested) ? requested : 128;

  try {
    const decoded = await readVtfFrames(file, maxSide);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Spray-Width', String(decoded.width));
    res.setHeader('X-Spray-Height', String(decoded.height));
    res.setHeader('X-Spray-Frames', String(decoded.frames.length));
    res.end(Buffer.concat(decoded.frames));
  } catch {
    // Un VTF ilegible no es un fallo del servidor: puede estar corrupto o venir
    // de una herramienta rara. La lista ya lo marca como sin vista previa.
    fail(res, 422, 'SPRAY_UNREADABLE', 'No se pudo leer ese archivo VTF.');
  }
});

/** Archivos que componen un spray, para poder avisar antes de borrarlo. */
router.get('/api/sprays/files', async (req, res) => {
  const result = await listSprayFiles(String(req.query.location || ''), req.query.name);
  if (!result.ok) {
    return fail(res, 404, result.error, 'Ese spray ya no esta en la carpeta.');
  }
  res.json(result);
});

/**
 * Renombra un spray entero. No basta con mover archivos: los .vmt llevan dentro
 * la ruta de la textura y hay que reescribirla, cosa que hace sprayLibrary.
 */
router.post('/api/sprays/rename', express.json(), async (req, res) => {
  const result = await renameSpray(
    String(req.body?.location || ''),
    req.body?.name,
    req.body?.newName,
  );

  if (!result.ok) {
    const status = result.error === 'NAME_TAKEN' ? 409 : 400;
    return fail(res, status, result.error, 'No se pudo renombrar el spray.');
  }
  res.json(result);
});

/** Borra un spray con todas sus piezas. */
router.post('/api/sprays/delete', express.json(), async (req, res) => {
  const result = await deleteSpray(String(req.body?.location || ''), req.body?.name);
  if (!result.ok) {
    const status = result.error === 'SPRAY_NOT_FOUND' ? 404 : 400;
    return fail(res, status, result.error, 'No se pudo borrar el spray.');
  }
  res.json(result);
});

/* -------------------------------------------------------------- Analisis --- */

/** Sube un video/gif y devuelve los frames candidatos para elegir. */
router.post('/api/analyze', upload.single('file'), async (req, res, next) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', 'No se recibio ningun archivo.');

  let session;
  try {
    session = await createSession();
    const ext = path.extname(req.file.originalname) || '.mp4';
    const inputPath = path.join(session.dir, `input${ext}`);
    await writeFile(inputPath, req.file.buffer);

    const previewDir = path.join(session.dir, 'previews');
    await mkdir(previewDir, { recursive: true });

    const { frames, width, height, count, info } = await extractCandidateFrames(inputPath, previewDir);

    // Cacheamos los frames crudos para no volver a invocar ffmpeg al generar.
    await writeFile(path.join(session.dir, 'frames.raw'), Buffer.concat(frames));
    session.frameCount = count;
    session.frameWidth = width;
    session.frameHeight = height;

    const previews = await readdir(previewDir);

    res.json({
      sessionId: session.id,
      frameCount: Math.min(count, previews.length),
      frameWidth: width,
      frameHeight: height,
      duration: info.duration,
      sourceWidth: info.width,
      sourceHeight: info.height,
      maxSelectable: MAX_ANIM_FRAMES,
      engineFps: ENGINE_SPRAY_FPS,
    });
  } catch (err) {
    if (session) destroySession(session.id);
    next(err);
  }
});

/** Sirve la vista previa PNG de un frame candidato. */
router.get('/api/frames/:sessionId/:index', (req, res) => {
  const session = getSession(req.params.sessionId);
  if (!session) return fail(res, 404, 'SESSION_EXPIRED', 'La sesion expiro.');

  const index = parseInt(req.params.index, 10);
  if (!Number.isInteger(index) || index < 0 || index >= session.frameCount) {
    return fail(res, 400, 'BAD_INDEX', 'Frame invalido.');
  }

  const filename = `frame_${String(index + 1).padStart(3, '0')}.png`;
  res.sendFile(path.join(session.dir, 'previews', filename));
});

/**
 * Vista previa PNG generada en el servidor.
 * El navegador no sabe dibujar TGA (ni algunos BMP con perfil ICC), asi que
 * el frontend recurre a esto cuando falla la vista previa local.
 */
router.post('/api/preview', upload.single('file'), async (req, res, next) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', 'No se recibio ningun archivo.');

  let session;
  try {
    session = await createSession();
    const ext = path.extname(req.file.originalname) || '.tga';
    const inputPath = path.join(session.dir, `input${ext}`);
    await writeFile(inputPath, req.file.buffer);

    const previewPath = path.join(session.dir, 'preview.png');
    await renderPreviewPng(inputPath, previewPath);

    // El callback de sendFile corre despues, asi que guardamos el id aparte.
    const sessionId = session.id;
    session = null;
    res.type('png');
    res.sendFile(previewPath, () => destroySession(sessionId));
  } catch (err) {
    if (session) destroySession(session.id);
    next(err);
  }
});

/* ------------------------------------------------------------ Generacion --- */

async function readCachedFrames(session, indices) {
  const raw = await readFile(path.join(session.dir, 'frames.raw'));
  const frameBytes = session.frameWidth * session.frameHeight * 4;
  return indices.map((i) => raw.subarray(i * frameBytes, (i + 1) * frameBytes));
}

/**
 * Escribe el spray en el juego, o lo devuelve como .vtf suelto para descargar.
 *
 * Reparto de archivos, siguiendo lo que hacen los sprays que ya funcionan:
 *   materials/vgui/logos/custom/<nombre>.vtf + .vmt   el spray y su material
 *   materials/vgui/logos/UI/<nombre>.vmt              icono del menu
 *   left4dead2/sprays/<nombre>.tga                    solo estaticos: fuente
 *                                                      para "Importar espray"
 *   left4dead2/sprays/<nombre>.vtf                    solo animados: copia
 *                                                      lista para el dialogo
 *                                                      de "Logotipo personalizado"
 */
async function deliver(res, opts) {
  const { name, animated, frames, src, out, quality, target } = opts;

  const vtfBuffer = Buffer.from(await buildVtf(frames, src, out, quality));
  const vmtText = buildVmt(name, { animated, folder: SPRAY_FOLDER });
  const uiVmt = buildUiVmt(name, { folder: SPRAY_FOLDER });
  const command = buildLogoCommand(name, SPRAY_FOLDER);

  if (target !== 'install') {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.vtf"`);
    res.setHeader('X-Vtf-Bytes', String(vtfBuffer.length));
    return res.end(vtfBuffer);
  }

  const location = await locateL4D2();
  if (!location.found) {
    return fail(res, 404, 'GAME_NOT_FOUND', 'No se encontro la instalacion de Left 4 Dead 2.');
  }

  const sprayDir = path.join(location.logosDir, SPRAY_FOLDER);
  const uiDir = path.join(location.logosDir, 'UI');
  await mkdir(sprayDir, { recursive: true });
  await mkdir(uiDir, { recursive: true });

  const written = [
    path.join(sprayDir, `${name}.vtf`),
    path.join(sprayDir, `${name}.vmt`),
    path.join(uiDir, `${name}.vmt`),
  ];
  await writeFile(written[0], vtfBuffer);
  await writeFile(written[1], vmtText);
  await writeFile(written[2], uiVmt);

  if (location.spraysDir) {
    await mkdir(location.spraysDir, { recursive: true });
    if (animated) {
      // Un unico .vtf, igual que deja VTFEdit al exportar una textura animada.
      const dest = path.join(location.spraysDir, `${name}.vtf`);
      await writeFile(dest, vtfBuffer);
      written.push(dest);
    } else {
      // Fuente editable para "Importar espray", que solo lee imagenes.
      const dest = path.join(location.spraysDir, `${name}.tga`);
      await writeFile(dest, encodeTga32(frames[0], src.width, src.height));
      written.push(dest);
    }
  }

  res.json({
    installed: true,
    logosDir: sprayDir,
    spraysDir: location.spraysDir,
    files: written,
    vtfBytes: vtfBuffer.length,
    width: out.width,
    height: out.height,
    command,
  });
}

/** Spray estatico: acepta cualquier relacion de aspecto. */
router.post('/api/generate/image', upload.single('file'), async (req, res, next) => {
  if (!req.file) return fail(res, 400, 'NO_FILE', 'No se recibio ningun archivo.');

  let session;
  try {
    const name = sanitizeName(req.body.name);
    const quality = QUALITIES.has(req.body.quality) ? req.body.quality : 'dxt5';
    const target = req.body.target === 'install' ? 'install' : 'download';
    const crop = parseCrop(req.body.crop);

    const width = VALID_SIDES.has(Number(req.body.width)) ? Number(req.body.width) : 512;
    const height = VALID_SIDES.has(Number(req.body.height)) ? Number(req.body.height) : width;

    session = await createSession();
    const ext = path.extname(req.file.originalname) || '.png';
    const inputPath = path.join(session.dir, `input${ext}`);
    await writeFile(inputPath, req.file.buffer);

    const frame = await extractImageRGBA(inputPath, width, height, crop);

    await deliver(res, {
      name,
      animated: false,
      frames: [frame],
      src: { width, height },
      out: { width, height },
      quality,
      target,
    });
  } catch (err) {
    next(err);
  } finally {
    if (session) destroySession(session.id);
  }
});

/** Spray animado: usa los frames elegidos, recortados segun el recuadro 1:1. */
router.post('/api/generate/animated', express.json(), async (req, res, next) => {
  try {
    const session = getSession(req.body.sessionId);
    if (!session) return fail(res, 404, 'SESSION_EXPIRED', 'La sesion expiro. Vuelve a subir el archivo.');

    const selected = Array.isArray(req.body.selected) ? req.body.selected : [];
    const indices = selected
      .map((i) => parseInt(i, 10))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < session.frameCount)
      .slice(0, MAX_ANIM_FRAMES);

    if (indices.length < 2) {
      return fail(res, 400, 'TOO_FEW_FRAMES', 'Elige al menos 2 frames.');
    }

    const name = sanitizeName(req.body.name);
    const side = ANIM_SIDES.has(Number(req.body.size)) ? Number(req.body.size) : 256;
    const quality = QUALITIES.has(req.body.quality) ? req.body.quality : 'dxt1';
    const target = req.body.target === 'install' ? 'install' : 'download';
    const crop = parseCrop(req.body.crop);

    const cached = await readCachedFrames(session, indices);

    // El recorte se aplica sobre los frames cacheados: no hace falta reprocesar.
    let frames = cached;
    let src = { width: session.frameWidth, height: session.frameHeight };
    if (crop) {
      const cropped = cached.map((f) => cropRgba(f, src.width, src.height, crop));
      frames = cropped.map((c) => c.data);
      src = { width: cropped[0].width, height: cropped[0].height };
    }

    await deliver(res, {
      name,
      animated: true,
      frames,
      src,
      out: { width: side, height: side },
      quality,
      target,
    });
  } catch (err) {
    next(err);
  }
});
