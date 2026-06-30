import { describe, it, expect } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import * as XLSX from 'xlsx'
import { parseFile } from './parse-file'

function fixture(): string {
  const ws = XLSX.utils.json_to_sheet([
    { Date: '2026-07-02', Impressions: 1000, Clicks: 5 },
    { Date: '2026-07-03', Impressions: 0, Clicks: 0 },
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-xlsx-')), 'perf.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

function multiSheetFixture(): string {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Country: 'Sweden', Budget: 1000 }]), 'Media Plan')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Summary', 'Ignore'],
    ['Date', 'Impressions', 'Clicks'],
    ['2026-07-02', 1000, 5],
  ]), 'Performance')
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-xlsx-')), 'multi.xlsx')
  XLSX.writeFile(wb, p)
  return p
}

describe('core/parse-file', () => {
  it('parses an xlsx and reports mapping', () => {
    const res = parseFile(fixture())
    expect(res.total_rows).toBe(2)
    expect(res.zero_impression_rows).toBe(1)
    expect(res.missing_required_columns).toEqual([])
    expect(res.columns).toContain('Impressions')
  })

  it('auto-selects a later sheet and header row with required import columns', () => {
    const res = parseFile(multiSheetFixture())
    expect(res.sheet_name).toBe('Performance')
    expect(res.header_row).toBe(2)
    expect(res.total_rows).toBe(1)
    expect(res.missing_required_columns).toEqual([])
  })

  it('allows forcing a specific sheet', () => {
    const res = parseFile(multiSheetFixture(), { sheet_name: 'Media Plan' })
    expect(res.sheet_name).toBe('Media Plan')
    expect(res.missing_required_columns).toEqual(['Date', 'Impressions'])
  })
})
