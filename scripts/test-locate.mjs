/** Prueba la localizacion manual del juego con distintas rutas. */
const GAME = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Left 4 Dead 2';

const cases = [
  ['carpeta del juego', GAME],
  ['un nivel adentro (left4dead2)', `${GAME}\\left4dead2`],
  ['dos niveles (left4dead2\\sprays)', `${GAME}\\left4dead2\\sprays`],
  ['con comillas alrededor', `"${GAME}"`],
  ['carpeta cualquiera (debe fallar)', 'C:\\Windows'],
  ['instalacion muerta de D: (debe fallar)', 'D:\\SteamLibrary\\steamapps\\common\\Left 4 Dead 2'],
  ['ruta inexistente (debe fallar)', 'Z:\\no\\existe'],
];

for (const [label, value] of cases) {
  const resp = await fetch('http://localhost:3000/api/steam/locate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: value }),
  });
  const data = await resp.json();
  const result = resp.ok ? `OK -> ${data.gameRoot}` : `RECHAZADO (${data.error})`;
  console.log(`${label.padEnd(38)} ${result}`);
}

// Dejar la app en deteccion automatica
const auto = await (await fetch('http://localhost:3000/api/steam/auto', { method: 'POST' })).json();
console.log(`\nvuelta a automatico -> source=${auto.source} found=${auto.found}`);
