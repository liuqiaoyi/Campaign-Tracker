import { ipcMain, dialog } from 'electron'
import { IPC } from '../shared/ipc-channels'
import * as db from './mock-db'
import type { IpcResponse, Campaign, Deal, Flight, ImportOptions, PerformanceData } from '../shared/types'
import fs from 'fs'
// xlsx: use require() to guarantee CJS export shape { readFile, utils, ... }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

function ok<T>(data: T): IpcResponse<T> { return { success: true, data } }
function err(error: unknown): IpcResponse { return { success: false, error: String(error) } }

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

function parseExcelDate(val: string | number): string {
  if (typeof val === 'number') {
    // Excel serial date to JS date
    const date = new Date(Math.round((val - 25569) * 86400 * 1000))
    return date.toISOString().split('T')[0]
  }
  return String(val)
}

function mapRow(raw: Record<string, unknown>, campaignId: number): PerformanceData {
  const row: Partial<PerformanceData> = { campaign_id: campaignId, id: 0 }
  for (const [excelCol, field] of Object.entries(COLUMN_MAP)) {
    const val = raw[excelCol]
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

export function registerHandlers(): void {
  // Campaigns
  ipcMain.handle(IPC.CAMPAIGN.LIST, () => {
    try { return ok(db.listCampaigns()) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.CAMPAIGN.GET, (_e, id: number) => {
    try { return ok(db.getCampaign(id)) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.CAMPAIGN.CREATE, (_e,
    data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
    deals: Omit<Deal, 'id' | 'campaign_id'>[],
    flights: Omit<Flight, 'id' | 'campaign_id'>[]
  ) => {
    try { return ok(db.createCampaign(data, deals ?? [], flights ?? [])) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.CAMPAIGN.UPDATE, (_e, id: number,
    data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>,
    deals: Omit<Deal, 'id' | 'campaign_id'>[],
    flights: Omit<Flight, 'id' | 'campaign_id'>[]
  ) => {
    try { return ok(db.updateCampaign(id, data, deals ?? [], flights ?? [])) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.CAMPAIGN.DELETE, (_e, id: number) => {
    try { db.deleteCampaign(id); return ok(undefined) } catch (e) { return err(e) }
  })

  // Performance
  ipcMain.handle(IPC.PERFORMANCE.QUERY, (_e, campaign_id: number, from?: string, to?: string) => {
    try { return ok(db.queryPerformance(campaign_id, from, to)) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.PERFORMANCE.IMPORT, (_e, opts: ImportOptions, rawRows: Record<string, unknown>[]) => {
    try {
      const mapped = rawRows.map(r => mapRow(r, opts.campaign_id))
      return ok(db.importPerformance(opts, mapped))
    } catch (e) { return err(e) }
  })

  ipcMain.handle('performance:delete', (_e, campaign_id: number) => {
    try { return ok(db.deletePerformanceData(campaign_id)) } catch (e) { return err(e) }
  })

  ipcMain.handle('campaigns:data-status', () => {
    try { return ok(db.listCampaignsWithDataStatus()) } catch (e) { return err(e) }
  })

  // Dialog - open file
  ipcMain.handle(IPC.DIALOG.OPEN_FILE, async (_e, filters: Electron.FileFilter[]) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters })
    if (result.canceled) return ok(null)
    return ok(result.filePaths[0])
  })

  // Dialog - save file
  ipcMain.handle(IPC.DIALOG.SAVE_FILE, async (_e, defaultName: string, content: string) => {
    const result = await dialog.showSaveDialog({ defaultPath: defaultName })
    if (result.canceled || !result.filePath) return ok(false)
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return ok(true)
  })

  // File parsing - returns raw rows + zero impression count for preview
  ipcMain.handle('dialog:parseFile', async (_e, filePath: string) => {
    try {
      const workbook = XLSX.readFile(filePath)
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { raw: true })
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      const zero_impression_rows = rows.filter((r: Record<string, unknown>) => (Number(r['Impressions']) || 0) === 0).length
      return ok({ columns, rows, zero_impression_rows, total_rows: rows.length })
    } catch (e) { return err(e) }
  })

  // DB Backup
  ipcMain.handle(IPC.DB.BACKUP, async () => {
    await dialog.showMessageBox({
      type: 'info',
      title: 'Mock Database',
      message: 'Currently using mock data. Database backup will be available after SQLite setup.',
      buttons: ['OK']
    })
    return ok(true)
  })
}
