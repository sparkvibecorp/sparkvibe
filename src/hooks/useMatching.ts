import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Call } from '../types'

export const useMatching = (userId: string | undefined, duration: number) => {
  const [isSearching, setIsSearching] = useState(false)
  const [matchedCall, setMatchedCall] = useState<Call | null>(null)
  const [queueId, setQueueId] = useState<string | null>(null)
  const channelRef = useRef<any>(null)

  const startMatching = async () => {
    if (!userId) return
    setIsSearching(true)
  
    try {
      await supabase.from('call_queue').delete().eq('user_id', userId)
      await new Promise(resolve => setTimeout(resolve, 100))
  
      // @ts-ignore
      const { data: queueEntry, error: queueError } = await supabase
        .from('call_queue')
        // @ts-ignore
        .insert({
          user_id: userId,
          duration: duration,
          language: 'en',
          status: 'waiting',
        })
        .select()
        .single()
  
      if (queueError) throw queueError
      // @ts-ignore
      setQueueId(queueEntry.id)
  
      // Simple approach: just poll and manually match on client side
      // @ts-ignore
      pollAndMatch(queueEntry.id, userId)
    } catch (error) {
      console.error('Error starting match:', error)
      setIsSearching(false)
    }
  }
  
  const pollAndMatch = async (queueEntryId: string, currentUserId: string) => {
    let pollInterval: NodeJS.Timeout | null = null // Declare it first
  
    // Subscribe to changes on OUR queue entry
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
          if (payload.new.status === 'matched') {
            // We were matched! Find our call
            const { data: existingCall } = await supabase
              .from('calls')
              .select('*')
              .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
              .eq('status', 'connecting')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()
  
            if (existingCall) {
              channel.unsubscribe()
              if (pollInterval) clearInterval(pollInterval) // Now it exists
              setMatchedCall(existingCall)
              setIsSearching(false)
            }
          }
        }
      )
      .subscribe()
  
    channelRef.current = channel
  
    // Still poll to actively find matches
    pollInterval = setInterval(async () => { // Now assign it
      try {
        const { data: otherUsers } = await supabase
          .from('call_queue')
          .select('*')
          .eq('status', 'waiting')
          .eq('duration', duration)
          .neq('user_id', currentUserId)
          .limit(1)
  
        const otherUser = otherUsers?.[0]
  
        if (otherUser) {
          if (pollInterval) clearInterval(pollInterval)
          channel.unsubscribe()
          
          const { data: newCall, error: callError } = await supabase
            .from('calls')
            // @ts-ignore
            .insert({
              user1_id: currentUserId,
              // @ts-ignore
              user2_id: otherUser.user_id,
              planned_duration: duration,
              status: 'connecting'
            })
            .select()
            .single()
  
          if (callError) {
            console.error('Error creating call:', callError)
            return
          }
  
          await supabase
            .from('call_queue')
            // @ts-ignore
            .update({ status: 'matched', matched_with: otherUser.user_id })
            .eq('id', queueEntryId)
          
          await supabase
            .from('call_queue')
            // @ts-ignore
            .update({ status: 'matched', matched_with: currentUserId })
            // @ts-ignore
            .eq('id', otherUser.id)
  
          setMatchedCall(newCall)
          setIsSearching(false)
        }
      } catch (error) {
        console.error('Unexpected error in pollAndMatch:', error)
      }
    }, 2000)
  
    setTimeout(() => {
      if (pollInterval) clearInterval(pollInterval)
      channel.unsubscribe()
      setIsSearching(false)
      cancelMatching()
    }, 300000)
  }

  const cancelMatching = async () => {
    if (!queueId) return

    try {
      // Unsubscribe from queue changes
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      // @ts-ignore
      await supabase
        .from('call_queue')
        // @ts-ignore
        .update({ status: 'cancelled' })
        .eq('id', queueId)
      
      setIsSearching(false)
      setQueueId(null)
    } catch (error) {
      console.error('Error cancelling match:', error)
    }
  }

  return { isSearching, matchedCall, startMatching, cancelMatching }
}