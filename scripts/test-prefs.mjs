/**
 * Prueba de que las preferencias sobreviven a cerrar la app.
 *
 * El servidor embebido arranca en un puerto libre distinto cada vez, y
 * localStorage se separa por origen (que incluye el puerto). Guardadas ahi, el
 * idioma elegido se perdia en cada arranque. Ahora viven en el perfil del
 * usuario, asi que tienen que seguir estando aunque el puerto cambie.
 *
 * Usa un "home" temporal, asi que no toca la configuracion real de nadie.
 *
 *   node scripts/test-prefs.mjs
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sandbox = await mkdtemp(path.join(tmpdir(), 'l4d2-prefs-test-'));
process.env.USERPROFILE = sandbox;
process.env.HOME = sandbox;
process.env.L4D2_SPRAY_EMBEDDED = '1';

const { startServer } = await import('../server.js');

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`  ok    ${label}`);
  else { failures++; console.log(`  FALLA ${label}${detail ? ` -> ${detail}` : ''}`); }
}

async function withServer(fn) {
  const { server, port } = await startServer({ port: 0 });
  try {
    return await fn(`http://127.0.0.1:${port}`, port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// --- Primer arranque: se elige ingles y se abre el panel ---
const firstPort = await withServer(async (base, port) => {
  const empty = await (await fetch(`${base}/api/prefs`)).json();
  check('arranca sin preferencias', Object.keys(empty).length === 0, JSON.stringify(empty));

  const saved = await (await fetch(`${base}/api/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'en', libraryOpen: true }),
  })).json();
  check('guarda idioma y panel', saved.lang === 'en' && saved.libraryOpen === true, JSON.stringify(saved));
  return port;
});

// --- Segundo arranque: OTRO puerto, que es justo lo que rompia localStorage ---
const secondPort = await withServer(async (base, port) => {
  const prefs = await (await fetch(`${base}/api/prefs`)).json();
  check('el idioma sobrevive al reinicio', prefs.lang === 'en', JSON.stringify(prefs));
  check('el panel sigue abierto', prefs.libraryOpen === true, JSON.stringify(prefs));

  await fetch(`${base}/api/prefs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lang: 'es', inventada: 'no deberia guardarse' }),
  });
  return port;
});

check('el puerto cambio entre arranques', firstPort !== secondPort, `${firstPort} vs ${secondPort}`);

// --- Tercer arranque: se comprueba el cambio y que no entra basura ---
await withServer(async (base) => {
  const prefs = await (await fetch(`${base}/api/prefs`)).json();
  check('recuerda el cambio a espanol', prefs.lang === 'es', JSON.stringify(prefs));
  check('ignora claves desconocidas', !('inventada' in prefs), JSON.stringify(prefs));
});

// La ruta del juego no debe verse afectada por las preferencias.
const raw = JSON.parse(await readFile(path.join(sandbox, '.l4d2-spray-maker.json'), 'utf8'));
check('las preferencias van en su propia rama', typeof raw.ui === 'object' && raw.ui.lang === 'es', JSON.stringify(raw));

await rm(sandbox, { recursive: true, force: true });
console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} PRUEBAS FALLARON`}`);
process.exit(failures === 0 ? 0 : 1);
