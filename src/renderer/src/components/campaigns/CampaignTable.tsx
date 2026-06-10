import type { Campaign } from '../../../../shared/types'
import { formatDate } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Pencil, Trash2, Copy, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Active: 'default', Draft: 'secondary', Paused: 'outline', Ended: 'destructive',
}

function splitAdTypes(type?: string): string[] {
  return Array.from(new Set((type ?? '').split(',').map(t => t.trim()).filter(Boolean)))
}

interface Props {
  campaigns: Campaign[]
  onEdit: (c: Campaign) => void
  onDelete: (id: number) => void
  onDuplicate: (c: Campaign) => void
}

export default function CampaignTable({ campaigns, onEdit, onDelete, onDuplicate }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (campaigns.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No campaigns yet. Click "New Campaign" to add one.</p>
  }

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-8 px-3 py-2" />
            <th className="text-left px-3 py-2 font-medium">Name</th>
            <th className="text-left px-3 py-2 font-medium">Client</th>
            <th className="text-left px-3 py-2 font-medium">Channels</th>
            <th className="text-left px-3 py-2 font-medium">Dates</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Lines</th>
            <th className="w-28 px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <>
              <tr key={c.id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => toggle(c.id)}>
                <td className="px-3 py-2 text-muted-foreground">
                  {expanded.has(c.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </td>
                <td className="px-3 py-2 font-medium">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.client}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {splitAdTypes(c.type).map(type => <Badge key={type} variant="outline">{type}</Badge>)}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{c.start_date && c.end_date ? `${formatDate(c.start_date)} – ${formatDate(c.end_date)}` : '—'}</td>
                <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{c.lines?.length ?? 0}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => onEdit(c)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Duplicate" onClick={() => onDuplicate(c)}><Copy size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => onDelete(c.id)}><Trash2 size={13} /></Button>
                  </div>
                </td>
              </tr>
              {expanded.has(c.id) && (
                <tr key={`${c.id}-detail`} className="border-b bg-muted/10">
                  <td colSpan={8} className="px-8 py-3 space-y-3">
                    {/* Notes */}
                    {c.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Notes</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{c.notes}</p>
                      </div>
                    )}
                    {c.lines && c.lines.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Campaign Lines ({c.lines.length})</p>
                        {c.lines.map(line => (
                          <div key={line.id} className="border rounded-md p-3 bg-background text-xs space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline">{line.channel}</Badge>
                              {line.country && <span className="font-medium">{line.country}</span>}
                              {line.ttd_campaign_id && <span className="text-muted-foreground">TTD: {line.ttd_campaign_id}</span>}
                              <span className="text-muted-foreground">{formatDate(line.start_date)} – {formatDate(line.end_date)}</span>
                              {line.budget != null && line.budget > 0 && <span className="text-muted-foreground">${line.budget.toLocaleString()}</span>}
                              {line.cpm_goal != null && <span className="text-muted-foreground">CPM Goal: ${line.cpm_goal}</span>}
                              <span className="text-muted-foreground">KPI: {line.primary_kpi}{line.secondary_kpi ? ` / ${line.secondary_kpi}` : ''}</span>
                            </div>
                            {line.flights && line.flights.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {line.flights.map(f => (
                                  <span key={f.id} className="border rounded px-2 py-1 bg-blue-50">
                                    {f.flight_name || 'Unnamed Flight'} · {formatDate(f.start_date)} – {formatDate(f.end_date)}
                                  </span>
                                ))}
                              </div>
                            )}
                            {line.deals && line.deals.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {line.deals.map(d => (
                                  <span key={d.id} className="border rounded px-2 py-1 bg-muted/30">
                                    {d.deal_name || d.deal_id || 'Unnamed Deal'}{d.deal_type ? ` (${d.deal_type})` : ''}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {!c.notes && (!c.lines || c.lines.length === 0) && (
                      <p className="text-xs text-muted-foreground">No additional details.</p>
                    )}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}