import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore simulado: las pruebas ven qué documento se escribe o se borra.
const store = vi.hoisted(() => ({ writes: [], deletes: [], writeError: null }))

vi.mock('firebase/firestore', () => ({
  Bytes: { fromUint8Array: array => ({ bytes: array }) },
  doc: (db, path) => ({ db, path }),
  serverTimestamp: () => 'SERVER_TIME',
  setDoc: async (reference, data) => {
    if (store.writeError) throw store.writeError
    store.writes.push({ path: reference.path, data })
  },
  deleteDoc: async reference => { store.deletes.push(reference.path) },
}))

const {
  MAX_PHOTO_BYTES, MAX_STORED_PHOTO_BYTES, checkPhotoFile, createPhotoUploadService, photoErrorMessage, photoExtension, playerPhotoId,
} = await import('./photoUpload.js')

const photo = (name, size = 1024, type = '') => ({ name, size, type })
const identity = { orgId: 'org-demo', actorId: 'coach-demo', playerId: 'p-1' }
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const resizeImage = vi.fn(async () => jpeg)
const { uploadPlayerPhoto, removePlayerPhoto } = createPhotoUploadService({ db: 'fake-db', resizeImage })

beforeEach(() => {
  store.writes = []
  store.deletes = []
  store.writeError = null
  resizeImage.mockClear()
  resizeImage.mockImplementation(async () => jpeg)
})

describe('validación del archivo', () => {
  it('reconoce .jpg, .png y .webp por nombre o tipo', () => {
    expect(photoExtension(photo('foto.JPG'))).toBe('jpg')
    expect(photoExtension(photo('foto.jpeg'))).toBe('jpeg')
    expect(photoExtension(photo('foto.png'))).toBe('png')
    expect(photoExtension(photo('foto.webp'))).toBe('webp')
    expect(photoExtension(photo('sin-extension', 10, 'image/png'))).toBe('png')
    expect(photoExtension(photo('foto.gif', 10, 'image/gif'))).toBeNull()
  })

  it('rechaza formatos, archivos vacíos y fotos demasiado grandes', () => {
    expect(() => checkPhotoFile(photo('foto.gif'))).toThrow(expect.objectContaining({ code: 'photo/invalid-type' }))
    expect(() => checkPhotoFile(photo('foto.jpg', 0))).toThrow(expect.objectContaining({ code: 'photo/empty' }))
    expect(() => checkPhotoFile(photo('foto.jpg', MAX_PHOTO_BYTES + 1))).toThrow(expect.objectContaining({ code: 'photo/too-large' }))
    expect(checkPhotoFile(photo('foto.jpg', MAX_PHOTO_BYTES))).toBe('jpg')
  })
})

describe('ruta de la foto', () => {
  it('solo acepta players/{este jugador}/media/photo-…', () => {
    expect(playerPhotoId('p-1', 'players/p-1/media/photo-abc12345')).toBe('photo-abc12345')
    for (const path of ['players/p-2/media/photo-abc12345', 'players/p-1/media/otra-abc12345', 'players/p-1/media/photo-ABC12345',
      'players/p-1/media/photo-abc', 'orgs/org-demo/players/p-1/photo.jpg', 'players/p-1/media/photo-abc12345/x', null]) {
      expect(playerPhotoId('p-1', path), String(path)).toBeNull()
    }
    expect(playerPhotoId('a/b', 'players/a/b/media/photo-abc12345')).toBeNull()
  })
})

describe('uploadPlayerPhoto', () => {
  it('reduce la foto y la guarda en Firestore con su organización, autor y tamaño; devuelve la ruta', async () => {
    const progress = []
    const file = photo('foto.png', 2048)
    const path = await uploadPlayerPhoto({ ...identity, file, onProgress: value => progress.push(value) })
    expect(resizeImage).toHaveBeenCalledWith(file)
    expect(path).toMatch(/^players\/p-1\/media\/photo-[a-z0-9]{8,32}$/)
    expect(store.writes).toEqual([{ path, data: {
      orgId: 'org-demo', contentType: 'image/jpeg', width: 256, height: 256,
      data: { bytes: jpeg }, createdBy: 'coach-demo', createdAt: 'SERVER_TIME',
    } }])
    expect(progress).toEqual([0, 50, 100])
  })

  it('cada subida usa un documento nuevo', async () => {
    const first = await uploadPlayerPhoto({ ...identity, file: photo('a.jpg') })
    const second = await uploadPlayerPhoto({ ...identity, file: photo('b.jpg') })
    expect(first).not.toBe(second)
  })

  it('no escribe si el archivo no es válido, falta la identidad, está cancelado o la foto reducida es demasiado grande', async () => {
    await expect(uploadPlayerPhoto({ ...identity, file: photo('foto.gif') })).rejects.toMatchObject({ code: 'photo/invalid-type' })
    await expect(uploadPlayerPhoto({ ...identity, playerId: '', file: photo('foto.jpg') })).rejects.toMatchObject({ code: 'photo/missing-identity' })
    await expect(uploadPlayerPhoto({ ...identity, playerId: 'a/b', file: photo('foto.jpg') })).rejects.toMatchObject({ code: 'photo/missing-identity' })
    const controller = new AbortController()
    controller.abort()
    await expect(uploadPlayerPhoto({ ...identity, file: photo('foto.jpg'), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    resizeImage.mockImplementation(async () => new Uint8Array(MAX_STORED_PHOTO_BYTES + 1))
    await expect(uploadPlayerPhoto({ ...identity, file: photo('foto.jpg') })).rejects.toMatchObject({ code: 'photo/too-large' })
    expect(store.writes).toEqual([])
  })

  it('propaga el error de Firestore con un mensaje apto para el usuario', async () => {
    store.writeError = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
    const error = await uploadPlayerPhoto({ ...identity, file: photo('foto.jpg') }).catch(failure => failure)
    expect(photoErrorMessage(error)).toBe('No tienes permiso para cambiar la foto de este jugador.')
    expect(photoErrorMessage({ code: 'otro' })).toBe('No pudimos guardar la foto. Inténtalo de nuevo.')
    expect(photoErrorMessage({ name: 'AbortError' })).toBe('Se canceló la subida de la foto.')
  })
})

describe('removePlayerPhoto', () => {
  it('borra la foto anterior y no toca rutas que no son fotos', async () => {
    await removePlayerPhoto('players/p-1/media/photo-abc12345')
    await removePlayerPhoto('orgs/org-demo/players/p-1/photo.jpg')
    await removePlayerPhoto('players/p-1')
    expect(store.deletes).toEqual(['players/p-1/media/photo-abc12345'])
  })
})
