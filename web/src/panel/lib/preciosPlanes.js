import enlaces from './stripeEnlaces.json'

export function precioPlan(plan, periodo, { porMes = false } = {}) {
  const { monto, moneda } = enlaces[plan][periodo]
  const valor = porMes && periodo === 'anual' ? monto / 12 / 100 : monto / 100
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: moneda.toUpperCase(),
    minimumFractionDigits: Number.isInteger(valor) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(valor)
}

export function montoPlan(plan, periodo) {
  return enlaces[plan][periodo].monto / 100
}
