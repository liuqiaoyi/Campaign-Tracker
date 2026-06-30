import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import * as db from '../../src/core/db'
import { previewImportTool, importPerformanceTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

function fixture(dir: string): string {
  const ws = XLSX.utils.json_to_sheet([{ Date: '2026-07-02', Impressions: 1000, Clicks: 5 }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const p = path.join(dir, 'perf.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

function missingColumnsFixture(dir: string): string {
  // Intentionally omits Date and Impressions (both required) — only has Clicks
  const ws = XLSX.utils.json_to_sheet([{ Clicks: 5 }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const p = path.join(dir, 'perf-missing.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('mcp import tools', () => {
  let dir: string, campaignId: number, lineId: number
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-it-'))
    await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
    const c = db.createCampaign({ name: 'Imp Co', client: 'I' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any])
    campaignId = c.id; lineId = c.lines![0].id
  })

  it('preview reports columns without writing', () => {
    const res = previewImportTool({ file_path: fixture(dir) })
    expect(res.missing_required_columns).toEqual([])
    expect(db.hasPerformanceData(campaignId)).toBe(false)
  })

  it('import writes rows and returns counts', () => {
    const res = importPerformanceTool({ campaign_id: campaignId, campaign_line_id: lineId, file_path: fixture(dir) })
    expect(res.result.imported_rows).toBe(1)
    expect(db.queryPerformance(campaignId)[0].impressions).toBe(1000)
  })

  it('rejects file with missing required columns', () => {
    const fp = missingColumnsFixture(dir)
    expect(() => importPerformanceTool({ campaign_id: campaignId, campaign_line_id: lineId, file_path: fp }))
      .toThrow(/Missing required columns/i)
  })

  it('double import is idempotent (delete-then-insert)', () => {
    const fp = fixture(dir)
    importPerformanceTool({ campaign_id: campaignId, campaign_line_id: lineId, file_path: fp })
    const count1 = db.queryPerformance(campaignId).length
    importPerformanceTool({ campaign_id: campaignId, campaign_line_id: lineId, file_path: fp })
    const count2 = db.queryPerformance(campaignId).length
    expect(count2).toBe(count1)
  })
})
