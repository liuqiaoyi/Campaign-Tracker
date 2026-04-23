export type AdType = 'CTV' | 'Display' | 'OTT' | 'Audio' | 'DOOH'
export type KpiType = 'CTR' | 'VCR' | 'Reach' | 'ROAS' | 'CPA' | 'CPM' | 'Viewability'
export type CampaignStatus = 'Draft' | 'Active' | 'Paused' | 'Ended'
export type DealType = 'PMP' | 'PG' | 'Open'

export interface Flight {
  id: number
  campaign_id: number
  flight_name: string
  start_date: string
  end_date: string
  budget?: number
  notes?: string
}

export interface Deal {
  id: number
  campaign_id: number
  deal_id?: string
  deal_name?: string
  deal_type?: DealType
  floor_price?: number
  inventory_source?: string
  notes?: string
}

export interface Campaign {
  id: number
  name: string
  ttd_campaign_id?: string        // TTD平台的Campaign ID，用于关联import数据
  start_date: string
  end_date: string
  type: AdType
  agency?: string
  client: string
  primary_kpi: KpiType
  secondary_kpi?: KpiType
  budget?: number
  status: CampaignStatus
  notes?: string
  created_at: string
  flights?: Flight[]
  deals?: Deal[]
}

// Raw performance row stored from import
export interface PerformanceData {
  id: number
  campaign_id: number             // FK to campaigns table
  ttd_campaign_id?: string
  ttd_campaign_name?: string
  ad_group?: string
  ad_group_id?: string
  publisher_name?: string
  media_type?: string
  market_type?: string
  inventory_contract?: string
  date: string

  // Core metrics
  impressions: number
  advertiser_cost_usd: number
  clicks: number
  media_cost_usd: number
  player_starts: number
  player_completed_views: number
  unique_households: number
  unique_persons: number
  unique_ids: number

  // Attribution window conversions (01-20)
  conv_01: number; conv_02: number; conv_03: number; conv_04: number; conv_05: number
  conv_06: number; conv_07: number; conv_08: number; conv_09: number; conv_10: number
  conv_11: number; conv_12: number; conv_13: number; conv_14: number; conv_15: number
  conv_16: number; conv_17: number; conv_18: number; conv_19: number; conv_20: number

  total_custom_cpa_conversions: number
  advertiser_cost_adv_currency: number
}

// Calculated metrics (derived, not stored)
export interface PerformanceMetrics {
  advertiser_cpm: number          // cost / impressions * 1000
  advertiser_cpc: number          // cost / clicks
  ctr: number                     // clicks / impressions
  media_cpm: number               // media_cost / impressions * 1000
  vcr: number                     // completed_views / player_starts
  custom_cpa: number              // cost / custom_conversions
  conv_cpa: Record<string, number> // conv_01_cpa ... conv_20_cpa = adv_cost_adv_currency / conv_xx
}

// Import types
export interface ImportRow {
  [key: string]: string | number
}

export interface ImportOptions {
  campaign_id: number
  file_path: string
  keep_zero_impressions: boolean
}

export interface ImportResult {
  total_rows: number
  imported_rows: number
  skipped_rows: number
  zero_impression_rows: number
}

export interface IpcResponse<T = void> {
  success: boolean
  data?: T
  error?: string
}
