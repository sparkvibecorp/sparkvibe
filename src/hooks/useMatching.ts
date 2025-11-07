import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Call } from '../types';

export const useMatching = (userId: string | undefined, duration: number) => {
  const [matchedCall, setMatchedCall] = useState<Call | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  
  // Use ReturnType<typeof setInterval> so it works in browser and node without NodeJS namespace
  const matchingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueEntryIdRef = useRef<string | null>(null);
  const matchAttemptRef = useRef(0);
  const hasMatchedRef = useRef(false);
  const isMountedRef = useRef(true);
  const isProcessingRef = useRef(false);

  const cleanup = useCallback(async () => {
    console.log('Cleaning up matching...');
    
    if (matchingIntervalRef.current) {
      clearInterval(matchingIntervalRef.current);
      matchingIntervalRef.current = null;
    }
  
    if (queueEntryIdRef.current && userId) {
      try {
        await supabase
          .from('call_queue')
          .delete()
          .eq('id', queueEntryIdRef.current);
        console.log('Removed from queue');
      } catch (err) {
        console.error('Error removing from queue:', err);
      }
      queueEntryIdRef.current = null;
    }
  
    matchAttemptRef.current = 0;
    hasMatchedRef.current = false;
    isProcessingRef.current = false;
    
    if (isMountedRef.current) {
      setIsMatching(false);
    }
  }, [userId]);

  const handleQueueUpdate = useCallback((payload: any) => {
    if (!isMountedRef.current || hasMatchedRef.current) return;

    console.log('Queue update:', payload.new.status);

    if (payload.new.status === 'matched' && payload.new.matched_with) {
      hasMatchedRef.current = true;
      console.log('Match found via realtime! Matched with:', payload.new.matched_with);
      
      if (matchingIntervalRef.current) {
        clearInterval(matchingIntervalRef.current);
        matchingIntervalRef.current = null;
      }

      supabase
        .from('calls')
        .select('*')
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .in('status', ['active', 'connecting'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching call:', error);
            return;
          }
          
          if (data && isMountedRef.current) {
            console.log('Call details loaded:', data);
            setMatchedCall(data);
            setIsMatching(false);
          }
        });
    }
  }, [userId]);

  const attemptMatch = useCallback(async () => {
    if (!userId || hasMatchedRef.current || isProcessingRef.current) {
      return;
    }

    isProcessingRef.current = true;
  
    matchAttemptRef.current += 1;
    console.log('Match attempt #' + matchAttemptRef.current);
  
    try {
      if (hasMatchedRef.current) {
        isProcessingRef.current = false;
        return;
      }

      const { data: waitingUsers, error: fetchError } = await supabase
        .from('call_queue')
        .select('*')
        .eq('status', 'waiting')
        .eq('duration', duration)
        .neq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1);
  
      if (fetchError) {
        console.error('Error fetching queue:', fetchError);
        isProcessingRef.current = false;
        return;
      }
  
      console.log('Found waiting users:', waitingUsers?.length || 0);
  
      if (!waitingUsers || waitingUsers.length === 0) {
        const recentTime = new Date(Date.now() - 30000).toISOString();
        
        const { data: existingCall } = await supabase
          .from('calls')
          .select('*')
          .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
          .in('status', ['active', 'connecting'])
          .gte('created_at', recentTime)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (existingCall && !hasMatchedRef.current) {
          console.log('Found call created for us:', existingCall.id);
          hasMatchedRef.current = true;
          
          setMatchedCall(existingCall);
          setIsMatching(false);
          
          if (matchingIntervalRef.current) {
            clearInterval(matchingIntervalRef.current);
            matchingIntervalRef.current = null;
          }
          
          const partnerId = existingCall.user1_id === userId ? existingCall.user2_id : existingCall.user1_id;
          
          await supabase
            .from('call_queue')
            .update({ 
              status: 'matched', 
              matched_with: partnerId,
              matched_at: new Date().toISOString()
            })
            .eq('user_id', userId);
        }
        
        isProcessingRef.current = false;
        return;
      }
  
      const partner = waitingUsers[0];
      const shouldCreateCall = userId < partner.user_id;
      
      if (!shouldCreateCall) {
        console.log('Partner will create call, waiting...');
        
        const recentTime = new Date(Date.now() - 30000).toISOString();
        
        const { data: existingCall } = await supabase
          .from('calls')
          .select('*')
          .eq('user1_id', partner.user_id)
          .eq('user2_id', userId)
          .in('status', ['active', 'connecting'])
          .gte('created_at', recentTime)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
          
        if (existingCall && !hasMatchedRef.current) {
          console.log('Found call created by partner:', existingCall.id);
          hasMatchedRef.current = true;
          
          setMatchedCall(existingCall);
          setIsMatching(false);
          
          if (matchingIntervalRef.current) {
            clearInterval(matchingIntervalRef.current);
            matchingIntervalRef.current = null;
          }
          
          await supabase
            .from('call_queue')
            .update({ 
              status: 'matched', 
              matched_with: partner.user_id,
              matched_at: new Date().toISOString()
            })
            .eq('id', queueEntryIdRef.current!);
        }
        
        isProcessingRef.current = false;
        return;
      }
      
      if (hasMatchedRef.current) {
        isProcessingRef.current = false;
        return;
      }

      const { data: partnerCheck } = await supabase
        .from('call_queue')
        .select('status')
        .eq('id', partner.id)
        .single();
  
      if (partnerCheck?.status !== 'waiting') {
        console.log('Partner no longer available');
        isProcessingRef.current = false;
        return;
      }
  
      hasMatchedRef.current = true;
      console.log('Creating match with:', partner.user_id);
  
      const { data: newCall, error: callError } = await supabase
        .from('calls')
        .insert({
          user1_id: userId,
          user2_id: partner.user_id,
          planned_duration: duration,
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
  
      if (callError) {
        console.error('Error creating call:', callError);
        hasMatchedRef.current = false;
        isProcessingRef.current = false;
        return;
      }
  
      console.log('Call created:', newCall.id);
  
      const updatePromises = [
        supabase.from('call_queue').update({ 
          status: 'matched', 
          matched_with: partner.user_id,
          matched_at: new Date().toISOString()
        }).eq('id', queueEntryIdRef.current!),
        supabase.from('call_queue').update({ 
          status: 'matched', 
          matched_with: userId,
          matched_at: new Date().toISOString()
        }).eq('id', partner.id),
        supabase.from('users').update({ 
          status: 'in_call', 
          current_call_id: newCall.id 
        }).eq('id', userId),
        supabase.from('users').update({ 
          status: 'in_call', 
          current_call_id: newCall.id 
        }).eq('id', partner.user_id),
      ];
  
      await Promise.allSettled(updatePromises);
      console.log('Queue and user statuses updated');
  
      setMatchedCall(newCall);
      setIsMatching(false);
  
      if (matchingIntervalRef.current) {
        clearInterval(matchingIntervalRef.current);
        matchingIntervalRef.current = null;
      }
      
      isProcessingRef.current = false;
    } catch (err: any) {
      console.error('Match attempt failed:', err);
      isProcessingRef.current = false;
      
      if (err.code === '23505' || err.message?.includes('duplicate')) {
        console.log('Race condition detected, resetting...');
        hasMatchedRef.current = false;
      }
    }
  }, [userId, duration]);

  const startMatching = useCallback(async () => {
    if (!userId || isMatching || hasMatchedRef.current) {
      console.log('Already matching or matched');
      return;
    }

    console.log('Starting matching:', { userId, duration });

    try {
      setIsMatching(true);
      hasMatchedRef.current = false;
      isProcessingRef.current = false;
      matchAttemptRef.current = 0;

      console.log('Cleaning up old queue entries...');
      await supabase.from('call_queue').delete().eq('user_id', userId);

      console.log('Updating user status to in_queue...');
      await supabase.from('users').update({ status: 'in_queue' }).eq('id', userId);

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      console.log('Adding to queue...');
      
      const { data: queueEntry, error: queueError } = await supabase
        .from('call_queue')
        .insert({
          user_id: userId,
          duration: duration,
          status: 'waiting',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (queueError) {
        console.error('Queue insert error:', queueError);
        throw queueError;
      }

      queueEntryIdRef.current = queueEntry.id;
      console.log('Added to queue:', queueEntry.id);

      const channel = supabase
        .channel(`queue-${queueEntry.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_queue',
          filter: `id=eq.${queueEntry.id}`,
        }, handleQueueUpdate)
        .subscribe((status) => {
          console.log('Realtime subscription status:', status);
        });

      console.log('Starting match polling...');
      matchingIntervalRef.current = setInterval(attemptMatch, 2000);
      
      console.log('Attempting immediate match...');
      attemptMatch();

      return () => {
        channel.unsubscribe();
      };
    } catch (err) {
      console.error('Error starting match:', err);
      if (isMountedRef.current) {
        setIsMatching(false);
      }
      cleanup();
    }
  }, [userId, duration, isMatching, attemptMatch, handleQueueUpdate, cleanup]);

  const cancelMatching = useCallback(async () => {
    console.log('Canceling matching');
    
    // FIX: Reset matchedCall state
    setMatchedCall(null);
    setIsMatching(false);
    
    if (userId) {
      await supabase.from('call_queue').delete().eq('user_id', userId);
      await supabase.from('users').update({ 
        status: 'online', 
        current_call_id: null 
      }).eq('id', userId);
    }
    
    cleanup();
  }, [userId, cleanup]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  console.log('useMatching state:', { matchedCallId: matchedCall?.id, isMatching });

  return {
    matchedCall,
    isMatching,
    startMatching,
    cancelMatching,
  };
};
