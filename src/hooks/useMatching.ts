import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Call } from '../types'

export const useMatching = (userId: string | undefined, duration: number) => {
  const [isSearching, setIsSearching] = useState(false)
  const [matchedCall, setMatchedCall] = useState<Call | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const channelRef = useRef<any>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMatchingRef = useRef(false)
  const hasMatchedRef = useRef(false)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('🧹 useMatching cleanup')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }
    }
  }, [])

  const startMatching = async () => {
    if (!userId || isMatchingRef.current || hasMatchedRef.current) {
      console.log('⚠️ Cannot start matching:', { 
        userId, 
        isMatching: isMatchingRef.current,
        hasMatched: hasMatchedRef.current 
      })
      return
    }
    
    console.log('🔍 Starting matching process for user:', userId, 'duration:', duration)
    setIsSearching(true)
    isMatchingRef.current = true
    hasMatchedRef.current = false
  
    try {
      // Only clean up OUR old entries and truly stale ones (5+ minutes old)
      console.log('🧹 Cleaning stale queue entries...')
      await supabase
        .from('call_queue')
        .delete()
        .or(`user_id.eq.${userId},created_at.lt.${new Date(Date.now() - 5 * 60 * 1000).toISOString()}`)
      
      await new Promise(resolve => setTimeout(resolve, 300))
  
      // Insert into queue
      console.log('➕ Inserting into queue...')
      const { data: queueEntry, error: queueError } = await supabase
        .from('call_queue')
        .insert({
          user_id: userId,
          duration: duration,
          language: 'en',
          status: 'waiting',
        })
        .select()
        .single()
  
      if (queueError) {
        console.error('❌ Queue error:', queueError)
        throw queueError
      }
      
      console.log('✅ Added to queue:', queueEntry.id)
      setQueueId(queueEntry.id)
  
      // Start matching process
      await pollAndMatch(queueEntry.id, userId)
    } catch (error) {
      console.error('❌ Error starting match:', error)
      setIsSearching(false)
      isMatchingRef.current = false
      hasMatchedRef.current = false
    }
  }
  
  const pollAndMatch = async (queueEntryId: string, currentUserId: string) => {
    console.log('🔄 Starting poll and match for:', queueEntryId)
    
    // Subscribe to changes on our queue entry
    const channel = supabase
      .channel(`queue-${queueEntryId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_queue',
          filter: `id=eq.${queueEntryId}`
        },
        async (payload) => {
          console.log('📨 Queue update received:', payload.new)
          
          if (payload.new.status === 'matched' && !hasMatchedRef.current) {
            hasMatchedRef.current = true
            console.log('🎉 We were matched! Partner:', payload.new.matched_with)
            
            // Stop polling
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            
            // Unsubscribe
            channel.unsubscribe()
            
            // Wait for call to be created
            await findAndSetCall(currentUserId)
          }
        }
      )
      .subscribe()
  
    channelRef.current = channel
  
    // Poll to actively find matches
    let attemptCount = 0
    pollIntervalRef.current = setInterval(async () => {
      if (hasMatchedRef.current) {
        console.log('⏹️ Already matched, stopping poll')
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        return
      }

      attemptCount++
      console.log(`🔍 Polling attempt #${attemptCount}`)
      
      try {
        // Check if we're still in queue
        const { data: ourEntry } = await supabase
          .from('call_queue')
          .select('status, matched_with')
          .eq('id', queueEntryId)
          .single()
        
        console.log('📋 Our queue status:', ourEntry?.status)
        
        if (!ourEntry || ourEntry.status === 'cancelled') {
          console.log('⏹️ No longer in queue, stopping poll')
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          return
        }
        
        if (ourEntry.status === 'matched' && !hasMatchedRef.current) {
          hasMatchedRef.current = true
          console.log('🎉 Found matched status via polling!')
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          
          await findAndSetCall(currentUserId)
          return
        }
        
        if (ourEntry.status !== 'waiting') return
        
        // Try to find a match using a transaction-like approach
        await tryCreateMatch(queueEntryId, currentUserId, duration)
        
      } catch (error) {
        console.error('❌ Polling error:', error)
      }
    }, 2000)
  
    // Timeout after 3 minutes
    setTimeout(() => {
      if (!hasMatchedRef.current) {
        console.log('⏰ Matching timeout')
        cancelMatching()
      }
    }, 180000)
  }

  const tryCreateMatch = async (
    ourQueueId: string, 
    currentUserId: string, 
    duration: number
  ) => {
    // CRITICAL: Use advisory locks to prevent race conditions
    const lockKey = Math.floor(Math.random() * 2147483647)
    
    try {
      // Try to acquire lock
      const { data: lockAcquired } = await supabase
        .rpc('pg_try_advisory_lock', { key: lockKey })
      
      if (!lockAcquired) {
        console.log('🔒 Could not acquire lock, skipping this attempt')
        return
      }

      // Look for someone to match with
      const { data: potentialMatches } = await supabase
        .from('call_queue')
        .select('*')
        .eq('status', 'waiting')
        .eq('duration', duration)
        .neq('user_id', currentUserId)
        .order('created_at', { ascending: true })
        .limit(5)

      console.log('🔍 Found potential matches:', potentialMatches?.length)

      let matchedUser = null
      if (potentialMatches && potentialMatches.length > 0) {
        for (const user of potentialMatches) {
          // Verify user is still active (within last 2 minutes)
          const { data: userData } = await supabase
            .from('users')
            .select('last_active, status')
            .eq('id', user.user_id)
            .single()
          
          const isActive = userData && 
            new Date(userData.last_active) > new Date(Date.now() - 120000) &&
            userData.status !== 'in_call'
          
          if (isActive) {
            matchedUser = user
            console.log('✅ Found active user:', user.user_id)
            break
          } else {
            console.log('⏭️ Skipping inactive user:', user.user_id)
            // Clean up stale entry
            await supabase.from('call_queue').delete().eq('id', user.id)
          }
        }
      }

      if (matchedUser && !hasMatchedRef.current) {
        hasMatchedRef.current = true
        console.log('👥 Creating match with:', matchedUser.user_id)
        
        // Stop polling immediately
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current)
          pollIntervalRef.current = null
        }
        
        // Create the call FIRST
        const { data: newCall, error: callError } = await supabase
          .from('calls')
          .insert({
            user1_id: currentUserId,
            user2_id: matchedUser.user_id,
            planned_duration: duration,
            status: 'connecting'
          })
          .select()
          .single()

        if (callError) {
          console.error('❌ Error creating call:', callError)
          hasMatchedRef.current = false
          // Release lock
          await supabase.rpc('pg_advisory_unlock', { key: lockKey })
          return
        }
        
        console.log('✅ Call created:', newCall.id)

        // Then update queue entries
        await Promise.all([
          supabase
            .from('call_queue')
            .update({ 
              status: 'matched', 
              matched_with: matchedUser.user_id,
              matched_at: new Date().toISOString()
            })
            .eq('id', ourQueueId),
          
          supabase
            .from('call_queue')
            .update({ 
              status: 'matched', 
              matched_with: currentUserId,
              matched_at: new Date().toISOString()
            })
            .eq('id', matchedUser.id)
        ])
        
        console.log('✅ Queue entries updated')

        // Release lock
        await supabase.rpc('pg_advisory_unlock', { key: lockKey })

        // Set matched call
        setMatchedCall(newCall)
        setIsSearching(false)
        isMatchingRef.current = false
      } else {
        // Release lock if no match found
        await supabase.rpc('pg_advisory_unlock', { key: lockKey })
      }
    } catch (error) {
      console.error('❌ Error in tryCreateMatch:', error)
      // Make sure to release lock on error
      try {
        await supabase.rpc('pg_advisory_unlock', { key: lockKey })
      } catch (unlockError) {
        console.error('❌ Error releasing lock:', unlockError)
      }
    }
  }

  const findAndSetCall = async (currentUserId: string) => {
    // Wait a moment for database to sync
    await new Promise(resolve => setTimeout(resolve, 500))
    
    console.log('🔍 Looking for call...')
    const { data: existingCall, error: callError } = await supabase
      .from('calls')
      .select('*')
      .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
      .eq('status', 'connecting')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (callError) {
      console.error('❌ Error finding call:', callError)
      // Try one more time after delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const { data: retryCall } = await supabase
        .from('calls')
        .select('*')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .eq('status', 'connecting')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (retryCall) {
        console.log('📞 Found call on retry:', retryCall.id)
        setMatchedCall(retryCall)
        setIsSearching(false)
        isMatchingRef.current = false
      } else {
        console.error('❌ Still no call found')
        setIsSearching(false)
        isMatchingRef.current = false
        hasMatchedRef.current = false
      }
      return
    }
    
    if (existingCall) {
      console.log('📞 Found call:', existingCall.id)
      setMatchedCall(existingCall)
      setIsSearching(false)
      isMatchingRef.current = false
    }
  }

  const cancelMatching = async () => {
    console.log('❌ Cancelling match')
    
    if (!queueId) return

    try {
      // Stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      
      // Unsubscribe from queue changes
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }

      // Update queue status
      await supabase
        .from('call_queue')
        .update({ status: 'cancelled' })
        .eq('id', queueId)
      
      setIsSearching(false)
      setQueueId(null)
      isMatchingRef.current = false
      hasMatchedRef.current = false
    } catch (error) {
      console.error('❌ Error cancelling match:', error)
    }
  }

  return { isSearching, matchedCall, startMatching, cancelMatching }
}