/**
 * Codifica pixeles RGBA en un TGA de 32 bits sin comprimir.
 *
 * Replica la cabecera de los TGA que produce VTFEdit / Photoshop y que ya usa
 * el usuario (tipo 2 sin comprimir, 32 bpp, origen arriba-izquierda):
 *   00 00 02 00 00 00 00 00 00 00 00 00  WW WW  HH HH  20 20
 *
 * Es el formato de entrada estandar de VTFEdit, y a diferencia del BMP de
 * 24 bits conserva el canal alfa.
 *
 * @param {Uint8Array} rgba datos RGBA, largo = width * height * 4
 */
export function encodeTga32(rgba, width, height) {
  const header = Buffer.alloc(18);
  header.writeUInt8(0, 0);   // sin campo de identificacion
  header.writeUInt8(0, 1);   // sin mapa de color
  header.writeUInt8(2, 2);   // tipo 2: color verdadero sin comprimir
  // bytes 3-7: especificacion del mapa de color, todo en cero
  header.writeUInt16LE(0, 8);   // origen X
  header.writeUInt16LE(0, 10);  // origen Y
  header.writeUInt16LE(width, 12);
  header.writeUInt16LE(height, 14);
  header.writeUInt8(32, 16);    // 32 bits por pixel
  header.writeUInt8(0x20, 17);  // bit 5: primera fila arriba

  // TGA guarda BGRA
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4 + 0] = rgba[i * 4 + 2]; // B
    pixels[i * 4 + 1] = rgba[i * 4 + 1]; // G
    pixels[i * 4 + 2] = rgba[i * 4 + 0]; // R
    pixels[i * 4 + 3] = rgba[i * 4 + 3]; // A
  }

  return Buffer.concat([header, pixels]);
}
