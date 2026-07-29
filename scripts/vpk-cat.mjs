/**
 * Extrae e imprime un archivo de texto contenido en un VPK de Source.
 * Uso: node scripts/vpk-cat.mjs <ruta_dir.vpk> <ruta/interna/archivo.vmt>
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [vpkPath, target] = process.argv.slice(2);
const wanted = target.replace(/\\/g, '/').toLowerCase();

const buf = await readFile(vpkPath);
let p = 0;
const u32 = () => { const v = buf.readUInt32LE(p); p += 4; return v; };
const u16 = () => { const v = buf.readUInt16LE(p); p += 2; return v; };
const str = () => {
  const start = p;
  while (buf[p] !== 0) p++;
  const s = buf.toString('utf8', start, p);
  p++;
  return s;
};

if (u32() !== 0x55aa1234) throw new Error('No es un VPK valido');
const version = u32();
const treeSize = u32();
if (version === 2) p += 16;

const treeEnd = Math.min(p + treeSize, buf.length);
let found = null;

outer:
while (p < treeEnd && !found) {
  const ext = str();
  if (!ext) break;
  while (true) {
    const dir = str();
    if (!dir) break;
    while (true) {
      const name = str();
      if (!name) break;
      p += 4;
      const preloadBytes = u16();
      const archiveIndex = u16();
      const entryOffset = u32();
      const entryLength = u32();
      p += 2;
      const preloadOffset = p;
      p += preloadBytes;

      if (`${dir}/${name}.${ext}`.toLowerCase() === wanted) {
        found = { archiveIndex, entryOffset, entryLength, preloadBytes, preloadOffset };
        break outer;
      }
    }
  }
}

if (!found) {
  console.error('No encontrado en el VPK:', target);
  process.exit(1);
}

const parts = [];
if (found.preloadBytes) {
  parts.push(buf.subarray(found.preloadOffset, found.preloadOffset + found.preloadBytes));
}
if (found.entryLength) {
  // archiveIndex 0x7fff significa que los datos estan en el propio _dir.vpk
  if (found.archiveIndex === 0x7fff) {
    const base = treeEnd;
    parts.push(buf.subarray(base + found.entryOffset, base + found.entryOffset + found.entryLength));
  } else {
    const archive = vpkPath.replace(/_dir\.vpk$/i, `_${String(found.archiveIndex).padStart(3, '0')}.vpk`);
    const abuf = await readFile(archive);
    parts.push(abuf.subarray(found.entryOffset, found.entryOffset + found.entryLength));
  }
}

process.stdout.write(Buffer.concat(parts).toString('utf8'));
