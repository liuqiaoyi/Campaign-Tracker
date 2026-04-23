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
function fmt(n: number, type: string) {
  if (type === 'pct') return pct(n)
  if (type === 'money') return money(n)
  return num(n)
}

function calcMetrics(rows: PerformanceData[]) {
  const imp  = rows.reduce((s, r) => s + r.impressions, 0)
  const cost = rows.reduce((s, r) => s + r.advertiser_cost_usd, 0)
  const clicks = rows.reduce((s, r) => s + r.clicks, 0)
  const starts = rows.reduce((s, r) => s + r.player_starts, 0)
  const completes = rows.reduce((s, r) => s + r.player_completed_views, 0)
  const reach_hh = rows.reduce((s, r) => s + r.unique_households, 0)
  const reach_p  = rows.reduce((s, r) => s + r.unique_persons, 0)
  const media_cost = rows.reduce((s, r) => s + r.media_cost_usd, 0)
  const custom_conv = rows.reduce((s, r) => s + r.total_custom_cpa_conversions, 0)

  // Conv 01-20
  const convTotals: Record<string, number> = {}
  const costAdv = rows.reduce((s, r) => s + r.advertiser_cost_adv_currency, 0)
  for (let i = 1; i <= 20; i++) {
    const key = `conv_${String(i).padStart(2, '0')}` as keyof PerformanceData
    const total = rows.reduce((s, r) => s + (r[key] as number || 0), 0)
    if (total > 0) {
      convTotals[`${String(i).padStart(2, '0')}`] = total
    }
  }

  return {
    imp, cost, clicks, starts, completes, reach_hh, reach_p, media_cost, custom_conv, costAdv,
    cpm: safe(cost, imp) * 1000,
    cpc: safe(cost, clicks),
    ctr: safe(clicks, imp),
    vcr: safe(completes, starts),
    media_cpm: safe(media_cost, imp) * 1000,
    custom_cpa: safe(cost, custom_conv),
    convTotals,
    convCpa: Object.fromEntries(Object.entries(convTotals).map(([k, v]) => [k, safe(costAdv, v)])),
  }
}

// KPI Card
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-lg p-4 bg-white">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { campaigns } = useCampaigns()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [rows, setRows] = useState<PerformanceData[]>([])
  const [loading, setLoading] = useState(false)
  const [activeConvWindow, setActiveConvWindow] = useState('01')

  useEffect(() => {
    if (!selectedId) return
    setLoading(true)
    api.performance?.query(selectedId).then(res => {
      setRows(res.data ?? [])
      setLoading(false)
    })
  }, [selectedId])

  const m = useMemo(() => rows.length > 0 ? calcMetrics(rows) : null, [rows])

  // Daily trend data
  const dailyData = useMemo(() => {
    const byDate: Record<string, { date: string; impressions: number; cost: number; vcr: number; starts: number; completes: number }> = {}
    rows.filter(r => r.impressions > 0).forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = { date: r.date, impressions: 0, cost: 0, vcr: 0, starts: 0, completes: 0 }
      byDate[r.date].impressions += r.impressions
      byDate[r.date].cost += r.advertiser_cost_usd
      byDate[r.date].starts += r.player_starts
      byDate[r.date].completes += r.player_completed_views
    })
    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
      ...d,
      vcr: safe(d.completes, d.starts) * 100,
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

  return (
    <div className="space-y-6">
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

      {selectedId && loading && (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">Loading...</div>
      )}

      {selectedId && !loading && rows.length === 0 && (
        <div className="border rounded-lg p-12 text-center text-muted-foreground">
          <p>No performance data for this campaign</p>
          <p className="text-xs mt-1">Go to Import to upload data</p>
        </div>
      )}

      {selectedId && !loading && m && rows.length > 0 && (
        <div className="space-y-6">

          {/* KPI Cards - Core */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Delivery</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Impressions" value={num(m.imp)} />
              <KpiCard label="Advertiser Cost" value={money(m.cost)} />
              <KpiCard label="Advertiser CPM" value={money(m.cpm)} sub="per 1,000 impressions" />
              <KpiCard label="Media CPM" value={money(m.media_cpm)} sub="per 1,000 impressions" />
              <KpiCard label="Clicks" value={num(m.clicks)} />
              <KpiCard label="CTR" value={pct(m.ctr)} />
              <KpiCard label="Advertiser CPC" value={m.clicks > 0 ? money(m.cpc) : 'N/A'} />
              <KpiCard label="Player Starts" value={num(m.starts)} />
            </div>
          </div>

          {/* VCR & Reach */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Video & Reach</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <KpiCard label="Player Completion Rate (VCR)" value={pct(m.vcr)} />
              <KpiCard label="Player Completed Views" value={num(m.completes)} />
              <KpiCard label="Unique Households" value={num(m.reach_hh)} />
              <KpiCard label="Unique Persons" value={num(m.reach_p)} />
            </div>
          </div>

          {/* Conversions */}
          {convWindows.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Conversions</p>
              {m.custom_conv > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 mb-3">
                  <KpiCard label="Custom CPA Conversions" value={num(m.custom_conv)} />
                  <KpiCard label="Custom CPA (USD)" value={money(m.custom_cpa)} />
                </div>
              )}
              {/* Attribution Window Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Attribution Window</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Conversions</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">CPA (Adv Currency)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convWindows.map((w, i) => (
                      <tr key={w} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                        <td className="px-4 py-2">{w} - Total Click + View Conversions</td>
                        <td className="text-right px-4 py-2 font-medium">{num(m.convTotals[w])}</td>
                        <td className="text-right px-4 py-2">{money(m.convCpa[w])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Trend Charts */}
          {dailyData.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Daily Trend</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Impressions & Spend */}
                <div className="border rounded-lg p-4">
                  <p className="text-sm font-medium mb-3">Impressions & Spend</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number, name: string) => name === 'Cost' ? money(v) : num(v)} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="impressions" stroke="#3b82f6" name="Impressions" dot={false} strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#10b981" name="Cost" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* VCR Trend */}
                <div className="border rounded-lg p-4">
                  <p className="text-sm font-medium mb-3">VCR % Daily</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                      <Tooltip formatter={(v: number) => v.toFixed(1) + '%'} />
                      <Line type="monotone" dataKey="vcr" stroke="#8b5cf6" name="VCR %" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* Ad Group Breakdown */}
          {adGroupData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ad Group Breakdown</p>

              {/* Bar chart - Impressions by Ad Group */}
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

              {/* Detail Table */}
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
                    {/* Total row */}
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
