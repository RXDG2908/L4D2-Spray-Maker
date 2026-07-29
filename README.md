# L4D2 Spray Maker

[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-ff7a1a.svg)](LICENSE)
[![Descargar](https://img.shields.io/github/v/release/RXDG2908/L4D2-Spray-Maker?label=Descargar&color=52c780)](https://github.com/RXDG2908/L4D2-Spray-Maker/releases/latest)

Crea sprays **estaticos y animados** para Left 4 Dead 2 a partir de fotos, videos o GIF, y los instala directamente en el juego. Reemplaza el flujo manual de **Gif Splitter + VTFEdit**.

## Descargar

Ve a [**Releases**](https://github.com/RXDG2908/L4D2-Spray-Maker/releases/latest) y descarga `L4D2-Spray-Maker-Setup-x.x.x.exe`.

Ejecutalo y listo: **no hace falta instalar nada mas**, ni Node ni FFmpeg. La app trae todo incluido y se actualiza sola.

> Windows puede mostrar un aviso de "Windows protegio tu PC" porque el instalador no esta firmado con un certificado de pago. Pulsa **Mas informacion > Ejecutar de todas formas**.

## Actualizaciones automaticas

La app comprueba si hay una version nueva al abrirse. Si la hay, aparece un aviso arriba: pulsas **Actualizar ahora**, se descarga sola y con **Reiniciar e instalar** queda al dia. No hace falta saber nada de GitHub ni volver a descargar nada a mano.

## Que hace

- **Fotos** en PNG, JPG, BMP, TGA, WebP, TIFF o GIF, con recorte libre (no hace falta que sea cuadrado).
- **Videos y GIF**: elige hasta 10 frames de la animacion y encuadra el recorte 1:1 sobre video vertical u horizontal.
- **Previsualizador** que muestra como quedara en el juego, animandose a la velocidad real del motor.
- **Instalacion automatica**: detecta tu Left 4 Dead 2 en Steam y deja los archivos donde van.

## Cómo usarla

Idioma español o inglés, seleccionable arriba a la derecha.

### Spray normal (foto)

1. Modo **Foto**, arrastra la imagen.
2. Ajusta el **recorte**: arrastra el recuadro o tira de las esquinas. El aspecto es libre, no hace falta que sea cuadrado.
3. Elige nombre, tamaño y calidad.
4. **Instalar en el juego** (si detectó tu Left 4 Dead 2) o **Descargar .vtf**.

### Spray animado (video o GIF)

1. Modo **Video / GIF**, arrastra el archivo.
2. La app extrae hasta 30 frames candidatos y preselecciona 10 repartidos de forma pareja.
3. Ajusta la selección haciendo clic en las miniaturas — **el orden de los clics es el orden de la animación**. El máximo es 10 imágenes.
4. Si el video no es cuadrado, mueve el **recuadro 1:1** sobre la parte que quieras conservar. Funciona igual con videos verticales y horizontales.
5. Genera. La velocidad no se elige: el motor anima siempre a 5 FPS (ver más abajo).

### Los dos métodos del juego, y cuál sirve para animados

Left 4 Dead 2 ofrece dos formas de poner un spray, y **solo una sirve para los animados**:

| Método | Qué acepta | Animado |
|---|---|---|
| Opciones > Multijugador > **Importar espray** | una imagen suelta (TGA/BMP/JPG) de `left4dead2/sprays/` | no, la convierte a un VTF de un solo frame |
| Opciones > Multijugador > **Imagen pulverizada > Logotipo personalizado** | un `.vtf` ya armado | sí, reproduce todos sus frames |

Por eso un spray animado deja **solo su `.vtf`** en `sprays/`. Si además se dejaran los frames sueltos, aparecerían en el diálogo de "Importar espray" y es fácil elegir uno por error, obteniendo un spray estático de un solo cuadro.

### Velocidad de la animación: 5 FPS fijos

No es configurable. Al pintar, el motor no usa el `.vmt` del spray sino el suyo, `materials/decals/playerlogoNN.vmt` (hay 64, todos idénticos), que trae:

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

El proxy `PlayerLogo` intercambia `$basetexture` por el VTF del jugador, y el `AnimatedTexture` lo recorre a 5 FPS. Cualquier `animatedtextureframerate` que pongamos en nuestro `.vmt` se ignora para la calcomanía. Con 10 frames, la vuelta dura 2 segundos.

### Previsualizador

Antes de instalar, el panel **"Así se verá en el juego"** muestra el resultado con el recorte aplicado y a la resolución final, animándose a los mismos 5 FPS del motor. Se puede cambiar el fondo entre pared, oscuro y cuadriculado para juzgar la transparencia.

## Formatos

El archivo que **lee el juego** es `.vtf` (Valve Texture Format) con un `.vmt` que describe el material. El BMP o el TGA son formatos de *entrada*: es lo que uno le da a VTFEdit para que produzca el VTF. (Los sprays en BMP directo son de GoldSrc: Half-Life 1, CS 1.6.)

**De entrada** acepta PNG, JPG, BMP, TGA, WebP, TIFF y GIF, además de video. La validación es por extensión y no solo por tipo MIME, porque Windows no registra MIME para `.tga` ni `.webp` y el navegador los reporta con tipo vacío. Los formatos que el navegador no sabe dibujar (TGA) se previsualizan convirtiéndolos en el servidor.

**De salida** siempre genera el `.vtf`. Al instalar una foto deja además un TGA de 32 bits en `sprays/`, que es el formato de entrada habitual de VTFEdit y conserva la transparencia.

### El VTF que genera

Se replica la estructura de un VTF hecho con VTFEdit, comparada contra los sprays reales del juego:

- Versión 7.4, cadena completa de mipmaps ("Generate Mipmaps" de VTFEdit) y miniatura interna de 16×16 en DXT1.
- DXT1 cuando la imagen es opaca y DXT5 cuando tiene alfa, que es el par "Normal Format / Alpha Format" de VTFEdit.
- Flags `ClampS | ClampT` para que el borde no se repita sobre la pared, más el flag de alfa **solo si la imagen tiene transparencia real**.
- `reflectivity` calculada como el color medio, igual que hace VTFEdit.

El `.vmt` usa `LightmappedGeneric` con `$decal 1` y `$decalscale 0.250`, que es lo que usan tanto los sprays oficiales de Valve como los generados con VTFEdit. Un `UnlitGeneric` con parámetros de sprite **no** se pinta correctamente como calcomanía.

## Límite de peso y calidad

Los sprays tienen un límite recomendado de **512 KB**. La app muestra el peso estimado en vivo y te avisa si lo superas:

Las cifras incluyen la cadena de mipmaps, que agrega alrededor de un tercio:

| Resolución | Frames | Sin comprimir | DXT5 | DXT1 |
|---|---|---|---|---|
| 256x256 | 10 (animado) | 3.4 MB | 875 KB | **427 KB** |
| 256x256 | 1 | 350 KB | **88 KB** | **44 KB** |
| 512x512 | 1 | 1.4 MB | **350 KB** | **175 KB** |

Por eso los valores por defecto son DXT1 para animados y DXT5 para estáticos. DXT5 conserva transparencia con degradado; DXT1 solo admite transparencia de 1 bit (con o sin, sin medias tintas).

## Instalación en el juego

El botón **Instalar en el juego** localiza Steam en el registro de Windows y lee `libraryfolders.vdf` para recorrer todas las bibliotecas. Escribe:

```
left4dead2/materials/vgui/logos/custom/<nombre>.vtf   el spray
left4dead2/materials/vgui/logos/custom/<nombre>.vmt   su material
left4dead2/materials/vgui/logos/UI/<nombre>.vmt       icono del menu de sprays
left4dead2/sprays/<nombre>.tga     solo fotos: fuente para "Importar espray"
left4dead2/sprays/<nombre>.vtf     solo animados: listo para "Logotipo personalizado"
```

La carpeta `sprays/` se crea sola si no existe. Los animados dejan **un único .vtf** ahí, igual que VTFEdit al exportar una textura animada: los frames sueltos solo servirían para confundir el diálogo de "Importar espray", que no sabe animar.

El `.vmt` de `UI/` no lleva `.vtf` propio: apunta al mismo del spray, igual que hacen los sprays originales del juego.

Después, en la consola de desarrollador (ruta completa y con extensión):

```
cl_logofile "materials/vgui/logos/custom/<nombre>.vtf"
```

### Detección de la instalación correcta

Al mover el juego de disco, Steam deja atrás las carpetas de datos del usuario (`materials`, `cfg`, `addons`), que aparentan ser una instalación válida. Por eso el detector exige `gameinfo.txt`, `pak01_dir.vpk` y `left4dead2.exe`, y prioriza la biblioteca cuyo `appmanifest_550.acf` declara el juego. Sin esa validación es fácil escribir los sprays en una carpeta muerta y que el juego nunca los vea.

## Notas técnicas

- El VTF se genera con [`vtf-js`](https://www.npmjs.com/package/vtf-js); la compresión DXT se habilita con el addon `vtf-js/addons/squish`. No hace falta VTFLib ni herramientas externas.
- Los frames se extraen con FFmpeg a RGBA crudo y se cachean en una sesión temporal, así al cambiar la selección no se vuelve a procesar el video.
- Las sesiones temporales se borran solas a los 30 minutos y al cerrar el servidor.
- Los lados del VTF se redondean a potencia de dos, igual que el "Nearest Power Of 2" de VTFEdit. Por eso las proporciones ofrecidas son 1:1, 2:1, 1:2, 4:1 y 1:4: un 4:3 pediría un lado de 384 px, que no es potencia de dos, y terminaría estirando la imagen. Con recorte libre la app avisa si el redondeo va a deformar el resultado.
- Los animados van siempre en 1:1, con el recuadro movible sobre el video.

### Scripts de verificación

```bash
node scripts/verify-vtf.mjs
```

Genera un VTF en memoria, lo decodifica y valida dimensiones y cantidad de frames.


## Desarrollo

Requiere Node.js. FFmpeg viene incluido como dependencia, no hace falta instalarlo aparte.

```bash
npm install
npm run electron     # app de escritorio
npm start            # solo el servidor, en http://localhost:3000
npm run build        # genera el instalador en dist/
```

## Licencia

MIT — ver [LICENSE](LICENSE). Copyright (c) 2026 RXDG2908.

Los avisos de terceros (FFmpeg, Electron, vtf-js y marcas de Valve) estan en
[NOTICE.md](NOTICE.md). Este proyecto no esta afiliado ni respaldado por Valve
Corporation.
