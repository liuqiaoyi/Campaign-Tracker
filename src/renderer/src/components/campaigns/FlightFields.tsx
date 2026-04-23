import { useFieldArray, UseFormReturn } from 'react-hook-form'
import type { CampaignFormValues } from '../../lib/schemas'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Plus, Trash2 } from 'lucide-react'

interface Props { form: UseFormReturn<CampaignFormValues> }

export default function FlightFields({ form }: Props) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'flights' })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Flights</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ flight_name: '', start_date: '', end_date: '', budget: undefined, notes: '' })}
        >
          <Plus size={13} className="mr-1" /> Add Flight
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground">No flights. Click "Add Flight" to add time segments.</p>
      )}

      {fields.map((field, index) => (
        <div key={field.id} className="border rounded-md p-3 space-y-2 bg-blue-50/30">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium text-muted-foreground">Flight {index + 1}</span>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => remove(index)}>
              <Trash2 size={12} />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">Flight Name</Label>
              <Input
                className="h-7 text-xs"
                {...form.register(`flights.${index}.flight_name`)}
                placeholder="e.g. Flight 1 - March"
              />
              {form.formState.errors.flights?.[index]?.flight_name && (
                <p className="text-xs text-red-600 mt-0.5">{form.formState.errors.flights[index]?.flight_name?.message}</p>
              )}
            </div>
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input className="h-7 text-xs" type="date" {...form.register(`flights.${index}.start_date`)} />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input className="h-7 text-xs" type="date" {...form.register(`flights.${index}.end_date`)} />
            </div>
            <div>
              <Label className="text-xs">Budget (USD)</Label>
              <Input
                className="h-7 text-xs"
                type="number"
                {...form.register(`flights.${index}.budget`, { valueAsNumber: true })}
                placeholder="30000"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Input className="h-7 text-xs" {...form.register(`flights.${index}.notes`)} placeholder="Optional notes" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
