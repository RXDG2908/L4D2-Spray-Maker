# L4D2 Spray Maker

[![Licencia: MIT](https://img.shields.io/badge/Licencia-MIT-ff7a1a.svg)](LICENSE)
[![Descargar](https://img.shields.io/github/v/release/RXDG2908/L4D2-Spray-Maker?label=Descargar&color=52c780)](https://github.com/RXDG2908/L4D2-Spray-Maker/releases/latest)

Convierte una foto, un vídeo o un GIF en un spray para Left 4 Dead 2, y lo deja
instalado en el juego. Sin Gif Splitter, sin VTFEdit.

## Descargar

Ve a [**Releases**](https://github.com/RXDG2908/L4D2-Spray-Maker/releases/latest)
y descarga `L4D2-Spray-Maker-Setup-x.x.x.exe`.

Pesa menos de 1 MB: al abrirlo descarga el resto solo. No hace falta instalar
nada más, ni Node ni FFmpeg, y la app se actualiza sola.

> Windows dirá "Windows protegió tu PC" porque el instalador no está firmado con
> un certificado de pago. Pulsa **Más información > Ejecutar de todas formas**.

## Qué hace

- **Fotos** en PNG, JPG, BMP, TGA, WebP, TIFF o GIF, con recorte libre.
- **Vídeos y GIF**: eliges hasta 10 frames y encuadras el recorte sobre el vídeo.
- **Vista previa** de cómo va a quedar en el juego, moviéndose a la velocidad real.
- **Instalación automática**: encuentra tu Left 4 Dead 2 y deja los archivos donde van.
- **Panel de tus sprays**: mira, renombra y borra los que ya tienes.
- Español e inglés.

## Cómo se usa

**Foto** → arrastra la imagen, ajusta el recuadro, ponle nombre y pulsa
**Instalar en el juego**.

**Vídeo o GIF** → arrastra el archivo. La app saca frames candidatos y
preselecciona 10. Haz clic en las miniaturas para ajustar: **el orden de los
clics es el orden de la animación**. Luego instala.

La velocidad no se elige. El juego anima todos los sprays a 5 FPS fijos, así que
con 10 frames la vuelta dura 2 segundos.

### Lo único importante que hay que saber

El juego tiene dos formas de poner un spray, y **solo una sirve para animados**:

| En el juego | Qué acepta | ¿Animado? |
|---|---|---|
| Opciones > Multijugador > **Importar espray** | una imagen suelta | **No.** La convierte a un solo cuadro |
| Opciones > Multijugador > **Imagen pulverizada > Logotipo personalizado** | un `.vtf` | **Sí** |

Si tu spray es animado, elígelo desde **Logotipo personalizado**. Con "Importar
espray" saldrá congelado.

## Tus sprays instalados

El panel **"Sprays instalados"** muestra lo que ya tienes en la carpeta del
juego, con vista previa; los animados se mueven ahí mismo. De cada uno puedes:

- **Renombrar** — cambia el nombre en todas las carpetas a la vez. Si lo tenías
  puesto, vuelve a activarlo con el comando nuevo que aparece.
- **Borrar** — te dice qué archivos se van a quitar. Van a la papelera, así que
  se pueden recuperar.
- **Copiar comando** — el `cl_logofile` listo para pegar en la consola.

## Si no encuentra el juego

La app lo busca sola al abrirse. Si no aparece, usa **Localizar manualmente** y
elige la carpeta `Left 4 Dead 2`. La elección se guarda y sobrevive a las
actualizaciones.

## Desarrollo

Requiere Node.js. FFmpeg viene incluido, no hay que instalarlo aparte.

```bash
npm install
npm run electron     # app de escritorio
npm start            # solo el servidor, en http://localhost:3000
npm run build        # genera el instalador en dist/nsis-web/
```

Los detalles de implementación —el formato VTF, por qué los 5 FPS no se pueden
cambiar, cómo se empaqueta y los scripts de verificación— están en
[TECNICO.md](TECNICO.md).

## Licencia

MIT — ver [LICENSE](LICENSE). Copyright (c) 2026 RXDG2908.

Los avisos de terceros (FFmpeg, Electron, vtf-js y marcas de Valve) están en
[NOTICE.md](NOTICE.md). Este proyecto no está afiliado ni respaldado por Valve
Corporation.
