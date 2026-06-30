import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { resolveDbPath } from './db-path'

describe('mcp/db-path', () => {
  it('prefers CAMPAIGN_TRACKER_DB when the file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-env-'))
    const p = path.join(dir, 'campaign-tracker.db')
    fs.writeFileSync(p, '')
    expect(resolveDbPath({ CAMPAIGN_TRACKER_DB: p } as any)).toBe(p)
  })

  it('throws a clear error when nothing is found', () => {
    expect(() => resolveDbPath({ HOME: '/nonexistent-xyz' } as any))
      .toThrow(/CAMPAIGN_TRACKER_DB/)
  })
})
