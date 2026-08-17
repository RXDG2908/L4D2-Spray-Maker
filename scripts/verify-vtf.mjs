import { buildVtf } from '../src/vtfBuilder.js';
import { Vtf } from 'vtf-js';

const size = 128;
const frameCount = 3;
const frames = [];
for (let f = 0; f < frameCount; f++) {
  const buf = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    buf[i * 4 + 0] = f * 50;
    buf[i * 4 + 1] = 100;
    buf[i * 4 + 2] = 200;
    buf[i * 4 + 3] = 255;
  }
  frames.push(buf);
}

const arrayBuffer = await buildVtf(
  frames,
  { width: size, height: size },
  { width: size, height: size },
  'dxt1',
);
console.log('encoded bytes:', arrayBuffer.byteLength);

const decoded = await Vtf.decode(arrayBuffer);
console.log('width', decoded.data.getSize()[0], 'height', decoded.data.getSize()[1]);
console.log('frameCount', decoded.data.frameCount());
console.log('mipmapCount', decoded.data.mipmapCount());
console.log('format', decoded.format);
console.log('version', decoded.version);

const img0 = decoded.data.getImage(0, 0, 0, 0).convert(Uint8Array);
console.log('frame0 pixel0 RGBA:', img0.data.slice(0, 4));
const img1 = decoded.data.getImage(0, 1, 0, 0).convert(Uint8Array);
console.log('frame1 pixel0 RGBA:', img1.data.slice(0, 4));

if (decoded.data.frameCount() !== frameCount) throw new Error('frame count mismatch');
if (decoded.data.getSize()[0] !== size || decoded.data.getSize()[1] !== size) throw new Error('size mismatch');
console.log('OK: roundtrip valido');
