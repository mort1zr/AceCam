// Foto de perfil de un jugador, guardada en Firestore (sin Firebase Storage).
//
// El proyecto está en el plan Spark y no tiene Cloud Storage: Firebase Storage exige el plan
// Blaze (ver docs/devsecops.md). Por eso la foto se reduce en el navegador a un JPEG de
// 256×256 que cabe en un documento de Firestore, en players/{playerId}/media/photo-{id}, y la
// ficha del jugador guarda esa ruta en photoPath. Las reglas están en firestore.rules.
//
// uploadPlayerPhoto({ file, orgId, actorId, playerId, signal, onProgress }) → Promise<string>
// Devuelve exactamente `players/${playerId}/media/photo-…`.

import { Bytes, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore'

/** Tamaño máximo del archivo que elige el usuario (antes de reducirlo). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
/** Lado de la foto guardada, en píxeles. Si cambia, cambiar también firestore.rules. */
export const PHOTO_SIZE = 256
/** Máximo de la foto ya reducida. Si cambia, cambiar también firestore.rules. */
export const MAX_STORED_PHOTO_BYTES = 60 * 1024
export const PHOTO_CONTENT_TYPE = 'image/jpeg'

export const PHOTO_CONTENT_TYPES = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })

const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const PHOTO_ID = /^photo-[a-z0-9]{8,32}$/

function photoError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function abortError() {
  return new DOMException('Se canceló la subida de la foto.', 'AbortError')
}

/** 'jpg' | 'jpeg' | 'png' | 'webp' según el nombre o, si no tiene extensión conocida, el tipo; null si no es válida. */
export function photoExtension(file) {
  const fromName = String(file?.name ?? '').toLowerCase().match(/\.(jpe?g|png|webp)$/)?.[1]
  return fromName ?? EXTENSION_BY_TYPE[file?.type] ?? null
}

/** Ruta del documento de la foto: players/{playerId}/media/photo-{id}. */
export function playerPhotoPath({ playerId, photoId }) {
  return `players/${playerId}/media/${photoId}`
}

/** Comprueba que `path` sea la foto de este jugador y devuelve el ID del documento; null si no. */
export function playerPhotoId(playerId, path) {
  if (typeof playerId !== 'string' || !playerId || /[/\\]/.test(playerId) || typeof path !== 'string') return null
  const prefix = `players/${playerId}/media/`
  const id = path.startsWith(prefix) ? path.slice(prefix.length) : ''
  return PHOTO_ID.test(id) ? id : null
}

function newPhotoId() {
  const random = new Uint8Array(10)
  globalThis.crypto.getRandomValues(random)
  return `photo-${Date.now().toString(36)}${Array.from(random, byte => (byte % 36).toString(36)).join('')}`.slice(0, 38)
}

/** Revisa el archivo antes de reducirlo; lanza un error con code 'photo/...'. */
export function checkPhotoFile(file, maxBytes = MAX_PHOTO_BYTES) {
  const extension = photoExtension(file)
  if (!extension) throw photoError('photo/invalid-type', 'La foto debe ser .jpg, .png o .webp.')
  if (!file.size) throw photoError('photo/empty', 'El archivo de la foto está vacío.')
  const limit = Math.min(maxBytes ?? MAX_PHOTO_BYTES, MAX_PHOTO_BYTES)
  if (file.size > limit) {
    throw photoError('photo/too-large', `La foto supera el máximo de ${Math.floor(limit / (1024 * 1024))} MB.`)
  }
  return extension
}

/**
 * Recorta el centro de la imagen en un cuadrado y lo guarda como JPEG de PHOTO_SIZE px,
 * bajando la calidad hasta que quepa en MAX_STORED_PHOTO_BYTES. Solo en el navegador.
 */
export async function resizePhotoToJpeg(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw photoError('photo/unreadable', 'No pudimos leer la imagen. Prueba con otro archivo .jpg, .png o .webp.')
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_SIZE
    canvas.height = PHOTO_SIZE
    const context = canvas.getContext('2d')
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
    for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, PHOTO_CONTENT_TYPE, quality))
      if (blob && blob.size <= MAX_STORED_PHOTO_BYTES) return new Uint8Array(await blob.arrayBuffer())
    }
  } finally {
    bitmap.close?.()
  }
  throw photoError('photo/too-large', 'No pudimos reducir la foto lo suficiente. Prueba con otra imagen.')
}

const ERROR_MESSAGES = {
  'permission-denied': 'No tienes permiso para cambiar la foto de este jugador.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  unavailable: 'Se perdió la conexión. Inténtalo de nuevo.',
  'resource-exhausted': 'No queda espacio para más fotos.',
}

/** Mensaje para el usuario; nunca muestra el error técnico. */
export function photoErrorMessage(error) {
  if (error?.name === 'AbortError') return 'Se canceló la subida de la foto.'
  if (error?.code?.startsWith('photo/')) return error.message
  return ERROR_MESSAGES[error?.code] ?? 'No pudimos guardar la foto. Inténtalo de nuevo.'
}

export function createPhotoUploadService({ db, resizeImage = resizePhotoToJpeg }) {
  if (!db) throw new TypeError('La foto de perfil necesita Firestore.')

  async function uploadPlayerPhoto({ file, orgId, actorId, playerId, maxBytes, signal, onProgress }) {
    if (signal?.aborted) throw abortError()
    if (!orgId || !actorId || !playerId || /[/\\]/.test(playerId)) {
      throw photoError('photo/missing-identity', 'Falta la organización, el usuario o el jugador.')
    }
    checkPhotoFile(file, maxBytes)
    onProgress?.(0)
    const jpeg = await resizeImage(file)
    if (signal?.aborted) throw abortError()
    if (!(jpeg instanceof Uint8Array) || !jpeg.length || jpeg.length > MAX_STORED_PHOTO_BYTES) {
      throw photoError('photo/too-large', 'No pudimos reducir la foto lo suficiente. Prueba con otra imagen.')
    }
    onProgress?.(50)
    const path = playerPhotoPath({ playerId, photoId: newPhotoId() })
    await setDoc(doc(db, path), {
      orgId, contentType: PHOTO_CONTENT_TYPE, width: PHOTO_SIZE, height: PHOTO_SIZE,
      data: Bytes.fromUint8Array(jpeg), createdBy: actorId, createdAt: serverTimestamp(),
    })
    onProgress?.(100)
    return path
  }

  /** Borra una foto anterior. Borrar un documento que ya no existe no es un error. */
  async function removePlayerPhoto(path) {
    if (!/^players\/[^/]+\/media\/photo-[a-z0-9]{8,32}$/.test(path ?? '')) return
    await deleteDoc(doc(db, path))
  }

  return { uploadPlayerPhoto, removePlayerPhoto }
}
