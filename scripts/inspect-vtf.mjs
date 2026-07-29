import 'vtf-js/addons/squish';
import { Vtf, VFormats, VFlags } from 'vtf-js';
import { readFile } from 'node:fs/promises';

function flagNames(flags) {
  return Object.entries(VFlags)
    .filter(([k, v]) => typeof v === 'number' && v && (flags & v) && !k.startsWith('DEPRECATED') && !k.startsWith('UNUSED'))
    .map(([k]) => k);
}

for (const file of process.argv.slice(2)) {
  const buf = await readFile(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const header = await Vtf.decode(ab, true);
  console.log(`--- ${file.split(/[\\/]/).pop()} (${buf.length} bytes) ---`);
  console.log('  version   : 7.' + header.version);
  console.log('  size      : ' + header.width + 'x' + header.height);
  console.log('  format    : ' + VFormats[header.format]);
  console.log('  frames    : ' + header.frames);
  console.log('  mipmaps   : ' + header.mipmaps);
  console.log('  flags     : 0x' + header.flags.toString(16) + ' [' + flagNames(header.flags).join(', ') + ']');
  console.log('  thumb     : ' + header.thumb_width + 'x' + header.thumb_height + ' ' + VFormats[header.thumb_format]);
  console.log('  reflect   : ' + Array.from(header.reflectivity).join(', '));
  console.log();
}
