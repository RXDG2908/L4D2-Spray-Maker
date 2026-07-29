// El addon squish habilita la compresion DXT (vtf-js no la trae activada por defecto).
import 'vtf-js/addons/squish';
import { Vtf, VFormats, VFlags, VFilters, VImageData, VFrameCollection } from 'vtf-js';

export const QUALITY_FORMATS = {
  uncompressed: VFormats.BGRA8888,
  dxt5: VFormats.DXT5,
  dxt1: VFormats.DXT1,
};

/** Bytes por pixel de cada formato, para estimar el peso del archivo. */
export const QUALITY_BPP = {
  uncompressed: 4,
  dxt5: 1,
  dxt1: 0.5,
};

/**
 * Los sprays reales del juego llevan la cadena completa de mipmaps
 * (VTFEdit trae "Generate Mipmaps" activado). Sumar todos los niveles
 * agrega alrededor de un tercio al peso de la imagen base.
 */
export const MIPMAP_SIZE_FACTOR = 4 / 3;

/** Las texturas de Source deben tener lados potencia de dos, pero no ser cuadradas. */
export function nearestPowerOfTwo(value, min = 8, max = 1024) {
  const pow = 2 ** Math.round(Math.log2(value));
  return Math.min(Math.max(pow, min), max);
}

function mipmapCount(width, height) {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/** True si algun pixel no es totalmente opaco. */
function hasTransparency(frame) {
  for (let i = 3; i < frame.length; i += 4) {
    if (frame[i] !== 255) return true;
  }
  return false;
}

/** Media de color de la imagen, que es lo que VTFEdit guarda como reflectivity. */
function averageReflectivity(frame) {
  let r = 0, g = 0, b = 0;
  const pixels = frame.length / 4;
  for (let i = 0; i < frame.length; i += 4) {
    r += frame[i]; g += frame[i + 1]; b += frame[i + 2];
  }
  return new Float32Array([r / pixels / 255, g / pixels / 255, b / pixels / 255]);
}

/**
 * Recorta una region de pixeles RGBA.
 * Los rectangulos llegan normalizados (0..1) desde el recortador de la interfaz.
 */
export function cropRgba(frame, srcW, srcH, rect) {
  const x = Math.max(0, Math.min(Math.round(rect.x * srcW), srcW - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y * srcH), srcH - 1));
  const w = Math.max(1, Math.min(Math.round(rect.w * srcW), srcW - x));
  const h = Math.max(1, Math.min(Math.round(rect.h * srcH), srcH - y));

  const out = new Uint8Array(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * srcW + x) * 4;
    out.set(frame.subarray(from, from + w * 4), row * w * 4);
  }
  return { data: out, width: w, height: h };
}

/**
 * @param {Uint8Array[]} frameBuffers frames RGBA, todos de srcW x srcH
 * @param {{width:number,height:number}} src dimensiones de los buffers de entrada
 * @param {{width:number,height:number}} out dimensiones finales (potencia de dos)
 * @param {'uncompressed'|'dxt5'|'dxt1'} quality
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildVtf(frameBuffers, src, out, quality = 'dxt5') {
  const format = QUALITY_FORMATS[quality] ?? QUALITY_FORMATS.dxt5;

  const images = frameBuffers.map((buf) => {
    const image = new VImageData(new Uint8Array(buf), src.width, src.height);
    return (out.width === src.width && out.height === src.height)
      ? image
      : image.resize(out.width, out.height, { filter: VFilters.NICE });
  });

  // ClampS/ClampT evitan que el borde del spray se repita sobre la pared
  // (equivalen al "Clamp" que trae marcado VTFEdit).
  // Los flags de alfa solo se marcan si la imagen tiene transparencia real.
  let flags = VFlags.ClampS | VFlags.ClampT;
  if (frameBuffers.some(hasTransparency)) {
    flags |= format === VFormats.DXT1 ? VFlags.OneBitAlpha : VFlags.EightBitAlpha;
  }

  const data = new VFrameCollection(images, {
    mipmaps: mipmapCount(out.width, out.height),
    filter: VFilters.NICE,
  });

  const vtf = new Vtf(data, {
    version: 4, // 7.4, igual que los sprays del juego
    format,
    flags,
    reflectivity: averageReflectivity(frameBuffers[0]),
  });

  return vtf.encode();
}

/** Estima el peso del VTF sin generarlo, para avisar al usuario antes de tiempo. */
export function estimateVtfBytes(width, height, frameCount, quality) {
  const bpp = QUALITY_BPP[quality] ?? 4;
  return Math.round(width * height * frameCount * bpp * MIPMAP_SIZE_FACTOR) + 1024;
}
