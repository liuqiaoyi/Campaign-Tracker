import * as db from '../../src/core/db'
import * as path from 'path'

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
