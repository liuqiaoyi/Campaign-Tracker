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

describe('core/parse-file', () => {
  it('parses an xlsx and reports mapping', () => {
    const res = parseFile(fixture())
    expect(res.total_rows).toBe(2)
    expect(res.zero_impression_rows).toBe(1)
    expect(res.missing_required_columns).toEqual([])
    expect(res.columns).toContain('Impressions')
  })
})
