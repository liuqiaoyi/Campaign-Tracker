import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { findCampaignTool, getCampaignTool, listCampaignsTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('mcp read tools', () => {
  let id: number
  beforeAll(async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-rt-')), 'test.db')
    await db.initDb({ dbPath, wasmPath })
    const c = db.createCampaign({ name: 'Nike Summer', client: 'Nike' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    id = c.id
  })

  it('find_campaign matches by client substring (case-insensitive)', () => {
    const hits = findCampaignTool({ query: 'nike' })
    expect(hits.some(h => h.id === id)).toBe(true)
  })

  it('get_campaign returns full record', () => {
    expect((getCampaignTool({ id }) as any).name).toBe('Nike Summer')
  })

  it('list_campaigns includes data status', () => {
    const list = listCampaignsTool() as any[]
    expect(list.find(x => x.campaign.id === id)?.hasData).toBe(false)
  })
})
