/**
 * Lectura de los VTF ya instalados, para el visualizador de sprays.
 *
 * Usa vtf-js 1.x bajo el alias `vtf-js-decoder`, y no el 0.9.4 con el que se
 * generan los sprays. El motivo es concreto: la version vieja no sabe leer los
 * VTF que traen tabla de recursos —los que produce VTFEdit y los oficiales de
 * Valve— y muere con "Offset is outside the bounds of the DataView". Como el
 * visualizador tiene que mostrar tambien los sprays que el usuario hizo con
 * otras herramientas, aqui hace falta el lector nuevo.
 *
 * Se conservan las dos versiones a proposito: el encoder de 0.9.4 esta
 * verificado contra los sprays reales del juego y la API de 1.x cambio lo
 * suficiente (VFrameCollection desaparecio) como para que migrarlo sea un
 * trabajo aparte, con su propia verificacion.
 */
import { Vtf, VFormats } from 'vtf-js-decoder';
import { readFile } from 'node:fs/promises';

/*
 * Aqui NO se importa `vtf-js-decoder/addons/squish`, y no es un olvido.
 *
 * Los dos vtf-js comparten la misma copia de `libsquish-js`, y cargar el addon
 * del lector deja al encoder de 0.9.4 sin compresion DXT ("DXT compression is
 * unsupported by the default backend!"), es decir, rompe la generacion de
 * sprays, que es lo que hace la app. El fallo dependia del orden de los
 * imports, asi que era de los que aparecen mucho despues y en otro sitio.
 *
 * Para leer no hace falta: 1.x trae su propio descompresor DXT y devuelve
 * exactamente los mismos pixeles. El addon solo agrega el lado de COMPRIMIR.
 * Lo cubre scripts/test-spray-library.mjs, que genera un VTF (encoder) despues
 * de haber leido uno (lector).
 */

/** Lee un archivo como ArrayBuffer, que es lo que espera Vtf.decode. */
async function readArrayBuffer(filePath) {
  const buf = await readFile(filePath);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Datos de cabecera, sin decodificar los pixeles.
 * Es lo que basta para armar la lista: dimensiones, formato y cuantos frames.
 */
export async function readVtfHeader(filePath) {
  const header = await Vtf.decode(await readArrayBuffer(filePath), { headerOnly: true });
  return {
    width: header.width,
    height: header.height,
    format: VFormats[header.format] ?? String(header.format),
    frames: header.frames,
    mipmaps: header.mipmaps,
    version: `7.${header.version}`,
    animated: header.frames > 1,
  };
}

/**
 * Elige el nivel de mipmap mas pequeño que siga cubriendo `maxSide`.
 *
 * El VTF ya trae la cadena de miniaturas hecha, asi que para la grilla no hay
 * que reescalar nada: se lee el nivel que toca y listo. El nivel 0 es el grande
 * y a partir de ahi cada uno es la mitad.
 */
function pickMipmap(body, maxSide) {
  const levels = body.getMipmapCount();
  let chosen = 0;
  for (let level = 0; level < levels; level++) {
    const image = body.getImage(level, 0, 0, 0);
    if (Math.max(image.width, image.height) <= maxSide) return level;
    chosen = level;
  }
  return chosen;
}

/**
 * Decodifica los frames a RGBA crudo, en el nivel de detalle mas barato que
 * cubra `maxSide`. Devuelve todos los frames para que el visualizador pueda
 * animarlos a los 5 FPS del motor.
 */
export async function readVtfFrames(filePath, maxSide = 128) {
  const vtf = await Vtf.decode(await readArrayBuffer(filePath));
  const body = vtf.body;

  const level = pickMipmap(body, maxSide);
  const frameCount = body.getFrameCount();

  const frames = [];
  let width = 0;
  let height = 0;

  for (let frame = 0; frame < frameCount; frame++) {
    const image = body.getImage(level, frame, 0, 0).convert(Uint8Array);
    width = image.width;
    height = image.height;
    frames.push(image.data);
  }

  const [fullWidth, fullHeight] = body.getSize();
  return {
    width,
    height,
    fullWidth,
    fullHeight,
    format: VFormats[vtf.format] ?? String(vtf.format),
    frames,
  };
}
