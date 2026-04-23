import { useFieldArray, UseFormReturn } from 'react-hook-form'
import type { CampaignFormValues } from '../../lib/schemas'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Plus, Trash2 } from 'lucide-react'

interface Props { form: UseFormReturn<CampaignFormValues> }

const selectClass = "flex h-7 w-full rounded-md border border-input bg-transparent px-2 py-0 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"

export default function DealFields({ form }: Props) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'deals' })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Deals</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ deal_id: '', deal_name: '', deal_type: undefined, floor_price: undefined, inventory_source: '', notes: '' })}
        >
          <Plus size={13} className="mr-1" /> Add Deal
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">No deals. Click "Add Deal" to associate deals.</p>
      )}

      {fields.map((field, index) => (
        <div key={field.id} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-muted-foreground">Deal {index + 1}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(index)}>
              <Trash2 size={12} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Deal ID</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.deal_id`)} placeholder="TTD-12345" />
            </div>
            <div>
              <Label className="text-xs">Deal Name</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.deal_name`)} placeholder="Hulu Premium CTV" />
            </div>
            <div>
              <Label className="text-xs">Type</Label>
              <select {...form.register(`deals.${index}.deal_type`)} className={selectClass}>
                <option value="">Select type</option>
                <option value="PMP">PMP</option>
                <option value="PG">PG</option>
                <option value="Open">Open</option>
              </select>
            </div>
            <div>
              <Label className="text-xs">Floor Price (CPM $)</Label>
              <Input className="h-7 text-xs" type="number" step="0.01" {...form.register(`deals.${index}.floor_price`, { valueAsNumber: true })} placeholder="15.00" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Inventory Source</Label>
              <Input className="h-7 text-xs" {...form.register(`deals.${index}.inventory_source`)} placeholder="Hulu / ESPN" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
