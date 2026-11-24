#!/usr/bin/env node
// Borra los datos de una persona u organización: solicitudes ARCO y cierre de cuentas (PCIT-221).
// Solo para operadores del proyecto. Usa el Admin SDK: se salta las reglas de Firestore.
//
// Por defecto NO borra nada: muestra el plan. Para borrar, repite el comando con --execute.
//
//   node scripts/borrarDatos.mjs --project acecam-e93a2 --org <orgId>
//   node scripts/borrarDatos.mjs --project acecam-e93a2 --player <playerId>
//   node scripts/borrarDatos.mjs --project acecam-e93a2 --application <applicationId>
//   node scripts/borrarDatos.mjs --project acecam-e93a2 --user <uid>
//   node scripts/borrarDatos.mjs --project acecam-e93a2 --audit-before 2025-11-24
//
// Opciones:
//   --execute                 borra de verdad (sin esto, solo muestra el plan)
//   --bucket <nombre>         Firebase Storage (por defecto <proyecto>.firebasestorage.app)
//   --azure-account <cuenta>  Azure Blob (por defecto AZURE_STORAGE_ACCOUNT); "none" para omitirlo
//   --azure-container <c>     contenedor de Azure (por defecto videos)
//   --out <archivo.json>      guarda el informe (rutas e IDs, sin datos personales) como constancia
//
// Credenciales: GOOGLE_APPLICATION_CREDENTIALS (cuenta de servicio de Firebase) y, para Azure,
// `az login` con un rol de datos sobre la cuenta de almacenamiento (DefaultAzureCredential).
// Con los emuladores (FIRESTORE_EMULATOR_HOST, etc.) no hace falta ninguna credencial.

import { writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { createEraser } from '../server/arco/erase.js'

const TARGETS = ['org', 'player', 'application', 'user', 'audit-before']

export function parseCommand(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      project: { type: 'string' },
      org: { type: 'string' },
      player: { type: 'string' },
      application: { type: 'string' },
      user: { type: 'string' },
      'audit-before': { type: 'string' },
      execute: { type: 'boolean', default: false },
      bucket: { type: 'string' },
      'azure-account': { type: 'string' },
      'azure-container': { type: 'string', default: 'videos' },
      out: { type: 'string' },
    },
    strict: true,
  })
  if (!values.project) throw new Error('Falta --project (por ejemplo, acecam-e93a2).')
  const chosen = TARGETS.filter(name => values[name] !== undefined)
  if (chosen.length !== 1) throw new Error(`Indica exactamente uno de: ${TARGETS.map(name => `--${name}`).join(', ')}.`)
  const azureAccount = values['azure-account'] ?? process.env.AZURE_STORAGE_ACCOUNT ?? null
  return {
    project: values.project,
    target: chosen[0],
    value: values[chosen[0]],
    execute: values.execute,
    bucket: values.bucket ?? `${values.project}.firebasestorage.app`,
    azureAccount: azureAccount === 'none' ? null : azureAccount,
    azureContainer: values['azure-container'],
    out: values.out ?? null,
  }
}

export function planFor(eraser, command) {
  switch (command.target) {
    case 'org': return eraser.planOrg(command.value)
    case 'player': return eraser.planPlayer(command.value)
    case 'application': return eraser.planApplication(command.value)
    case 'user': return eraser.planUser(command.value)
    default: {
      const before = new Date(`${command.value}T00:00:00Z`)
      return eraser.planAudit(before)
    }
  }
}

export function summarize(report) {
  const lines = [
    `${report.dryRun ? 'PLAN (no se borró nada)' : 'BORRADO'} · ${JSON.stringify(report.target)}`,
    `  Firestore: ${report.documents.length} documentos y ${report.recursive.length} con subcolecciones`,
    `  Firebase Storage: ${report.firebaseFiles.length} archivos`,
    `  Azure Blob: ${report.azureBlobs.length} videos`,
    `  Cuentas de Auth: ${report.authUids.length}`,
  ]
  for (const note of report.kept) lines.push(`  Se conserva: ${note}`)
  if (report.dryRun) lines.push('Revisa el plan y repite el comando con --execute para borrar.')
  return lines.join('\n')
}

async function azureContainer(account, container) {
  if (!account) return null
  const [{ DefaultAzureCredential }, { BlobServiceClient }] = await Promise.all([
    import('@azure/identity'), import('@azure/storage-blob'),
  ])
  return new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential())
    .getContainerClient(container)
}

async function main() {
  const command = parseCommand(process.argv.slice(2))
  const app = initializeApp({ projectId: command.project, storageBucket: command.bucket })
  const eraser = createEraser({
    db: getFirestore(app),
    auth: getAuth(app),
    bucket: getStorage(app).bucket(),
    container: await azureContainer(command.azureAccount, command.azureContainer),
  })
  const report = await eraser.execute(await planFor(eraser, command), { dryRun: !command.execute })
  console.log(summarize(report))
  if (command.out) {
    await writeFile(command.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
    console.log(`Informe guardado en ${command.out}`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(`Error: ${error.message}`)
    process.exit(1)
  })
}
