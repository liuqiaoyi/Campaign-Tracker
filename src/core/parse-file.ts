import * as XLSX from 'xlsx'
import { getImportMapping } from './import-mapping'

export function parseFile(filePath: string) {
  const workbook = XLSX.readFile(filePath)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: true })
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []
  const mapping = getImportMapping(columns)
  const idx = new Map(mapping.mapped.map(m => [m.field, m.source]))
  const impSource = idx.get('impressions')
  const zero_impression_rows = impSource
    ? rows.filter(r => (Number(r[impSource]) || 0) === 0).length
    : 0
  return {
    columns,
    rows,
    total_rows: rows.length,
    zero_impression_rows,
    mapped_columns: mapping.mapped.map(m => ({ source: m.source, field: String(m.field), label: m.label })),
    missing_required_columns: mapping.missingRequired,
  }
}
