import { describe, expect, it } from 'vitest'
import { parseCommand, summarize } from './borrarDatos.mjs'

describe('borrarDatos: argumentos (PCIT-221)', () => {
  it('por defecto solo muestra el plan; --execute borra', () => {
    expect(parseCommand(['--project', 'acecam-e93a2', '--org', 'org-a'])).toMatchObject({
      project: 'acecam-e93a2', target: 'org', value: 'org-a', execute: false,
      bucket: 'acecam-e93a2.firebasestorage.app', azureContainer: 'videos',
    })
    expect(parseCommand(['--project', 'p', '--player', 'p-1', '--execute']).execute).toBe(true)
  })

  it('exige el proyecto y exactamente un objetivo', () => {
    expect(() => parseCommand(['--org', 'org-a'])).toThrow(/--project/)
    expect(() => parseCommand(['--project', 'p'])).toThrow(/exactamente uno/)
    expect(() => parseCommand(['--project', 'p', '--org', 'a', '--user', 'u'])).toThrow(/exactamente uno/)
    expect(() => parseCommand(['--project', 'p', '--org', 'a', '--borrar-todo'])).toThrow()
  })

  it('Azure se puede omitir con "none"', () => {
    expect(parseCommand(['--project', 'p', '--org', 'a', '--azure-account', 'none']).azureAccount).toBeNull()
    expect(parseCommand(['--project', 'p', '--org', 'a', '--azure-account', 'cuenta']).azureAccount).toBe('cuenta')
  })

  it('el resumen cuenta lo borrado y recuerda que el plan no borra', () => {
    const report = {
      target: { type: 'org', id: 'org-a' }, dryRun: true, documents: ['a', 'b'], recursive: ['c'],
      firebaseFiles: ['x'], azureBlobs: ['y', 'z'], authUids: ['u'], kept: ['algo'],
    }
    const text = summarize(report)
    expect(text).toContain('PLAN (no se borró nada)')
    expect(text).toContain('2 documentos y 1 con subcolecciones')
    expect(text).toContain('Azure Blob: 2 videos')
    expect(text).toContain('--execute')
    expect(summarize({ ...report, dryRun: false })).toContain('BORRADO')
  })
})
