import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUser(session.user.id)
      } else {
        // Create anonymous user
        signInAnonymously()
      }
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUser(session.user.id)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const fetchUser = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error

      if (data) {
        setUser(data)
      } else {
        // User doesn't exist in database, create them
        await createUserRecord(userId)
      }
    } catch (error) {
      console.error('Error fetching user:', error)
    } finally {
      setLoading(false)
    }
  }

  const createUserRecord = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            id: userId,
            is_anonymous: true,
            status: 'online',
          },
        ])
        .select()
        .single()

      if (error) throw error
      setUser(data)
    } catch (error) {
      console.error('Error creating user record:', error)
    }
  }

  const signInAnonymously = async () => {
    try {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) throw error
      if (data.user) {
        await createUserRecord(data.user.id)
      }
    } catch (error) {
      console.error('Error signing in anonymously:', error)
    }
  }

  const updatePresence = async (screen: string) => {
    if (!user) return
    
    try {
      await supabase.rpc('update_presence', {
        p_user_id: user.id,
        p_screen: screen,
      })
    } catch (error) {
      console.error('Error updating presence:', error)
    }
  }

  return { user, loading, updatePresence }
}