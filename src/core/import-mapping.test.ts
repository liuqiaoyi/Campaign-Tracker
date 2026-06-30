import { describe, it, expect } from 'vitest'
import { getImportMapping, mapRow } from './import-mapping'

describe('core/import-mapping', () => {
  it('maps TTD columns and flags missing required', () => {
    const m = getImportMapping(['Date', 'Impressions', 'Clicks'])
    expect(m.missingRequired).toEqual([])
    expect(m.mapped.find(x => x.field === 'impressions')?.source).toBe('Impressions')

    const missing = getImportMapping(['Clicks'])
    expect(missing.missingRequired).toContain('Date')
    expect(missing.missingRequired).toContain('Impressions')
  })

  it('coerces numeric fields and defaults to 0', () => {
    const row = mapRow({ Date: '2026-07-02', Impressions: '1000', Clicks: 5 }, 7)
    expect(row.campaign_id).toBe(7)
    expect(row.impressions).toBe(1000)
    expect(row.clicks).toBe(5)
    expect(row.player_starts).toBe(0)
  })
})
