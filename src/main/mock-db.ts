import type { Campaign, Flight, Deal, PerformanceData, ImportOptions, ImportResult } from '../shared/types'

// ── In-memory stores ──────────────────────────────────────────────────────────
let campaigns: Campaign[] = [
  {
    id: 1,
    name: 'Navimow-DE-i系列-26新品-Joyn-$60k',
    ttd_campaign_id: 'a69qifn',
    start_date: '2026-03-01',
    end_date: '2026-04-30',
    type: 'CTV',
    agency: 'SEVENS',
    client: 'Navimow-DE',
    primary_kpi: 'VCR',
    secondary_kpi: 'Reach',
    budget: 60000,
    status: 'Active',
    notes: 'i系列新品上市投放',
    created_at: new Date().toISOString(),
    flights: [
      { id: 1, campaign_id: 1, flight_name: 'Flight 1 - March', start_date: '2026-03-01', end_date: '2026-03-31', budget: 30000 },
      { id: 2, campaign_id: 1, flight_name: 'Flight 2 - April', start_date: '2026-04-01', end_date: '2026-04-30', budget: 30000 },
    ],
    deals: [
      { id: 1, campaign_id: 1, deal_id: 'TTD-001', deal_name: 'Joyn CTV Premium', deal_type: 'PMP', floor_price: 15, inventory_source: 'Joyn' },
    ],
  },
  {
    id: 2,
    name: 'Navimow-DE-x系列-26新品-Joyn-$67k',
    ttd_campaign_id: 'ypevx9l',
    start_date: '2026-03-01',
    end_date: '2026-04-30',
    type: 'CTV',
    agency: 'SEVENS',
    client: 'Navimow-DE',
    primary_kpi: 'VCR',
    secondary_kpi: 'Reach',
    budget: 67000,
    status: 'Active',
    notes: 'x系列新品上市投放',
    created_at: new Date().toISOString(),
    flights: [],
    deals: [],
  },
]

let performanceData: PerformanceData[] = []

let nextCampaignId = 3
let nextFlightId = 3
let nextDealId = 2
let nextPerfId = 1

// ── Campaigns ─────────────────────────────────────────────────────────────────
export function listCampaigns(): Campaign[] {
  return campaigns
}

export function getCampaign(id: number): Campaign | undefined {
  return campaigns.find(c => c.id === id)
}

export function createCampaign(
  data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
  deals: Omit<Deal, 'id' | 'campaign_id'>[],
  flights: Omit<Flight, 'id' | 'campaign_id'>[]
): Campaign {
  const id = nextCampaignId++
  const campaign: Campaign = {
    ...data,
    id,
    created_at: new Date().toISOString(),
    flights: flights.map(f => ({ ...f, id: nextFlightId++, campaign_id: id })),
    deals: deals.map(d => ({ ...d, id: nextDealId++, campaign_id: id })),
  }
  campaigns.push(campaign)
  return campaign
}

export function updateCampaign(
  id: number,
  data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
  deals: Omit<Deal, 'id' | 'campaign_id'>[],
  flights: Omit<Flight, 'id' | 'campaign_id'>[]
): Campaign | undefined {
  const idx = campaigns.findIndex(c => c.id === id)
  if (idx === -1) return undefined
  const existing = campaigns[idx]
  campaigns[idx] = {
    ...existing,
    ...data,
    flights: flights.map(f => ({ ...f, id: nextFlightId++, campaign_id: id })),
    deals: deals.map(d => ({ ...d, id: nextDealId++, campaign_id: id })),
  }
  return campaigns[idx]
}

export function deleteCampaign(id: number): boolean {
  const before = campaigns.length
  campaigns = campaigns.filter(c => c.id !== id)
  performanceData = performanceData.filter(p => p.campaign_id !== id)
  return campaigns.length < before
}

// ── Performance ───────────────────────────────────────────────────────────────
export function queryPerformance(campaign_id: number, from?: string, to?: string): PerformanceData[] {
  return performanceData.filter(p => {
    if (p.campaign_id !== campaign_id) return false
    if (from && p.date < from) return false
    if (to && p.date > to) return false
    return true
  })
}

export function importPerformance(opts: ImportOptions, rows: PerformanceData[]): ImportResult {
  // Remove existing data for this campaign to allow re-import
  performanceData = performanceData.filter(p => p.campaign_id !== opts.campaign_id)

  const toInsert = opts.keep_zero_impressions
    ? rows
    : rows.filter(r => r.impressions > 0)

  const zeroes = rows.filter(r => r.impressions === 0).length

  toInsert.forEach(r => {
    performanceData.push({ ...r, id: nextPerfId++, campaign_id: opts.campaign_id })
  })

  return {
    total_rows: rows.length,
    imported_rows: toInsert.length,
    skipped_rows: rows.length - toInsert.length,
    zero_impression_rows: zeroes,
  }
}

export function hasPerformanceData(campaign_id: number): boolean {
  return performanceData.some(p => p.campaign_id === campaign_id)
}
