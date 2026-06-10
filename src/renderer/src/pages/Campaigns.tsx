import { useMemo, useState } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import CampaignTable from '../components/campaigns/CampaignTable'
import CampaignFormDialog from '../components/campaigns/CampaignFormDialog'
import { useCampaigns } from '../hooks/useCampaigns'
import type { Campaign } from '../../../shared/types'
import { Plus, Search } from 'lucide-react'

const selectClass = "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
type SortKey = 'created_desc' | 'start_asc' | 'start_desc' | 'end_asc' | 'end_desc' | 'budget_desc' | 'budget_asc'

function splitAdTypes(type: string): string[] {
  return type.split(',').map(t => t.trim()).filter(Boolean)
}

export default function Campaigns() {
  const { campaigns, loading, error, refresh, deleteCampaign } = useCampaigns()
  const [editTarget, setEditTarget] = useState<Campaign | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState<SortKey>('created_desc')

  const statusOptions = useMemo(() => Array.from(new Set(campaigns.map(c => c.status))).sort(), [campaigns])
  const typeOptions = useMemo(() => Array.from(new Set(campaigns.flatMap(c => splitAdTypes(c.type)))).sort(), [campaigns])

  const filteredCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase()
    return campaigns
      .filter(c => {
        const matchesSearch = !q || [
          c.name, c.client, c.agency, c.ttd_campaign_id, c.primary_kpi, c.secondary_kpi,
        ].some(v => String(v ?? '').toLowerCase().includes(q))
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter
        const matchesType = typeFilter === 'all' || splitAdTypes(c.type).includes(typeFilter)
        return matchesSearch && matchesStatus && matchesType
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'start_asc': return a.start_date.localeCompare(b.start_date)
          case 'start_desc': return b.start_date.localeCompare(a.start_date)
          case 'end_asc': return a.end_date.localeCompare(b.end_date)
          case 'end_desc': return b.end_date.localeCompare(a.end_date)
          case 'budget_asc': return (a.budget ?? 0) - (b.budget ?? 0)
          case 'budget_desc': return (b.budget ?? 0) - (a.budget ?? 0)
          case 'created_desc':
          default: return b.created_at.localeCompare(a.created_at)
        }
      })
  }, [campaigns, search, statusFilter, typeFilter, sortBy])

  const handleDelete = async (id: number) => {
    if (window.confirm('Delete this campaign and all its data?')) {
      await deleteCampaign(id)
    }
  }

  const handleEdit = (c: Campaign) => {
    setEditTarget(c)
    setShowForm(true)
  }

  const handleNew = () => {
    setEditTarget(null)
    setShowForm(true)
  }

  const handleDuplicate = (c: Campaign) => {
    // Open the form pre-filled with copied data so user can review before saving
    setEditTarget({
      ...c,
      id: 0,                          // 0 signals "new" to the form
      name: `Copy of ${c.name}`,
      status: 'Draft',
      created_at: '',
    })
    setShowForm(true)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button onClick={handleNew}><Plus size={16} className="mr-2" />New Campaign</Button>
      </div>
      <div className="border rounded-lg p-4 mb-4 bg-white space-y-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by campaign, client, agency, TTD ID, or KPI..."
            className="pl-9"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select className={selectClass} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={selectClass} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">All types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className={selectClass} value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
            <option value="created_desc">Newest created</option>
            <option value="start_asc">Start date ↑</option>
            <option value="start_desc">Start date ↓</option>
            <option value="end_asc">End date ↑</option>
            <option value="end_desc">End date ↓</option>
            <option value="budget_desc">Budget ↓</option>
            <option value="budget_asc">Budget ↑</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          Showing {filteredCampaigns.length} of {campaigns.length} campaigns
        </p>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : error ? (
        <div className="text-red-600 text-sm">
          <p>Error loading campaigns: {error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-2">Retry</Button>
        </div>
      ) : (
        <CampaignTable campaigns={filteredCampaigns} onEdit={handleEdit} onDelete={handleDelete} onDuplicate={handleDuplicate} />
      )}
      <CampaignFormDialog open={showForm} onClose={() => setShowForm(false)} onSuccess={refresh} editTarget={editTarget} />
    </div>
  )
}