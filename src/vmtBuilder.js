/**
 * Velocidad de animacion del spray dentro del juego.
 *
 * NO es configurable: al pintar, el motor no usa el .vmt del spray sino su
 * propio material `materials/decals/playerlogoNN.vmt` (hay 64, todos iguales),
 * que trae el proxy PlayerLogo para intercambiar la textura y un AnimatedTexture
 * con `animatedtextureframerate 5` fijo. Cualquier framerate que pongamos en
 * nuestro .vmt se ignora para la calcomania.
 */
export const ENGINE_SPRAY_FPS = 5;

/**
 * Formato tomado de los sprays reales de Left 4 Dead 2:
 *   - materials/vgui/logos/spray_stencil_ellis_01.vmt (oficial de Valve)
 *   - materials/vgui/logos/custom/*.vmt (generados con VTFEdit)
 *
 * El spray se dibuja como calcomania sobre la pared, por eso usa
 * LightmappedGeneric con $decal, y no UnlitGeneric.
 */
export function buildVmt(name, { animated, fps = ENGINE_SPRAY_FPS, folder = 'custom' }) {
  const texture = folder ? `vgui\\logos\\${folder}/${name}` : `vgui\\logos\\${name}`;

  const body = `	"$basetexture"	"${texture}"
	"$translucent" "1"
	"$decal" "1"
	"$decalscale" "0.250"`;

  if (!animated) {
    return `LightmappedGeneric\n{\n${body}\n}\n`;
  }

  return `LightmappedGeneric
{
${body}

	Proxies
	{
		AnimatedTexture
		{
			animatedtexturevar          "$basetexture"
			animatedtextureframenumvar  "$frame"
			animatedtextureframerate    ${fps}
		}
	}
}
`;
}

/**
 * Material del icono del menu de sprays (materials/vgui/logos/UI/<nombre>.vmt).
 * Apunta al MISMO vtf que el spray: no lleva textura propia.
 */
export function buildUiVmt(name, { folder = 'custom' } = {}) {
  const texture = folder ? `VGUI\\logos\\${folder}/${name}` : `VGUI\\logos\\${name}`;

  return `"UnlitGeneric"
{
	// Original shader: BaseTimesVertexColorAlphaBlendNoOverbright
	"$translucent" 1
	"$basetexture" "${texture}"
	"$vertexcolor" 1
	"$vertexalpha" 1
	"$no_fullbright" 1
	"$ignorez" 1
}
`;
}

/** Comando de consola para activar el spray, con el formato que usa config.cfg. */
export function buildLogoCommand(name, folder = 'custom') {
  const relative = folder ? `${folder}/${name}` : name;
  return `cl_logofile "materials/vgui/logos/${relative}.vtf"`;
}
