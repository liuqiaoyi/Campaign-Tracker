import type { Campaign, Flight, Deal, PerformanceData, ImportOptions, ImportResult } from '../shared/types'


// ── In-memory stores ──────────────────────────────────────────────────────────
let campaigns: Campaign[] = []
let performanceData: PerformanceData[] = []

let nextCampaignId = 1
let nextFlightId = 1
let nextDealId = 1
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
  performanceData = performanceData.filter(p => p.campaign_id !== opts.campaign_id)
  const toInsert = opts.keep_zero_impressions ? rows : rows.filter(r => r.impressions > 0)
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

export function deletePerformanceData(campaign_id: number): number {
  const before = performanceData.length
  performanceData = performanceData.filter(p => p.campaign_id !== campaign_id)
  return before - performanceData.length
}

export function hasPerformanceData(campaign_id: number): boolean {
  return performanceData.some(p => p.campaign_id === campaign_id)
}

export function listCampaignsWithDataStatus(): Array<{ campaign: Campaign; hasData: boolean; rowCount: number }> {
  return campaigns.map(c => ({
    campaign: c,
    hasData: hasPerformanceData(c.id),
    rowCount: performanceData.filter(p => p.campaign_id === c.id).length,
  }))
}
