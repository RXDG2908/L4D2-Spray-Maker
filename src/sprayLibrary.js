/**
 * Inventario de los sprays que ya estan en la carpeta del juego.
 *
 * Solo mira archivos sueltos: lo que Valve trae empaquetado en los .vpk no
 * aparece aqui, igual que no aparece en el explorador de archivos.
 */
import { readdir, stat, rename, unlink, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { locateL4D2 } from './steamLocator.js';
import { readVtfHeader } from './vtfReader.js';
import { buildLogoCommand } from './vmtBuilder.js';
import { sanitizeName } from './sprayName.js';

/**
 * Los tres sitios donde puede haber un .vtf, en orden de preferencia.
 *
 *   custom  materials/vgui/logos/custom  los sprays propios (los que hace la app)
 *   logos   materials/vgui/logos         la raiz, donde viven los de Valve
 *   sprays  left4dead2/sprays            la copia que lee el dialogo del juego
 */
const LOCATION_ORDER = ['custom', 'logos', 'sprays'];

/** Carpeta real de cada ubicacion, o null si el juego no aparece. */
export async function resolveLocations() {
  const game = await locateL4D2();
  if (!game.found) return null;

  return {
    game,
    dirs: {
      custom: path.join(game.logosDir, 'custom'),
      logos: game.logosDir,
      sprays: game.spraysDir,
      // La carpeta del icono del menu. No se enumera (solo tiene .vmt sueltos),
      // pero renombrar y borrar si tienen que pasar por ella.
      ui: path.join(game.logosDir, 'UI'),
    },
  };
}

/**
 * Enumera los .vtf sueltos sin decodificar nada.
 *
 * Es la unica puerta por la que se traducen nombres a rutas: el resto del
 * codigo elige de esta lista en vez de armar rutas con lo que manda el cliente,
 * asi que no hay forma de salirse de las carpetas del juego.
 */
async function enumerateVtfFiles(dirs) {
  const found = [];

  for (const location of LOCATION_ORDER) {
    const dir = dirs[location];
    if (!dir) continue;

    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // La carpeta puede no existir todavia; no es un error.
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (path.extname(entry.name).toLowerCase() !== '.vtf') continue;

      found.push({
        location,
        name: path.basename(entry.name, path.extname(entry.name)),
        file: path.join(dir, entry.name),
      });
    }
  }

  return found;
}

/**
 * Devuelve la ruta de un spray concreto, o null si no existe.
 * El nombre que llega del cliente nunca se concatena a una ruta: se busca
 * dentro de lo que ya enumeramos.
 */
export async function resolveSprayFile(location, name) {
  const resolved = await resolveLocations();
  if (!resolved) return null;

  const wanted = String(name ?? '').toLowerCase();
  const files = await enumerateVtfFiles(resolved.dirs);

  const match = files.find(
    (f) => f.location === location && f.name.toLowerCase() === wanted,
  );
  return match ? match.file : null;
}

/** Comando de consola, solo para los que viven bajo materials/vgui/logos. */
function commandFor(location, name) {
  if (location === 'custom') return buildLogoCommand(name, 'custom');
  if (location === 'logos') return buildLogoCommand(name, '');
  // La copia de sprays/ existe para el dialogo del juego, no se activa por consola.
  return null;
}

/**
 * Lista los sprays instalados, con sus datos ya leidos de la cabecera.
 *
 * Un mismo spray suele estar en dos sitios (el .vtf del material y la copia en
 * sprays/ que lee el dialogo de "Logotipo personalizado"). Se muestra una sola
 * vez, anotando en que otras carpetas aparece, que es justo lo que sirve para
 * saber si la instalacion quedo completa.
 */
export async function listInstalledSprays() {
  const resolved = await resolveLocations();
  if (!resolved) return { found: false, sprays: [] };

  const { game, dirs } = resolved;
  const files = await enumerateVtfFiles(dirs);

  const byName = new Map();

  for (const entry of files) {
    const key = entry.name.toLowerCase();

    // Ya lo vimos en una carpeta de mas prioridad: solo anotamos donde esta.
    const existing = byName.get(key);
    if (existing) {
      existing.alsoIn.push(entry.location);
      continue;
    }

    const record = {
      name: entry.name,
      location: entry.location,
      alsoIn: [],
      command: commandFor(entry.location, entry.name),
      // El .vmt es lo que hace que el juego sepa dibujar el spray. Sin el, el
      // .vtf esta ahi pero no se puede usar.
      hasVmt: existsSync(path.join(path.dirname(entry.file), `${entry.name}.vmt`)),
      bytes: 0,
      modified: null,
      readable: false,
    };

    try {
      const info = await stat(entry.file);
      record.bytes = info.size;
      record.modified = info.mtime.toISOString();
    } catch {
      // Si no se puede leer el tamaño seguimos: el spray igual existe.
    }

    try {
      Object.assign(record, await readVtfHeader(entry.file));
      record.readable = true;
    } catch {
      // Un VTF que no se puede leer se muestra igual, sin vista previa: es
      // preferible a esconderle al usuario un archivo que si esta en su carpeta.
      record.readable = false;
    }

    byName.set(key, record);
  }

  const sprays = [...byName.values()].sort((a, b) => {
    // Lo mas reciente primero: es lo que el usuario acaba de instalar.
    if (a.modified && b.modified) return b.modified.localeCompare(a.modified);
    return a.name.localeCompare(b.name);
  });

  return {
    found: true,
    gameRoot: game.gameRoot,
    dirs,
    sprays,
  };
}

/* ---------------------------------------------------- renombrar y borrar --- */

/**
 * Un spray no es un archivo: son hasta cinco repartidos en cuatro carpetas.
 * Renombrar o borrar tiene que tocarlos todos o el juego queda a medias, con
 * un material apuntando a una textura que ya no esta.
 */
const SPRAY_PIECES = [
  { dir: 'custom', exts: ['.vtf', '.vmt'] },
  { dir: 'logos', exts: ['.vtf', '.vmt'] },
  { dir: 'ui', exts: ['.vmt'] },
  // En sprays/ conviven el .vtf de los animados y la imagen fuente de los fijos.
  { dir: 'sprays', exts: ['.vtf', '.tga', '.bmp', '.jpg', '.jpeg', '.png'] },
];

/**
 * Como se quita un archivo del disco.
 *
 * Por defecto se borra sin mas, que es lo unico que puede hacer el servidor a
 * secas. La app de escritorio lo reemplaza por la papelera de Windows (ver
 * electron/main.js): borrar un spray es de las pocas cosas de esta app que
 * destruyen trabajo del usuario, y conviene que se pueda deshacer.
 */
let removeFile = (file) => unlink(file);

export function setFileRemover(fn) {
  removeFile = typeof fn === 'function' ? fn : ((file) => unlink(file));
}

/** Archivos que existen de verdad para un spray dado. */
function collectSprayFiles(dirs, name) {
  const files = [];
  for (const piece of SPRAY_PIECES) {
    const dir = dirs[piece.dir];
    if (!dir) continue;
    for (const ext of piece.exts) {
      const file = path.join(dir, `${name}${ext}`);
      if (existsSync(file)) files.push({ dir: piece.dir, ext, file });
    }
  }
  return files;
}

/**
 * Reapunta el `$basetexture` de un .vmt al nombre nuevo.
 *
 * Es la parte que no se ve: si solo se renombraran los archivos, el material
 * seguiria apuntando a la textura vieja y el spray saldria en rosa y negro.
 * Se reescribe unicamente el ultimo tramo de la ruta, y solo si coincide con el
 * nombre viejo: un .vmt que apunte a otra textura se deja como esta.
 */
function retargetVmt(text, oldName, newName) {
  // El patron se ancla al principio de la linea a proposito. En un material
  // animado tambien aparece `animatedtexturevar "$basetexture"`, donde
  // $basetexture es el VALOR y no la clave: si se buscara suelto por el texto,
  // en un .vmt que traiga los Proxies arriba se reescribiria esa linea y el
  // material quedaria roto. Aqui solo entra si la linea EMPIEZA por la clave.
  const declaration = /^([ \t]*"?\$basetexture"?[ \t]+")([^"]*)(")/im;

  return text.replace(declaration, (whole, open, value, close) => {
    const parts = value.match(/^(.*[\\/])?([^\\/]+)$/);
    if (!parts) return whole;

    const prefix = parts[1] ?? '';
    // Si apunta a otra textura no es cosa nuestra: romperlo seria peor.
    if (parts[2].toLowerCase() !== oldName.toLowerCase()) return whole;
    return `${open}${prefix}${newName}${close}`;
  });
}

/** Nombre real en disco (con su capitalizacion) a partir del que manda el cliente. */
async function resolveRealName(location, name) {
  const file = await resolveSprayFile(location, name);
  return file ? path.basename(file, path.extname(file)) : null;
}

/** Los archivos que componen un spray, para poder avisar antes de tocar nada. */
export async function listSprayFiles(location, name) {
  const resolved = await resolveLocations();
  if (!resolved) return { ok: false, error: 'GAME_NOT_FOUND' };

  const real = await resolveRealName(location, name);
  if (!real) return { ok: false, error: 'SPRAY_NOT_FOUND' };

  return {
    ok: true,
    name: real,
    files: collectSprayFiles(resolved.dirs, real).map((piece) => piece.file),
  };
}

/**
 * Renombra un spray entero: mueve cada archivo y reescribe los materiales.
 *
 * El spray que estuviera activo deja de estarlo, porque `cl_logofile` guarda la
 * ruta vieja: por eso se devuelve el comando nuevo para volver a activarlo.
 */
export async function renameSpray(location, name, requestedName) {
  const resolved = await resolveLocations();
  if (!resolved) return { ok: false, error: 'GAME_NOT_FOUND' };

  const { dirs } = resolved;
  const from = await resolveRealName(location, name);
  if (!from) return { ok: false, error: 'SPRAY_NOT_FOUND' };

  const to = sanitizeName(requestedName);
  if (to === from) return { ok: false, error: 'SAME_NAME' };

  // Windows no distingue mayusculas, asi que al cambiar solo la capitalizacion
  // los archivos "que estorban" son los propios: esos no cuentan como choque.
  const ours = new Set(collectSprayFiles(dirs, from).map((p) => p.file.toLowerCase()));
  const clash = collectSprayFiles(dirs, to).some((p) => !ours.has(p.file.toLowerCase()));
  if (clash) return { ok: false, error: 'NAME_TAKEN' };

  const moved = [];
  for (const piece of collectSprayFiles(dirs, from)) {
    const target = path.join(path.dirname(piece.file), `${to}${piece.ext}`);
    await rename(piece.file, target);

    if (piece.ext === '.vmt') {
      await writeFile(target, retargetVmt(await readFile(target, 'utf8'), from, to));
    }
    moved.push(target);
  }

  return {
    ok: true,
    from,
    name: to,
    files: moved,
    command: commandFor(location, to),
  };
}

/** Borra un spray con todas sus piezas. */
export async function deleteSpray(location, name) {
  const resolved = await resolveLocations();
  if (!resolved) return { ok: false, error: 'GAME_NOT_FOUND' };

  const real = await resolveRealName(location, name);
  if (!real) return { ok: false, error: 'SPRAY_NOT_FOUND' };

  const removed = [];
  const failed = [];
  for (const piece of collectSprayFiles(resolved.dirs, real)) {
    try {
      await removeFile(piece.file);
      removed.push(piece.file);
    } catch {
      // Suele ser que el juego este abierto y tenga el archivo tomado.
      failed.push(piece.file);
    }
  }

  if (!removed.length && failed.length) return { ok: false, error: 'DELETE_FAILED', failed };
  return { ok: true, name: real, removed, failed };
}
