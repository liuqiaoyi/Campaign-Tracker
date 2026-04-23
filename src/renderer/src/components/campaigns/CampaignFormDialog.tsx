import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { campaignSchema, type CampaignFormValues } from '../../lib/schemas'
import type { Campaign } from '../../../../shared/types'
import { api } from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import DealFields from './DealFields'
import FlightFields from './FlightFields'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editTarget?: Campaign | null
}

const KPI_OPTIONS = ['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']
const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"

export default function CampaignFormDialog({ open, onClose, onSuccess, editTarget }: Props) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '', ttd_campaign_id: '', start_date: '', end_date: '',
      type: 'CTV', agency: '', client: '',
      primary_kpi: 'VCR', secondary_kpi: undefined,
      budget: undefined, status: 'Draft', notes: '',
      flights: [], deals: [],
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = form

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      reset({
        name: editTarget.name,
        ttd_campaign_id: editTarget.ttd_campaign_id ?? '',
        start_date: editTarget.start_date,
        end_date: editTarget.end_date,
        type: editTarget.type,
        agency: editTarget.agency ?? '',
        client: editTarget.client,
        primary_kpi: editTarget.primary_kpi,
        secondary_kpi: editTarget.secondary_kpi ?? undefined,
        budget: editTarget.budget ?? undefined,
        status: editTarget.status,
        notes: editTarget.notes ?? '',
        flights: editTarget.flights?.map(f => ({
          flight_name: f.flight_name,
          start_date: f.start_date,
          end_date: f.end_date,
          budget: f.budget,
          notes: f.notes ?? '',
        })) ?? [],
        deals: editTarget.deals?.map(d => ({
          deal_id: d.deal_id ?? '',
          deal_name: d.deal_name ?? '',
          deal_type: d.deal_type,
          floor_price: d.floor_price,
          inventory_source: d.inventory_source ?? '',
          notes: d.notes ?? '',
        })) ?? [],
      })
    } else {
      reset({
        name: '', ttd_campaign_id: '', start_date: '', end_date: '',
        type: 'CTV', agency: '', client: '',
        primary_kpi: 'VCR', secondary_kpi: undefined,
        budget: undefined, status: 'Draft', notes: '',
        flights: [], deals: [],
      })
    }
  }, [editTarget, open, reset])

  const onSubmit = async (values: CampaignFormValues) => {
    try {
      if (!api.campaign) throw new Error('API not available')
      const { deals, flights, ...campaignData } = values
      const result = editTarget
        ? await api.campaign.update!(editTarget.id, campaignData as never, deals as never, flights as never)
        : await api.campaign.create!(campaignData as never, deals as never, flights as never)
      if (result.success) { onSuccess(); onClose() }
      else alert(`Error: ${result.error}`)
    } catch (error) {
      alert(`Error: ${String(error)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Info</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Campaign Name *</Label>
                <Input {...register('name')} placeholder="Nike Q2 2026 CTV" className="mt-1" />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
              </div>

              <div className="col-span-2">
                <Label>TTD Campaign ID</Label>
                <Input {...register('ttd_campaign_id')} placeholder="a69qifn（用于关联 import 数据）" className="mt-1" />
              </div>

              <div>
                <Label>Start Date *</Label>
                <Input type="date" {...register('start_date')} className="mt-1" />
                {errors.start_date && <p className="text-xs text-red-600 mt-1">{errors.start_date.message}</p>}
              </div>
              <div>
                <Label>End Date *</Label>
                <Input type="date" {...register('end_date')} className="mt-1" />
                {errors.end_date && <p className="text-xs text-red-600 mt-1">{errors.end_date.message}</p>}
              </div>

              <div>
                <Label>Ad Type *</Label>
                <select {...register('type')} className={selectClass}>
                  <option value="CTV">CTV</option>
                  <option value="Display">Display</option>
                  <option value="OTT">OTT</option>
                  <option value="Audio">Audio</option>
                  <option value="DOOH">DOOH</option>
                </select>
              </div>
              <div>
                <Label>Status *</Label>
                <select {...register('status')} className={selectClass}>
                  <option value="Draft">Draft</option>
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Ended">Ended</option>
                </select>
              </div>

              <div>
                <Label>Client *</Label>
                <Input {...register('client')} placeholder="Nike" className="mt-1" />
                {errors.client && <p className="text-xs text-red-600 mt-1">{errors.client.message}</p>}
              </div>
              <div>
                <Label>Agency</Label>
                <Input {...register('agency')} placeholder="Wavemaker" className="mt-1" />
              </div>

              <div>
                <Label>Primary KPI *</Label>
                <select {...register('primary_kpi')} className={selectClass}>
                  {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div>
                <Label>Secondary KPI</Label>
                <select {...register('secondary_kpi')} className={selectClass}>
                  <option value="">None</option>
                  {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="col-span-2">
                <Label>Total Budget (USD)</Label>
                <Input type="number" {...register('budget', { valueAsNumber: true })} placeholder="50000" className="mt-1" />
              </div>

              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea {...register('notes')} rows={2} placeholder="Any additional notes..." className="mt-1" />
              </div>
            </div>
          </div>

          {/* Flights */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Flights</p>
            <FlightFields form={form} />
          </div>

          {/* Deals */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Deals</p>
            <DealFields form={form} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit">{editTarget ? 'Save Changes' : 'Create Campaign'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
