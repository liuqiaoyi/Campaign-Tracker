import type { PerformanceData } from '../shared/types'

// Map Excel column names to PerformanceData fields
const COLUMN_MAP: Record<string, keyof PerformanceData> = {
  'Campaign ID':                  'ttd_campaign_id',
  'Campaign':                     'ttd_campaign_name',
  'Ad Group':                     'ad_group',
  'Ad Group ID':                  'ad_group_id',
  'Publisher Name':               'publisher_name',
  'Media Type':                   'media_type',
  'Market Type':                  'market_type',
  'Inventory Contract':           'inventory_contract',
  'Date':                         'date',
  'Impressions':                  'impressions',
  'Advertiser Cost (USD)':        'advertiser_cost_usd',
  'Clicks':                       'clicks',
  'Media Cost (USD)':             'media_cost_usd',
  'Player Starts':                'player_starts',
  'Player Completed Views':       'player_completed_views',
  'Unique Households':            'unique_households',
  'Unique Persons':               'unique_persons',
  'Unique IDs':                   'unique_ids',
  '01 - Total Click + View Conversions': 'conv_01',
  '02 - Total Click + View Conversions': 'conv_02',
  '03 - Total Click + View Conversions': 'conv_03',
  '04 - Total Click + View Conversions': 'conv_04',
  '05 - Total Click + View Conversions': 'conv_05',
  '06 - Total Click + View Conversions': 'conv_06',
  '07 - Total Click + View Conversions': 'conv_07',
  '08 - Total Click + View Conversions': 'conv_08',
  '09 - Total Click + View Conversions': 'conv_09',
  '10 - Total Click + View Conversions': 'conv_10',
  '11 - Total Click + View Conversions': 'conv_11',
  '12 - Total Click + View Conversions': 'conv_12',
  '13 - Total Click + View Conversions': 'conv_13',
  '14 - Total Click + View Conversions': 'conv_14',
  '15 - Total Click + View Conversions': 'conv_15',
  '16 - Total Click + View Conversions': 'conv_16',
  '17 - Total Click + View Conversions': 'conv_17',
  '18 - Total Click + View Conversions': 'conv_18',
  '19 - Total Click + View Conversions': 'conv_19',
  '20 - Total Click + View Conversions': 'conv_20',
  'Total Custom CPA Conversions': 'total_custom_cpa_conversions',
  'Advertiser Cost (Adv Currency)': 'advertiser_cost_adv_currency',
}

export const REQUIRED_IMPORT_FIELDS: Array<keyof PerformanceData> = ['date', 'impressions']

const FIELD_LABELS: Partial<Record<keyof PerformanceData, string>> = {
  date: 'Date',
  impressions: 'Impressions',
  advertiser_cost_usd: 'Advertiser Cost (USD)',
  clicks: 'Clicks',
  ad_group: 'Ad Group',
  ttd_campaign_name: 'Campaign',
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\s_\-()/$]+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const NORMALIZED_COLUMN_MAP = Object.fromEntries(
  Object.entries(COLUMN_MAP).map(([column, field]) => [normalizeColumnName(column), field])
) as Record<string, keyof PerformanceData>

export function getImportMapping(columns: string[]) {
  const mapped: Array<{ source: string; field: keyof PerformanceData; label: string }> = []
  const seen = new Set<keyof PerformanceData>()
  for (const source of columns) {
    const field = NORMALIZED_COLUMN_MAP[normalizeColumnName(source)]
    if (!field || seen.has(field)) continue
    seen.add(field)
    mapped.push({ source, field, label: FIELD_LABELS[field] ?? String(field) })
  }
  const missingRequired = REQUIRED_IMPORT_FIELDS
    .filter(field => !seen.has(field))
    .map(field => FIELD_LABELS[field] ?? String(field))
  return { mapped, missingRequired }
}

function getMappedValue(raw: Record<string, unknown>, field: keyof PerformanceData): unknown {
  for (const [source, value] of Object.entries(raw)) {
    if (NORMALIZED_COLUMN_MAP[normalizeColumnName(source)] === field) return value
  }
  return undefined
}

function parseExcelDate(val: string | number): string {
  if (typeof val === 'number') {
    // Excel serial date to JS date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    return date.toISOString().split('T')[0]
  }
  return String(val)
}

export function mapRow(raw: Record<string, unknown>, campaignId: number): PerformanceData {
  const row: Partial<PerformanceData> = { campaign_id: campaignId, id: 0 }
  for (const field of Object.values(COLUMN_MAP)) {
    const val = getMappedValue(raw, field)
    if (val === undefined || val === null || val === '') continue
    if (field === 'date') {
      (row as Record<string, unknown>)[field] = parseExcelDate(val as string | number)
    } else if (['impressions','advertiser_cost_usd','clicks','media_cost_usd','player_starts',
      'player_completed_views','unique_households','unique_persons','unique_ids',
      'conv_01','conv_02','conv_03','conv_04','conv_05','conv_06','conv_07','conv_08','conv_09','conv_10',
      'conv_11','conv_12','conv_13','conv_14','conv_15','conv_16','conv_17','conv_18','conv_19','conv_20',
      'total_custom_cpa_conversions','advertiser_cost_adv_currency'].includes(field)) {
      (row as Record<string, unknown>)[field] = Number(val) || 0
    } else {
      (row as Record<string, unknown>)[field] = String(val)
    }
  }
  // Ensure all numeric fields default to 0
  const numFields = ['impressions','advertiser_cost_usd','clicks','media_cost_usd','player_starts',
    'player_completed_views','unique_households','unique_persons','unique_ids',
    'conv_01','conv_02','conv_03','conv_04','conv_05','conv_06','conv_07','conv_08','conv_09','conv_10',
    'conv_11','conv_12','conv_13','conv_14','conv_15','conv_16','conv_17','conv_18','conv_19','conv_20',
    'total_custom_cpa_conversions','advertiser_cost_adv_currency']
  for (const f of numFields) {
    if ((row as Record<string, unknown>)[f] === undefined) {
      (row as Record<string, unknown>)[f] = 0
    }
  }
  return row as PerformanceData
}
