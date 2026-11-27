import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tarea de subida simulada: las pruebas deciden cuándo avanza, falla o termina.
const upload = vi.hoisted(() => ({ calls: [], task: null, deleted: [], deleteError: null }))

vi.mock('firebase/storage', () => ({
  ref: (storage, path) => ({ storage, path }),
  uploadBytesResumable: (reference, file, metadata) => {
    const handlers = {}
    upload.task = {
      on: (event, next, error, complete) => Object.assign(handlers, { next, error, complete }),
      cancel: vi.fn(() => handlers.error({ code: 'storage/canceled' })),
      progress: (bytesTransferred, totalBytes) => handlers.next({ bytesTransferred, totalBytes }),
      fail: error => handlers.error(error),
      finish: () => handlers.complete(),
    }
    upload.calls.push({ path: reference.path, file, metadata })
    return upload.task
  },
  deleteObject: async reference => {
    if (upload.deleteError) throw upload.deleteError
    upload.deleted.push(reference.path)
  },
}))

const { MAX_PHOTO_BYTES, checkPhotoFile, createPhotoUploadService, photoErrorMessage, photoExtension } = await import('./photoUpload.js')

const photo = (name, size = 1024, type = '') => ({ name, size, type })
const identity = { orgId: 'org-demo', actorId: 'coach-demo', playerId: 'p-1' }
const { uploadPlayerPhoto, removePlayerPhoto } = createPhotoUploadService({ storage: 'fake-storage' })

beforeEach(() => {
  upload.calls = []
  upload.task = null
  upload.deleted = []
  upload.deleteError = null
})

describe('validación del archivo', () => {
  it('reconoce .jpg, .png y .webp por nombre o tipo', () => {
    expect(photoExtension(photo('Foto.JPG'))).toBe('jpg')
    expect(photoExtension(photo('foto.jpeg'))).toBe('jpeg')
    expect(photoExtension(photo('foto.png'))).toBe('png')
    expect(photoExtension(photo('sin-extension', 1, 'image/webp'))).toBe('webp')
    expect(photoExtension(photo('foto.gif', 1, 'image/gif'))).toBeNull()
  })

  it('rechaza formatos, archivos vacíos y fotos demasiado grandes', () => {
    expect(() => checkPhotoFile(photo('foto.gif'))).toThrow('.jpg, .png o .webp')
    expect(() => checkPhotoFile(photo('foto.jpg', 0))).toThrow('vacío')
    expect(() => checkPhotoFile(photo('foto.jpg', 101), 100)).toThrow('supera el máximo')
    // maxBytes no puede pasar el límite de las reglas.
    expect(() => checkPhotoFile(photo('foto.jpg', MAX_PHOTO_BYTES + 1), MAX_PHOTO_BYTES * 8)).toThrow('5 MB')
  })
})

describe('uploadPlayerPhoto', () => {
  it('sube a la ruta del jugador con tipo y autor, informa el avance y devuelve la ruta', async () => {
    const onProgress = vi.fn()
    const result = uploadPlayerPhoto({ ...identity, file: photo('Foto.PNG'), onProgress })
    expect(upload.calls[0].path).toBe('orgs/org-demo/players/p-1/photo.png')
    expect(upload.calls[0].metadata).toEqual({ contentType: 'image/png', customMetadata: { uploadedBy: 'coach-demo' } })
    upload.task.progress(512, 1024)
    upload.task.finish()
    await expect(result).resolves.toBe('orgs/org-demo/players/p-1/photo.png')
    expect(onProgress.mock.calls.map(([percent]) => percent)).toEqual([0, 50, 100])
  })

  it('cancela con AbortSignal', async () => {
    const controller = new AbortController()
    const result = uploadPlayerPhoto({ ...identity, file: photo('Foto.jpg'), signal: controller.signal })
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(upload.task.cancel).toHaveBeenCalledTimes(1)
  })

  it('no empieza si ya está cancelado o el archivo no es válido', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(uploadPlayerPhoto({ ...identity, file: photo('Foto.jpg'), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(uploadPlayerPhoto({ ...identity, file: photo('Foto.gif') })).rejects.toMatchObject({ code: 'photo/invalid-type' })
    await expect(uploadPlayerPhoto({ ...identity, orgId: '', file: photo('Foto.jpg') })).rejects.toMatchObject({ code: 'photo/missing-identity' })
    expect(upload.calls).toHaveLength(0)
  })

  it('propaga el error de Storage con un mensaje apto para el usuario', async () => {
    const result = uploadPlayerPhoto({ ...identity, file: photo('Foto.jpg') })
    upload.task.fail({ code: 'storage/unauthorized' })
    const error = await result.catch(caught => caught)
    expect(photoErrorMessage(error)).toBe('No tienes permiso para subir la foto de este jugador.')
    expect(photoErrorMessage(new Error('boom'))).toBe('No pudimos subir la foto. Inténtalo de nuevo.')
  })
})

describe('removePlayerPhoto', () => {
  it('borra la foto anterior', async () => {
    await removePlayerPhoto('orgs/org-demo/players/p-1/photo.png')
    expect(upload.deleted).toEqual(['orgs/org-demo/players/p-1/photo.png'])
  })

  it('ignora que ya no exista, pero propaga otros errores', async () => {
    upload.deleteError = { code: 'storage/object-not-found' }
    await expect(removePlayerPhoto('orgs/org-demo/players/p-1/photo.png')).resolves.toBeUndefined()
    upload.deleteError = { code: 'storage/unauthorized' }
    await expect(removePlayerPhoto('orgs/org-demo/players/p-1/photo.png')).rejects.toMatchObject({ code: 'storage/unauthorized' })
  })
})
