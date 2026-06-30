import { ipcMain, dialog, app, shell } from 'electron'
import { IPC } from '../shared/ipc-channels'
import * as db from './database'
import type { IpcResponse, Campaign, CampaignLine, ImportOptions } from '../shared/types'
import { getImportMapping, mapRow } from '../core/import-mapping'
import fs from 'fs'
import https from 'https'
import path from 'path'
// xlsx: use require() to guarantee CJS export shape { readFile, utils, ... }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx')

function ok<T>(data: T): IpcResponse<T> { return { success: true, data } }
function err(error: unknown): IpcResponse { return { success: false, error: String(error) } }

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
}

function pickPlatformAsset(assets: GitHubReleaseAsset[]): GitHubReleaseAsset | null {
  const platform = process.platform
  const arch = process.arch
  if (platform === 'win32') {
    return assets.find(a => /\.exe$/i.test(a.name)) ?? null
  }
  if (platform === 'darwin') {
    const dmgAssets = assets.filter(a => /\.dmg$/i.test(a.name))
    if (arch === 'arm64') return dmgAssets.find(a => /arm64/i.test(a.name)) ?? dmgAssets[0] ?? null
    return dmgAssets.find(a => !/arm64/i.test(a.name)) ?? dmgAssets[0] ?? null
  }
  return null
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
    data: Omit<Campaign, 'id' | 'created_at' | 'lines'>,
    lines: Omit<CampaignLine, 'id' | 'campaign_id'>[]
  ) => {
    try { return ok(db.createCampaign(data, lines ?? [])) } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.CAMPAIGN.UPDATE, (_e, id: number,
    data: Omit<Campaign, 'id' | 'created_at' | 'lines'>,
    lines: Omit<CampaignLine, 'id' | 'campaign_id'>[]
  ) => {
    try { return ok(db.updateCampaign(id, data, lines ?? [])) } catch (e) { return err(e) }
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
      const columns = rawRows.length > 0 ? Object.keys(rawRows[0]) : []
      const mapping = getImportMapping(columns)
      if (mapping.missingRequired.length > 0) {
        throw new Error(`Missing required columns: ${mapping.missingRequired.join(', ')}`)
      }
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
      const mapping = getImportMapping(columns)
      const zero_impression_rows = rows.filter((r: Record<string, unknown>) => (mapRow(r, 0).impressions || 0) === 0).length
      return ok({
        columns,
        rows,
        zero_impression_rows,
        total_rows: rows.length,
        mapped_columns: mapping.mapped,
        missing_required_columns: mapping.missingRequired,
      })
    } catch (e) { return err(e) }
  })

  // DB Backup / Restore (data lives in userData/campaign-tracker.db)
  ipcMain.handle(IPC.DB.BACKUP, async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const result = await dialog.showSaveDialog({
        title: 'Backup Campaign Tracker Database',
        defaultPath: `campaign-tracker-backup-${today}.db`,
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      })
      if (result.canceled || !result.filePath) return ok(null)
      return ok(db.backupDatabaseTo(result.filePath))
    } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.DB.RESTORE, async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Restore Campaign Tracker Database',
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      })
      if (result.canceled || result.filePaths.length === 0) return ok(null)
      return ok(db.restoreDatabaseFrom(result.filePaths[0]))
    } catch (e) { return err(e) }
  })

  ipcMain.handle(IPC.DB.OPEN_FOLDER, async () => {
    try {
      const folder = path.dirname(db.getDatabasePath())
      const result = await shell.openPath(folder)
      if (result) throw new Error(result)
      return ok(folder)
    } catch (e) { return err(e) }
  })

  // Return the real app version from package.json (via Electron app.getVersion())
  ipcMain.handle('app:version', () => ok(app.getVersion()))

  // Check for updates via GitHub Releases API (runs in main process — no CORS)
  ipcMain.handle('app:check-update', () => {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/liuqiaoyi/Campaign-Tracker/releases/latest',
        headers: {
          'User-Agent': 'Campaign-Tracker-App',
          'Accept': 'application/vnd.github.v3+json',
        },
      }
      const req = https.get(options, (res) => {
        let body = ''
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          try {
            const data = JSON.parse(body)
            const assets = (data.assets ?? []).map((a: GitHubReleaseAsset) => ({
              name: a.name,
              browser_download_url: a.browser_download_url,
            }))
            resolve(ok({
              tag_name: data.tag_name,
              html_url: data.html_url,
              name: data.name,
              assets,
              recommended_asset: pickPlatformAsset(assets),
              platform: process.platform,
              arch: process.arch,
            }))
          } catch (e) {
            resolve(err(e))
          }
        })
      })
      req.on('error', (e) => resolve(err(e)))
      req.setTimeout(8000, () => { req.destroy(); resolve(err('Request timed out')) })
    })
  })
}
