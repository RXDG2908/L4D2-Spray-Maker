/**
 * Lista archivos dentro de un VPK de Source cuyo nombre coincida con un patron.
 * Solo lee el arbol de directorios del _dir.vpk, no extrae contenido.
 */
import { readFile } from 'node:fs/promises';

const [vpkPath, pattern] = process.argv.slice(2);
const rx = new RegExp(pattern, 'i');

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

const signature = u32();
if (signature !== 0x55aa1234) throw new Error('No es un VPK valido');
const version = u32();
const treeSize = u32();
if (version === 2) p += 16; // campos extra de la v2

const treeEnd = Math.min(p + treeSize, buf.length);
const matches = [];

outer:
while (p < treeEnd) {
  const ext = str();
  if (!ext) break;
  while (true) {
    const dir = str();
    if (!dir) break;
    while (true) {
      const name = str();
      if (!name) break;
      p += 4;                 // crc
      const preload = u16();
      p += 2 + 4 + 4 + 2;     // archiveIndex, entryOffset, entryLength, terminador (2 bytes)
      p += preload;
      const full = `${dir}/${name}.${ext}`;
      if (rx.test(full)) {
        matches.push(full);
        if (matches.length > 400) break outer;
      }
    }
  }
}

console.log(matches.sort().join('\n'));
console.log(`\n(${matches.length} coincidencias)`);
