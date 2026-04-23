import { useState } from 'react'
import { Button } from '../components/ui/button'
import CampaignTable from '../components/campaigns/CampaignTable'
import CampaignFormDialog from '../components/campaigns/CampaignFormDialog'
import { useCampaigns } from '../hooks/useCampaigns'
import type { Campaign } from '../../../shared/types'
import { Plus } from 'lucide-react'

export default function Campaigns() {
  const { campaigns, loading, error, refresh, deleteCampaign } = useCampaigns()
  const [editTarget, setEditTarget] = useState<Campaign | null>(null)
  const [showForm, setShowForm] = useState(false)

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Button onClick={handleNew}><Plus size={16} className="mr-2" />New Campaign</Button>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : error ? (
        <div className="text-red-600 text-sm">
          <p>Error loading campaigns: {error}</p>
          <Button variant="outline" size="sm" onClick={refresh} className="mt-2">Retry</Button>
        </div>
      ) : (
        <CampaignTable campaigns={campaigns} onEdit={handleEdit} onDelete={handleDelete} />
      )}
      <CampaignFormDialog open={showForm} onClose={() => setShowForm(false)} onSuccess={refresh} editTarget={editTarget} />
    </div>
  )
}