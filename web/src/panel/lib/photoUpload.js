// Subida de la foto de perfil de un jugador a Storage.
// Recibe { storage } desde fuera para poder probarlo contra el emulador
// sin importar src/panel/lib/firebase.js. Las reglas están en storage.rules.
//
// uploadPlayerPhoto({ file, orgId, actorId, playerId, signal, onProgress }) → Promise<string>
// Devuelve exactamente `orgs/${orgId}/players/${playerId}/photo.jpg|jpeg|png|webp`.

import { deleteObject, ref, uploadBytesResumable } from 'firebase/storage'

/** Límite de las reglas de Storage. Si cambia, cambiar también storage.rules. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

export const PHOTO_CONTENT_TYPES = Object.freeze({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })

const EXTENSION_BY_TYPE = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

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

export function playerPhotoPath({ orgId, playerId, extension }) {
  return `orgs/${orgId}/players/${playerId}/photo.${extension}`
}

/** Revisa el archivo antes de subirlo; lanza un error con code 'photo/...'. */
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

const ERROR_MESSAGES = {
  'storage/unauthorized': 'No tienes permiso para subir la foto de este jugador.',
  'storage/unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión.',
  'storage/retry-limit-exceeded': 'Se perdió la conexión durante la subida. Inténtalo de nuevo.',
  'storage/quota-exceeded': 'No queda espacio para más archivos.',
}

/** Mensaje para el usuario; nunca muestra el error técnico. */
export function photoErrorMessage(error) {
  if (error?.name === 'AbortError') return 'Se canceló la subida de la foto.'
  if (error?.code?.startsWith('photo/')) return error.message
  return ERROR_MESSAGES[error?.code] ?? 'No pudimos subir la foto. Inténtalo de nuevo.'
}

export function createPhotoUploadService({ storage }) {
  function uploadPlayerPhoto({ file, orgId, actorId, playerId, maxBytes, signal, onProgress }) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(abortError())
      if (!orgId || !actorId || !playerId) {
        return reject(photoError('photo/missing-identity', 'Falta la organización, el usuario o el jugador.'))
      }

      let extension
      try {
        extension = checkPhotoFile(file, maxBytes)
      } catch (error) {
        return reject(error)
      }

      const path = playerPhotoPath({ orgId, playerId, extension })
      const task = uploadBytesResumable(ref(storage, path), file, {
        contentType: PHOTO_CONTENT_TYPES[extension],
        customMetadata: { uploadedBy: actorId },
      })

      const cancel = () => task.cancel()
      signal?.addEventListener('abort', cancel, { once: true })
      const done = () => signal?.removeEventListener('abort', cancel)

      onProgress?.(0)
      task.on(
        'state_changed',
        snapshot => {
          if (snapshot.totalBytes > 0) onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
        },
        error => {
          done()
          reject(error?.code === 'storage/canceled' ? abortError() : error)
        },
        () => {
          done()
          onProgress?.(100)
          resolve(path)
        },
      )
    })
  }

  /** Borra una foto anterior; ignora si ya no existe (reemplazo por otra extensión, doble clic). */
  async function removePlayerPhoto(path) {
    try {
      await deleteObject(ref(storage, path))
    } catch (error) {
      if (error?.code !== 'storage/object-not-found') throw error
    }
  }

  return { uploadPlayerPhoto, removePlayerPhoto }
}
