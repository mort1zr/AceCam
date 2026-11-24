// Comprueba que la web publicada envía las cabeceras de seguridad de firebase.json (PCIT-215).
// Uso: node scripts/checkHeaders.mjs <url> [<url> …]
// Termina con código 1 si alguna cabecera falta o es más débil que el mínimo, e indica cuál.
// Se ejecuta en el pipeline sobre la vista previa de cada PR y sobre producción tras publicar.
import { pathToFileURL } from 'node:url'

const ONE_YEAR = 31_536_000
const STRONG_REFERRER = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin']

/** Directivas de la CSP como { nombre: [valores] }. */
export function parseCsp(value) {
  const directives = {}
  for (const part of (value ?? '').split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives[name.toLowerCase()] = sources
  }
  return directives
}

function checkCsp(value) {
  if (!value) return 'falta'
  const csp = parseCsp(value)
  const problems = []
  const exactly = (name, expected) => {
    if ((csp[name] ?? []).join(' ') !== expected) problems.push(`${name} debe ser ${expected}`)
  }
  exactly('default-src', "'self'")
  exactly('object-src', "'none'")
  exactly('base-uri', "'self'")
  exactly('frame-ancestors', "'none'")
  const scripts = csp['script-src'] ?? csp['default-src'] ?? []
  for (const weak of ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:']) {
    if (scripts.includes(weak)) problems.push(`script-src no puede incluir ${weak}`)
  }
  if (!('upgrade-insecure-requests' in csp)) problems.push('falta upgrade-insecure-requests')
  return problems.join('; ') || null
}

function checkHsts(value) {
  if (!value) return 'falta'
  const maxAge = Number(/max-age=(\d+)/i.exec(value)?.[1] ?? 0)
  if (maxAge < ONE_YEAR) return `max-age=${maxAge} es menor que 1 año (${ONE_YEAR})`
  if (!/includeSubDomains/i.test(value)) return 'falta includeSubDomains'
  return null
}

const equals = expected => value => {
  if (!value) return 'falta'
  return value.trim().toLowerCase() === expected.toLowerCase() ? null : `es "${value}" y debe ser "${expected}"`
}

function checkReferrer(value) {
  if (!value) return 'falta'
  // Puede traer una lista de respaldo: manda la última que el navegador entienda.
  const policy = value.split(',').map(item => item.trim().toLowerCase()).at(-1)
  return STRONG_REFERRER.includes(policy) ? null : `"${value}" deja pasar la URL completa a otros sitios`
}

function checkPermissions(value) {
  if (!value) return 'falta'
  const blocked = ['camera', 'microphone', 'geolocation'].filter(feature => !new RegExp(`${feature}=\\(\\)`).test(value))
  return blocked.length ? `no bloquea ${blocked.join(', ')}` : null
}

export const RULES = {
  'content-security-policy': checkCsp,
  'strict-transport-security': checkHsts,
  'x-content-type-options': equals('nosniff'),
  'x-frame-options': equals('DENY'),
  'referrer-policy': checkReferrer,
  'permissions-policy': checkPermissions,
  'cross-origin-opener-policy': equals('same-origin'),
}

/** Devuelve [{ header, problem }] con las cabeceras que fallan; vacío si todo está bien. */
export function evaluateHeaders(headers) {
  const get = name => (typeof headers.get === 'function' ? headers.get(name) : headers[name]) ?? null
  return Object.entries(RULES)
    .map(([header, check]) => ({ header, problem: check(get(header)) }))
    .filter(result => result.problem)
}

/** Pide cada URL y devuelve los fallos por URL. */
export async function checkHeaders(urls, { fetchImpl = fetch } = {}) {
  const results = []
  for (const url of urls) {
    try {
      const response = await fetchImpl(url, { cache: 'no-store', redirect: 'follow' })
      if (!response.ok) {
        results.push({ url, failures: [{ header: '(respuesta)', problem: `respondió ${response.status}` }] })
        continue
      }
      results.push({ url, failures: evaluateHeaders(response.headers) })
    } catch (error) {
      results.push({ url, failures: [{ header: '(respuesta)', problem: `no respondió (${error.message})` }] })
    }
  }
  return results
}

async function main(urls) {
  if (!urls.length) {
    console.error('Uso: node scripts/checkHeaders.mjs <url> [<url> …]')
    return 2
  }
  let failed = false
  for (const { url, failures } of await checkHeaders(urls)) {
    if (!failures.length) {
      console.log(`${url}: las ${Object.keys(RULES).length} cabeceras de seguridad están bien.`)
      continue
    }
    failed = true
    for (const { header, problem } of failures) console.error(`::error::${url} · ${header}: ${problem}`)
  }
  return failed ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2))
}
