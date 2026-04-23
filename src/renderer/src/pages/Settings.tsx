import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Button } from '../components/ui/button'
import { RefreshCw, Trash2, CheckCircle, AlertCircle, Download, Database } from 'lucide-react'

const GITHUB_REPO = 'liuqiaoyi/Campaign-Tracker'
const CURRENT_VERSION = '0.1.0'

interface DataStatus {
  campaign: { id: number; name: string; client: string; status: string }
  hasData: boolean
  rowCount: number
}

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'

export default function Settings() {
  const [dataStatuses, setDataStatuses] = useState<DataStatus[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deletedIds, setDeletedIds] = useState<number[]>([])

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')
  const [latestVersion, setLatestVersion] = useState('')
  const [releaseUrl, setReleaseUrl] = useState('')
  const [updateError, setUpdateError] = useState('')

  // Load data status on mount
  useEffect(() => {
    loadDataStatus()
  }, [])

  const loadDataStatus = async () => {
    setLoadingData(true)
    const res = await (api.performance as any).dataStatus?.()
    if (res?.success && res.data) {
      setDataStatuses(res.data)
    }
    setLoadingData(false)
  }

  const handleDeleteData = async (campaignId: number, campaignName: string) => {
    if (!window.confirm(`Delete all performance data for:\n"${campaignName}"?\n\nThis cannot be undone.`)) return
    setDeletingId(campaignId)
    const res = await (api.performance as any).delete?.(campaignId)
    if (res?.success) {
      setDeletedIds(prev => [...prev, campaignId])
      setDataStatuses(prev => prev.map(s =>
        s.campaign.id === campaignId ? { ...s, hasData: false, rowCount: 0 } : s
      ))
    }
    setDeletingId(null)
  }

  const checkForUpdates = async () => {
    setUpdateStatus('checking')
    setUpdateError('')
    try {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github.v3+json' }
      })
      if (!res.ok) throw new Error(`GitHub API returned ${res.status}`)
      const data = await res.json()
      const latest = (data.tag_name as string ?? '').replace(/^v/, '')
      setLatestVersion(latest)
      setReleaseUrl(data.html_url ?? `https://github.com/${GITHUB_REPO}/releases`)
      setUpdateStatus(latest && latest !== CURRENT_VERSION ? 'available' : 'up-to-date')
    } catch (e) {
      setUpdateError(String(e))
      setUpdateStatus('error')
    }
  }

  const StatusDot = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      Active: 'bg-emerald-500', Paused: 'bg-amber-500', Draft: 'bg-slate-400', Ended: 'bg-rose-400'
    }
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-slate-400'}`} />
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      {/* ── Auto Update ── */}
      <section className="border rounded-xl p-6 space-y-4 bg-white">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-blue-500" />
          <h2 className="font-semibold">Updates</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Current version: <span className="font-mono font-medium">v{CURRENT_VERSION}</span>
        </p>

        {updateStatus === 'idle' && (
          <Button onClick={checkForUpdates} variant="outline" className="gap-2">
            <RefreshCw size={14} /> Check for Updates
          </Button>
        )}

        {updateStatus === 'checking' && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw size={14} className="animate-spin" /> Checking GitHub for updates…
          </div>
        )}

        {updateStatus === 'up-to-date' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
              <CheckCircle size={14} /> You're on the latest version (v{CURRENT_VERSION})
            </div>
            <Button onClick={checkForUpdates} variant="ghost" size="sm" className="gap-1">
              <RefreshCw size={12} /> Recheck
            </Button>
          </div>
        )}

        {updateStatus === 'available' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              <Download size={14} />
              New version available: <span className="font-mono font-semibold">v{latestVersion}</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => window.open(releaseUrl, '_blank')} className="gap-2">
                <Download size={14} /> Download v{latestVersion}
              </Button>
              <Button onClick={checkForUpdates} variant="ghost" size="sm">Recheck</Button>
            </div>
          </div>
        )}

        {updateStatus === 'error' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>Failed to check: {updateError}</span>
            </div>
            <Button onClick={checkForUpdates} variant="outline" size="sm" className="gap-1">
              <RefreshCw size={12} /> Retry
            </Button>
          </div>
        )}
      </section>

      {/* ── Data Management ── */}
      <section className="border rounded-xl p-6 space-y-4 bg-white">
        <div className="flex items-center gap-2">
          <Database size={18} className="text-orange-500" />
          <h2 className="font-semibold">Performance Data Management</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Delete imported performance data for specific campaigns. The campaign record itself will be kept.
        </p>

        {loadingData ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : dataStatuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No campaigns found.</p>
        ) : (
          <div className="space-y-2">
            {dataStatuses.map(({ campaign, hasData, rowCount }) => (
              <div
                key={campaign.id}
                className="flex items-center gap-3 border rounded-lg px-4 py-3 bg-muted/20"
              >
                <StatusDot status={campaign.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {campaign.client} ·{' '}
                    {hasData
                      ? <span className="text-blue-700">{rowCount.toLocaleString()} rows imported</span>
                      : <span className="text-muted-foreground">No performance data</span>
                    }
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasData || deletingId === campaign.id}
                  onClick={() => handleDeleteData(campaign.id, campaign.name)}
                  className={`gap-1.5 flex-shrink-0 ${hasData ? 'text-red-600 border-red-200 hover:bg-red-50' : ''}`}
                >
                  {deletingId === campaign.id ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : deletedIds.includes(campaign.id) ? (
                    <><CheckCircle size={12} /> Deleted</>
                  ) : (
                    <><Trash2 size={12} /> Delete Data</>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t">
          <Button onClick={loadDataStatus} variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            <RefreshCw size={12} /> Refresh
          </Button>
        </div>
      </section>

      {/* ── About ── */}
      <section className="border rounded-xl p-6 space-y-2 bg-white">
        <h2 className="font-semibold">About</h2>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Campaign Tracker v{CURRENT_VERSION}</p>
          <p>Built with Electron + React + TypeScript</p>
          <p>
            <button
              onClick={() => window.open(`https://github.com/${GITHUB_REPO}`, '_blank')}
              className="text-blue-600 hover:underline"
            >
              github.com/{GITHUB_REPO}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
