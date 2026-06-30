import * as db from '../../src/core/db'
import * as path from 'path'
import { parseFile } from '../../src/core/parse-file'
import { getImportMapping, mapRow } from '../../src/core/import-mapping'

export function listCampaignsTool() {
  return db.listCampaignsWithDataStatus()
}

export function getCampaignTool(args: { id: number }) {
  const c = db.getCampaign(args.id)
  if (!c) throw new Error(`Campaign ${args.id} not found`)
  return c
}

export function findCampaignTool(args: { query: string }) {
  const q = args.query.toLowerCase()
  return db.listCampaigns()
    .filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.client ?? '').toLowerCase().includes(q) ||
      (c.ttd_campaign_id ?? '').toLowerCase().includes(q))
    .map(c => ({ id: c.id, name: c.name, client: c.client, ttd_campaign_id: c.ttd_campaign_id, status: c.status }))
}

export function queryPerformanceTool(args: { campaign_id: number; from?: string; to?: string }) {
  return db.queryPerformance(args.campaign_id, args.from, args.to)
}

const RESTART_NOTE = 'Saved. Restart Campaign Tracker (or open it fresh) to see the change — the app caches the DB in memory.'

export function backupBeforeWrite(): string {
  const dbPath = db.getDatabasePath()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = path.join(path.dirname(dbPath), `campaign-tracker-before-mcp-${stamp}.db`)
  return db.backupDatabaseTo(dest)
}

function assertLines(lines: unknown[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('A campaign needs at least one line (channel, start_date, end_date, primary_kpi).')
  }
}

export function createCampaignTool(args: { data: any; lines: any[] }) {
  if (!args.data?.name) throw new Error('Campaign name is required.')
  assertLines(args.lines)
  backupBeforeWrite()
  const campaign = db.createCampaign(args.data, args.lines)
  return { campaign, note: RESTART_NOTE }
}

export function updateCampaignTool(args: { id: number; data: any; lines: any[] }) {
  if (!db.getCampaign(args.id)) throw new Error(`Campaign ${args.id} not found`)
  assertLines(args.lines)
  backupBeforeWrite()
  const campaign = db.updateCampaign(args.id, args.data, args.lines)
  return { campaign, note: RESTART_NOTE }
}

export function previewImportTool(args: { file_path: string }) {
  return parseFile(args.file_path)
}

export function importPerformanceTool(args: {
  campaign_id: number
  campaign_line_id: number
  file_path: string
  keep_zero_impressions?: boolean
}) {
  const parsed = parseFile(args.file_path)
  const mapping = getImportMapping(parsed.columns)
  if (mapping.missingRequired.length > 0) {
    throw new Error(`Missing required columns: ${mapping.missingRequired.join(', ')}`)
  }
  // Validate that the line belongs to the campaign before any destructive write.
  const campaign = db.getCampaign(args.campaign_id)
  if (!campaign) throw new Error(`Campaign ${args.campaign_id} not found`)
  if (!campaign.lines?.some(l => l.id === args.campaign_line_id)) {
    throw new Error(`Campaign line ${args.campaign_line_id} does not belong to campaign ${args.campaign_id}`)
  }
  backupBeforeWrite()
  const rows = parsed.rows.map(r => mapRow(r, args.campaign_id))
  const result = db.importPerformance(
    {
      campaign_id: args.campaign_id,
      campaign_line_id: args.campaign_line_id,
      file_path: args.file_path,
      keep_zero_impressions: args.keep_zero_impressions ?? false,
    },
    rows
  )
  return { result, note: RESTART_NOTE }
}
