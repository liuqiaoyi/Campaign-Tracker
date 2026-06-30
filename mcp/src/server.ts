import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import * as db from '../../src/core/db'
import {
  listCampaignsTool, getCampaignTool, findCampaignTool, queryPerformanceTool,
  createCampaignTool, updateCampaignTool, previewImportTool, importPerformanceTool,
} from './tools'

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

/**
 * Wrap a tool function: reload DB from disk first (so MCP always sees app's
 * latest data), then call `fn`, then wrap the result in an MCP text response.
 *
 * Typed as `any` on the argument to avoid TS2589 deep-instantiation errors
 * that arise from the Zod v3/v4 compat union in the MCP SDK's ShapeOutput<T>.
 * Runtime behaviour is fully correct — zod validates args before this is called.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fresh(fn: (a: any) => unknown): (a: any) => Promise<ReturnType<typeof json>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (a: any) => {
    db.reloadFromDisk()
    return json(fn(a))
  }
}

const lineShape = {
  id: z.number().optional(),
  channel: z.string(),
  country: z.string().optional(),
  start_date: z.string(),
  end_date: z.string(),
  budget: z.number().optional(),
  cpm_goal: z.number().optional(),
  primary_kpi: z.string(),
  secondary_kpi: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  ttd_campaign_id: z.string().optional(),
}
const lineSchema = z.object(lineShape)
const linePatchSchema = z.object({
  id: z.number().optional(),
  channel: z.string().optional(),
  country: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  budget: z.number().optional(),
  cpm_goal: z.number().optional(),
  primary_kpi: z.string().optional(),
  secondary_kpi: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
  ttd_campaign_id: z.string().optional(),
})
const dataSchema = z.object({
  name: z.string(),
  client: z.string().optional(),
  agency: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
})
const dataPatchSchema = dataSchema.partial()

export function buildServer(): McpServer {
  // Cast to `any` for tool registration calls only.
  // This avoids TS2589 ("excessively deep and possibly infinite" type
  // instantiation) caused by the MCP SDK's Zod v3/v4 compat union types
  // interacting with our nested z.object/z.array schemas.
  // All runtime type safety is provided by the Zod validators themselves.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = new McpServer({ name: 'campaign-tracker', version: '0.1.0' }) as any

  s.tool('list_campaigns', 'List all campaigns with whether they have performance data.',
    {}, fresh(() => listCampaignsTool()))

  s.tool('get_campaign', 'Get one campaign with its lines, flights and deals.',
    { id: z.number() }, fresh(getCampaignTool))

  s.tool('find_campaign', 'Fuzzy-find campaigns by name, client or TTD campaign id.',
    { query: z.string() }, fresh(findCampaignTool))

  s.tool('query_performance', 'Query performance rows for a campaign, optional date range.',
    { campaign_id: z.number(), from: z.string().optional(), to: z.string().optional() },
    fresh(queryPerformanceTool))

  s.tool('create_campaign', 'Create a campaign. Requires name and at least one line.',
    { data: dataSchema, lines: z.array(lineSchema) },
    fresh(createCampaignTool))

  s.tool('update_campaign', 'Patch a campaign and/or its lines. Omitted existing lines are preserved.',
    { id: z.number(), data: dataPatchSchema.optional(), lines: z.array(linePatchSchema).optional() },
    fresh(updateCampaignTool))

  s.tool('preview_import', 'Parse a TTD Excel/CSV and report column mapping WITHOUT writing.',
    { file_path: z.string(), sheet_name: z.string().optional() }, fresh(previewImportTool))

  s.tool('import_performance', 'Import performance data from a file into a campaign line (replaces existing rows for that line).',
    {
      campaign_id: z.number(), campaign_line_id: z.number(),
      file_path: z.string(), sheet_name: z.string().optional(), keep_zero_impressions: z.boolean().optional(),
    },
    fresh(importPerformanceTool))

  return s as McpServer
}
