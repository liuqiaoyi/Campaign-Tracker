import { describe, it, expect, beforeEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as db from '../../src/core/db'
import { deleteCampaignTool, deleteCampaignLineTool, deletePerformanceTool } from './tools'

const wasmPath = path.join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm') // tests run from repo root

let dir: string
async function freshDb() {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-del-'))
  await db.initDb({ dbPath: path.join(dir, 'test.db'), wasmPath })
}
function backupCount(): number {
  return fs.readdirSync(dir).filter(f => f.startsWith('campaign-tracker-before-mcp-')).length
}

describe('mcp delete tools', () => {
  beforeEach(async () => { await freshDb() })

  it('delete_campaign previews without writing, then deletes with token', () => {
    const c = db.createCampaign({ name: 'Del Co', client: 'D' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    db.importPerformance({ campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any])

    const preview = deleteCampaignTool({ id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(typeof preview.confirm_token).toBe('string')
    expect(db.getCampaign(c.id)).toBeTruthy()       // not deleted yet
    expect(backupCount()).toBe(0)                    // preview did not back up

    const done = deleteCampaignTool({ id: c.id, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('campaign')
    expect(db.getCampaign(c.id)).toBeUndefined()
    expect(db.queryPerformance(c.id).length).toBe(0) // cascaded
    expect(backupCount()).toBe(1)                     // execution backed up
  })

  it('delete_campaign rejects a wrong/expired token', () => {
    const c = db.createCampaign({ name: 'Tok Co', client: 'T' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => deleteCampaignTool({ id: c.id, confirm_token: 'bogus' })).toThrow(/invalid|expired/i)
    expect(db.getCampaign(c.id)).toBeTruthy()
  })

  it('delete_campaign on a missing campaign throws', () => {
    expect(() => deleteCampaignTool({ id: 424242 })).toThrow(/not found/i)
  })

  it('delete_campaign rejects stale token when new performance rows imported after preview', () => {
    const c = db.createCampaign({ name: 'Stale Camp', client: 'S' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    // No perf rows yet — preview sees 1 line : 0 perf rows
    const preview = deleteCampaignTool({ id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)

    // Mutate: import a performance row after the preview was issued
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 5000 } as any]
    )

    // Execute with the now-stale token — must throw changed|stale
    expect(() => deleteCampaignTool({ id: c.id, confirm_token: preview.confirm_token })).toThrow(/changed|stale/i)

    // No backup created, campaign still exists
    expect(backupCount()).toBe(0)
    expect(db.getCampaign(c.id)).toBeTruthy()
    expect(db.queryPerformance(c.id).length).toBe(1)
  })

  it('delete_campaign_line deletes a non-last line with token', () => {
    const c = db.createCampaign({ name: 'Line Co', client: 'L' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    const lineId = c.lines![0].id
    const preview = deleteCampaignLineTool({ line_id: lineId }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(backupCount()).toBe(0)                    // preview did not back up
    const done = deleteCampaignLineTool({ line_id: lineId, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('campaign_line')
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
    expect(backupCount()).toBe(1)                    // execution backed up
  })

  it('delete_campaign_line refuses the last line at preview (no token issued)', () => {
    const c = db.createCampaign({ name: 'Solo Co', client: 'S' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    expect(() => deleteCampaignLineTool({ line_id: c.lines![0].id })).toThrow(/last line/i)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1)
  })

  it('delete_performance clears rows but keeps campaign and lines', () => {
    const c = db.createCampaign({ name: 'Perf Co', client: 'P' } as any,
      [{ channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any])
    db.importPerformance({ campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any])

    const preview = deletePerformanceTool({ campaign_id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(db.queryPerformance(c.id).length).toBe(1) // not cleared yet
    expect(backupCount()).toBe(0)                    // preview did not back up

    const done = deletePerformanceTool({ campaign_id: c.id, confirm_token: preview.confirm_token }) as any
    expect(done.deleted.type).toBe('performance')
    expect(db.queryPerformance(c.id).length).toBe(0)
    expect(db.getCampaign(c.id)?.lines?.length).toBe(1) // structure kept
    expect(backupCount()).toBe(1)                    // execution backed up
  })

  it('delete_performance rejects stale token when new rows imported after preview', () => {
    const c = db.createCampaign({ name: 'Stale Perf', client: 'SP' } as any, [
      { channel: 'CTV', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'CTR' } as any,
      { channel: 'Display', start_date: '2026-07-01', end_date: '2026-07-31', primary_kpi: 'VCR' } as any,
    ])
    // Import a row for line[0] first
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: c.lines![0].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-02', impressions: 1000 } as any]
    )

    // Preview sees 1 perf row (fingerprint "1")
    const preview = deletePerformanceTool({ campaign_id: c.id }) as any
    expect(preview.requires_confirmation).toBe(true)
    expect(db.queryPerformance(c.id).length).toBe(1)

    // Mutate: import a row for a DIFFERENT line after preview → total becomes 2 (fingerprint "2")
    db.importPerformance(
      { campaign_id: c.id, campaign_line_id: c.lines![1].id, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: c.id, date: '2026-07-03', impressions: 2000 } as any]
    )
    expect(db.queryPerformance(c.id).length).toBe(2)

    // Execute with stale token — must throw changed|stale
    expect(() => deletePerformanceTool({ campaign_id: c.id, confirm_token: preview.confirm_token })).toThrow(/changed|stale/i)

    // No backup, data intact
    expect(backupCount()).toBe(0)
    expect(db.queryPerformance(c.id).length).toBe(2)
  })
})
