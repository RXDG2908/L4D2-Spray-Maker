const TRANSLATIONS = {
  es: {
    'app.title': 'L4D2 Spray Maker',
    'app.subtitle': 'Convierte una foto o un video en un spray listo para Left 4 Dead 2.',

    'mode.image': 'Foto (spray normal)',
    'mode.video': 'Video / GIF (animado)',

    'drop.image': 'Arrastra una foto aquí, o haz clic para elegir un archivo',
    'drop.video': 'Arrastra un video o GIF aquí, o haz clic para elegir un archivo',
    'drop.remove': 'Quitar',

    'field.name': 'Nombre del spray',
    'field.name.placeholder': 'mi-spray',
    'field.size': 'Resolución',
    'field.maxSide': 'Tamaño (lado más largo)',
    'field.quality': 'Calidad',
    'field.fpsFixed': 'La animación va a 5 FPS: el juego usa su propio material de calcomanía con esa velocidad fija, así que no se puede cambiar. Con 10 frames, la vuelta dura 2 segundos.',

    'quality.uncompressed': 'Alta (sin comprimir)',
    'quality.dxt5': 'Media (DXT5, con transparencia)',
    'quality.dxt1': 'Baja (DXT1, la más liviana)',

    'frames.title': 'Elige los frames de la animación',
    'frames.help': 'Un spray animado admite hasta {max} imágenes. Haz clic en las miniaturas en el orden que quieras que se vean.',
    'frames.counter': '{n} de {max} seleccionados',
    'frames.auto': 'Elegir {max} automáticamente',
    'frames.clear': 'Limpiar selección',
    'frames.analyzing': 'Analizando el archivo...',

    'size.estimate': 'Peso estimado: {size}',
    'size.warning': 'Supera el límite recomendado de 512 KB. Baja la resolución o usa una calidad más comprimida.',

    'crop.title': 'Recorte',
    'crop.help': 'Arrastra el recuadro para moverlo, o tira de las esquinas para cambiar su tamaño.',
    'crop.reset': 'Restablecer',
    'crop.info': 'Resultado: {width} x {height} px',

    'aspect.free': 'Libre',
    'aspect.square': 'Cuadrado 1:1',
    'aspect.landscape21': 'Horizontal 2:1',
    'aspect.portrait12': 'Vertical 1:2',
    'aspect.landscape41': 'Horizontal 4:1',
    'aspect.portrait14': 'Vertical 1:4',
    'crop.stretch': 'la imagen se estirará un poco: Source exige lados potencia de dos',

    'preview.title': 'Así se verá en el juego',
    'preview.bg.wall': 'Pared',
    'preview.bg.dark': 'Oscuro',
    'preview.bg.checker': 'Transparencia',
    'preview.info.static': '{width} x {height} px',
    'preview.info.animated': '{width} x {height} px · {frames} frames a {fps} FPS ({seconds}s por vuelta, tal como se verá en el juego)',

    'action.download': 'Descargar .vtf',
    'action.install': 'Instalar en el juego',
    'action.installing': 'Instalando...',
    'action.generating': 'Generando spray...',

    'steam.detected': 'Left 4 Dead 2 detectado en:',
    'steam.notFound': 'No se encontró Left 4 Dead 2 instalado. Puedes descargar el .vtf e instalarlo a mano.',
    'steam.searching': 'Buscando la instalación del juego...',

    'status.downloaded': 'Se descargó el .vtf. Cópialo a materials/vgui/logos/custom/ dentro del juego.',
    'status.installed': 'Instalado en el juego.',
    'status.howToStatic': 'Actívalo por consola, o desde Opciones > Multijugador > Imagen pulverizada > Logotipo personalizado.',
    'status.howToAnimated': 'Importante: para que se anime tienes que elegirlo desde Opciones > Multijugador > Imagen pulverizada > Logotipo personalizado (elegir el .vtf). La opción "Importar espray" solo toma imágenes fijas.',
    'status.selectFile': 'Elige un archivo de tipo {kind}.',
    'status.kind.image': 'imagen',
    'status.kind.video': 'video o GIF',

    'error.NO_FILE': 'No se recibió ningún archivo.',
    'error.FILE_TOO_LARGE': 'El archivo es demasiado grande (máximo 150 MB).',
    'error.FFMPEG_MISSING': 'No se encontró FFmpeg. Instálalo y agrégalo al PATH del sistema.',
    'error.FFMPEG_FAILED': 'FFmpeg no pudo procesar el archivo.',
    'error.DECODE_FAILED': 'No se pudo leer el contenido del archivo.',
    'error.PROBE_FAILED': 'No se pudo analizar el archivo.',
    'error.NO_VIDEO_STREAM': 'El archivo no contiene imagen.',
    'error.SESSION_EXPIRED': 'La sesión expiró. Vuelve a subir el archivo.',
    'error.TOO_FEW_FRAMES': 'Elige al menos 2 frames.',
    'error.GAME_NOT_FOUND': 'No se encontró la instalación de Left 4 Dead 2.',
    'error.UNKNOWN': 'Ocurrió un error inesperado.',

    'update.available': 'Hay una versión nueva disponible ({version}).',
    'update.download': 'Actualizar ahora',
    'update.downloading': 'Descargando la actualización... {percent}%',
    'update.ready': 'La versión {version} está lista para instalarse.',
    'update.restart': 'Reiniciar e instalar',
  },

  en: {
    'app.title': 'L4D2 Spray Maker',
    'app.subtitle': 'Turn a photo or a video into a spray ready for Left 4 Dead 2.',

    'mode.image': 'Photo (static spray)',
    'mode.video': 'Video / GIF (animated)',

    'drop.image': 'Drag a photo here, or click to pick a file',
    'drop.video': 'Drag a video or GIF here, or click to pick a file',
    'drop.remove': 'Remove',

    'field.name': 'Spray name',
    'field.name.placeholder': 'my-spray',
    'field.size': 'Resolution',
    'field.maxSide': 'Size (longest side)',
    'field.quality': 'Quality',
    'field.fpsFixed': 'The animation runs at 5 FPS: the game uses its own decal material with that fixed rate, so it cannot be changed. With 10 frames, one loop lasts 2 seconds.',

    'quality.uncompressed': 'High (uncompressed)',
    'quality.dxt5': 'Medium (DXT5, with transparency)',
    'quality.dxt1': 'Low (DXT1, smallest)',

    'frames.title': 'Pick the animation frames',
    'frames.help': 'An animated spray supports up to {max} images. Click the thumbnails in the order you want them to play.',
    'frames.counter': '{n} of {max} selected',
    'frames.auto': 'Auto-pick {max}',
    'frames.clear': 'Clear selection',
    'frames.analyzing': 'Analyzing file...',

    'size.estimate': 'Estimated size: {size}',
    'size.warning': 'Over the recommended 512 KB limit. Lower the resolution or pick a more compressed quality.',

    'crop.title': 'Crop',
    'crop.help': 'Drag the box to move it, or pull the corners to resize it.',
    'crop.reset': 'Reset',
    'crop.info': 'Result: {width} x {height} px',

    'aspect.free': 'Free',
    'aspect.square': 'Square 1:1',
    'aspect.landscape21': 'Landscape 2:1',
    'aspect.portrait12': 'Portrait 1:2',
    'aspect.landscape41': 'Landscape 4:1',
    'aspect.portrait14': 'Portrait 1:4',
    'crop.stretch': 'the image will stretch slightly: Source requires power-of-two sides',

    'preview.title': 'How it will look in game',
    'preview.bg.wall': 'Wall',
    'preview.bg.dark': 'Dark',
    'preview.bg.checker': 'Transparency',
    'preview.info.static': '{width} x {height} px',
    'preview.info.animated': '{width} x {height} px · {frames} frames at {fps} FPS ({seconds}s per loop, exactly as in game)',

    'action.download': 'Download .vtf',
    'action.install': 'Install into the game',
    'action.installing': 'Installing...',
    'action.generating': 'Generating spray...',

    'steam.detected': 'Left 4 Dead 2 found at:',
    'steam.notFound': 'Left 4 Dead 2 was not found. You can download the .vtf and install it manually.',
    'steam.searching': 'Looking for the game installation...',

    'status.downloaded': 'The .vtf was downloaded. Copy it into materials/vgui/logos/custom/ in the game.',
    'status.installed': 'Installed into the game.',
    'status.howToStatic': 'Enable it from the console, or via Options > Multiplayer > Spray paint > Custom logo.',
    'status.howToAnimated': 'Important: for it to animate you must pick it from Options > Multiplayer > Spray paint > Custom logo (choose the .vtf). The "Import spray" option only takes still images.',
    'status.selectFile': 'Please pick a {kind} file.',
    'status.kind.image': 'image',
    'status.kind.video': 'video or GIF',

    'error.NO_FILE': 'No file was received.',
    'error.FILE_TOO_LARGE': 'The file is too large (150 MB max).',
    'error.FFMPEG_MISSING': 'FFmpeg was not found. Install it and add it to your system PATH.',
    'error.FFMPEG_FAILED': 'FFmpeg could not process the file.',
    'error.DECODE_FAILED': 'The file contents could not be read.',
    'error.PROBE_FAILED': 'The file could not be analyzed.',
    'error.NO_VIDEO_STREAM': 'The file contains no image data.',
    'error.SESSION_EXPIRED': 'Your session expired. Please upload the file again.',
    'error.TOO_FEW_FRAMES': 'Pick at least 2 frames.',
    'error.GAME_NOT_FOUND': 'Left 4 Dead 2 installation was not found.',
    'error.UNKNOWN': 'An unexpected error occurred.',

    'update.available': 'A new version is available ({version}).',
    'update.download': 'Update now',
    'update.downloading': 'Downloading the update... {percent}%',
    'update.ready': 'Version {version} is ready to install.',
    'update.restart': 'Restart and install',
  },
};

let currentLang = localStorage.getItem('l4d2spray.lang') || 'es';

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = TRANSLATIONS[lang] ? lang : 'es';
  localStorage.setItem('l4d2spray.lang', currentLang);
  applyTranslations();
}

/** Traduce una clave, reemplazando {marcadores} con los valores dados. */
export function t(key, vars = {}) {
  const table = TRANSLATIONS[currentLang] || TRANSLATIONS.es;
  let text = table[key] ?? TRANSLATIONS.es[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replaceAll(`{${name}}`, value);
  }
  return text;
}

/** Aplica las traducciones a todo el DOM marcado con data-i18n. */
export function applyTranslations() {
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.dispatchEvent(new CustomEvent('languagechange'));
}
