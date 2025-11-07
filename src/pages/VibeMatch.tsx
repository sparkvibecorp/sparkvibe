import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import { PhoneOff, User, Volume2, Mic, MicOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { LiveKitRoom, useLocalParticipant, useTracks, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;

// Call UI
function CallInterface({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  const remoteTracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
  });

  const toggleMute = () => {
    if (localParticipant) {
      const enabled = localParticipant.isMicrophoneEnabled;
      localParticipant.setMicrophoneEnabled(!enabled);
      setIsMuted(enabled);
    }
  };

  const handleEndCall = async () => {
    try {
      await room.disconnect();
      onLeave();
    } catch (err) {
      console.error('Disconnect failed:', err);
      onLeave();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      {!audioReady && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setAudioReady(true)}
        >
          <div className="text-center text-white">
            <Volume2 className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg font-medium">Tap to enable audio</p>
          </div>
        </motion.div>
      )}

      <div className="relative w-32 h-32 mb-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="w-full h-full rounded-full bg-gradient-to-br from-neonPurple to-neonCyan flex items-center justify-center shadow-neon-glow"
        >
          <User className="w-16 h-16 text-white" />
        </motion.div>
        {remoteTracks.length > 0 && (
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="absolute -bottom-2 -right-2 w-8 h-8 bg-green-500 rounded-full border-2 border-gray-900"
          />
        )}
      </div>

      <p className="text-lg text-gray-300 mb-2">
        {remoteTracks.length > 0 ? "Connected! Say hi" : "Waiting for partner..."}
      </p>
      <p className="text-sm text-gray-500 mb-8">
        {remoteTracks.length} participant{remoteTracks.length !== 1 ? 's' : ''}
      </p>

      <div className="flex gap-4 items-center">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all ${
            isMuted ? 'bg-gray-700 hover:bg-gray-600' : 'bg-neonPurple hover:bg-neonMagenta'
          } text-white shadow-neon-glow`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={handleEndCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-neon-glow"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}

export default function VibeMatch() {
  const [status, setStatus] = useState<'searching' | 'connecting' | 'in-call' | 'error'>('searching');
  const [progress, setProgress] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const matchingRef = useRef(false);
  const cleanupRef = useRef(false);

  const params = new URLSearchParams(location.search);
  const vibe = params.get('vibe') || 'default';

  // === PROFILE GUARANTEE ===
  const upsertProfileIfMissing = async (uid: string) => {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      console.error('Profile check error:', error);
      return;
    }

    if (!data) {
      const { data: authUser } = await supabase.auth.getUser();
      const { error: insertError } = await supabase
        .from('users')
        .upsert(
          {
            id: uid,
            email: authUser.user?.email ?? '',
            full_name: authUser.user?.user_metadata.full_name ?? null,
            avatar_url: authUser.user?.user_metadata.avatar_url ?? null,
            status: 'online',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (insertError) {
        console.error('Failed to create profile:', insertError);
      } else {
        console.log('Created profile for', uid);
      }
    }
  };

  // Progress bar
  useEffect(() => {
    if (status !== 'searching') return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((p) => Math.min(100, p + 5));
    }, 300);
    return () => clearInterval(interval);
  }, [status]);

  // === MATCHING LOGIC ===
  useEffect(() => {
    if (!user?.id || matchingRef.current) return;
    matchingRef.current = true;

    const startMatching = async () => {
      try {
        console.log('Starting match...');

        // 1. Clean old queue
        await supabase.from('call_queue').delete().eq('user_id', user.id);

        // 2. Insert into queue
        const { data: queueEntry, error: insertError } = await supabase
          .from('call_queue')
          .insert({
            user_id: user.id,
            duration: 5,
            status: 'waiting',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .select()
          .single();

        if (insertError) throw insertError;
        console.log('Queue entry:', queueEntry.id);

        // === CONNECT TO CALL (MUST BE INSIDE) ===
        const connectToCall = async (callId: string) => {
          console.log('Connecting to call:', callId);
          setStatus('connecting');
          const room = `call-${callId}`;
          setRoomName(room);

          const { data, error } = await supabase.functions.invoke('get-livekit-token', {
            body: { room, userId: user.id },
          });

          if (error || !data?.token) {
            console.error('Token error:', error, data);
            setError('Failed to connect');
            setStatus('error');
            return;
          }

          setToken(data.token);
          setTimeout(() => setStatus('in-call'), 500);
        };

        // 3. REAL-TIME SUBSCRIPTION
        const channelName = `queue-${queueEntry.id}`;
        console.log('Subscribing to:', channelName);

        const channel = supabase
          .channel(channelName)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_queue',
              filter: `id=eq.${queueEntry.id}`,
            },
            (payload) => {
              console.log('Realtime UPDATE:', payload);
              const row = payload.new as any;
              if (row.status === 'matched' && row.call_id) {
                console.log('MATCHED! Call ID:', row.call_id);
                supabase.removeChannel(channel);
                connectToCall(row.call_id);
              }
            }
          )
          .subscribe((status, err) => {
            console.log('Realtime status:', status, 'Error:', err);
            if (status === 'SUBSCRIBED') {
              console.log('SUBSCRIBED — SLOT WILL ACTIVATE');
            }
            if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
              console.error('Realtime failed:', err);
            }
          });

        // 4. Try to find partner
        const tryFindPartner = async () => {
          console.log('Trying to find partner...');
          const { data: partners, error: partnerError } = await supabase
            .from('call_queue')
            .select('*')
            .eq('status', 'waiting')
            .neq('user_id', user.id)
            .limit(1);

          if (partnerError) {
            console.error('Partner query error:', partnerError);
            return;
          }
          if (!partners?.[0]) {
            console.log('No partner found');
            return;
          }

          const partner = partners[0];
          if (user.id > partner.user_id) {
            console.log('Skipping — partner has lower ID');
            return;
          }

          console.log('Creating call with partner:', partner.user_id);
          const { data: call, error: callError } = await supabase
            .from('calls')
            .insert({
              user1_id: user.id,
              user2_id: partner.user_id,
              planned_duration: 5,
              status: 'active',
              started_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (callError) {
            console.error('Call insert error:', callError);
            return;
          }

          console.log('Call created:', call.id);

          // UPDATE BOTH WITH call_id
          const [update1, update2] = await Promise.all([
            supabase.from('call_queue').update({ status: 'matched', call_id: call.id }).eq('id', queueEntry.id),
            supabase.from('call_queue').update({ status: 'matched', call_id: call.id }).eq('id', partner.id),
          ]);

          console.log('Queue updated:', update1.error, update2.error);

          supabase.removeChannel(channel);
          await connectToCall(call.id);
        };

        tryFindPartner();
      } catch (err: any) {
        console.error('Match failed:', err);
        setError('Failed to match');
        setStatus('error');
      }
    };

    startMatching();
  }, [user?.id, vibe]);

  // === LEAVE CALL ===
  const handleLeave = async () => {
    cleanupRef.current = true;

    if (user?.id) {
      await supabase.from('call_queue').delete().eq('user_id', user.id);
      await supabase.from('users').update({ status: 'online', current_call_id: null }).eq('id', user.id);
    }

    setToken(null);
    setRoomName(null);
    setStatus('searching');
    navigate('/onboarding');
  };

  // === RENDER ===
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-800">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-full max-w-sm bg-gray-900 rounded-3xl p-8 text-center shadow-neon-glow">
          <h2 className="text-2xl font-bold mb-4 text-red-400">Connection Failed</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <Button variant="primary" onClick={() => navigate('/onboarding')}>Try Again</Button>
        </motion.div>
      </div>
    );
  }

  if (status !== 'in-call') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-b from-gray-900 to-gray-800">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-full max-w-sm bg-gray-900 rounded-3xl p-8 text-center shadow-neon-glow">
          <h2 className="text-2xl font-bold mb-4 neon-text">
            {status === 'searching' ? 'Finding your vibe match...' : 'Connecting...'}
          </h2>
          {status === 'searching' && (
            <>
              <motion.div animate={{ width: `${progress}%` }} className="h-2 bg-neon-gradient rounded-full mb-4" />
              <p className="text-sm text-gray-400 mb-6">Looking for someone with the same energy</p>
            </>
          )}
          <Button variant="secondary" onClick={handleLeave}>Cancel</Button>
        </motion.div>
      </div>
    );
  }

  if (!token || !roomName) return null;

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token}
      connect={true}
      audio={true}
      video={false}
      className="min-h-screen bg-gray-900"
      onDisconnected={handleLeave}
    >
      <CallInterface onLeave={handleLeave} />
    </LiveKitRoom>
  );
}