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

/**
 * Preferencias de la interfaz (idioma, panel abierto...).
 *
 * Van aqui y no en localStorage del navegador por una razon concreta: el
 * servidor embebido arranca en un puerto libre distinto en cada apertura, y
 * localStorage se separa por origen, que incluye el puerto. Guardadas ahi se
 * perdian en cada arranque de la app de escritorio, asi que el idioma elegido
 * volvia a espanol cada vez.
 */
const UI_KEYS = new Set(['lang', 'libraryOpen']);

export function getUiPrefs() {
  const stored = read().ui;
  if (!stored || typeof stored !== 'object') return {};

  const clean = {};
  for (const [key, value] of Object.entries(stored)) {
    if (UI_KEYS.has(key)) clean[key] = value;
  }
  return clean;
}

export function setUiPref(key, value) {
  if (!UI_KEYS.has(key)) return false;

  const data = read();
  if (!data.ui || typeof data.ui !== 'object') data.ui = {};
  data.ui[key] = value;
  return write(data);
}
