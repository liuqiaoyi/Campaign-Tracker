import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { createCampaignTool, updateCampaignTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('mcp write tools', () => {
  let dir: string
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-wt-'))
    await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
  })

  it('creates a campaign and writes a backup file', () => {
    const before = fs.readdirSync(dir).length
    const res = createCampaignTool({
      data: { name: 'New Co', client: 'NC' },
      lines: [{ channel: 'CTV', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'CTR', budget: 1000 }],
    })
    expect((res.campaign as any).id).toBeGreaterThan(0)
    expect(res.note).toMatch(/restart/i)
    expect(fs.readdirSync(dir).length).toBeGreaterThan(before) // backup created
  })

  it('updates an existing campaign', () => {
    const created = createCampaignTool({
      data: { name: 'Edit Me', client: 'E' },
      lines: [{ channel: 'Display', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'VCR' }],
    })
    const id = (created.campaign as any).id
    const updated = updateCampaignTool({
      id,
      data: { name: 'Edited', client: 'E' },
      lines: [{ channel: 'Display', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'VCR' }],
    })
    expect((updated.campaign as any).name).toBe('Edited')
  })

  it('rejects a campaign with no lines', () => {
    expect(() => createCampaignTool({ data: { name: 'X', client: 'X' }, lines: [] }))
      .toThrow(/at least one line/i)
  })
})
