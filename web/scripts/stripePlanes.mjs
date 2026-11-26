#!/usr/bin/env node
import { writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const web = (args.includes('--web') ? args[args.indexOf('--web') + 1] : 'http://localhost:5173').replace(/\/$/, '')
const key = process.env.STRIPE_SECRET_KEY
if (!key?.startsWith('sk_test_')) {
  console.error('Falta STRIPE_SECRET_KEY de modo prueba (sk_test_...).')
  process.exit(1)
}

const PLANES = {
  basico: { nombre: 'AceCam Básico', mensual: 500, anual: 5500 },
  pro: { nombre: 'AceCam Pro', mensual: 2000, anual: 22000 },
  ultra: { nombre: 'AceCam Ultra', mensual: 5000, anual: 55000 },
}
const MONEDA = 'usd'

function form(objeto, prefijo = '', pares = []) {
  for (const [clave, valor] of Object.entries(objeto)) {
    const nombre = prefijo ? `${prefijo}[${clave}]` : clave
    if (valor && typeof valor === 'object') form(valor, nombre, pares)
    else if (valor !== undefined) pares.push([nombre, String(valor)])
  }
  return pares
}

async function stripe(metodo, ruta, datos) {
  const respuesta = await fetch(`https://api.stripe.com/v1/${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: datos ? new URLSearchParams(form(datos)) : undefined,
  })
  const json = await respuesta.json()
  if (!respuesta.ok) throw new Error(`${metodo} ${ruta}: ${json.error?.message}`)
  return json
}

async function precio(plan, periodo, producto) {
  const lookup = `acecam_${plan}_${periodo}`
  const existentes = await stripe('GET', `prices?lookup_keys[]=${lookup}&active=true`)
  if (existentes.data[0]?.unit_amount === PLANES[plan][periodo]) return existentes.data[0]
  return stripe('POST', 'prices', {
    transfer_lookup_key: true,
    product: producto,
    currency: MONEDA,
    unit_amount: PLANES[plan][periodo],
    recurring: { interval: periodo === 'anual' ? 'year' : 'month' },
    lookup_key: lookup,
  })
}

async function producto(plan) {
  const busqueda = await stripe('GET', `products/search?query=${encodeURIComponent(`metadata['acecam_plan']:'${plan}'`)}`)
  if (busqueda.data[0]) return busqueda.data[0]
  return stripe('POST', 'products', { name: PLANES[plan].nombre, metadata: { acecam_plan: plan } })
}

async function enlace(plan, periodo, price, pruebaDias) {
  const vuelta = `${web}/checkout?pago=ok&plan=${plan}&ciclo=${periodo}&sesion={CHECKOUT_SESSION_ID}`
  const variante = pruebaDias ? 'prueba' : 'normal'
  const datos = {
    after_completion: { type: 'redirect', redirect: { url: vuelta } },
    metadata: { acecam_plan: plan, acecam_periodo: periodo, acecam_variante: variante },
  }
  const existentes = await stripe('GET', 'payment_links?active=true&limit=100')
  const previo = existentes.data.find(l => l.metadata?.acecam_plan === plan && l.metadata?.acecam_periodo === periodo
    && (l.metadata?.acecam_variante ?? 'normal') === variante && Boolean(l.subscription_data?.trial_period_days) === Boolean(pruebaDias))
  const precioPrevio = previo && (await stripe('GET', `payment_links/${previo.id}/line_items`)).data[0]?.price?.id
  if (previo && precioPrevio === price.id) return stripe('POST', `payment_links/${previo.id}`, datos)
  if (previo) await stripe('POST', `payment_links/${previo.id}`, { active: false })
  return stripe('POST', 'payment_links', {
    ...datos,
    line_items: { 0: { price: price.id, quantity: 1 } },
    ...(pruebaDias ? { subscription_data: { trial_period_days: pruebaDias } } : {}),
  })
}

const salida = {}
for (const plan of Object.keys(PLANES)) {
  const prod = await producto(plan)
  salida[plan] = {}
  for (const periodo of ['mensual', 'anual']) {
    const price = await precio(plan, periodo, prod.id)
    const link = await enlace(plan, periodo, price)
    salida[plan][periodo] = { url: link.url, monto: price.unit_amount, moneda: price.currency }
    console.log(`${plan} ${periodo}: ${link.url}`)
    if (plan === 'basico') {
      const prueba = await enlace(plan, periodo, price, 30)
      salida[plan][periodo].urlPrueba = prueba.url
      console.log(`${plan} ${periodo} con prueba: ${prueba.url}`)
    }
  }
}
await writeFile(new URL('../src/panel/lib/stripeEnlaces.json', import.meta.url), JSON.stringify(salida, null, 2) + '\n')
console.log(`Vuelta a ${web}/checkout. Escrito src/panel/lib/stripeEnlaces.json`)
