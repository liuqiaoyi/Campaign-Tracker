import * as XLSX from 'xlsx'
import { getImportMapping } from './import-mapping'

type ParseFileOptions = {
  sheet_name?: string
}

function isBlankRow(row: unknown[]): boolean {
  return !row.some(v => v !== null && v !== undefined && String(v).trim() !== '')
}

function rowToHeaders(row: unknown[]): string[] {
  return row.map(v => v === null || v === undefined ? '' : String(v).trim())
}

function rowsFromMatrix(matrix: unknown[][], headerIndex: number, headers: string[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const row = matrix[i] ?? []
    if (isBlankRow(row)) {
      if (rows.length > 0) break
      continue
    }
    const obj: Record<string, unknown> = {}
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c]
      if (!header) continue
      const value = row[c]
      if (value !== undefined && value !== null && String(value).trim() !== '') obj[header] = value
    }
    if (Object.keys(obj).length > 0) rows.push(obj)
  }
  return rows
}

function parseSheet(sheet: XLSX.WorkSheet) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false, defval: null }) as unknown[][]
  const scanRows = Math.min(matrix.length, 50)
  for (let i = 0; i < scanRows; i++) {
    const headers = rowToHeaders(matrix[i] ?? [])
    if (headers.filter(Boolean).length < 2) continue
    const mapping = getImportMapping(headers)
    if (mapping.missingRequired.length === 0) {
      return { rows: rowsFromMatrix(matrix, i, headers), columns: headers.filter(Boolean), header_row: i + 1 }
    }
  }

  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: true })
  return {
    rows,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    header_row: rows.length > 0 ? 1 : null,
  }
}

function selectSheet(workbook: XLSX.WorkBook, requested?: string) {
  if (requested) {
    const sheet = workbook.Sheets[requested]
    if (!sheet) throw new Error(`Sheet not found: ${requested}`)
    return { sheetName: requested, parsed: parseSheet(sheet) }
  }

  for (const sheetName of workbook.SheetNames) {
    const parsed = parseSheet(workbook.Sheets[sheetName])
    const mapping = getImportMapping(parsed.columns)
    if (mapping.missingRequired.length === 0) return { sheetName, parsed }
  }

  const sheetName = workbook.SheetNames[0]
  return { sheetName, parsed: parseSheet(workbook.Sheets[sheetName]) }
}

export function parseFile(filePath: string, opts: ParseFileOptions = {}) {
  const workbook = XLSX.readFile(filePath)
  const { sheetName, parsed } = selectSheet(workbook, opts.sheet_name)
  const { rows, columns, header_row } = parsed
  const mapping = getImportMapping(columns)
  const idx = new Map(mapping.mapped.map(m => [m.field, m.source]))
  const impSource = idx.get('impressions')
  const zero_impression_rows = impSource
    ? rows.filter(r => (Number(r[impSource]) || 0) === 0).length
    : 0
  return {
    sheet_name: sheetName,
    header_row,
    columns,
    rows,
    total_rows: rows.length,
    zero_impression_rows,
    mapped_columns: mapping.mapped.map(m => ({ source: m.source, field: String(m.field), label: m.label })),
    missing_required_columns: mapping.missingRequired,
  }
}
