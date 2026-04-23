import { useState, useEffect, useMemo } from 'react'
import { api } from '../lib/api'
import { useCampaigns } from '../hooks/useCampaigns'
import type { PerformanceData } from '../../../shared/types'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const selectClass = "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

// ── Helpers ────────────────────────────────────────────────────────────────────
function safe(a: number, b: number) { return b === 0 ? 0 : a / b }
function pct(n: number) { return (n * 100).toFixed(2) + '%' }
function money(n: number) { return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }
function num(n: number) { return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) }

function calcMetrics(rows: PerformanceData[]) {
  const imp        = rows.reduce((s, r) => s + r.impressions, 0)
  const cost       = rows.reduce((s, r) => s + r.advertiser_cost_usd, 0)
  const clicks     = rows.reduce((s, r) => s + r.clicks, 0)
  const starts     = rows.reduce((s, r) => s + r.player_starts, 0)
  const completes  = rows.reduce((s, r) => s + r.player_completed_views, 0)
  const reach_hh   = rows.reduce((s, r) => s + r.unique_households, 0)
  const reach_p    = rows.reduce((s, r) => s + r.unique_persons, 0)
  const media_cost = rows.reduce((s, r) => s + r.media_cost_usd, 0)
  const custom_conv = rows.reduce((s, r) => s + r.total_custom_cpa_conversions, 0)
  const costAdv    = rows.reduce((s, r) => s + r.advertiser_cost_adv_currency, 0)

  const convTotals: Record<string, number> = {}
  for (let i = 1; i <= 20; i++) {
    const key = `conv_${String(i).padStart(2, '0')}` as keyof PerformanceData
    const total = rows.reduce((s, r) => s + (r[key] as number || 0), 0)
    if (total > 0) convTotals[String(i).padStart(2, '0')] = total
  }

  return {
    imp, cost, clicks, starts, completes, reach_hh, reach_p, media_cost, custom_conv, costAdv,
    cpm:        safe(cost, imp) * 1000,
    cpc:        safe(cost, clicks),
    ctr:        safe(clicks, imp),
    vcr:        safe(completes, starts),
    media_cpm:  safe(media_cost, imp) * 1000,
    custom_cpa: safe(cost, custom_conv),
    convTotals,
    convCpa: Object.fromEntries(Object.entries(convTotals).map(([k, v]) => [k, safe(costAdv, v)])),
  }
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Available metrics for the trend chart ─────────────────────────────────────
const METRIC_OPTIONS = [
  { key: 'impressions', label: 'Impressions',    color: '#3b82f6', fmt: (v: number) => num(v) },
  { key: 'cost',        label: 'Adv Cost (USD)', color: '#10b981', fmt: (v: number) => money(v) },
  { key: 'cpm',         label: 'CPM (USD)',       color: '#f59e0b', fmt: (v: number) => money(v) },
  { key: 'vcr',         label: 'VCR %',           color: '#8b5cf6', fmt: (v: number) => v.toFixed(1) + '%' },
  { key: 'clicks',      label: 'Clicks',          color: '#ef4444', fmt: (v: number) => num(v) },
  { key: 'ctr',         label: 'CTR %',           color: '#ec4899', fmt: (v: number) => (v * 100).toFixed(3) + '%' },
  { key: 'starts',      label: 'Player Starts',   color: '#06b6d4', fmt: (v: number) => num(v) },
  { key: 'completes',   label: 'Completed Views', color: '#6366f1', fmt: (v: number) => num(v) },
  { key: 'reach_hh',    label: 'Unique HH',       color: '#84cc16', fmt: (v: number) => num(v) },
]

export default function Dashboard() {
  const { campaigns } = useCampaigns()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rows, setRows] = useState<PerformanceData[]>([])
  const [loading, setLoading] = useState(false)

  // Reporting Column single-select
  const [activeConv, setActiveConv] = useState('01')

  // Trend chart metric selectors
  const [metric1, setMetric1] = useState('impressions')
  const [metric2, setMetric2] = useState('vcr')

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.performance?.query(selectedId).then(res => {
      setRows(res.data ?? [])
      setLoading(false)
    })
  }, [selectedId])

  const m = useMemo(() => rows.length > 0 ? calcMetrics(rows) : null, [rows])

  // Daily trend data — includes all metrics
  const dailyData = useMemo(() => {
    const byDate: Record<string, Record<string, number> & { date: string }> = {}
    rows.filter(r => r.impressions > 0).forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {
        date: r.date, impressions: 0, cost: 0, starts: 0, completes: 0,
        clicks: 0, reach_hh: 0, reach_p: 0,
      }
      byDate[r.date].impressions += r.impressions
      byDate[r.date].cost       += r.advertiser_cost_usd
      byDate[r.date].starts     += r.player_starts
      byDate[r.date].completes  += r.player_completed_views
      byDate[r.date].clicks     += r.clicks
      byDate[r.date].reach_hh   += r.unique_households
      byDate[r.date].reach_p    += r.unique_persons
    })
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      vcr: safe(d.completes, d.starts) * 100,
      ctr: safe(d.clicks, d.impressions),
      cpm: safe(d.cost, d.impressions) * 1000,
    }))
  }, [rows])

  // Ad Group breakdown
  const adGroupData = useMemo(() => {
    const byAg: Record<string, PerformanceData[]> = {}
    rows.forEach(r => {
      const k = r.ad_group || 'Unknown'
      if (!byAg[k]) byAg[k] = []
      byAg[k].push(r)
    })
    return Object.entries(byAg).map(([ag, agRows]) => {
      const m = calcMetrics(agRows)
      return { ad_group: ag, ...m }
    }).sort((a, b) => b.imp - a.imp)
  }, [rows])

  const convWindows = m ? Object.keys(m.convTotals).sort() : []

  // When conv windows load, default to first available
  useEffect(() => {
    if (convWindows.length > 0 && !convWindows.includes(activeConv)) {
      setActiveConv(convWindows[0])
    }
  }, [convWindows.join(',')])

  const m1Def = METRIC_OPTIONS.find(o => o.key === metric1) ?? METRIC_OPTIONS[0]
  const m2Def = METRIC_OPTIONS.find(o => o.key === metric2) ?? METRIC_OPTIONS[3]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Performance Dashboard</h1>
        <select
          className={selectClass + ' w-72'}
          value={selectedId ?? ''}
          onChange={e => setSelectedId(Number(e.target.value) || null)}
        >
          <option value="">— Select a campaign —</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {!selectedId && (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <p>Select a campaign to view performance data</p>
          <p className="text-xs mt-1">Import data first via the Import page</p>
        </div>
      )}
      {selectedId && loading && <div className="border rounded-lg p-12 text-center text-muted-foreground">Loading...</div>}
      {selectedId && !loading && rows.length === 0 && (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <p>No performance data for this campaign</p>
          <p className="text-xs mt-1">Go to Import to upload data</p>
        </div>
      )}

      {selectedId && !loading && m && rows.length > 0 && (
        <div className="space-y-6">

          {/* Delivery KPIs */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Delivery</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Impressions"          value={num(m.imp)} />
              <KpiCard label="Advertiser Cost"       value={money(m.cost)} />
              <KpiCard label="Advertiser CPM"        value={money(m.cpm)} sub="per 1,000 impressions" />
              <KpiCard label="Media CPM"             value={money(m.media_cpm)} sub="per 1,000 impressions" />
              <KpiCard label="Clicks"                value={num(m.clicks)} />
              <KpiCard label="CTR"                   value={pct(m.ctr)} />
              <KpiCard label="Advertiser CPC"        value={m.clicks > 0 ? money(m.cpc) : 'N/A'} />
              <KpiCard label="Player Starts"         value={num(m.starts)} />
            </div>
          </div>

          {/* Video & Reach */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Video & Reach</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Player Completion Rate (VCR)" value={pct(m.vcr)} />
              <KpiCard label="Player Completed Views"        value={num(m.completes)} />
              <KpiCard label="Unique Households"             value={num(m.reach_hh)} />
              <KpiCard label="Unique Persons"                value={num(m.reach_p)} />
            </div>
          </div>

          {/* Reporting Columns (single-select, formerly Attribution Window) */}
          {convWindows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reporting Columns</p>
              {m.custom_conv > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-4">
                  <KpiCard label="Custom CPA Conversions" value={num(m.custom_conv)} />
                  <KpiCard label="Custom CPA (USD)"       value={money(m.custom_cpa)} />
                </div>
              )}

              {/* Single-select tabs for conv window */}
              <div className="border rounded-lg overflow-hidden">
                {/* Window selector */}
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium mr-1">Window:</span>
                  {convWindows.map(w => (
                    <button
                      key={w}
                      onClick={() => setActiveConv(w)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors font-mono
                        ${activeConv === w
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white border-border text-muted-foreground hover:border-blue-300 hover:text-blue-600'}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>

                {/* Selected window detail */}
                {m.convTotals[activeConv] !== undefined && (
                  <div className="px-4 py-4">
                    <p className="text-sm font-medium text-muted-foreground mb-3">
                      {activeConv} — Total Click + View Conversions
                    </p>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground">Conversions</p>
                        <p className="text-2xl font-bold text-blue-700 mt-1">{num(m.convTotals[activeConv])}</p>
                      </div>
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground">CPA (Adv Currency)</p>
                        <p className="text-2xl font-bold text-green-700 mt-1">{money(m.convCpa[activeConv])}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-4">
                        <p className="text-xs text-muted-foreground">Conv Rate (per 1k Imp)</p>
                        <p className="text-2xl font-bold text-purple-700 mt-1">
                          {safe(m.convTotals[activeConv], m.imp / 1000).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daily Trend — single chart, dual-metric */}
          {dailyData.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Daily Trend</p>
              <div className="border rounded-lg p-4">
                {/* Metric pickers */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m1Def.color }} />
                    <span className="text-xs text-muted-foreground">Metric 1:</span>
                    <select
                      className="h-7 px-2 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      value={metric1}
                      onChange={e => setMetric1(e.target.value)}
                    >
                      {METRIC_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </div>
                  <span className="text-muted-foreground text-xs">vs.</span>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: m2Def.color }} />
                    <span className="text-xs text-muted-foreground">Metric 2:</span>
                    <select
                      className="h-7 px-2 text-xs border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                      value={metric2}
                      onChange={e => setMetric2(e.target.value)}
                    >
                      {METRIC_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                  </div>
                </div>

                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={dailyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => m1Def.fmt(v)} width={60} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => m2Def.fmt(v)} width={60} />
                    <Tooltip
                      formatter={(v: number, name: string) => {
                        if (name === m1Def.label) return [m1Def.fmt(v), name]
                        if (name === m2Def.label) return [m2Def.fmt(v), name]
                        return [v, name]
                      }}
                    />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey={metric1}
                      stroke={m1Def.color}
                      name={m1Def.label}
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey={metric2}
                      stroke={m2Def.color}
                      name={m2Def.label}
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="4 2"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Ad Group Breakdown */}
          {adGroupData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ad Group Breakdown</p>
              {adGroupData.length > 1 && (
                <div className="border rounded-lg p-4 mb-4">
                  <p className="text-sm font-medium mb-3">Impressions by Ad Group</p>
                  <ResponsiveContainer width="100%" height={Math.max(200, adGroupData.length * 28)}>
                    <BarChart data={adGroupData} layout="vertical" margin={{ top: 5, right: 10, left: 120, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="ad_group" tick={{ fontSize: 10 }} width={120} />
                      <Tooltip formatter={(v: number) => num(v)} />
                      <Bar dataKey="imp" fill="#3b82f6" name="Impressions" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="border rounded-lg overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Ad Group</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Impressions</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Cost</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">CPM</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Clicks</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">CTR</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">VCR</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Reach (P)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adGroupData.map((ag, i) => (
                      <tr key={ag.ad_group} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                        <td className="px-3 py-1.5 max-w-[200px] truncate" title={ag.ad_group}>{ag.ad_group}</td>
                        <td className="text-right px-3 py-1.5">{num(ag.imp)}</td>
                        <td className="text-right px-3 py-1.5">{money(ag.cost)}</td>
                        <td className="text-right px-3 py-1.5">{money(ag.cpm)}</td>
                        <td className="text-right px-3 py-1.5">{num(ag.clicks)}</td>
                        <td className="text-right px-3 py-1.5">{pct(ag.ctr)}</td>
                        <td className="text-right px-3 py-1.5">{pct(ag.vcr)}</td>
                        <td className="text-right px-3 py-1.5">{num(ag.reach_p)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50 font-medium border-t">
                      <td className="px-3 py-1.5">Total</td>
                      <td className="text-right px-3 py-1.5">{num(m.imp)}</td>
                      <td className="text-right px-3 py-1.5">{money(m.cost)}</td>
                      <td className="text-right px-3 py-1.5">{money(m.cpm)}</td>
                      <td className="text-right px-3 py-1.5">{num(m.clicks)}</td>
                      <td className="text-right px-3 py-1.5">{pct(m.ctr)}</td>
                      <td className="text-right px-3 py-1.5">{pct(m.vcr)}</td>
                      <td className="text-right px-3 py-1.5">{num(m.reach_p)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
