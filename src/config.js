import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/**
 * Ajustes que sobreviven entre sesiones.
 *
 * Se guardan en el perfil del usuario y no dentro de la carpeta de la app,
 * para que una actualizacion no los borre.
 */
const CONFIG_PATH = path.join(homedir(), '.l4d2-spray-maker.json');

function read() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function write(data) {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch {
    return false;
  }
}

/** Ruta del juego elegida a mano, si la hay. */
export function getManualGamePath() {
  const value = read().gamePath;
  return typeof value === 'string' && value ? value : null;
}

export function setManualGamePath(gamePath) {
  const data = read();
  if (gamePath) data.gamePath = gamePath;
  else delete data.gamePath;
  return write(data);
}
