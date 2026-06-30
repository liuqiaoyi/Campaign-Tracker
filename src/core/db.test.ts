import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from './db'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('core/db', () => {
  beforeAll(async () => {
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'test.db')
    await db.initDb({ dbPath, wasmPath })
  })

  it('creates and lists a campaign with one line', () => {
    const created = db.createCampaign(
      { name: 'Acme Q3', client: 'Acme' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', budget: 50000, primary_kpi: 'CTR' } as any]
    )
    expect(created.id).toBeGreaterThan(0)
    const all = db.listCampaigns()
    expect(all.find(c => c.id === created.id)?.name).toBe('Acme Q3')
    expect(all.find(c => c.id === created.id)?.lines?.[0].channel).toBe('CTV')
  })

  it('imports and queries performance rows', () => {
    const c = db.createCampaign({ name: 'Perf Co', client: 'P' } as any,
      [{ channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    const lineId = c.lines![0].id
    const res = db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000, clicks: 5 } as any]
    )
    expect(res.imported_rows).toBe(1)
    const rows = db.queryPerformance(c.id)
    expect(rows[0].impressions).toBe(1000)
  })
})
