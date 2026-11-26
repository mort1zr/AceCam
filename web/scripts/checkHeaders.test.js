import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { checkHeaders, evaluateHeaders, RULES } from './checkHeaders.mjs'

// Las cabeceras reales de firebase.json: lo que se publica debe pasar la comprobación.
const config = JSON.parse(readFileSync(new URL('../../firebase.json', import.meta.url), 'utf8'))
const FIREBASE = Object.fromEntries(
  config.hosting.headers.find(rule => rule.source === '**').headers.map(({ key, value }) => [key.toLowerCase(), value]),
)

let server
afterEach(() => new Promise(resolve => (server ? server.close(resolve) : resolve())))

function serve(headers, status = 200) {
  server = createServer((_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html', ...headers })
    res.end('<html></html>')
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/`)))
}

const failing = headers => evaluateHeaders(headers).map(result => result.header)
const without = name => Object.fromEntries(Object.entries(FIREBASE).filter(([key]) => key !== name))

describe('cabeceras de seguridad (PCIT-215)', () => {
  it('las cabeceras de firebase.json pasan todas', () => {
    expect(Object.keys(RULES).every(name => name in FIREBASE)).toBe(true)
    expect(evaluateHeaders(FIREBASE)).toEqual([])
  })

  it('si falta cualquiera, lo indica por su nombre', () => {
    for (const name of Object.keys(RULES)) {
      expect(evaluateHeaders(without(name))).toEqual([{ header: name, problem: 'falta' }])
    }
  })

  it('detecta una CSP debilitada', () => {
    const weaken = (from, to) => failing({ ...FIREBASE, 'content-security-policy': FIREBASE['content-security-policy'].replace(from, to) })
    expect(weaken("script-src 'self'", "script-src 'self' 'unsafe-inline'")).toEqual(['content-security-policy'])
    expect(weaken("script-src 'self'", "script-src 'self' 'unsafe-eval'")).toEqual(['content-security-policy'])
    expect(weaken("frame-ancestors 'none'", "frame-ancestors *")).toEqual(['content-security-policy'])
    expect(weaken("object-src 'none'", "object-src 'self'")).toEqual(['content-security-policy'])
    expect(weaken("default-src 'self'", 'default-src *')).toEqual(['content-security-policy'])
    expect(weaken('; upgrade-insecure-requests', '')).toEqual(['content-security-policy'])
    const problem = evaluateHeaders({ ...FIREBASE, 'content-security-policy': "default-src 'self'; script-src *" })[0].problem
    expect(problem).toContain('script-src no puede incluir *')
  })

  it('detecta un HSTS corto o sin subdominios', () => {
    expect(failing({ ...FIREBASE, 'strict-transport-security': 'max-age=86400; includeSubDomains' })).toEqual(['strict-transport-security'])
    expect(failing({ ...FIREBASE, 'strict-transport-security': 'max-age=63072000' })).toEqual(['strict-transport-security'])
    expect(failing({ ...FIREBASE, 'strict-transport-security': 'max-age=63072000; includeSubDomains; preload' })).toEqual([])
  })

  it('detecta valores más débiles en el resto', () => {
    expect(failing({ ...FIREBASE, 'x-frame-options': 'SAMEORIGIN' })).toEqual(['x-frame-options'])
    expect(failing({ ...FIREBASE, 'referrer-policy': 'unsafe-url' })).toEqual(['referrer-policy'])
    expect(failing({ ...FIREBASE, 'referrer-policy': 'no-referrer-when-downgrade' })).toEqual(['referrer-policy'])
    expect(failing({ ...FIREBASE, 'referrer-policy': 'no-referrer, strict-origin-when-cross-origin' })).toEqual([])
    expect(failing({ ...FIREBASE, 'permissions-policy': 'camera=(), microphone=*' })).toEqual(['permissions-policy'])
    expect(failing({ ...FIREBASE, 'cross-origin-opener-policy': 'unsafe-none' })).toEqual(['cross-origin-opener-policy'])
    expect(failing({ ...FIREBASE, 'x-content-type-options': 'sniff' })).toEqual(['x-content-type-options'])
  })

  it('admite el popup OAuth de Google y sigue rechazando una política sin aislamiento', () => {
    for (const policy of ['same-origin', 'same-origin-allow-popups']) {
      expect(failing({ ...FIREBASE, 'cross-origin-opener-policy': policy })).toEqual([])
    }
    for (const policy of ['unsafe-none', '*', 'same-origin, unsafe-none']) {
      expect(failing({ ...FIREBASE, 'cross-origin-opener-policy': policy })).toEqual(['cross-origin-opener-policy'])
    }
  })

  it('contra un servidor local: pasa con las cabeceras completas y falla indicando cuál', async () => {
    const good = await serve(FIREBASE)
    expect(await checkHeaders([good])).toEqual([{ url: good, failures: [] }])
    server.close()
    const bad = await serve(without('strict-transport-security'))
    expect(await checkHeaders([bad])).toEqual([{ url: bad, failures: [{ header: 'strict-transport-security', problem: 'falta' }] }])
  })

  it('una respuesta de error o sin servidor también falla', async () => {
    const url = await serve(FIREBASE, 500)
    expect((await checkHeaders([url]))[0].failures[0].problem).toBe('respondió 500')
    const [down] = await checkHeaders(['http://127.0.0.1:1/'])
    expect(down.failures[0].problem).toMatch(/no respondió/)
  })
})
