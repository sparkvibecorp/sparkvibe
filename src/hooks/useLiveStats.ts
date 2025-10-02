import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LiveStats } from '../types'

export const useLiveStats = () => {
  const [stats, setStats] = useState<LiveStats>({
    active_users: 127,
    users_in_queue: 0,
    ongoing_calls: 0,
  })

  useEffect(() => {
    fetchStats()

    const interval = setInterval(fetchStats, 10000) // Update every 10 seconds

    return () => clearInterval(interval)
  }, [])

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_live_stats')

      if (error) throw error

      if (data && data.length > 0) {
        setStats(data[0])
      }
    } catch (error) {
      console.error('Error fetching live stats:', error)
    }
  }

  return stats
}