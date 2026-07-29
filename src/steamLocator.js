import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const L4D2_APPID = '550';

function regQuery(key, value) {
  return new Promise((resolve) => {
    const proc = spawn('reg', ['query', key, '/v', value], { windowsHide: true });
    let out = '';
    proc.stdout.on('data', (c) => { out += c; });
    proc.on('error', () => resolve(null));
    proc.on('close', (code) => {
      if (code !== 0) return resolve(null);
      // Formato: "    SteamPath    REG_SZ    C:/Program Files (x86)/Steam"
      const match = out.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, 'i'));
      resolve(match ? match[1].trim() : null);
    });
  });
}

async function findSteamRoot() {
  const candidates = [];

  const fromHkcu = await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath');
  if (fromHkcu) candidates.push(fromHkcu);

  const fromHklm = await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
  if (fromHklm) candidates.push(fromHklm);

  candidates.push(
    'C:\\Program Files (x86)\\Steam',
    'C:\\Program Files\\Steam',
  );

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate.replace(/\//g, path.sep));
    if (existsSync(path.join(normalized, 'steamapps'))) return normalized;
  }
  return null;
}

/** Lee libraryfolders.vdf para encontrar bibliotecas de Steam en otros discos. */
async function readLibraryFolders(steamRoot) {
  const libs = [steamRoot];
  const vdfPath = path.join(steamRoot, 'steamapps', 'libraryfolders.vdf');
  if (!existsSync(vdfPath)) return libs;

  try {
    const text = await readFile(vdfPath, 'utf8');
    const matches = text.matchAll(/"path"\s+"([^"]+)"/g);
    for (const m of matches) {
      const libPath = path.normalize(m[1].replace(/\\\\/g, '\\'));
      if (!libs.includes(libPath)) libs.push(libPath);
    }
  } catch {
    // Si el vdf no se puede leer, seguimos con la biblioteca principal.
  }
  return libs;
}

/**
 * Comprueba que la carpeta sea una instalacion jugable y no restos de una vieja.
 *
 * Hace falta porque al mover el juego de disco Steam deja atras las carpetas de
 * datos del usuario (materials, cfg, addons), que a simple vista parecen una
 * instalacion valida. Solo la de verdad tiene el ejecutable y los VPK.
 */
function isRealInstall(gameRoot) {
  const gameData = path.join(gameRoot, 'left4dead2');
  return (
    existsSync(path.join(gameData, 'gameinfo.txt')) &&
    existsSync(path.join(gameData, 'pak01_dir.vpk')) &&
    existsSync(path.join(gameRoot, 'left4dead2.exe'))
  );
}

/**
 * Localiza la instalacion de Left 4 Dead 2.
 * @returns {Promise<{found: boolean, gameRoot?: string, logosDir?: string, spraysDir?: string, steamRoot?: string}>}
 */
export async function locateL4D2() {
  const steamRoot = await findSteamRoot();
  if (!steamRoot) return { found: false };

  const libs = await readLibraryFolders(steamRoot);

  // Primero las bibliotecas cuyo appmanifest declara el juego: es lo que Steam
  // considera la instalacion vigente.
  const ordered = [...libs].sort((a, b) => {
    const hasA = existsSync(path.join(a, 'steamapps', `appmanifest_${L4D2_APPID}.acf`));
    const hasB = existsSync(path.join(b, 'steamapps', `appmanifest_${L4D2_APPID}.acf`));
    return Number(hasB) - Number(hasA);
  });

  for (const lib of ordered) {
    const gameRoot = path.join(lib, 'steamapps', 'common', 'Left 4 Dead 2');
    if (!isRealInstall(gameRoot)) continue;

    const gameData = path.join(gameRoot, 'left4dead2');
    return {
      found: true,
      steamRoot,
      gameRoot,
      logosDir: path.join(gameData, 'materials', 'vgui', 'logos'),
      spraysDir: path.join(gameData, 'sprays'),
    };
  }

  return { found: false, steamRoot };
}
