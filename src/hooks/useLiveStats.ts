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
          // RPC returns an array, take the first element
          setStats(Array.isArray(data) ? data[0] : data)
        }
      } catch (err) {
        console.error('❌ Error fetching live stats:', err)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 10000)

    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return stats
}