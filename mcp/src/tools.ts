import * as db from '../../src/core/db'

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
