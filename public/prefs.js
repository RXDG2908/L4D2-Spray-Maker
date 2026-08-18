/**
 * Preferencias que sobreviven a cerrar la app (idioma, panel abierto...).
 *
 * No se guardan solo en localStorage a proposito. El servidor embebido arranca
 * en un puerto libre distinto cada vez, y localStorage se separa por origen,
 * que incluye el puerto: en la app de escritorio se perdia todo en cada
 * arranque y el idioma volvia a espanol. La copia buena vive en el perfil del
 * usuario, junto a la ruta del juego, y se lee por /api/prefs.
 *
 * localStorage se sigue usando como copia local, para que la pagina pueda
 * pintarse con el idioma correcto si el servidor no contesta.
 */

const CACHE_PREFIX = 'l4d2spray.';

let cache = {};

function readLocal(key) {
  try {
    return localStorage.getItem(CACHE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, String(value));
  } catch {
    // Modo privado o almacenamiento lleno: la copia del servidor basta.
  }
}

/**
 * Carga las preferencias antes de pintar nada.
 * Si el servidor no responde se cae a la copia local, y si tampoco hay, a los
 * valores por defecto que pida quien llame a getPref.
 */
export async function loadPrefs() {
  try {
    const resp = await fetch('/api/prefs');
    if (resp.ok) {
      cache = await resp.json();
      return cache;
    }
  } catch {
    // Sin servidor seguimos con lo que haya en local.
  }

  cache = {};
  for (const key of ['lang', 'libraryOpen']) {
    const local = readLocal(key);
    if (local !== null) cache[key] = local === 'true' ? true : local === 'false' ? false : local;
  }
  return cache;
}

export function getPref(key, fallback = null) {
  return cache[key] ?? fallback;
}

/** Guarda una preferencia. No se espera la respuesta: no debe frenar la interfaz. */
export function setPref(key, value) {
  cache[key] = value;
  writeLocal(key, value);

  fetch('/api/prefs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [key]: value }),
  }).catch(() => {
    // Si falla queda la copia local; se reintenta al proximo cambio.
  });
}
