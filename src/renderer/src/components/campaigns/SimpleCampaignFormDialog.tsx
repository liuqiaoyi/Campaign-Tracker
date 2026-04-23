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

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editTarget?: Campaign | null
}

export default function SimpleCampaignFormDialog({ open, onClose, onSuccess, editTarget }: Props) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: { 
      name: '', 
      start_date: '', 
      end_date: '', 
      type: 'CTV', 
      agency: '', 
      client: '', 
      primary_kpi: 'VCR', 
      secondary_kpi: undefined, 
      budget: undefined, 
      status: 'Draft', 
      notes: '', 
      deals: [] 
    },
  })

  useEffect(() => {
    if (editTarget) {
      form.reset({
        name: editTarget.name, 
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
        deals: editTarget.deals ?? [],
      })
    } else {
      form.reset({ 
        name: '', 
        start_date: '', 
        end_date: '', 
        type: 'CTV', 
        agency: '', 
        client: '', 
        primary_kpi: 'VCR', 
        secondary_kpi: undefined, 
        budget: undefined, 
        status: 'Draft', 
        notes: '', 
        deals: [] 
      })
    }
  }, [editTarget, open, form])

  const onSubmit = async (values: CampaignFormValues) => {
    try {
      if (!api.campaign) {
        throw new Error('API not available')
      }
      const { deals, ...campaignData } = values
      const result = editTarget
        ? await api.campaign.update!(editTarget.id, campaignData as never, deals as never)
        : await api.campaign.create!(campaignData as never, deals as never)
      if (result.success) { 
        onSuccess() 
        onClose() 
      } else {
        alert(`Error: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${String(error)}`)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editTarget ? 'Edit Campaign' : 'New Campaign'}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label>Campaign Name *</Label>
            <Input {...form.register('name')} placeholder="Nike Q2 2026 CTV" />
            {form.formState.errors.name && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date *</Label>
              <Input type="date" {...form.register('start_date')} />
              {form.formState.errors.start_date && (
                <p className="text-xs text-red-600 mt-1">{form.formState.errors.start_date.message}</p>
              )}
            </div>
            <div>
              <Label>End Date *</Label>
              <Input type="date" {...form.register('end_date')} />
              {form.formState.errors.end_date && (
                <p className="text-xs text-red-600 mt-1">{form.formState.errors.end_date.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label>Client *</Label>
            <Input {...form.register('client')} placeholder="Nike" />
            {form.formState.errors.client && (
              <p className="text-xs text-red-600 mt-1">{form.formState.errors.client.message}</p>
            )}
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