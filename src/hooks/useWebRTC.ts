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
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  // MAIN USEEFFECT WITH PROPER CLEANUP - FIXED
  useEffect(() => {
    if (!callId || !userId || !partnerId) return
    if (isInitializedRef.current) return
    
    isInitializedRef.current = true

    // Add connection timeout
    const connectionTimeout = setTimeout(() => {
      if (!peerConnectionRef.current || 
          peerConnectionRef.current.connectionState !== 'connected') {
        console.log('⏰ WebRTC connection timeout')
        alert('Failed to connect. Please try again.')
        window.location.reload()
      }
    }, 30000) // 30 seconds

    initializeCall()

    // CLEANUP FUNCTION
    return () => {
      clearTimeout(connectionTimeout)
      console.log('🧹 Starting WebRTC cleanup...')
      
      // 1. Stop polling
      if (pollingIntervalRef.current) {
        console.log('⏹️ Stopping polling interval')
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      
      // 2. Clean up peer connection
      if (peerConnectionRef.current) {
        console.log('🔌 Closing peer connection')
        
        // Remove all event listeners
        peerConnectionRef.current.ontrack = null
        peerConnectionRef.current.onicecandidate = null
        peerConnectionRef.current.onconnectionstatechange = null
        peerConnectionRef.current.oniceconnectionstatechange = null
        
        // Close the connection
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
      }
      
      // 3. Clean up local stream (CRITICAL - prevents microphone staying on)
      const currentLocalStream = localStreamRef.current
      if (currentLocalStream) {
        console.log('🎤 Stopping local stream tracks')
        currentLocalStream.getTracks().forEach((track) => {
          console.log(`  Stopping ${track.kind} track:`, track.label)
          track.stop()
          track.enabled = false
        })
        setLocalStream(null)
        localStreamRef.current = null
      }
      
      // 4. Clean up remote stream
      const currentRemoteStream = remoteStreamRef.current
      if (currentRemoteStream) {
        console.log('🔊 Stopping remote stream tracks')
        currentRemoteStream.getTracks().forEach((track) => {
          console.log(`  Stopping ${track.kind} track:`, track.label)
          track.stop()
        })
        setRemoteStream(null)
        remoteStreamRef.current = null
      }
      
      // 5. Unsubscribe from Supabase realtime
      if (channelRef.current) {
        console.log('📡 Unsubscribing from channel')
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      
      // 6. Clear processed signals and ICE candidate queue
      processedSignalsRef.current.clear()
      iceCandidateQueueRef.current = []
      
      // 7. Reset refs
      isInitializedRef.current = false
      lastProcessedSignalRef.current = null
      
      // 8. Reset state
      setIsConnected(false)
      setIsMuted(false)
      
      console.log('✅ WebRTC cleanup complete')
    }
  }, [callId, userId, partnerId]) // FIXED: Only these dependencies!

  const initializeCall = async () => {
    if (!callId || !userId || !partnerId) return
    
    console.log('🎯 Initializing WebRTC call:', { callId, userId, partnerId })
    
    try {
      // 1. Get user media
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      setLocalStream(stream)
      localStreamRef.current = stream // Store in ref
      console.log('✅ Got local media stream')

      // 2. Determine if this user is the initiator
      const { data: call } = await supabase
        .from('calls')
        .select('user1_id')
        .eq('id', callId)
        .single()

      const isInitiator = call?.user1_id === userId
      console.log(`📞 Role: ${isInitiator ? 'INITIATOR' : 'RECEIVER'}`)

      // 3. Create peer connection
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      })
      peerConnectionRef.current = peerConnection

      // 4. Add local stream tracks
      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream)
        console.log('🎵 Added local track:', track.kind)
      })

      // 5. Handle remote stream
      peerConnection.ontrack = (event) => {
        console.log('🎵 Received remote track:', event.track.kind)
        const remote = new MediaStream()
        event.streams[0].getTracks().forEach((track) => {
          remote.addTrack(track)
        })
        setRemoteStream(remote)
        remoteStreamRef.current = remote // Store in ref
      }

      // 6. Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          console.log('🧊 New ICE candidate')
          try {
            await supabase.from('webrtc_signals').insert({
              call_id: callId,
              sender_id: userId,
              receiver_id: partnerId,
              signal_type: 'ice-candidate',
              signal_data: event.candidate.toJSON(),
            })
            console.log('📨 ICE candidate sent')
          } catch (error) {
            console.error('❌ Failed to send ICE candidate:', error)
          }
        }
      }

      // 7. Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', peerConnection.connectionState)
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true)
          console.log('✅ WebRTC connection established!')
        } else if (peerConnection.connectionState === 'failed' || 
                   peerConnection.connectionState === 'disconnected') {
          console.log('❌ Connection failed or disconnected')
          setIsConnected(false)
        }
      }

      // 8. Start polling for signals
      startPolling(callId, userId, peerConnection)
      console.log('🔄 Started polling for WebRTC signals')

      // 9. If initiator, create and send offer
      if (isInitiator) {
        console.log('📞 Creating offer...')
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        
        await supabase.from('webrtc_signals').insert({
          call_id: callId,
          sender_id: userId,
          receiver_id: partnerId,
          signal_type: 'offer',
          signal_data: offer,
        })
        console.log('📨 Offer sent')
      }

    } catch (error: any) {
      console.error('❌ Error initializing call:', error)
      
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        alert('Microphone permission denied. Please allow microphone access and refresh the page.')
      } else if (error.name === 'NotFoundError') {
        alert('No microphone found. Please connect a microphone and try again.')
      } else {
        alert('Failed to access microphone. Please check your browser settings.')
      }
      
      window.location.href = '/'
      return
    }
  }

  const startPolling = (callId: string, userId: string, peerConnection: RTCPeerConnection): void => {
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
  
    const signalId = signal.id || `${signal.signal_type}-${signal.sender_id}-${signal.created_at}`
    
    if (processedSignalsRef.current.has(signalId)) {
      console.log('⏭️ Skipping duplicate signal:', signal.signal_type)
      return
    }
    
    processedSignalsRef.current.add(signalId)
    
    if (processedSignalsRef.current.size > 50) {
      const oldestSignals = Array.from(processedSignalsRef.current).slice(0, 25)
      oldestSignals.forEach(sig => processedSignalsRef.current.delete(sig))
    }
  
    const signalData = signal.signal_data
    const signalType = signal.signal_type
  
    try {
      if (signalType === 'offer') {
        console.log('📥 Processing offer')
        
        if (peerConnection.remoteDescription) {
          console.log('⏭️ Already have remote description, skipping offer')
          return
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
        console.log('✅ Remote description set')
        
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
        
        if (peerConnection.remoteDescription) {
          console.log('⏭️ Already have remote description, skipping answer')
          return
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
        console.log('✅ Remote description set from answer')
        
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
    const stream = localStreamRef.current
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
      console.log(`🎤 Microphone ${!isMuted ? 'muted' : 'unmuted'}`)
    }
  }

  // MANUAL CLEANUP FUNCTION
  const cleanup = () => {
    console.log('🧹 Manual cleanup triggered')
    
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
      currentLocal.getTracks().forEach((track) => {
        track.stop()
        track.enabled = false
      })
      setLocalStream(null)
      localStreamRef.current = null
    }
    
    const currentRemote = remoteStreamRef.current
    if (currentRemote) {
      currentRemote.getTracks().forEach((track) => {
        track.stop()
      })
      setRemoteStream(null)
      remoteStreamRef.current = null
    }
    
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }
    
    processedSignalsRef.current.clear()
    iceCandidateQueueRef.current = []
    isInitializedRef.current = false
    lastProcessedSignalRef.current = null
    
    setIsConnected(false)
    setIsMuted(false)
  }
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      console.log('⏹️ Stopping signal polling')
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }
  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    toggleMute,
    cleanup,
    stopPolling
  }
}