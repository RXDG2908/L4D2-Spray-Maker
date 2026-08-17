/**
 * Prueba del inventario de sprays: listar, renombrar y borrar.
 *
 * Monta una instalacion falsa del juego en una carpeta temporal y trabaja solo
 * ahi dentro. Tambien mueve el "home" del proceso, porque la ruta del juego se
 * guarda en el perfil del usuario: asi la prueba no toca la configuracion real
 * de quien la ejecute.
 *
 *   node scripts/test-spray-library.mjs
 */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sandbox = await mkdtemp(path.join(tmpdir(), 'l4d2-spray-test-'));
process.env.USERPROFILE = sandbox; // Windows
process.env.HOME = sandbox;        // el resto

// Los modulos se cargan DESPUES de mover el home: config.js calcula la ruta del
// archivo de ajustes al importarse.
const { setGamePath } = await import('../src/steamLocator.js');
const {
  listInstalledSprays,
  listSprayFiles,
  renameSpray,
  deleteSpray,
  resolveSprayFile,
} = await import('../src/sprayLibrary.js');
const { buildVtf } = await import('../src/vtfBuilder.js');
const { buildVmt, buildUiVmt } = await import('../src/vmtBuilder.js');

let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FALLA ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

/* ------------------------------------------------- instalacion de mentira --- */

const gameRoot = path.join(sandbox, 'Left 4 Dead 2');
const gameData = path.join(gameRoot, 'left4dead2');
const logosDir = path.join(gameData, 'materials', 'vgui', 'logos');
const customDir = path.join(logosDir, 'custom');
const uiDir = path.join(logosDir, 'UI');
const spraysDir = path.join(gameData, 'sprays');

for (const dir of [customDir, uiDir, spraysDir]) {
  await mkdir(dir, { recursive: true });
}

// El detector exige estos tres archivos para aceptar la carpeta como real.
await writeFile(path.join(gameData, 'gameinfo.txt'), 'test');
await writeFile(path.join(gameData, 'pak01_dir.vpk'), 'test');
await writeFile(path.join(gameRoot, 'left4dead2.exe'), 'test');

const located = setGamePath(gameRoot);
check('el sandbox pasa por instalacion valida', located.ok, JSON.stringify(located));

/** Escribe un spray completo, con las mismas piezas que deja la app al instalar. */
async function installFakeSpray(name, { frames = 1, size = 64 } = {}) {
  const buffers = [];
  for (let f = 0; f < frames; f++) {
    const buf = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buf[i * 4 + 0] = (i + f * 30) & 0xff;
      buf[i * 4 + 1] = 120;
      buf[i * 4 + 2] = 200;
      buf[i * 4 + 3] = 255;
    }
    buffers.push(buf);
  }

  const animated = frames > 1;
  const vtf = Buffer.from(await buildVtf(buffers, { width: size, height: size }, { width: size, height: size }, 'dxt1'));

  await writeFile(path.join(customDir, `${name}.vtf`), vtf);
  await writeFile(path.join(customDir, `${name}.vmt`), buildVmt(name, { animated, folder: 'custom' }));
  await writeFile(path.join(uiDir, `${name}.vmt`), buildUiVmt(name, { folder: 'custom' }));

  if (animated) await writeFile(path.join(spraysDir, `${name}.vtf`), vtf);
  else await writeFile(path.join(spraysDir, `${name}.tga`), 'tga de mentira');
}

await installFakeSpray('perro', { frames: 10 });
await installFakeSpray('gato', { frames: 1 });

/* ---------------------------------------------------------------- listar --- */

console.log('\nlistar');
const list = await listInstalledSprays();
check('encuentra el juego', list.found);
check('lista los dos sprays', list.sprays.length === 2, `fueron ${list.sprays.length}`);

const perro = list.sprays.find((s) => s.name === 'perro');
const gato = list.sprays.find((s) => s.name === 'gato');
check('perro sale como animado de 10 frames', perro?.animated === true && perro?.frames === 10, JSON.stringify(perro));
check('gato sale como fijo', gato?.animated === false && gato?.frames === 1, JSON.stringify(gato));
check('perro se ve tambien en sprays/', perro?.alsoIn.includes('sprays'), JSON.stringify(perro?.alsoIn));
check('ambos tienen su .vmt', perro?.hasVmt && gato?.hasVmt);
check('el comando apunta a custom', perro?.command === 'cl_logofile "materials/vgui/logos/custom/perro.vtf"', perro?.command);

const piezas = await listSprayFiles('custom', 'perro');
check('perro son 4 archivos', piezas.files?.length === 4, JSON.stringify(piezas.files));

/* ------------------------------------------------------------- renombrar --- */

console.log('\nrenombrar');
const renamed = await renameSpray('custom', 'perro', 'Perro Feliz');
check('renombra y normaliza el nombre', renamed.ok && renamed.name === 'perro-feliz', JSON.stringify(renamed));
check('no queda el .vtf viejo', !existsSync(path.join(customDir, 'perro.vtf')));
check('esta el .vtf nuevo', existsSync(path.join(customDir, 'perro-feliz.vtf')));
check('se movio la copia de sprays/', existsSync(path.join(spraysDir, 'perro-feliz.vtf')));
check('se movio el .vmt del menu', existsSync(path.join(uiDir, 'perro-feliz.vmt')));

// Lo que de verdad importa: el material tiene que apuntar a la textura nueva.
const vmtText = await readFile(path.join(customDir, 'perro-feliz.vmt'), 'utf8');
check('el $basetexture apunta al nombre nuevo', vmtText.includes('perro-feliz') && !/logos.custom.perro"/.test(vmtText), vmtText.split('\n')[2]);
const uiText = await readFile(path.join(uiDir, 'perro-feliz.vmt'), 'utf8');
check('el .vmt del menu tambien', uiText.includes('perro-feliz'));

// El proxy de animacion tiene que sobrevivir al renombrado.
check('sigue siendo un material animado', vmtText.includes('AnimatedTexture'));

const afterRename = await listInstalledSprays();
check('la lista refleja el nombre nuevo', afterRename.sprays.some((s) => s.name === 'perro-feliz'));
check('sigue siendo animado tras renombrar', afterRename.sprays.find((s) => s.name === 'perro-feliz')?.frames === 10);

const taken = await renameSpray('custom', 'perro-feliz', 'gato');
check('rechaza pisar un spray existente', !taken.ok && taken.error === 'NAME_TAKEN', JSON.stringify(taken));
check('el spray pisado sigue intacto', existsSync(path.join(customDir, 'gato.vtf')));
check('el que se quiso renombrar sigue donde estaba', existsSync(path.join(customDir, 'perro-feliz.vtf')));

const missing = await renameSpray('custom', 'no-existe', 'da-igual');
check('rechaza un spray inexistente', !missing.ok && missing.error === 'SPRAY_NOT_FOUND');

// Un .vmt de otra herramienta puede traer los Proxies ANTES del $basetexture.
// Ahi dentro `$basetexture` aparece como valor de animatedtexturevar, y hay que
// dejarlo intacto: solo se reescribe la declaracion.
await installFakeSpray('raro', { frames: 4 });
await writeFile(path.join(customDir, 'raro.vmt'), `LightmappedGeneric
{
	Proxies
	{
		AnimatedTexture
		{
			animatedtexturevar          "$basetexture"
			animatedtextureframenumvar  "$frame"
			animatedtextureframerate    5
		}
	}

	"$basetexture"	"vgui\\logos\\custom/raro"
	"$decal" "1"
}
`);

const weird = await renameSpray('custom', 'raro', 'raro-nuevo');
check('renombra un .vmt con los Proxies arriba', weird.ok, JSON.stringify(weird));
const weirdText = await readFile(path.join(customDir, 'raro-nuevo.vmt'), 'utf8');
check('no toca animatedtexturevar', weirdText.includes('animatedtexturevar          "$basetexture"'), weirdText);
check('reescribe solo la declaracion', /"\$basetexture"\s+"vgui\\logos\\custom\/raro-nuevo"/.test(weirdText), weirdText);
await deleteSpray('custom', 'raro-nuevo');

/* ---------------------------------------------------------------- borrar --- */

console.log('\nborrar');
const removed = await deleteSpray('custom', 'perro-feliz');
check('borra las 4 piezas', removed.ok && removed.removed.length === 4, JSON.stringify(removed));
check('no queda el .vtf', !existsSync(path.join(customDir, 'perro-feliz.vtf')));
check('no queda el .vmt', !existsSync(path.join(customDir, 'perro-feliz.vmt')));
check('no queda el del menu', !existsSync(path.join(uiDir, 'perro-feliz.vmt')));
check('no queda la copia de sprays/', !existsSync(path.join(spraysDir, 'perro-feliz.vtf')));
check('no toco al otro spray', existsSync(path.join(customDir, 'gato.vtf')));

const gone = await deleteSpray('custom', 'perro-feliz');
check('borrar dos veces avisa en vez de romper', !gone.ok && gone.error === 'SPRAY_NOT_FOUND');

/* -------------------------------------------------------------- fronteras --- */

console.log('\nfronteras');
for (const attack of ['../../../../windows/win.ini', '..\\..\\gato', 'C:\\Windows\\win.ini']) {
  check(`no resuelve "${attack}"`, (await resolveSprayFile('custom', attack)) === null);
}
check('no resuelve una ubicacion inventada', (await resolveSprayFile('inventada', 'gato')) === null);

// Borrar el spray fijo tiene que llevarse tambien su TGA fuente.
const gatoOut = await deleteSpray('custom', 'gato');
check('el spray fijo se lleva su .tga', gatoOut.ok && !existsSync(path.join(spraysDir, 'gato.tga')), JSON.stringify(gatoOut));

const empty = await listInstalledSprays();
check('la carpeta queda vacia', empty.sprays.length === 0, JSON.stringify(empty.sprays.map((s) => s.name)));

/* ------------------------------------------------------------------ fin --- */

await rm(sandbox, { recursive: true, force: true });

console.log(`\n${failures === 0 ? 'TODO OK' : `${failures} PRUEBAS FALLARON`}`);
process.exit(failures === 0 ? 0 : 1);
