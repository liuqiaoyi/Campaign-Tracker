import { describe, it, expect, beforeAll } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from './db'
// @ts-ignore - sql.js ships no bundled types
import initSqlJs from 'sql.js'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')

describe('core/db', () => {
  let dbPath: string
  beforeAll(async () => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-')), 'test.db')
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

  it('reloadFromDisk preserves FK enforcement: inserting orphan row throws', () => {
    // Save something so the db file exists on disk.
    db.createCampaign({ name: 'FK Test Campaign', client: 'FK' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])

    // Reload the db from disk — this is what MCP does before every tool call.
    db.reloadFromDisk()

    // After reload, FK enforcement must still be ON.
    // Attempt to insert a performance_data row with a non-existent campaign_line_id.
    // If FK is OFF this silently succeeds; if FK is ON it throws.
    expect(() => {
      db.importPerformance(
        { campaign_id: 99999, campaign_line_id: 99999, file_path: '', keep_zero_impressions: true },
        [{ campaign_id: 99999, campaign_line_id: 99999, date: '2026-07-01', impressions: 1 } as any]
      )
    }).toThrow()
  })

  it('getCampaignLineSummary reports sibling and performance counts', () => {
    const c = db.createCampaign({ name: 'LineSum Co', client: 'L' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any]
    )
    const sum = db.getCampaignLineSummary(lineId)
    expect(sum?.campaign_id).toBe(c.id)
    expect(sum?.campaign_name).toBe('LineSum Co')
    expect(sum?.line_count).toBe(2)
    expect(sum?.performance_rows).toBe(1)
    expect(db.getCampaignLineSummary(999999)).toBeUndefined()
  })

  it('deleteCampaignLine removes a non-last line and cascades its performance', () => {
    const c = db.createCampaign({ name: 'DelLine Co', client: 'D' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 500 } as any]
    )
    expect(db.deleteCampaignLine(lineId)).toBe(true)
    const after = db.getCampaign(c.id)
    expect(after?.lines?.length).toBe(1)
    expect(after?.lines?.[0].channel).toBe('Display')
    expect(db.queryPerformance(c.id).length).toBe(0)
  })

  it('deleteCampaignLine refuses to delete the last line', () => {
    const c = db.createCampaign({ name: 'LastLine Co', client: 'L' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => db.deleteCampaignLine(c.lines![0].id)).toThrow(/last line/i)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
  })

  it('deleteCampaignLine returns false for a non-existent line', () => {
    expect(db.deleteCampaignLine(987654)).toBe(false)
  })

  it('deleteCampaign leaves no orphan campaign_lines, performance_data, flights, deals, or campaign row', async () => {
    const c = db.createCampaign({ name: 'Orphan Co', client: 'O' } as any, [
      {
        channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR',
        flights: [{ flight_name: 'F1', start_date: '2026-07-01', end_date: '2026-07-15', budget: 1000 }],
        deals: [{ deal_id: 'D1', deal_name: 'Deal One' }],
      } as any,
    ])
    const lineId = c.lines![0].id
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: lineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 999 } as any]
    )
    // Sanity: flights and deals were actually seeded for this line.
    const before = db.getCampaign(c.id)
    expect(before?.lines?.[0].flights?.length).toBe(1)
    expect(before?.lines?.[0].deals?.length).toBe(1)

    expect(db.deleteCampaign(c.id)).toBe(true)
    // Campaign row gone
    expect(db.getCampaign(c.id)).toBeUndefined()
    // Performance rows gone
    expect(db.queryPerformance(c.id).length).toBe(0)
    // No orphan campaign_lines: getCampaignLineSummary must return undefined
    expect(db.getCampaignLineSummary(lineId)).toBeUndefined()

    // No orphan flights/deals: query the on-disk file directly (scoped to this
    // campaign so other tests sharing the DB do not affect the counts).
    const SQL = await initSqlJs({ locateFile: () => wasmPath })
    const raw = new SQL.Database(fs.readFileSync(dbPath))
    const scopedCount = (table: string) =>
      raw.exec(`SELECT COUNT(*) FROM ${table} WHERE campaign_id = ${c.id}`)[0].values[0][0] as number
    expect(scopedCount('flights')).toBe(0)
    expect(scopedCount('deals')).toBe(0)
    raw.close()
  })
})
