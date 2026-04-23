import type { Campaign } from '../../../../shared/types'
import { formatDate } from '../../lib/utils'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  Active: 'default', Draft: 'secondary', Paused: 'outline', Ended: 'destructive',
}

interface Props {
  campaigns: Campaign[]
  onEdit: (c: Campaign) => void
  onDelete: (id: number) => void
}

export default function CampaignTable({ campaigns, onEdit, onDelete }: Props) {
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
            <th className="text-left px-3 py-2 font-medium">Type</th>
            <th className="text-left px-3 py-2 font-medium">Dates</th>
            <th className="text-left px-3 py-2 font-medium">Status</th>
            <th className="text-left px-3 py-2 font-medium">Primary KPI</th>
            <th className="w-20 px-3 py-2" />
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
                <td className="px-3 py-2"><Badge variant="outline">{c.type}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{formatDate(c.start_date)} – {formatDate(c.end_date)}</td>
                <td className="px-3 py-2"><Badge variant={STATUS_VARIANT[c.status] ?? 'secondary'}>{c.status}</Badge></td>
                <td className="px-3 py-2 text-muted-foreground">{c.primary_kpi}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(c)}><Pencil size={13} /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => onDelete(c.id)}><Trash2 size={13} /></Button>
                  </div>
                </td>
              </tr>
              {expanded.has(c.id) && c.deals && c.deals.length > 0 && (
                <tr key={`${c.id}-deals`} className="border-b bg-muted/10">
                  <td colSpan={8} className="px-8 py-2">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Deals ({c.deals.length})</p>
                    <div className="flex flex-wrap gap-2">
                      {c.deals.map(d => (
                        <div key={d.id} className="text-xs border rounded px-2 py-1 bg-background">
                          <span className="font-medium">{d.deal_name || d.deal_id || 'Unnamed Deal'}</span>
                          {d.deal_type && <span className="text-muted-foreground ml-1">({d.deal_type})</span>}
                          {d.floor_price != null && <span className="text-muted-foreground ml-1">${d.floor_price} CPM</span>}
                        </div>
                      ))}
                    </div>
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