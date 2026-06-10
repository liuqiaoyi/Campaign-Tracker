import { useEffect } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { campaignSchema, type CampaignFormValues } from '../../lib/schemas'
import type { Campaign, CampaignLine } from '../../../../shared/types'
import { api } from '../../lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  editTarget?: Campaign | null
}

const KPI_OPTIONS = ['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']
const CHANNEL_OPTIONS = ['CTV', 'Display', 'Video', 'High Impact', 'OTT', 'Audio', 'DOOH']
const selectClass = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mt-1"
const smallSelectClass = "flex h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

function emptyLine(): CampaignFormValues['lines'][number] {
  return {
    country: '',
    channel: 'CTV',
    ttd_campaign_id: '',
    start_date: '',
    end_date: '',
    budget: undefined,
    cpm_goal: undefined,
    primary_kpi: 'VCR',
    secondary_kpi: undefined,
    status: 'Draft',
    notes: '',
    flights: [],
    deals: [],
  }
}

function lineToForm(line: CampaignLine): CampaignFormValues['lines'][number] {
  return {
    country: line.country ?? '',
    channel: line.channel || 'CTV',
    ttd_campaign_id: line.ttd_campaign_id ?? '',
    start_date: line.start_date,
    end_date: line.end_date,
    budget: line.budget ?? undefined,
    cpm_goal: line.cpm_goal ?? undefined,
    primary_kpi: line.primary_kpi,
    secondary_kpi: line.secondary_kpi ?? undefined,
    status: line.status,
    notes: line.notes ?? '',
    flights: line.flights?.map(f => ({
      flight_name: f.flight_name,
      start_date: f.start_date,
      end_date: f.end_date,
      budget: f.budget,
      notes: f.notes ?? '',
    })) ?? [],
    deals: line.deals?.map(d => ({
      deal_id: d.deal_id ?? '',
      deal_name: d.deal_name ?? '',
      deal_type: d.deal_type,
      floor_price: d.floor_price,
      inventory_source: d.inventory_source ?? '',
      notes: d.notes ?? '',
    })) ?? [],
  }
}

function legacyCampaignToLine(campaign: Campaign): CampaignFormValues['lines'][number] {
  return {
    country: '',
    channel: campaign.type || 'CTV',
    ttd_campaign_id: campaign.ttd_campaign_id ?? '',
    start_date: campaign.start_date ?? '',
    end_date: campaign.end_date ?? '',
    budget: campaign.budget ?? undefined,
    cpm_goal: undefined,
    primary_kpi: campaign.primary_kpi ?? 'VCR',
    secondary_kpi: campaign.secondary_kpi ?? undefined,
    status: campaign.status,
    notes: '',
    flights: [],
    deals: [],
  }
}

function cloneLineForAppend(line?: CampaignFormValues['lines'][number]): CampaignFormValues['lines'][number] {
  if (!line) return emptyLine()
  return {
    ...line,
    // Keep planning inputs, but avoid accidentally reusing the same platform campaign ID.
    ttd_campaign_id: '',
    flights: line.flights?.map(f => ({ ...f })) ?? [],
    deals: line.deals?.map(d => ({ ...d })) ?? [],
  }
}

function LineFields({ form, index, onRemove }: { form: ReturnType<typeof useForm<CampaignFormValues>>; index: number; onRemove: () => void }) {
  const flightArray = useFieldArray({ control: form.control, name: `lines.${index}.flights` })
  const dealArray = useFieldArray({ control: form.control, name: `lines.${index}.deals` })
  const errors = form.formState.errors.lines?.[index]

  return (
    <div className="border rounded-lg p-4 bg-muted/20 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Campaign Line {index + 1}</p>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove}>
          <Trash2 size={14} />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Country</Label>
          <Input {...form.register(`lines.${index}.country`)} placeholder="Germany" className="mt-1" />
        </div>
        <div>
          <Label>Channel *</Label>
          <select {...form.register(`lines.${index}.channel`)} className={selectClass}>
            {CHANNEL_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {errors?.channel && <p className="text-xs text-red-600 mt-1">{errors.channel.message}</p>}
        </div>
        <div className="col-span-2">
          <Label>TTD Campaign ID</Label>
          <Input {...form.register(`lines.${index}.ttd_campaign_id`)} placeholder="a69qifn" className="mt-1" />
        </div>
        <div>
          <Label>Start Date *</Label>
          <Input type="date" {...form.register(`lines.${index}.start_date`)} className="mt-1" />
          {errors?.start_date && <p className="text-xs text-red-600 mt-1">{errors.start_date.message}</p>}
        </div>
        <div>
          <Label>End Date *</Label>
          <Input type="date" {...form.register(`lines.${index}.end_date`)} className="mt-1" />
          {errors?.end_date && <p className="text-xs text-red-600 mt-1">{errors.end_date.message}</p>}
        </div>
        <div>
          <Label>Budget (USD)</Label>
          <Input type="number" {...form.register(`lines.${index}.budget`, { valueAsNumber: true })} placeholder="60000" className="mt-1" />
        </div>
        <div>
          <Label>CPM Goal</Label>
          <Input type="number" step="0.01" {...form.register(`lines.${index}.cpm_goal`, { valueAsNumber: true })} placeholder="25" className="mt-1" />
        </div>
        <div>
          <Label>Primary KPI *</Label>
          <select {...form.register(`lines.${index}.primary_kpi`)} className={selectClass}>
            {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <Label>Secondary KPI</Label>
          <select {...form.register(`lines.${index}.secondary_kpi`)} className={selectClass}>
            <option value="">None</option>
            {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <Label>Status *</Label>
          <select {...form.register(`lines.${index}.status`)} className={selectClass}>
            <option value="Draft">Draft</option>
            <option value="Active">Active</option>
            <option value="Paused">Paused</option>
            <option value="Ended">Ended</option>
          </select>
        </div>
        <div>
          <Label>Notes</Label>
          <Input {...form.register(`lines.${index}.notes`)} placeholder="Line notes" className="mt-1" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Flights</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => flightArray.append({ flight_name: '', start_date: '', end_date: '', budget: undefined, notes: '' })}>
            <Plus size={13} className="mr-1" /> Add Flight
          </Button>
        </div>
        {flightArray.fields.map((field, flightIndex) => (
          <div key={field.id} className="grid grid-cols-5 gap-2 border rounded-md p-2 bg-blue-50/30">
            <Input className="h-8 text-xs col-span-2" {...form.register(`lines.${index}.flights.${flightIndex}.flight_name`)} placeholder="Flight name" />
            <Input className="h-8 text-xs" type="date" {...form.register(`lines.${index}.flights.${flightIndex}.start_date`)} />
            <Input className="h-8 text-xs" type="date" {...form.register(`lines.${index}.flights.${flightIndex}.end_date`)} />
            <div className="flex gap-1">
              <Input className="h-8 text-xs" type="number" {...form.register(`lines.${index}.flights.${flightIndex}.budget`, { valueAsNumber: true })} placeholder="Budget" />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => flightArray.remove(flightIndex)}><Trash2 size={12} /></Button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Deals</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => dealArray.append({ deal_id: '', deal_name: '', deal_type: undefined, floor_price: undefined, inventory_source: '', notes: '' })}>
            <Plus size={13} className="mr-1" /> Add Deal
          </Button>
        </div>
        {dealArray.fields.map((field, dealIndex) => (
          <div key={field.id} className="grid grid-cols-5 gap-2 border rounded-md p-2 bg-white">
            <Input className="h-8 text-xs" {...form.register(`lines.${index}.deals.${dealIndex}.deal_id`)} placeholder="Deal ID" />
            <Input className="h-8 text-xs" {...form.register(`lines.${index}.deals.${dealIndex}.deal_name`)} placeholder="Deal name" />
            <select {...form.register(`lines.${index}.deals.${dealIndex}.deal_type`)} className={smallSelectClass}>
              <option value="">Type</option>
              <option value="PMP">PMP</option>
              <option value="PG">PG</option>
              <option value="Open">Open</option>
            </select>
            <Input className="h-8 text-xs" type="number" step="0.01" {...form.register(`lines.${index}.deals.${dealIndex}.floor_price`, { valueAsNumber: true })} placeholder="Floor" />
            <div className="flex gap-1">
              <Input className="h-8 text-xs" {...form.register(`lines.${index}.deals.${dealIndex}.inventory_source`)} placeholder="Source" />
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => dealArray.remove(dealIndex)}><Trash2 size={12} /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CampaignFormDialog({ open, onClose, onSuccess, editTarget }: Props) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: '',
      agency: '', client: '',
      status: 'Draft', notes: '',
      lines: [emptyLine()],
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = form
  const lineArray = useFieldArray({ control: form.control, name: 'lines' })

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      reset({
        name: editTarget.name,
        agency: editTarget.agency ?? '',
        client: editTarget.client,
        status: editTarget.status,
        notes: editTarget.notes ?? '',
        lines: editTarget.lines && editTarget.lines.length > 0
          ? editTarget.lines.map(lineToForm)
          : [legacyCampaignToLine(editTarget)],
      })
    } else {
      reset({
        name: '',
        agency: '', client: '',
        status: 'Draft', notes: '',
        lines: [emptyLine()],
      })
    }
  }, [editTarget, open, reset])

  const onSubmit = async (values: CampaignFormValues) => {
    try {
      if (!api.campaign) throw new Error('API not available')
      const { lines, ...campaignData } = values
      const isEdit = editTarget && editTarget.id > 0
      const result = isEdit
        ? await api.campaign.update!(editTarget!.id, campaignData as never, lines as never)
        : await api.campaign.create!(campaignData as never, lines as never)
      if (result.success) { onSuccess(); onClose() }
      else alert(`Error: ${result.error}`)
    } catch (error) {
      alert(`Error: ${String(error)}`)
    }
  }

  const handleAddLine = () => {
    const lines = form.getValues('lines')
    lineArray.append(cloneLineForAppend(lines?.[lines.length - 1]))
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {editTarget && editTarget.id > 0 ? 'Edit Campaign' : editTarget ? 'Duplicate Campaign' : 'New Campaign'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit as never)} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Info</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Campaign Name *</Label>
                <Input {...register('name')} placeholder="Nike Q2 2026 CTV" className="mt-1" />
                {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
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

              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea {...register('notes')} rows={2} placeholder="Any additional notes..." className="mt-1" />
              </div>
            </div>
          </div>

          {/* Campaign Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Campaign Lines</p>
              <Button type="button" variant="outline" size="sm" onClick={handleAddLine}>
                <Plus size={13} className="mr-1" /> Add Line from Previous
              </Button>
            </div>
            {errors.lines?.message && <p className="text-xs text-red-600">{errors.lines.message}</p>}
            {lineArray.fields.map((field, index) => (
              <LineFields
                key={field.id}
                form={form}
                index={index}
                onRemove={() => lineArray.fields.length > 1 ? lineArray.remove(index) : undefined}
              />
            ))}
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
