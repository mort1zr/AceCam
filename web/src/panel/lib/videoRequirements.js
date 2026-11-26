// Requisitos de calidad de PCIT-147.
export const MIN_VIDEO_WIDTH = 1280
export const MIN_VIDEO_HEIGHT = 720
export const MIN_VIDEO_FPS = 25
export const MAX_VIDEO_FPS = 60
// Tamaño máximo de un video subido (500 MB). Vive aquí, sin dependencias, para que lo usen
// también los servicios de Node (PCIT-251) sin cargar el SDK de Firebase del navegador.
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024
export const LOW_VIDEO_RESOLUTION_MESSAGE = `El video debe tener al menos 720p (${MIN_VIDEO_WIDTH}×${MIN_VIDEO_HEIGHT}). Grábalo o expórtalo en 720p o 1080p.`
export const VIDEO_FPS_MESSAGE = `El video debe tener entre ${MIN_VIDEO_FPS} y ${MAX_VIDEO_FPS} FPS. Grábalo o expórtalo dentro de ese rango.`

export function videoRequirementsError({ width, height }) {
  if (Math.min(width, height) < MIN_VIDEO_HEIGHT || Math.max(width, height) < MIN_VIDEO_WIDTH) {
    return LOW_VIDEO_RESOLUTION_MESSAGE
  }
  return null
}
