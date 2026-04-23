import { useState, useEffect, useCallback } from 'react'
import type { Campaign } from '../../../shared/types'
import { api } from '../lib/api'

export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (!api.campaign?.list) {
        throw new Error('API not available')
      }
      const result = await api.campaign.list()
      if (result.success && result.data) {
        setCampaigns(result.data)
      } else {
        setError(result.error ?? 'Unknown error')
      }
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const deleteCampaign = useCallback(async (id: number) => {
    try {
      if (!api.campaign?.delete) {
        throw new Error('API not available')
      }
      const result = await api.campaign.delete(id)
      if (result.success) refresh()
      return result
    } catch (e) {
      return { success: false, error: String(e) }
    }
  }, [refresh])

  return { campaigns, loading, error, refresh, deleteCampaign }
}