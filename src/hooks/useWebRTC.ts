import { useEffect, useRef, useState, useCallback } from 'react'
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
  const [error, setError] = useState<string | null>(null)
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const processedSignalsRef = useRef<Set<string>>(new Set())
  const isInitializedRef = useRef(false)
  const isMountedRef = useRef(true)
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([])
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  const cleanup = useCallback(() => {
    console.log('🧹 Cleaning up WebRTC...')
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.ontrack = null
      peerConnectionRef.current.onicecandidate = null
      peerConnectionRef.current.onconnectionstatechange = null
      peerConnectionRef.current.oniceconnectionstatechange = null
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    const currentLocal = localStreamRef.current
    if (currentLocal) {
      currentLocal.getTracks().forEach(track => {
        track.stop()
        track.enabled = false
      })
      if (isMountedRef.current) setLocalStream(null)
      localStreamRef.current = null
    }
    
    const currentRemote = remoteStreamRef.current
    if (currentRemote) {
      currentRemote.getTracks().forEach(track => track.stop())
      if (isMountedRef.current) setRemoteStream(null)
      remoteStreamRef.current = null
    }
    
    processedSignalsRef.current.clear()
    iceCandidateQueueRef.current = []
    isInitializedRef.current = false
    
    if (isMountedRef.current) {
      setIsConnected(false)
      setIsMuted(false)
    }
    
    console.log('✅ WebRTC cleanup complete')
  }, [])

  const createAndSendOffer = async (
    pc: RTCPeerConnection,
    callId: string,
    userId: string,
    partnerId: string
  ) => {
    try {
      console.log('📞 Creating offer...')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      
      await supabase.from('webrtc_signals').insert({
        call_id: callId,
        sender_id: userId,
        receiver_id: partnerId,
        signal_type: 'offer',
        signal_data: offer,
      })
      
      console.log('✅ Offer sent')
    } catch (err) {
      console.error('❌ Error creating offer:', err)
    }
  }

  const handleSignal = async (
    signal: any,
    pc: RTCPeerConnection,
    callId: string,
    userId: string,
    partnerId: string
  ) => {
    const signalId = signal.id
    
    if (processedSignalsRef.current.has(signalId)) {
      return
    }
    
    processedSignalsRef.current.add(signalId)
    
    if (processedSignalsRef.current.size > 50) {
      const oldestSignals = Array.from(processedSignalsRef.current).slice(0, 25)
      oldestSignals.forEach(sig => processedSignalsRef.current.delete(sig))
    }
    
    const { signal_type: type, signal_data: data } = signal
    
    try {
      if (type === 'offer') {
        console.log('📥 Processing offer')
        
        if (pc.remoteDescription) {
          console.log('⏭️ Already have remote description')
          return
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(data))
        
        for (const candidate of iceCandidateQueueRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        iceCandidateQueueRef.current = []
        
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        
        await supabase.from('webrtc_signals').insert({
          call_id: callId,
          sender_id: userId,
          receiver_id: partnerId,
          signal_type: 'answer',
          signal_data: answer,
        })
        
        console.log('✅ Answer sent')
        
      } else if (type === 'answer') {
        console.log('📥 Processing answer')
        
        if (pc.remoteDescription) {
          console.log('⏭️ Already have remote description')
          return
        }
        
        await pc.setRemoteDescription(new RTCSessionDescription(data))
        
        for (const candidate of iceCandidateQueueRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        iceCandidateQueueRef.current = []
        
        console.log('✅ Answer processed')
        
      } else if (type === 'ice-candidate') {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data))
          console.log('✅ ICE candidate added')
        } else {
          iceCandidateQueueRef.current.push(data)
          console.log('⏳ ICE candidate queued')
        }
      }
    } catch (err) {
      console.error(`❌ Error handling ${type}:`, err)
    }
  }

  const startPolling = (callId: string, userId: string, pc: RTCPeerConnection) => {
    if (pollingIntervalRef.current) return
    
    console.log('🔄 Starting signal polling')
    
    pollingIntervalRef.current = setInterval(async () => {
      if (!pc || pc.connectionState === 'closed') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
          pollingIntervalRef.current = null
        }
        return
      }
      
      try {
        const { data: signals } = await supabase
          .from('webrtc_signals')
          .select('*')
          .eq('call_id', callId)
          .eq('receiver_id', userId)
          .eq('is_read', false)
          .order('created_at', { ascending: true })

        if (signals && signals.length > 0) {
          for (const signal of signals) {
            await handleSignal(signal, pc, callId, userId, partnerId!)
            
            await supabase
              .from('webrtc_signals')
              .update({ is_read: true })
              .eq('id', signal.id)
          }
        }
      } catch (err) {
        console.error('❌ Polling error:', err)
      }
    }, 1000)
  }

  const initializeWebRTC = useCallback(async () => {
    if (!callId || !userId || !partnerId || isInitializedRef.current) {
      return
    }
    
    isInitializedRef.current = true
    console.log('🚀 Initializing WebRTC:', { callId, userId, partnerId })
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      
      localStreamRef.current = stream
      if (isMountedRef.current) setLocalStream(stream)
      console.log('✅ Got local stream')
  
      const { data: call } = await supabase
        .from('calls')
        .select('user1_id')
        .eq('id', callId)
        .single()
  
      const isInitiator = call?.user1_id === userId
      console.log(`👤 Role: ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`)
  
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          {
            urls: [
              'turn:openrelay.metered.ca:80',
              'turn:openrelay.metered.ca:80?transport=tcp',
              'turn:openrelay.metered.ca:443',
              'turn:openrelay.metered.ca:443?transport=tcp',
            ],
            username: 'openrelayproject',
            credential: 'openrelayproject',
          },
        ],
        iceCandidatePoolSize: 10,
      });
      peerConnectionRef.current = pc
  
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
        console.log('🎵 Added local track:', track.kind)
      })
  
      pc.ontrack = (event) => {
        console.log('📨 Received remote track:', event.track.kind);
        if (event.streams[0]) {
          setRemoteStream(event.streams[0]);  // Make sure this line exists
        }
      };
  
      pc.onicecandidate = async (event) => {
        if (event.candidate) {
          try {
            await supabase.from('webrtc_signals').insert({
              call_id: callId,
              sender_id: userId,
              receiver_id: partnerId,
              signal_type: 'ice-candidate',
              signal_data: event.candidate.toJSON(),
            })
            console.log('✅ Sent ICE candidate')
          } catch (err) {
            console.error('❌ Failed to send ICE:', err)
          }
        }
      }
  
      pc.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', pc.connectionState)
                
        if (pc.connectionState === 'connected') {
          setIsConnected(true)
          setError(null)
        } else if (pc.connectionState === 'failed') {
          setError('Connection failed')
          setIsConnected(false)
        } else if (pc.connectionState === 'disconnected') {
          setIsConnected(false)
        }
      }
  
      // 🔥 FIX: Start polling FIRST for receiver, THEN let initiator send offer
      startPolling(callId, userId, pc)
  
      if (isInitiator) {
        // Wait for receiver to start polling
        await new Promise(resolve => setTimeout(resolve, 2000))
        await createAndSendOffer(pc, callId, userId, partnerId)
      }
  
      setTimeout(() => {
        if (pc.connectionState !== 'connected' && isMountedRef.current) {
          console.log('⏰ Connection timeout')
          setError('Connection timeout - please try again')
        }
      }, 30000)
  
    } catch (err: any) {
      console.error('❌ WebRTC init error:', err)
      
      if (isMountedRef.current) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone permission denied')
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found')
        } else {
          setError('Failed to initialize call')
        }
      }
      
      cleanup()
    }
  }, [callId, userId, partnerId, cleanup])

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current
    if (stream) {
      stream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(prev => !prev)
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
      console.log('⏹️ Stopped polling')
    }
  }, [])

  useEffect(() => {
    initializeWebRTC()
    
    return () => {
      isMountedRef.current = false
      cleanup()
    }
  }, [initializeWebRTC, cleanup])

  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    error,
    toggleMute,
    cleanup,
    stopPolling
  }
}