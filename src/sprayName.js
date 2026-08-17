/**
 * Normalizacion del nombre de un spray.
 *
 * Vive aparte porque lo usan tanto la generacion como el renombrado, y ambos
 * tienen que coincidir: un nombre que se acepta al crear el spray tiene que
 * seguir siendo valido al renombrarlo.
 *
 * Source no lleva bien los espacios ni los acentos en las rutas de materiales,
 * asi que se reduce a minusculas, sin tildes y solo con [a-z0-9_-].
 */
export function sanitizeName(raw) {
  const cleaned = String(raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'spray';
}
