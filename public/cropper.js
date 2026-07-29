/**
 * Recortador interactivo.
 *
 * Dibuja un recuadro movible y redimensionable sobre la imagen de origen y
 * devuelve el rectangulo en coordenadas normalizadas (0..1), que es lo que
 * espera el filtro `crop` de FFmpeg en el servidor.
 *
 * Con `aspect` fijo (1 para los animados) el recuadro se mantiene cuadrado;
 * con `aspect = null` el usuario lo estira libremente.
 */
export class Cropper {
  constructor(container) {
    this.container = container;
    this.aspect = null;
    this.rect = { x: 0, y: 0, w: 1, h: 1 };
    this.onChange = () => {};
    this.natural = { width: 1, height: 1 };

    this.container.classList.add('cropper');
    this.container.innerHTML = `
      <div class="cropper-inner">
        <img class="cropper-img" alt="" />
        <div class="cropper-shade"></div>
        <div class="cropper-box">
          <span class="cropper-handle" data-h="nw"></span>
          <span class="cropper-handle" data-h="ne"></span>
          <span class="cropper-handle" data-h="sw"></span>
          <span class="cropper-handle" data-h="se"></span>
        </div>
      </div>`;

    this.inner = this.container.querySelector('.cropper-inner');
    this.img = this.container.querySelector('.cropper-img');
    this.box = this.container.querySelector('.cropper-box');

    this.box.addEventListener('pointerdown', (e) => this.#startDrag(e));
    this.container.querySelectorAll('.cropper-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => this.#startResize(e, handle.dataset.h));
    });
  }

  /** Carga una imagen y reinicia el recuadro al maximo que permita el aspecto. */
  setImage(src, { aspect = null } = {}) {
    this.aspect = aspect;
    return new Promise((resolve) => {
      this.img.onload = () => {
        this.natural = { width: this.img.naturalWidth, height: this.img.naturalHeight };
        this.reset();
        resolve();
      };
      this.img.onerror = () => resolve();
      this.img.src = src;
    });
  }

  setAspect(aspect) {
    this.aspect = aspect;
    this.reset();
  }

  /** Recuadro centrado y lo mas grande posible dentro de la imagen. */
  reset() {
    const imgAspect = this.natural.width / this.natural.height;

    if (!this.aspect) {
      this.rect = { x: 0, y: 0, w: 1, h: 1 };
    } else if (imgAspect > this.aspect) {
      // La imagen es mas ancha: el alto manda.
      const w = (this.aspect / imgAspect);
      this.rect = { x: (1 - w) / 2, y: 0, w, h: 1 };
    } else {
      const h = (imgAspect / this.aspect);
      this.rect = { x: 0, y: (1 - h) / 2, w: 1, h };
    }
    this.#render();
  }

  getRect() {
    return { ...this.rect };
  }

  /** Tamano en pixeles del recorte sobre la imagen original. */
  getPixelSize(sourceWidth, sourceHeight) {
    return {
      width: Math.round(this.rect.w * (sourceWidth ?? this.natural.width)),
      height: Math.round(this.rect.h * (sourceHeight ?? this.natural.height)),
    };
  }

  #render() {
    // Un valor no finito dejaria el CSS con "NaN%" y el recuadro se congelaria.
    const safe = (v, fallback) => (Number.isFinite(v) ? v : fallback);
    this.rect = {
      x: Math.max(0, Math.min(safe(this.rect.x, 0), 1)),
      y: Math.max(0, Math.min(safe(this.rect.y, 0), 1)),
      w: Math.max(0.01, Math.min(safe(this.rect.w, 1), 1)),
      h: Math.max(0.01, Math.min(safe(this.rect.h, 1), 1)),
    };
    const { x, y, w, h } = this.rect;
    this.box.style.left = `${x * 100}%`;
    this.box.style.top = `${y * 100}%`;
    this.box.style.width = `${w * 100}%`;
    this.box.style.height = `${h * 100}%`;
    // El sombreado exterior se hace con un recorte inverso.
    this.container.querySelector('.cropper-shade').style.clipPath =
      `polygon(0% 0%, 0% 100%, ${x * 100}% 100%, ${x * 100}% ${y * 100}%, ` +
      `${(x + w) * 100}% ${y * 100}%, ${(x + w) * 100}% ${(y + h) * 100}%, ` +
      `${x * 100}% ${(y + h) * 100}%, ${x * 100}% 100%, 100% 100%, 100% 0%)`;
    this.onChange(this.getRect());
  }

  /**
   * Medidas del area de recorte.
   * Si el elemento todavia no tiene layout (pestana en segundo plano, imagen
   * recien insertada) devolveria 0 y los desplazamientos saldrian NaN, asi que
   * caemos al tamano natural de la imagen.
   */
  #bounds() {
    const r = this.inner.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return r;
    return {
      left: r.left,
      top: r.top,
      width: this.natural.width || 1,
      height: this.natural.height || 1,
    };
  }

  #startDrag(e) {
    if (e.target.classList.contains('cropper-handle')) return;
    e.preventDefault();
    const b = this.#bounds();
    const startX = e.clientX; const startY = e.clientY;
    const orig = { ...this.rect };

    const move = (ev) => {
      const dx = (ev.clientX - startX) / b.width;
      const dy = (ev.clientY - startY) / b.height;
      this.rect.x = Math.max(0, Math.min(orig.x + dx, 1 - orig.w));
      this.rect.y = Math.max(0, Math.min(orig.y + dy, 1 - orig.h));
      this.#render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  #startResize(e, corner) {
    e.preventDefault();
    e.stopPropagation();
    const b = this.#bounds();
    const startX = e.clientX; const startY = e.clientY;
    const orig = { ...this.rect };
    // Relacion ancho/alto en pixeles de pantalla, para mantener el aspecto real.
    const pxAspect = b.width / b.height;
    const minSize = 0.05;

    const move = (ev) => {
      const dx = (ev.clientX - startX) / b.width;
      const dy = (ev.clientY - startY) / b.height;

      let { x, y, w, h } = orig;
      const west = corner.includes('w');
      const north = corner.includes('n');

      if (west) { w = orig.w - dx; x = orig.x + dx; } else { w = orig.w + dx; }
      if (north) { h = orig.h - dy; y = orig.y + dy; } else { h = orig.h + dy; }

      if (this.aspect) {
        // Mandamos con el ancho y derivamos el alto para respetar el aspecto.
        h = (w * pxAspect) / this.aspect;
        if (north) y = orig.y + orig.h - h;
      }

      w = Math.max(minSize, w);
      h = Math.max(minSize, h);
      if (west) x = Math.min(x, orig.x + orig.w - minSize);
      if (north) y = Math.min(y, orig.y + orig.h - minSize);

      // Recortar contra los bordes sin deformar.
      x = Math.max(0, x); y = Math.max(0, y);
      if (x + w > 1) w = 1 - x;
      if (y + h > 1) h = 1 - y;
      if (this.aspect) {
        const hFromW = (w * pxAspect) / this.aspect;
        if (y + hFromW > 1) {
          h = 1 - y;
          w = (h * this.aspect) / pxAspect;
        } else {
          h = hFromW;
        }
      }

      this.rect = { x, y, w, h };
      this.#render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}
