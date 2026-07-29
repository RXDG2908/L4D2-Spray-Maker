import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * Rutas a ffmpeg y ffprobe.
 *
 * La app se distribuye con los binarios incluidos para que funcione en equipos
 * que no tienen FFmpeg instalado. Dentro del .exe empaquetado los archivos
 * viven en app.asar, que no permite ejecutar binarios: electron-builder los
 * deja tambien en app.asar.unpacked, asi que hay que corregir la ruta.
 *
 * Si por lo que sea no estan, caemos al FFmpeg del PATH del sistema.
 */
function resolveBinary(moduleName, fallback) {
  try {
    const mod = require(moduleName);
    const raw = typeof mod === 'string' ? mod : mod?.path;
    if (!raw) return fallback;

    const unpacked = raw.replace('app.asar', 'app.asar.unpacked');
    if (existsSync(unpacked)) return unpacked;
    if (existsSync(raw)) return raw;
    return fallback;
  } catch {
    return fallback;
  }
}

export const FFMPEG_PATH = resolveBinary('ffmpeg-static', 'ffmpeg');
export const FFPROBE_PATH = resolveBinary('ffprobe-static', 'ffprobe');
