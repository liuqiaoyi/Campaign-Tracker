import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCampaigns } from '../hooks/useCampaigns'
import { Button } from '../components/ui/button'
import { BarChart2, Calendar, Upload, Plus, Activity } from 'lucide-react'

const STATUS_DOT: Record<string, string> = {
  Active:  'bg-emerald-500',
  Paused:  'bg-amber-500',
  Draft:   'bg-slate-400',
  Ended:   'bg-rose-400',
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="border rounded-xl p-5 bg-white">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color ?? ''}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  )
}

export default function Home() {
  const { campaigns, loading } = useCampaigns()
  const navigate = useNavigate()

  const stats = useMemo(() => {
    const active  = campaigns.filter(c => c.status === 'Active').length
    const paused  = campaigns.filter(c => c.status === 'Paused').length
    const draft   = campaigns.filter(c => c.status === 'Draft').length
    const ended   = campaigns.filter(c => c.status === 'Ended').length
    const totalBudget = campaigns.reduce((s, c) => s + (c.budget ?? 0), 0)
    return { active, paused, draft, ended, total: campaigns.length, totalBudget }
  }, [campaigns])

  // Campaigns ending within 14 days
  const today = new Date()
  const endingSoon = useMemo(() => {
    return campaigns
      .filter(c => {
        if (c.status === 'Ended') return false
        const end = new Date(c.end_date)
        const days = Math.ceil((end.getTime() - today.getTime()) / 86400000)
        return days >= 0 && days <= 14
      })
      .sort((a, b) => a.end_date.localeCompare(b.end_date))
  }, [campaigns])

  // Active campaigns
  const activeCampaigns = campaigns.filter(c => c.status === 'Active').slice(0, 5)

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaign Tracker</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button onClick={() => navigate('/campaigns')} className="gap-2">
          <Plus size={16} /> New Campaign
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active" value={stats.active} sub="campaigns running" color="text-emerald-600" />
        <StatCard label="Total Campaigns" value={stats.total} sub={`${stats.draft} draft · ${stats.ended} ended`} />
        <StatCard label="Paused" value={stats.paused} color="text-amber-600" />
        <StatCard
          label="Total Budget"
          value={stats.totalBudget > 0 ? '$' + stats.totalBudget.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
          sub="across all campaigns"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Campaigns */}
        <div className="border rounded-xl p-5 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-emerald-500" />
              <p className="font-medium text-sm">Active Campaigns</p>
            </div>
            <button onClick={() => navigate('/campaigns')} className="text-xs text-blue-600 hover:underline">View all</button>
          </div>
          {activeCampaigns.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No active campaigns</p>
          )}
          {activeCampaigns.map(c => (
            <div key={c.id} className="flex items-start gap-3 py-2 border-t first:border-t-0">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[c.status]}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.client} · {c.start_date} → {c.end_date}</p>
              </div>
              {c.budget && (
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  ${(c.budget / 1000).toFixed(0)}k
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Ending Soon */}
        <div className="border rounded-xl p-5 bg-white space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-orange-500" />
            <p className="font-medium text-sm">Ending Within 14 Days</p>
          </div>
          {endingSoon.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No campaigns ending soon</p>
          )}
          {endingSoon.map(c => {
            const days = Math.ceil((new Date(c.end_date).getTime() - today.getTime()) / 86400000)
            return (
              <div key={c.id} className="flex items-center gap-3 py-2 border-t first:border-t-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[c.status]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.client}</p>
                </div>
                <span className={`text-xs font-medium flex-shrink-0 ${days <= 3 ? 'text-red-600' : 'text-orange-600'}`}>
                  {days === 0 ? 'Today' : `${days}d left`}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: <Plus size={18} />, label: 'New Campaign', path: '/campaigns', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
            { icon: <Calendar size={18} />, label: 'View Timeline', path: '/timeline', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
            { icon: <Upload size={18} />, label: 'Import Data', path: '/import', color: 'text-orange-600 bg-orange-50 hover:bg-orange-100' },
            { icon: <BarChart2 size={18} />, label: 'Dashboard', path: '/dashboard', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
          ].map(a => (
            <button
              key={a.path}
              onClick={() => navigate(a.path)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-colors ${a.color}`}
            >
              {a.icon}
              <span className="text-sm font-medium">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
