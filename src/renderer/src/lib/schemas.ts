import { z } from 'zod'

export const flightSchema = z.object({
  flight_name:  z.string().min(1, 'Flight name is required'),
  start_date:   z.string().min(1, 'Start date is required'),
  end_date:     z.string().min(1, 'End date is required'),
  budget:       z.coerce.number().optional(),
  notes:        z.string().optional(),
})

export const dealSchema = z.object({
  deal_id:          z.string().optional(),
  deal_name:        z.string().optional(),
  deal_type:        z.enum(['PMP', 'PG', 'Open']).optional(),
  floor_price:      z.coerce.number().optional(),
  inventory_source: z.string().optional(),
  notes:            z.string().optional(),
})

export const campaignSchema = z.object({
  name:             z.string().min(1, 'Campaign name is required'),
  ttd_campaign_id:  z.string().optional(),
  start_date:       z.string().min(1, 'Start date is required'),
  end_date:         z.string().min(1, 'End date is required'),
  type:             z.enum(['CTV', 'Display', 'OTT', 'Audio', 'DOOH']),
  agency:           z.string().optional(),
  client:           z.string().min(1, 'Client is required'),
  primary_kpi:      z.enum(['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']),
  secondary_kpi:    z.enum(['CTR', 'VCR', 'Reach', 'ROAS', 'CPA', 'CPM', 'Viewability']).optional(),
  budget:           z.coerce.number().optional(),
  status:           z.enum(['Draft', 'Active', 'Paused', 'Ended']),
  notes:            z.string().optional(),
  flights:          z.array(flightSchema).default([]),
  deals:            z.array(dealSchema).default([]),
}).refine(
  (d) => !d.start_date || !d.end_date || new Date(d.end_date) > new Date(d.start_date),
  { message: 'End date must be after start date', path: ['end_date'] }
)

export type FlightFormValues = z.infer<typeof flightSchema>
export type CampaignFormValues = z.infer<typeof campaignSchema>
