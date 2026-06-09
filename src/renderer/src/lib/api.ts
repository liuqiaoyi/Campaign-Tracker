import type { Campaign, Deal, Flight, PerformanceData, ImportOptions, ImportResult, IpcResponse } from '../../../shared/types'

declare global {
  interface Window {
    api: {
      campaign: {
        list:   () => Promise<IpcResponse<Campaign[]>>
        get:    (id: number) => Promise<IpcResponse<Campaign>>
        create: (data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[], flights: Omit<Flight, 'id' | 'campaign_id'>[]) => Promise<IpcResponse<Campaign>>
        update: (id: number, data: Omit<Campaign, 'id' | 'created_at' | 'flights' | 'deals'>, deals: Omit<Deal, 'id' | 'campaign_id'>[], flights: Omit<Flight, 'id' | 'campaign_id'>[]) => Promise<IpcResponse<Campaign>>
        delete: (id: number) => Promise<IpcResponse>
      }
      performance: {
        query:      (campaign_id: number, from?: string, to?: string) => Promise<IpcResponse<PerformanceData[]>>
        import:     (opts: ImportOptions, rows: Record<string, unknown>[]) => Promise<IpcResponse<ImportResult>>
        delete:     (campaign_id: number) => Promise<IpcResponse<number>>
        dataStatus: () => Promise<IpcResponse<Array<{ campaign: { id: number; name: string; client: string; status: string }; hasData: boolean; rowCount: number }>>>
      }
      dialog: {
        openFile:  (filters: { name: string; extensions: string[] }[]) => Promise<IpcResponse<string | null>>
        saveFile:  (name: string, content: string) => Promise<IpcResponse<boolean>>
        parseFile: (filePath: string) => Promise<IpcResponse<{
          columns: string[]
          rows: Record<string, unknown>[]
          zero_impression_rows: number
          total_rows: number
          mapped_columns: Array<{ source: string; field: string; label: string }>
          missing_required_columns: string[]
        }>>
      }
      db: {
        backup:     () => Promise<IpcResponse<string | null>>
        restore:    () => Promise<IpcResponse<{ dbPath: string; safetyBackupPath: string } | null>>
        openFolder: () => Promise<IpcResponse<string>>
      }
      app: {
        checkUpdate: () => Promise<IpcResponse<{
          tag_name: string
          html_url: string
          name: string
          assets: Array<{ name: string; browser_download_url: string }>
          recommended_asset: { name: string; browser_download_url: string } | null
          platform: string
          arch: string
        }>>
        getVersion:  () => Promise<IpcResponse<string>>
      }
    }
  }
}

export const api = {
  get campaign() { return window.api?.campaign },
  get performance() { return window.api?.performance },
  get dialog() { return window.api?.dialog },
  get db() { return window.api?.db },
  get app() { return window.api?.app },
}
