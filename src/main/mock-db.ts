import type { Campaign, Flight, Deal, PerformanceData, ImportOptions, ImportResult } from '../shared/types'

// ── Dummy data generator ───────────────────────────────────────────────────────
function generatePerformanceData(campaignId: number, startDate: string, endDate: string, adGroups: string[]): PerformanceData[] {
  const rows: PerformanceData[] = []
  let id = 1
  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    // Skip ~30% of days per ad group to simulate realistic gaps
    for (const ag of adGroups) {
      if (Math.random() < 0.25) continue
      const imp = Math.floor(Math.random() * 8000 + 1000)
      const cost = imp * (Math.random() * 0.04 + 0.03) // CPM $30-70
      const starts = Math.floor(imp * (Math.random() * 0.3 + 0.6))
      const completes = Math.floor(starts * (Math.random() * 0.2 + 0.7)) // VCR 70-90%
      const clicks = Math.floor(imp * Math.random() * 0.002) // CTR very low for CTV
      const hh = Math.floor(imp * (Math.random() * 0.2 + 0.7))
      // Conversions - only some ad groups have them
      const hasConv = ag.includes('Garden') || ag.includes('Home') || ag.includes('DIY')
      const conv1 = hasConv ? Math.floor(Math.random() * 15) : 0
      const conv7 = hasConv ? Math.floor(conv1 * (Math.random() * 0.5 + 1.2)) : 0
      const conv14 = hasConv ? Math.floor(conv7 * (Math.random() * 0.3 + 1.1)) : 0
      const conv28 = hasConv ? Math.floor(conv14 * (Math.random() * 0.2 + 1.05)) : 0

      rows.push({
        id: id++,
        campaign_id: campaignId,
        ttd_campaign_name: campaignId === 1 ? 'Navimow-DE-i系列-26新品-Joyn-$60k-260301-260430' : 'Navimow-DE-x系列-26新品-Joyn-$67k-260301-260430',
        ad_group: ag,
        ad_group_id: Math.random().toString(36).slice(2, 9),
        publisher_name: 'Joyn',
        media_type: 'Video',
        market_type: 'Private Market',
        date: dateStr,
        impressions: imp,
        advertiser_cost_usd: parseFloat(cost.toFixed(2)),
        clicks,
        media_cost_usd: parseFloat((cost * 0.65).toFixed(2)),
        player_starts: starts,
        player_completed_views: completes,
        unique_households: hh,
        unique_persons: Math.floor(hh * (Math.random() * 0.1 + 0.95)),
        unique_ids: hh,
        conv_01: conv1,
        conv_02: Math.floor(conv1 * 1.05),
        conv_03: Math.floor(conv1 * 1.1),
        conv_04: Math.floor(conv1 * 1.15),
        conv_05: Math.floor(conv1 * 1.2),
        conv_06: Math.floor(conv1 * 1.25),
        conv_07: conv7,
        conv_08: Math.floor(conv7 * 1.03),
        conv_09: Math.floor(conv7 * 1.06),
        conv_10: Math.floor(conv7 * 1.09),
        conv_11: Math.floor(conv7 * 1.12),
        conv_12: Math.floor(conv7 * 1.15),
        conv_13: Math.floor(conv7 * 1.18),
        conv_14: conv14,
        conv_15: Math.floor(conv14 * 1.02),
        conv_16: Math.floor(conv14 * 1.04),
        conv_17: Math.floor(conv14 * 1.06),
        conv_18: Math.floor(conv14 * 1.08),
        conv_19: Math.floor(conv14 * 1.1),
        conv_20: conv28,
        total_custom_cpa_conversions: Math.floor(conv7 * 0.3),
        advertiser_cost_adv_currency: parseFloat(cost.toFixed(2)),
      })
    }
  }
  return rows
}

const AD_GROUPS_C1 = ['AF-DIY', 'AF-Garden Magazines', 'AF-Garden Owner', 'AF-Home Improvement', 'AF-Big House & Villa', 'AF-Outdoor Enthusiast']
const AD_GROUPS_C2 = ['AF-Tech Early Adopter', 'AF-Smart Home', 'AF-Premium Consumer', 'AF-Auto Enthusiast', 'AF-High Income HH']

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
  {
    id: 3,
    name: 'Navimow-AU-Awareness-Display-$25k',
    ttd_campaign_id: 'cx3mna9',
    start_date: '2025-11-01',
    end_date: '2025-12-31',
    type: 'Display',
    agency: 'SEVENS',
    client: 'Navimow-AU',
    primary_kpi: 'CTR',
    secondary_kpi: 'CPM',
    budget: 25000,
    status: 'Ended',
    notes: 'Australia market awareness',
    created_at: new Date().toISOString(),
    flights: [
      { id: 3, campaign_id: 3, flight_name: 'Nov Burst', start_date: '2025-11-01', end_date: '2025-11-30', budget: 12000 },
      { id: 4, campaign_id: 3, flight_name: 'Dec Holiday', start_date: '2025-12-01', end_date: '2025-12-31', budget: 13000 },
    ],
    deals: [],
  },
]

// Pre-populate performance data for campaigns 1 and 2
let performanceData: PerformanceData[] = [
  ...generatePerformanceData(1, '2026-03-01', '2026-04-22', AD_GROUPS_C1),
  ...generatePerformanceData(2, '2026-03-01', '2026-04-22', AD_GROUPS_C2),
]

let nextCampaignId = 4
let nextFlightId = 5
let nextDealId = 2
let nextPerfId = performanceData.length + 1

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
