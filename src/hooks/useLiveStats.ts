import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { LiveStats } from '../types'

export const useLiveStats = () => {
  const [stats, setStats] = useState<LiveStats>({
    active_users: 0,
    users_in_queue: 0,
    ongoing_calls: 0,
  })

  useEffect(() => {
    let isMounted = true

    const fetchStats = async () => {
      try {
        const { data, error } = await supabase.rpc('get_live_stats')
        if (error) throw error

        if (data && isMounted) {
          // If your RPC returns a single object
          setStats(data)
          // If it actually returns an array with one object, use: setStats(data[0])
        }
      } catch (err) {
        console.error('❌ Error fetching live stats:', err)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 10000) // Update every 10 seconds

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return stats
}
