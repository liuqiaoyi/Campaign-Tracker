import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as db from '../../src/core/db'
import { resolveDbPath, resolveWasmPath } from './db-path'
import { buildServer } from './server'

async function main() {
  const dbPath = resolveDbPath()
  await db.initDb({ dbPath, wasmPath: resolveWasmPath() })
  console.error(`[campaign-tracker-mcp] using db: ${dbPath}`)
  const server = buildServer()
  await server.connect(new StdioServerTransport())
}

main().catch(err => {
  console.error('[campaign-tracker-mcp] fatal:', err)
  process.exit(1)
})
