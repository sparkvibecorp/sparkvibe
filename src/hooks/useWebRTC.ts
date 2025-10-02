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

  useEffect(() => {
    if (!callId || !userId || !partnerId) return

    initializeCall()

    return () => {
      cleanup()
    }
  }, [callId, userId, partnerId])

  const initializeCall = async () => {
    if (!callId || !userId || !partnerId) return
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      })
      setLocalStream(stream)

      const { data: call } = await supabase
        .from('calls')
        .select('user1_id')
        .eq('id', callId)
        .single()

// @ts-ignore - Supabase type issue
const isInitiator = call?.user1_id === userId

      const configuration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ]
      }

      const peerConnection = new RTCPeerConnection(configuration)
      peerConnectionRef.current = peerConnection

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream)
      })

      peerConnection.ontrack = (event) => {
        setRemoteStream(event.streams[0])
        setIsConnected(true)
      }

      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          // @ts-ignore - Supabase type issue
          await supabase.from('webrtc_signals').insert({
            call_id: callId,
            sender_id: userId,
            receiver_id: partnerId,
            signal_type: 'ice-candidate',
            signal_data: event.candidate,
          })
        }
      }

      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'connected') {
          setIsConnected(true)
        }
      }

      const channel = supabase
        .channel(`call-${callId}`)
        .on(
          'postgres_changes' as any,
          {
            event: 'INSERT',
            schema: 'public',
            table: 'webrtc_signals',
            filter: `receiver_id=eq.${userId}`,
          },
          async (payload: any) => {
            const signal = payload.new?.signal_data
            const signalType = payload.new?.signal_type

            if (!signal || !signalType) return

            if (signalType === 'offer') {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
              const answer = await peerConnection.createAnswer()
              await peerConnection.setLocalDescription(answer)
              
              // @ts-ignore - Supabase type issue
              await supabase.from('webrtc_signals').insert({
                call_id: callId,
                sender_id: userId,
                receiver_id: partnerId,
                signal_type: 'answer',
                signal_data: answer,
              })
            } else if (signalType === 'answer') {
              await peerConnection.setRemoteDescription(new RTCSessionDescription(signal))
            } else if (signalType === 'ice-candidate') {
              await peerConnection.addIceCandidate(new RTCIceCandidate(signal))
            }
          }
        )
        .subscribe()

      channelRef.current = channel

      if (isInitiator) {
        const offer = await peerConnection.createOffer()
        await peerConnection.setLocalDescription(offer)
        
        // @ts-ignore - Supabase type issue
        await supabase.from('webrtc_signals').insert({
          call_id: callId,
          sender_id: userId,
          receiver_id: partnerId,
          signal_type: 'offer',
          signal_data: offer,
        })
      }

      const { data: existingSignals } = await supabase
        .from('webrtc_signals')
        .select('*')
        .eq('call_id', callId)
        .eq('receiver_id', userId)
        .eq('is_read', false)

      if (existingSignals && existingSignals.length > 0) {
        for (const signal of existingSignals) {
          const signalData = (signal as any).signal_data
          const signalType = (signal as any).signal_type

          if (signalType === 'offer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
            const answer = await peerConnection.createAnswer()
            await peerConnection.setLocalDescription(answer)
            
            // @ts-ignore - Supabase type issue
            await supabase.from('webrtc_signals').insert({
              call_id: callId,
              sender_id: userId,
              receiver_id: partnerId,
              signal_type: 'answer',
              signal_data: answer,
            })
          } else if (signalType === 'answer') {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(signalData))
          } else if (signalType === 'ice-candidate') {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signalData))
          }
        }
      }
    } catch (error) {
      console.error('Error initializing call:', error)
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

  const cleanup = () => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
    }
    if (channelRef.current) {
      channelRef.current.unsubscribe()
    }
  }

  return {
    localStream,
    remoteStream,
    isConnected,
    isMuted,
    toggleMute,
    cleanup,
  }
}