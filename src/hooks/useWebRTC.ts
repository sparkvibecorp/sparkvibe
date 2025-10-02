import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export const useWebRTC = (
  callId: string | undefined,
  userId: string | undefined,
  partnerId: string | undefined
) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<any>(null)
  const isInitializedRef = useRef(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastProcessedSignalRef = useRef<string | null>(null)
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([])
  const processedSignalsRef = useRef<Set<string>>(new Set())



  // SINGLE MAIN USEEFFECT WITH PROPER CLEANUP
  useEffect(() => {
    if (!callId || !userId || !partnerId) return
    if (isInitializedRef.current) return
    
    isInitializedRef.current = true
    initializeCall()
  
    return () => {
      console.log('🧹 Cleaning up WebRTC')
      
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
      
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      
      // Clear ICE candidate queue
      processedSignalsRef.current.clear()
      iceCandidateQueueRef.current = []
      
      isInitializedRef.current = false
      lastProcessedSignalRef.current = null
    }
  }, [callId, userId, partnerId])

  const initializeCall = async () => {
    if (!callId || !userId || !partnerId) return
    
    console.log('🎯 Initializing WebRTC call:', { callId, userId, partnerId })
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      setLocalStream(stream)
      console.log('✅ Got local media stream')

      const { data: call } = await supabase
        .from('calls')
        .select('user1_id')
        .eq('id', callId)
        .single()

      const isInitiator = call?.user1_id === userId
      console.log(`📞 Role: ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`)

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ]
      }

      const peerConnection = new RTCPeerConnection(configuration)
      peerConnectionRef.current = peerConnection

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
        console.log('➕ Added local track:', track.kind)
      })

      peerConnection.ontrack = (event) => {
        console.log('🎵 Received remote track')
        setRemoteStream(event.streams[0])
      }

      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('🧊 Sending ICE candidate')
          try {
            await supabase.from('webrtc_signals').insert({
              call_id: callId,
              sender_id: userId,
              receiver_id: partnerId,
              signal_type: 'ice-candidate',
              signal_data: event.candidate,
            })
          } catch (error) {
            console.error('❌ Error sending ICE candidate:', error)
          }
        }
      }

      peerConnection.onconnectionstatechange = async () => {
        console.log('🔌 Connection state:', peerConnection.connectionState)
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true)
          console.log('✅ WebRTC CONNECTED!')
          
          await supabase
            .from('calls')
            .update({ 
              status: 'active',
              started_at: new Date().toISOString()
            })
            .eq('id', callId)
        } else if (peerConnection.connectionState === 'failed' || 
                   peerConnection.connectionState === 'disconnected' ||
                   peerConnection.connectionState === 'closed') {
          console.log('❌ Partner disconnected')
          setIsConnected(false)
          
          await supabase
            .from('calls')
            .update({ 
              status: 'ended',
              ended_at: new Date().toISOString()
            })
            .eq('id', callId)
          
          // Notify user that partner left
          alert('Your partner has left the call')
          window.location.reload()
        }
      }

      peerConnection.oniceconnectionstatechange = () => {
        console.log('🧊 ICE Connection state:', peerConnection.iceConnectionState)
      }

      // Try realtime first
      console.log('👂 Attempting realtime subscription...')
      const channel = supabase
        .channel(`call-${callId}-${userId}`)
        .on(
          'postgres_changes' as any,
          {
            event: 'INSERT',
            schema: 'public',
            table: 'webrtc_signals',
            filter: `receiver_id=eq.${userId}`,
          },
          async (payload: any) => {
            console.log('📨 Received signal via realtime:', payload.new?.signal_type)
            await handleSignal(payload.new, peerConnection)
          }
        )
        .subscribe((status) => {
          console.log('📡 Subscription status:', status)
          
          // If realtime fails, start polling
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.log('⚠️ Realtime failed, switching to polling')
            startPolling(callId, userId, peerConnection)
          } else if (status === 'SUBSCRIBED') {
            console.log('✅ Realtime working!')
          }
        })

      channelRef.current = channel

      // Also start polling as backup (will stop if realtime works)
      setTimeout(() => {
        if (channelRef.current?.state !== 'joined') {
          console.log('🔄 Starting polling backup')
          startPolling(callId, userId, peerConnection)
        }
      }, 3000)

      await new Promise(resolve => setTimeout(resolve, 1000))

      console.log('🔍 Checking for existing signals...')
      const { data: existingSignals } = await supabase
        .from('webrtc_signals')
        .select('*')
        .eq('call_id', callId)
        .eq('receiver_id', userId)
        .order('created_at', { ascending: true })

      if (existingSignals && existingSignals.length > 0) {
        console.log(`📬 Found ${existingSignals.length} existing signals`)
        for (const signal of existingSignals) {
          await handleSignal(signal, peerConnection)
        }
      }

      if (isInitiator) {
        console.log('📤 Creating offer...')
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true,
        })
        await peerConnection.setLocalDescription(offer)
        console.log('✅ Offer created')
        
        await supabase.from('webrtc_signals').insert({
          call_id: callId,
          sender_id: userId,
          receiver_id: partnerId,
          signal_type: 'offer',
          signal_data: offer,
        })
        console.log('📨 Offer sent')
      } else {
        console.log('👂 Receiver waiting for offer...')
      }

    } catch (error) {
      console.error('❌ Error initializing call:', error)
    }
  }

  const startPolling = (callId: string, userId: string, peerConnection: RTCPeerConnection) => {
    if (pollingIntervalRef.current) return
    
    console.log('🔄 Polling for signals every 1 second')
    
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const { data: signals } = await supabase
          .from('webrtc_signals')
          .select('*')
          .eq('call_id', callId)
          .eq('receiver_id', userId)
          .order('created_at', { ascending: true })

        if (signals && signals.length > 0) {
          for (const signal of signals) {
            const signalId = signal.id
            if (lastProcessedSignalRef.current !== signalId) {
              console.log('📨 Received signal via polling:', signal.signal_type)
              await handleSignal(signal, peerConnection)
              lastProcessedSignalRef.current = signalId
            }
          }
        }
      } catch (error) {
        console.error('❌ Polling error:', error)
      }
    }, 1000)
  }

  const handleSignal = async (signal: any, peerConnection: RTCPeerConnection) => {
    if (!signal?.signal_data || !signal?.signal_type) return
  
    // Create unique signal ID to prevent duplicates
    const signalId = signal.id || `${signal.signal_type}-${Date.now()}`
    
    if (processedSignalsRef.current.has(signalId)) {
      console.log('⏭️ Skipping duplicate signal:', signal.signal_type)
      return
    }
    
    processedSignalsRef.current.add(signalId)
  
    const signalData = signal.signal_data
    const signalType = signal.signal_type
  
    try {
      if (signalType === 'offer') {
        console.log('📥 Processing offer')
        
        // Check if we already have a remote description
        if (peerConnection.remoteDescription) {
          console.log('⏭️ Already have remote description, skipping offer')
          return
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
        console.log('✅ Remote description set')
        
        // Process queued ICE candidates
        console.log(`🧊 Processing ${iceCandidateQueueRef.current.length} queued ICE candidates`)
        for (const candidate of iceCandidateQueueRef.current) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            console.log('✅ Queued ICE candidate added')
          } catch (err) {
            console.error('❌ Error adding queued candidate:', err)
          }
        }
        iceCandidateQueueRef.current = []
        
        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)
        console.log('✅ Answer created')
        
        if (userId && partnerId && callId) {
          await supabase.from('webrtc_signals').insert({
            call_id: callId,
            sender_id: userId,
            receiver_id: partnerId,
            signal_type: 'answer',
            signal_data: answer,
          })
          console.log('📨 Answer sent')
        }
      } else if (signalType === 'answer') {
        console.log('📥 Processing answer')
        
        // Check if we already have a remote description
        if (peerConnection.remoteDescription) {
          console.log('⏭️ Already have remote description, skipping answer')
          return
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
        console.log('✅ Remote description set from answer')
        
        // Process queued ICE candidates
        console.log(`🧊 Processing ${iceCandidateQueueRef.current.length} queued ICE candidates`)
        for (const candidate of iceCandidateQueueRef.current) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            console.log('✅ Queued ICE candidate added')
          } catch (err) {
            console.error('❌ Error adding queued candidate:', err)
          }
        }
        iceCandidateQueueRef.current = []
        
      } else if (signalType === 'ice-candidate') {
        console.log('📥 Processing ICE candidate')
        
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(signalData))
          console.log('✅ ICE candidate added')
        } else {
          console.log('⏳ Remote description not ready, queuing ICE candidate')
          iceCandidateQueueRef.current.push(signalData)
        }
      }
    } catch (error) {
      console.error(`❌ Error handling ${signalType}:`, error)
    }
  }

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  // REMOVED THE SEPARATE cleanup() FUNCTION - it's now inline in the useEffect return

  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    toggleMute,
  }
}