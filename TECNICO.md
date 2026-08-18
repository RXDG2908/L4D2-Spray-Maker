# Notas técnicas

Todo lo que hace falta para tocar el código, y el porqué de las decisiones que
no son evidentes. Para usar la app basta con el [README](README.md).

## Formatos

El archivo que **lee el juego** es `.vtf` (Valve Texture Format), con un `.vmt`
que describe el material. El BMP o el TGA son formatos de *entrada*: es lo que
uno le da a VTFEdit para que produzca el VTF. (Los sprays en BMP directo son de
GoldSrc: Half-Life 1, CS 1.6.)

**Entrada**: PNG, JPG, BMP, TGA, WebP, TIFF, GIF y vídeo. La validación es por
extensión y no solo por tipo MIME, porque Windows no registra MIME para `.tga`
ni `.webp` y el navegador los reporta con tipo vacío. Lo que el navegador no
sabe dibujar (TGA) se previsualiza convirtiéndolo en el servidor.

**Salida**: siempre `.vtf`. Al instalar una foto se deja además un TGA de 32
bits en `sprays/`, que es el formato de entrada habitual de VTFEdit y conserva
la transparencia.

### El VTF que genera

Se replica la estructura de un VTF hecho con VTFEdit, comparada contra los
sprays reales del juego:

- Versión 7.4, cadena completa de mipmaps y miniatura interna de 16×16 en DXT1.
- DXT1 si la imagen es opaca, DXT5 si tiene alfa. Es el par "Normal Format /
  Alpha Format" de VTFEdit.
- Flags `ClampS | ClampT` para que el borde no se repita sobre la pared, más el
  flag de alfa **solo si hay transparencia real**.
- `reflectivity` calculada como el color medio, igual que VTFEdit.

El `.vmt` usa `LightmappedGeneric` con `$decal 1` y `$decalscale 0.250`, que es
lo que usan tanto los sprays oficiales de Valve como los de VTFEdit. Un
`UnlitGeneric` con parámetros de sprite **no** se pinta bien como calcomanía.

Los lados se redondean a potencia de dos ("Nearest Power Of 2"). Por eso las
proporciones ofrecidas son 1:1, 2:1, 1:2, 4:1 y 1:4: un 4:3 pediría un lado de
384 px, que no es potencia de dos, y acabaría estirando la imagen. Con recorte
libre la app avisa si el redondeo va a deformar el resultado.

## Los 5 FPS son del motor, no nuestros

Al pintar, el juego no usa el `.vmt` del spray sino el suyo,
`materials/decals/playerlogoNN.vmt` (hay 64, todos idénticos):

```
Proxies
{
    PlayerLogo { }
    AnimatedTexture
    {
        animatedtexturevar $basetexture
        animatedtextureframenumvar $frame
        animatedtextureframerate 5
    }
}
```

El proxy `PlayerLogo` intercambia `$basetexture` por el VTF del jugador y el
`AnimatedTexture` lo recorre a 5 FPS. Cualquier `animatedtextureframerate` que
pongamos en nuestro `.vmt` **se ignora** para la calcomanía. Con 10 frames, la
vuelta dura 2 segundos.

## Límite de peso

El límite recomendado es **512 KB**. Las cifras incluyen los mipmaps, que suman
alrededor de un tercio:

| Resolución | Frames | Sin comprimir | DXT5 | DXT1 |
|---|---|---|---|---|
| 256x256 | 10 (animado) | 3,4 MB | 875 KB | **427 KB** |
| 256x256 | 1 | 350 KB | **88 KB** | **44 KB** |
| 512x512 | 1 | 1,4 MB | **350 KB** | **175 KB** |

Por eso los valores por defecto son DXT1 para animados y DXT5 para estáticos.
DXT5 conserva transparencia con degradado; DXT1 solo admite 1 bit de alfa.

## Instalación en el juego

### Qué archivos escribe

```
left4dead2/sprays/<nombre>.tga                        fotos: fuente para "Importar espray"
left4dead2/sprays/<nombre>.vtf                        animados: para "Logotipo personalizado"
left4dead2/materials/vgui/logos/custom/<nombre>.vtf   el spray
left4dead2/materials/vgui/logos/custom/<nombre>.vmt   su material
left4dead2/materials/vgui/logos/UI/<nombre>.vmt       icono del menú
```

El `.vmt` de `UI/` no lleva `.vtf` propio: apunta al mismo del spray, igual que
hacen los sprays originales.

Para activarlo por consola (ruta completa y con extensión):

```
cl_logofile "materials/vgui/logos/custom/<nombre>.vtf"
```

### Detectar la instalación correcta

Al mover el juego de disco, Steam deja atrás las carpetas de datos del usuario
(`materials`, `cfg`, `addons`), que aparentan ser una instalación válida. Por eso
el detector exige `gameinfo.txt`, `pak01_dir.vpk` y `left4dead2.exe`, y prioriza
la biblioteca cuyo `appmanifest_550.acf` declara el juego. Sin esa validación es
fácil escribir los sprays en una carpeta muerta y que el juego nunca los vea.

La ruta elegida a mano se guarda en el perfil del usuario, así que sobrevive a
las actualizaciones. Se acepta apuntar a `Left 4 Dead 2`, a `left4dead2` o a
`left4dead2\sprays`: la app deduce la raíz.

### Nombres sin colisiones

El nombre se regenera con cada archivo y se comprueba contra los sprays ya
instalados. Si `mi-spray` existe, propone `mi-spray-2`.

Al renombrar desde el panel no basta con mover archivos: el `.vmt` lleva dentro
la ruta de la textura (`$basetexture`) y hay que reescribirla, o el spray sale
en rosa y negro. Solo se reescribe la declaración, nunca el
`animatedtexturevar "$basetexture"` de los proxies.

## Dos versiones de vtf-js, a propósito

- **Generar**: [`vtf-js`](https://www.npmjs.com/package/vtf-js) 0.9.4, con el
  addon `vtf-js/addons/squish` para la compresión DXT. No hace falta VTFLib.
- **Leer**: una segunda copia, `vtf-js@1.x`, declarada como `vtf-js-decoder`. La
  0.9.4 no sabe leer los VTF con tabla de recursos —los de VTFEdit y los
  oficiales de Valve— y falla con *"Offset is outside the bounds of the
  DataView"*. El visualizador tiene que mostrar también esos, así que hace falta
  el lector nuevo. Se mantienen las dos porque la API de 1.x cambió bastante
  (`VFrameCollection` desapareció) y migrar el generador es un trabajo aparte,
  con su propia verificación.

El lector **no** importa `vtf-js-decoder/addons/squish`, y no es un olvido: las
dos versiones comparten la misma copia de `libsquish-js`, y cargar ese addon
deja al generador sin compresión DXT. Para leer no hace falta, porque 1.x trae
su propio descompresor.

## Otros detalles

- Las miniaturas del panel de sprays no son PNG: se lee el nivel de mipmap que
  el propio VTF ya trae y se vuelca en un canvas, sin reescalar ni recomprimir.
- Los frames se extraen con FFmpeg a RGBA crudo y se cachean en una sesión
  temporal: al cambiar la selección no se reprocesa el vídeo.
- Las sesiones temporales se borran solas a los 30 minutos y al cerrar el
  servidor.
- Las preferencias (idioma, panel abierto) viven en el perfil del usuario y no
  en `localStorage`. El servidor embebido arranca en un puerto libre distinto
  cada vez y `localStorage` se separa por origen, que incluye el puerto: ahí se
  perdían en cada arranque.
- Borrar un spray manda sus archivos a la papelera de Windows. Solo la app de
  escritorio puede hacerlo; con `npm start` el borrado es definitivo.
- El atributo `hidden` se refuerza con `[hidden] { display: none !important; }`.
  Una regla propia con `display` le gana a la hoja del navegador, y había
  elementos ocultos que se seguían pintando.
- El área de trabajo pasa a dos columnas a partir de 900 px de ancho, con la
  columna del previsualizador fija. Por debajo se apila.

## Scripts de verificación

```bash
node scripts/verify-vtf.mjs
```

Genera un VTF en memoria, lo decodifica y valida dimensiones y frames.

```bash
node scripts/test-spray-library.mjs
```

Prueba el panel de sprays instalados: listar, renombrar y borrar. Monta una
instalación falsa del juego en una carpeta temporal y mueve el "home" del
proceso, así que **no toca ni tus sprays ni tu configuración**. Comprueba, entre
otras cosas, que al renombrar se reescribe el `$basetexture`, que no se pisa un
spray existente y que los nombres con `../` no salen de las carpetas del juego.

```bash
node scripts/test-prefs.mjs
```

Arranca el servidor dos veces en puertos distintos y comprueba que las
preferencias siguen ahí.

## Empaquetado

El target es `nsis-web`, no `nsis`. Produce dos artefactos que se suben juntos
al Release:

| Archivo | Peso | Qué es |
|---|---|---|
| `L4D2-Spray-Maker-Setup-x.x.x.exe` | ~0,7 MB | La cáscara que descarga el resto |
| `l4d2-spray-maker-x.x.x-x64.nsis.7z` | ~131 MB | El paquete con la app |

La cáscara saca la URL del bloque `publish` de `package.json`, así que apunta
sola al Release que toca. **Si el `.7z` está en la misma carpeta que el `.exe`,
lo usa de ahí en vez de descargarlo**: cómodo para probar en local, pero una
prueba hecha así no comprueba la descarga.

Lo que se descarga en total es lo mismo; lo que cambia es que el botón entrega
un archivo diminuto. El peso real está en Electron (~305 MB instalados) y en los
binarios de FFmpeg (~139 MB).

El actualizador lee el bloque `packages` del `latest.yml`, descarga la cáscara y
el `.7z`, y lanza el instalador con `--package-file`, así que no baja el paquete
dos veces.
