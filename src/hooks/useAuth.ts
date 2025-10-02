import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    initAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('🔐 Auth state changed:', _event, session?.user?.id)
      if (session?.user) {
        fetchUser(session.user.id)
      } else {
        setUser(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const initAuth = async () => {
    console.log('🔐 Initializing auth...')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (session?.user) {
        console.log('✅ Existing session found:', session.user.id)
        await fetchUser(session.user.id)
      } else {
        console.log('👤 No session, creating anonymous user...')
        await signInAnonymously()
      }
    } catch (error) {
      console.error('❌ Init auth error:', error)
      setLoading(false)
    }
  }

  const fetchUser = async (userId: string) => {
    try {
      console.log('📥 Fetching user:', userId)
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('❌ Fetch user error:', error)
        // If user doesn't exist, create them
        await createUserRecord(userId)
        return
      }

      if (data) {
        console.log('✅ User found:', data.id)
        setUser(data)
      } else {
        console.log('👤 User not in DB, creating...')
        await createUserRecord(userId)
      }
    } catch (error) {
      console.error('❌ Error in fetchUser:', error)
    } finally {
      setLoading(false)
    }
  }

  const createUserRecord = async (userId: string) => {
    try {
      console.log('➕ Creating user record:', userId)
      
      // First check if user already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      
      if (existingUser) {
        console.log('✅ User already exists:', existingUser.id)
        setUser(existingUser)
        return
      }
      
      // User doesn't exist, create them
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            id: userId,
            is_anonymous: true,
            status: 'online',
            last_active: new Date().toISOString(),
          },
        ])
        .select()
        .single()

      if (error) {
        console.error('❌ Create user error:', error)
        
        // If it's a duplicate key error (409), try to fetch the user
        if (error.code === '23505' || error.message?.includes('duplicate')) {
          console.log('🔄 Duplicate user, fetching existing...')
          const { data: existingUser } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single()
          
          if (existingUser) {
            console.log('✅ Fetched existing user:', existingUser.id)
            setUser(existingUser)
          }
        }
        return
      }
      
      console.log('✅ User created:', data.id)
      setUser(data)
    } catch (error) {
      console.error('❌ Error creating user record:', error)
    }
  }

  const signInAnonymously = async () => {
    try {
      console.log('🔑 Signing in anonymously...')
      
      const { data, error } = await supabase.auth.signInAnonymously()
      
      if (error) {
        console.error('❌ Anonymous sign in error:', error)
        throw error
      }
      
      if (data.user) {
        console.log('✅ Anonymous sign in success:', data.user.id)
        await createUserRecord(data.user.id)
      }
    } catch (error) {
      console.error('❌ Error signing in anonymously:', error)
      setLoading(false)
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
      console.error('❌ Error updating presence:', error)
    }
  }

  return { user, loading, updatePresence }
}