import * as path from 'path'
import * as fs from 'fs'

const APP_DIR_NAMES = ['campaign-tracker', 'Campaign Tracker']

function candidatePaths(env: NodeJS.ProcessEnv): string[] {
  const out: string[] = []
  const home = env.HOME || env.USERPROFILE || ''
  if (env.APPDATA) {
    for (const d of APP_DIR_NAMES) out.push(path.join(env.APPDATA, d, 'campaign-tracker.db'))
  }
  if (home) {
    for (const d of APP_DIR_NAMES) {
      out.push(path.join(home, 'Library', 'Application Support', d, 'campaign-tracker.db'))
      out.push(path.join(home, '.config', d, 'campaign-tracker.db'))
    }
  }
  return out
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CAMPAIGN_TRACKER_DB) {
    if (fs.existsSync(env.CAMPAIGN_TRACKER_DB)) return env.CAMPAIGN_TRACKER_DB
    throw new Error(`CAMPAIGN_TRACKER_DB points to a missing file: ${env.CAMPAIGN_TRACKER_DB}`)
  }
  for (const p of candidatePaths(env)) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    'Could not locate campaign-tracker.db. Set the CAMPAIGN_TRACKER_DB environment variable to its full path.'
  )
}

export function resolveWasmPath(): string {
  return path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
}
