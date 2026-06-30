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

  it('patches a line without deleting other lines or performance associations', () => {
    const created = createCampaignTool({
      data: { name: 'Patch Me', client: 'P' },
      lines: [
        { channel: 'CTV', country: 'Sweden', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'CPA', cpm_goal: 20 },
        { channel: 'Audio', country: 'Norway', start_date: '2026-08-01', end_date: '2026-08-31', primary_kpi: 'CPA', cpm_goal: 10 },
      ],
    })
    const campaign = created.campaign as any
    const ctvLineId = campaign.lines[0].id
    db.importPerformance(
      { campaign_id: campaign.id, campaign_line_id: ctvLineId, file_path: '', keep_zero_impressions: false },
      [{ campaign_id: campaign.id, campaign_line_id: ctvLineId, date: '2026-08-02', impressions: 1000 } as any]
    )

    const updated = updateCampaignTool({
      id: campaign.id,
      lines: [{ id: ctvLineId, cpm_goal: 31 }],
    })
    const updatedCampaign = updated.campaign as any
    expect(updatedCampaign.lines).toHaveLength(2)
    expect(updatedCampaign.lines.find((l: any) => l.id === ctvLineId)?.cpm_goal).toBe(31)
    expect(db.queryPerformance(campaign.id)[0].campaign_line_id).toBe(ctvLineId)
  })

  it('rejects a campaign with no lines', () => {
    expect(() => createCampaignTool({ data: { name: 'X', client: 'X' }, lines: [] }))
      .toThrow(/at least one line/i)
  })
})
