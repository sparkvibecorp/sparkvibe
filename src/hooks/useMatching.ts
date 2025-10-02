import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Call } from '../types'

export const useMatching = (userId: string | undefined, duration: number) => {
  const [isSearching, setIsSearching] = useState(false)
  const [matchedCall, setMatchedCall] = useState<Call | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const channelRef = useRef<any>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const isMatchingRef = useRef(false)

  const startMatching = async () => {
    if (!userId || isMatchingRef.current) {
      console.log('⚠️ Cannot start matching:', { userId, isMatching: isMatchingRef.current })
      return
    }
    
    console.log('🔍 Starting matching process for user:', userId, 'duration:', duration)
    setIsSearching(true)
    isMatchingRef.current = true
  
    try {
      // Clean up ALL old queue entries (stale entries from disconnected users)
      console.log('🧹 Cleaning ALL stale queue entries...')
      await supabase
        .from('call_queue')
        .delete()
        .lt('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      
      // Clean up our own old entries
      console.log('🧹 Cleaning our old queue entries...')
      await supabase.from('call_queue').delete().eq('user_id', userId)
      await new Promise(resolve => setTimeout(resolve, 200))
  
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
          
          if (payload.new.status === 'matched') {
            console.log('🎉 We were matched! Partner:', payload.new.matched_with)
            
            // Stop polling
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            
            // Unsubscribe
            channel.unsubscribe()
            
            // Wait a moment for call to be created
            await new Promise(resolve => setTimeout(resolve, 500))
            
            // Find our call
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
              setIsSearching(false)
              isMatchingRef.current = false
              return
            }
            
            if (existingCall) {
              console.log('📞 Found call:', existingCall.id)
              setMatchedCall(existingCall)
              setIsSearching(false)
              isMatchingRef.current = false
            } else {
              console.error('❌ No call found after match')
              setIsSearching(false)
              isMatchingRef.current = false
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Queue subscription status:', status)
      })
  
    channelRef.current = channel
  
    // Poll to actively find matches
    let attemptCount = 0
    pollIntervalRef.current = setInterval(async () => {
      attemptCount++
      console.log(`🔍 Polling attempt #${attemptCount}`)
      
      try {
        // Check if we're still in queue
        const { data: ourEntry } = await supabase
          .from('call_queue')
          .select('status, matched_with')
          .eq('id', queueEntryId)
          .single()
        
        console.log('📋 Our queue status:', ourEntry?.status, 'matched_with:', ourEntry?.matched_with)
        
        if (!ourEntry || ourEntry.status !== 'waiting') {
          console.log('⏹️ No longer in queue, stopping poll. Status:', ourEntry?.status)
          
          // If we were matched, find the call
          if (ourEntry?.status === 'matched') {
            console.log('🎉 Found matched status via polling!')
            
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            
            await new Promise(resolve => setTimeout(resolve, 500))
            
            const { data: existingCall } = await supabase
              .from('calls')
              .select('*')
              .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
              .eq('status', 'connecting')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
            
            if (existingCall) {
              console.log('📞 Found call via polling:', existingCall.id)
              setMatchedCall(existingCall)
              setIsSearching(false)
              isMatchingRef.current = false
            }
          }
          
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          return
        }
        
        // Look for someone to match with
        const { data: otherUsers } = await supabase
          .from('call_queue')
          .select('*')
          .eq('status', 'waiting')
          .eq('duration', duration)
          .neq('user_id', currentUserId)
          .order('created_at', { ascending: true })
          .limit(5) // Get up to 5 potential matches
  
        // Filter to only recently active users
        let otherUser = null
        if (otherUsers && otherUsers.length > 0) {
          for (const user of otherUsers) {
            // Check if this user is still active
            const { data: userData } = await supabase
              .from('users')
              .select('last_active')
              .eq('id', user.user_id)
              .single()
            
            // User must have been active in last 2 minutes
            if (userData && new Date(userData.last_active) > new Date(Date.now() - 120000)) {
              otherUser = user
              console.log('✅ Found active user:', user.user_id)
              break
            } else {
              console.log('⏭️ Skipping inactive user:', user.user_id)
              // Delete stale queue entry
              await supabase
                .from('call_queue')
                .delete()
                .eq('id', user.id)
            }
          }
        }
  
        if (otherUser) {
          console.log('👥 Found match:', otherUser.user_id)
          
          // Stop polling immediately
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          channel.unsubscribe()
          
          // Create the call
          console.log('📞 Creating call...')
          const { data: newCall, error: callError } = await supabase
            .from('calls')
            .insert({
              user1_id: currentUserId,
              user2_id: otherUser.user_id,
              planned_duration: duration,
              status: 'connecting'
            })
            .select()
            .single()
  
          if (callError) {
            console.error('❌ Error creating call:', callError)
            setIsSearching(false)
            isMatchingRef.current = false
            return
          }
          
          console.log('✅ Call created:', newCall.id)
  
          // Update both queue entries
          console.log('📝 Updating queue entries...')
          await Promise.all([
            supabase
              .from('call_queue')
              .update({ 
                status: 'matched', 
                matched_with: otherUser.user_id,
                matched_at: new Date().toISOString()
              })
              .eq('id', queueEntryId),
            
            supabase
              .from('call_queue')
              .update({ 
                status: 'matched', 
                matched_with: currentUserId,
                matched_at: new Date().toISOString()
              })
              .eq('id', otherUser.id)
          ])
          
          console.log('✅ Queue entries updated')
  
          setMatchedCall(newCall)
          setIsSearching(false)
          isMatchingRef.current = false
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
      }
    }, 2000)
  
    // Timeout after 5 minutes
    setTimeout(() => {
      console.log('⏰ Matching timeout')
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      channel.unsubscribe()
      setIsSearching(false)
      isMatchingRef.current = false
      cancelMatching()
    }, 300000)
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
      }

      // Update queue status
      await supabase
        .from('call_queue')
        .update({ status: 'cancelled' })
        .eq('id', queueId)
      
      setIsSearching(false)
      setQueueId(null)
      isMatchingRef.current = false
    } catch (error) {
      console.error('❌ Error cancelling match:', error)
    }
  }

  return { isSearching, matchedCall, startMatching, cancelMatching }
}