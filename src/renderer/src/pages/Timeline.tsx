import { useState, useMemo, useRef, useEffect } from 'react'
import { useCampaigns } from '../hooks/useCampaigns'
import type { Campaign, Flight } from '../../../shared/types'
import { Badge } from '../components/ui/badge'
import { X, ChevronRight, Calendar, DollarSign, Target, Layers } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────
const ROW_H = 40          // px per campaign row
const FLIGHT_ROW_H = 28   // px per flight row
const HEADER_H = 56       // top date header height
const LABEL_W = 220       // left label column width
const DAY_W = 28          // px per day

const STATUS_COLORS: Record<string, { bar: string; text: string; dot: string }> = {
  Active:  { bar: 'bg-emerald-400',  text: 'text-emerald-700', dot: 'bg-emerald-500' },
  Paused:  { bar: 'bg-amber-400',    text: 'text-amber-700',   dot: 'bg-amber-500'   },
  Draft:   { bar: 'bg-slate-300',    text: 'text-slate-600',   dot: 'bg-slate-400'   },
  Ended:   { bar: 'bg-rose-300',     text: 'text-rose-600',    dot: 'bg-rose-400'    },
}

function parseDate(s: string) { return new Date(s + 'T00:00:00') }
function diffDays(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / 86400000) }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function fmtDate(d: Date) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtMoney(n?: number) {
  if (!n) return '—'
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 })
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({ campaign, onClose }: { campaign: Campaign; onClose: () => void }) {
  const colors = STATUS_COLORS[campaign.status] ?? STATUS_COLORS.Draft
  return (
    <div className="w-80 border-l bg-white flex flex-col h-full shadow-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-semibold text-sm truncate pr-2">{campaign.name}</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {/* Status & Type */}
        <div className="flex gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-opacity-15 ${colors.text}`}
            style={{ backgroundColor: `color-mix(in srgb, currentColor 12%, transparent)` }}>
            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
            {campaign.status}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{campaign.type}</span>
        </div>

        {/* Key Info */}
        <div className="space-y-2">
          <InfoRow icon={<Calendar size={13} />} label="Period" value={`${campaign.start_date} → ${campaign.end_date}`} />
          <InfoRow icon={<Target size={13} />} label="Client" value={campaign.client} />
          {campaign.agency && <InfoRow icon={<ChevronRight size={13} />} label="Agency" value={campaign.agency} />}
          <InfoRow icon={<Target size={13} />} label="Primary KPI" value={campaign.primary_kpi} />
          {campaign.secondary_kpi && <InfoRow icon={<Target size={13} />} label="Secondary KPI" value={campaign.secondary_kpi} />}
          {campaign.budget && <InfoRow icon={<DollarSign size={13} />} label="Budget" value={fmtMoney(campaign.budget)} />}
          {campaign.ttd_campaign_id && <InfoRow icon={<Layers size={13} />} label="TTD ID" value={campaign.ttd_campaign_id} />}
        </div>

        {/* Flights */}
        {campaign.flights && campaign.flights.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Flights</p>
            <div className="space-y-2">
              {campaign.flights.map((f, i) => (
                <div key={i} className="border rounded-md p-2.5 bg-blue-50/40 text-xs space-y-1">
                  <p className="font-medium">{f.flight_name}</p>
                  <p className="text-muted-foreground">{f.start_date} → {f.end_date}</p>
                  {f.budget && <p className="text-blue-700 font-medium">{fmtMoney(f.budget)}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Deals */}
        {campaign.deals && campaign.deals.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Deals</p>
            <div className="space-y-2">
              {campaign.deals.map((d, i) => (
                <div key={i} className="border rounded-md p-2.5 text-xs space-y-0.5">
                  <p className="font-medium">{d.deal_name || d.deal_id || `Deal ${i + 1}`}</p>
                  {d.deal_id && <p className="text-muted-foreground">ID: {d.deal_id}</p>}
                  <div className="flex gap-3 text-muted-foreground">
                    {d.deal_type && <span>{d.deal_type}</span>}
                    {d.floor_price && <span>Floor: ${d.floor_price} CPM</span>}
                  </div>
                  {d.inventory_source && <p className="text-muted-foreground">{d.inventory_source}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {campaign.notes && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{campaign.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Timeline() {
  const { campaigns, loading } = useCampaigns()
  const [selected, setSelected] = useState<Campaign | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'ended'>('all')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Compute timeline range
  const { rangeStart, rangeEnd, totalDays } = useMemo(() => {
    if (campaigns.length === 0) {
      const today = new Date()
      return {
        rangeStart: addDays(today, -30),
        rangeEnd: addDays(today, 60),
        totalDays: 90,
      }
    }
    const dates = campaigns.flatMap(c => [parseDate(c.start_date), parseDate(c.end_date)])
    const min = new Date(Math.min(...dates.map(d => d.getTime())))
    const max = new Date(Math.max(...dates.map(d => d.getTime())))
    const start = addDays(min, -14)
    const end = addDays(max, 14)
    return { rangeStart: start, rangeEnd: end, totalDays: diffDays(start, end) }
  }, [campaigns])

  const today = new Date()
  const todayOffset = diffDays(rangeStart, today)

  // Filter campaigns
  const filtered = useMemo(() => {
    return campaigns.filter(c => {
      if (filter === 'all') return true
      if (filter === 'active') return c.status === 'Active'
      if (filter === 'upcoming') return c.status === 'Draft' || parseDate(c.start_date) > today
      if (filter === 'ended') return c.status === 'Ended'
      return true
    })
  }, [campaigns, filter, today])

  // Scroll to today on load
  useEffect(() => {
    if (scrollRef.current && todayOffset > 0) {
      const scrollTo = todayOffset * DAY_W - 200
      scrollRef.current.scrollLeft = Math.max(0, scrollTo)
    }
  }, [todayOffset, campaigns.length])

  // Generate month headers
  const months = useMemo(() => {
    const result: { label: string; offset: number; days: number }[] = []
    let cursor = new Date(rangeStart)
    cursor.setDate(1)
    while (cursor <= rangeEnd) {
      const start = Math.max(0, diffDays(rangeStart, cursor))
      const nextMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const end = Math.min(totalDays, diffDays(rangeStart, nextMonth))
      result.push({
        label: cursor.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        offset: start,
        days: end - start,
      })
      cursor = nextMonth
    }
    return result
  }, [rangeStart, rangeEnd, totalDays])

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>

  const canvasW = totalDays * DAY_W

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h1 className="text-2xl font-semibold">Timeline</h1>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(['all', 'active', 'upcoming', 'ended'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 text-xs rounded-md transition-colors capitalize
                ${filter === f ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          No campaigns found. Add campaigns first.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="flex flex-1 border rounded-lg overflow-hidden">
          {/* Main scrollable area */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Sticky header row */}
            <div className="flex flex-shrink-0 border-b bg-muted/30">
              {/* Label column header */}
              <div className="flex-shrink-0 border-r bg-muted/30 flex items-end px-3 pb-2" style={{ width: LABEL_W, height: HEADER_H }}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign</span>
              </div>
              {/* Date header - scrollable */}
              <div ref={scrollRef} className="flex-1 overflow-x-auto" style={{ height: HEADER_H }}>
                <div className="relative" style={{ width: canvasW, height: HEADER_H }}>
                  {/* Month labels */}
                  {months.map((m, i) => (
                    <div
                      key={i}
                      className="absolute top-0 border-r border-border/50 px-2 pt-2"
                      style={{ left: m.offset * DAY_W, width: m.days * DAY_W, height: HEADER_H }}
                    >
                      <span className="text-xs font-medium text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                  {/* Today marker header */}
                  {todayOffset >= 0 && todayOffset <= totalDays && (
                    <div
                      className="absolute top-2 flex flex-col items-center"
                      style={{ left: todayOffset * DAY_W - 12, width: 24 }}
                    >
                      <span className="text-xs font-bold text-blue-600">Today</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Gantt rows - label + bars scrolled together vertically */}
            <div className="flex flex-1 overflow-y-auto">
              {/* Label column */}
              <div className="flex-shrink-0 border-r overflow-hidden" style={{ width: LABEL_W }}>
                {filtered.map((c) => {
                  const hasFlights = (c.flights?.length ?? 0) > 0
                  const rowH = ROW_H + (hasFlights ? c.flights!.length * FLIGHT_ROW_H + 8 : 0)
                  const colors = STATUS_COLORS[c.status] ?? STATUS_COLORS.Draft
                  return (
                    <div
                      key={c.id}
                      className={`border-b px-3 flex flex-col justify-center cursor-pointer hover:bg-muted/40 transition-colors
                        ${selected?.id === c.id ? 'bg-blue-50' : ''}`}
                      style={{ height: rowH }}
                      onClick={() => setSelected(selected?.id === c.id ? null : c)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
                        <span className="text-xs font-medium truncate">{c.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground truncate pl-3.5">{c.client}</span>
                      {hasFlights && (
                        <div className="pl-3.5 mt-1 space-y-0.5">
                          {c.flights!.map((f, fi) => (
                            <div key={fi} className="text-xs text-muted-foreground/70 truncate">↳ {f.flight_name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Gantt bars (synced scroll with header) */}
              <div
                className="flex-1 overflow-x-auto"
                onScroll={(e) => {
                  if (scrollRef.current) scrollRef.current.scrollLeft = e.currentTarget.scrollLeft
                }}
              >
                <div style={{ width: canvasW, position: 'relative' }}>
                  {/* Today vertical line */}
                  {todayOffset >= 0 && todayOffset <= totalDays && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-blue-500 z-10 pointer-events-none"
                      style={{ left: todayOffset * DAY_W }}
                    />
                  )}

                  {filtered.map((c) => {
                    const hasFlights = (c.flights?.length ?? 0) > 0
                    const rowH = ROW_H + (hasFlights ? c.flights!.length * FLIGHT_ROW_H + 8 : 0)
                    const colors = STATUS_COLORS[c.status] ?? STATUS_COLORS.Draft
                    const cStart = Math.max(0, diffDays(rangeStart, parseDate(c.start_date)))
                    const cEnd = Math.min(totalDays, diffDays(rangeStart, parseDate(c.end_date)))
                    const cW = Math.max(2, (cEnd - cStart) * DAY_W)

                    return (
                      <div
                        key={c.id}
                        className={`border-b relative cursor-pointer hover:bg-muted/20 transition-colors
                          ${selected?.id === c.id ? 'bg-blue-50/50' : ''}`}
                        style={{ height: rowH }}
                        onClick={() => setSelected(selected?.id === c.id ? null : c)}
                      >
                        {/* Campaign bar */}
                        <div
                          className={`absolute top-3 h-5 rounded-full ${colors.bar} opacity-90 flex items-center px-2 overflow-hidden`}
                          style={{ left: cStart * DAY_W, width: cW, top: (ROW_H - 20) / 2 }}
                          title={`${c.name}: ${c.start_date} → ${c.end_date}`}
                        >
                          <span className="text-xs font-medium text-white truncate whitespace-nowrap drop-shadow-sm">
                            {c.name}
                          </span>
                        </div>

                        {/* Flight bars */}
                        {hasFlights && c.flights!.map((f, fi) => {
                          const fStart = Math.max(0, diffDays(rangeStart, parseDate(f.start_date)))
                          const fEnd = Math.min(totalDays, diffDays(rangeStart, parseDate(f.end_date)))
                          const fW = Math.max(2, (fEnd - fStart) * DAY_W)
                          return (
                            <div
                              key={fi}
                              className="absolute h-3.5 rounded-sm bg-blue-200 border border-blue-300 flex items-center px-1.5 overflow-hidden"
                              style={{
                                left: fStart * DAY_W,
                                width: fW,
                                top: ROW_H + fi * FLIGHT_ROW_H + 4,
                              }}
                              title={`${f.flight_name}: ${f.start_date} → ${f.end_date}${f.budget ? ' · ' + fmtMoney(f.budget) : ''}`}
                            >
                              <span className="text-xs text-blue-700 truncate whitespace-nowrap">{f.flight_name}</span>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <DetailPanel campaign={selected} onClose={() => setSelected(null)} />
          )}
        </div>
      )}
    </div>
  )
}
