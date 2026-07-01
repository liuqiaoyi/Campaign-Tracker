import * as db from '../../src/core/db'
import * as path from 'path'
import { parseFile } from '../../src/core/parse-file'
import { getImportMapping, mapRow } from '../../src/core/import-mapping'
import { issueToken, consumeToken } from './confirm-tokens'

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
      (c.ttd_campaign_id ?? '').toLowerCase().includes(q) ||
      (c.lines ?? []).some(l => (l.ttd_campaign_id ?? '').toLowerCase().includes(q)))
    .map(c => ({
      id: c.id,
      name: c.name,
      client: c.client,
      ttd_campaign_id: c.ttd_campaign_id,
      status: c.status,
      lines: c.lines?.map(l => ({
        id: l.id,
        country: l.country,
        channel: l.channel,
        ttd_campaign_id: l.ttd_campaign_id,
        start_date: l.start_date,
        end_date: l.end_date,
        budget: l.budget,
        cpm_goal: l.cpm_goal,
        primary_kpi: l.primary_kpi,
        status: l.status,
        notes: l.notes,
      })) ?? [],
    }))
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

export function updateCampaignTool(args: { id: number; data?: any; lines?: any[] }) {
  if (!db.getCampaign(args.id)) throw new Error(`Campaign ${args.id} not found`)
  if (!args.data && (!Array.isArray(args.lines) || args.lines.length === 0)) {
    throw new Error('Provide campaign data or at least one line patch to update.')
  }
  backupBeforeWrite()
  const campaign = db.patchCampaign(args.id, args.data ?? {}, args.lines ?? [])
  return { campaign, note: RESTART_NOTE }
}

export function previewImportTool(args: { file_path: string; sheet_name?: string }) {
  return parseFile(args.file_path, { sheet_name: args.sheet_name })
}

export function importPerformanceTool(args: {
  campaign_id: number
  campaign_line_id: number
  file_path: string
  sheet_name?: string
  keep_zero_impressions?: boolean
}) {
  const parsed = parseFile(args.file_path, { sheet_name: args.sheet_name })
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

export function deleteCampaignTool(args: { id: number; confirm_token?: string }) {
  const c = db.getCampaign(args.id)
  if (!c) throw new Error(`Campaign ${args.id} not found`)
  if (!args.confirm_token) {
    const lineCount = c.lines?.length ?? 0
    const perfRows = db.queryPerformance(args.id).length
    const fp = `${lineCount}:${perfRows}`
    const preview = `Will DELETE campaign '${c.name}' (id ${args.id}) and its ${lineCount} line(s) and ${perfRows} performance row(s). Cascades; cannot be undone via MCP.`
    return { preview, confirm_token: issueToken('campaign', args.id, preview, fp), requires_confirmation: true }
  }
  const current = db.getCampaign(args.id)
  if (!current) throw new Error(`Campaign ${args.id} not found`)
  const fp = `${current.lines?.length ?? 0}:${db.queryPerformance(args.id).length}`
  consumeToken(args.confirm_token, 'campaign', args.id, fp)
  backupBeforeWrite()
  // core deleteCampaign cascades children explicitly (sql.js FK is unreliable)
  db.deleteCampaign(args.id)
  return { deleted: { type: 'campaign', id: args.id, name: c.name }, note: RESTART_NOTE }
}

export function deleteCampaignLineTool(args: { line_id: number; confirm_token?: string }) {
  const summary = db.getCampaignLineSummary(args.line_id)
  if (!summary) throw new Error(`Campaign line ${args.line_id} not found`)
  if (!args.confirm_token) {
    if (summary.line_count <= 1) {
      // Refuse at preview: issue no token so the AI must report this to the user.
      throw new Error(`Campaign line ${args.line_id} ('${summary.channel}') is the last line of campaign '${summary.campaign_name}'. Use delete_campaign to remove the whole campaign instead.`)
    }
    const fp = `${summary.line_count}:${summary.performance_rows}`
    const preview = `Will DELETE campaign line ${args.line_id} ('${summary.channel}') of campaign '${summary.campaign_name}' and its ${summary.performance_rows} performance row(s). Cascades; cannot be undone via MCP.`
    return { preview, confirm_token: issueToken('campaign_line', args.line_id, preview, fp), requires_confirmation: true }
  }
  const currentSummary = db.getCampaignLineSummary(args.line_id)
  if (!currentSummary) throw new Error(`Campaign line ${args.line_id} not found`)
  const fp = `${currentSummary.line_count}:${currentSummary.performance_rows}`
  consumeToken(args.confirm_token, 'campaign_line', args.line_id, fp)
  backupBeforeWrite()
  db.deleteCampaignLine(args.line_id) // core re-validates the last-line rule (authoritative)
  return { deleted: { type: 'campaign_line', line_id: args.line_id, campaign_id: summary.campaign_id }, note: RESTART_NOTE }
}

export function deletePerformanceTool(args: { campaign_id: number; confirm_token?: string }) {
  const c = db.getCampaign(args.campaign_id)
  if (!c) throw new Error(`Campaign ${args.campaign_id} not found`)
  if (!args.confirm_token) {
    const perfRows = db.queryPerformance(args.campaign_id).length
    const fp = `${perfRows}`
    const preview = `Will DELETE all ${perfRows} performance row(s) for campaign '${c.name}' (id ${args.campaign_id}). Campaign and line structure are kept.`
    return { preview, confirm_token: issueToken('performance', args.campaign_id, preview, fp), requires_confirmation: true }
  }
  const fp = `${db.queryPerformance(args.campaign_id).length}`
  consumeToken(args.confirm_token, 'performance', args.campaign_id, fp)
  backupBeforeWrite()
  const rows = db.deletePerformanceData(args.campaign_id)
  return { deleted: { type: 'performance', campaign_id: args.campaign_id, rows }, note: RESTART_NOTE }
}
