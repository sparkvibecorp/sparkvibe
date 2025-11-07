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

  // END CALL BUTTON — NOW WORKS
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

        {/* END CALL — NOW WORKS */}
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
  
    const start = async () => {
      try {
        await upsertProfileIfMissing(user.id);
        await supabase.from('call_queue').delete().eq('user_id', user.id);
  
        const { data: queueEntry } = await supabase
          .from('call_queue')
          .insert({
            user_id: user.id,
            duration: 5,
            status: 'waiting',
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          })
          .select()
          .single();
  
        console.log('In queue:', queueEntry.id);
  
        // === REAL-TIME SUBSCRIPTION ===
        const channel = supabase
          .channel(`queue-${queueEntry.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'call_queue',
              filter: `id=eq.${queueEntry.id}`,
            },
            (payload) => {
              const row = payload.new as any;
              if (row.status === 'matched' && row.call_id) {
                console.log('MATCH via Realtime!', row.call_id);
                supabase.removeChannel(channel);
                connectToCall(row.call_id);
              }
            }
          )
          .subscribe((status, err) => {
            console.log('Realtime status:', status, err);
            if (status === 'SUBSCRIBED') {
              console.log('SLOT ACTIVATED');
            }
          });
  
        // === FALLBACK: Try to create match ===
        const tryMatch = async () => {
          const { data: partners } = await supabase
            .from('call_queue')
            .select('*')
            .eq('status', 'waiting')
            .neq('user_id', user.id)
            .limit(1);
  
          if (!partners?.[0]) return;
          if (user.id > partners[0].user_id) return;
  
          const { data: call } = await supabase
            .from('calls')
            .insert({
              user1_id: user.id,
              user2_id: partners[0].user_id,
              planned_duration: 5,
              status: 'active',
              started_at: new Date().toISOString(),
            })
            .select()
            .single();
  
          await Promise.all([
            supabase.from('call_queue').update({ status: 'matched', call_id: call.id }).eq('id', queueEntry.id),
            supabase.from('call_queue').update({ status: 'matched', call_id: call.id }).eq('id', partners[0].id),
          ]);
  
          console.log('CALL CREATED:', call.id);
          supabase.removeChannel(channel);
          await connectToCall(call.id);
        };
  
        tryMatch();
      } catch (err) {
        console.error('Match error:', err);
        setError('Failed to match');
        setStatus('error');
      }
    };
  
    start();
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