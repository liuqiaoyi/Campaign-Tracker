/**
 * Electron adapter over the shared, electron-free data layer in src/core/db.ts.
 * Resolves the userData db path + bundled WASM path, then delegates everything.
 */
import { app } from 'electron'
import * as path from 'path'
import * as core from '../core/db'

export * from '../core/db'

export async function initDatabase(): Promise<void> {
  const wasmPath = app.isPackaged
    ? path.join(process.resourcesPath, 'sql-wasm.wasm')
    : path.join(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm')
  const dbPath = path.join(app.getPath('userData'), 'campaign-tracker.db')
  await core.initDb({ dbPath, wasmPath })
}
