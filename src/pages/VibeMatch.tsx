import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import { PhoneOff, User, Volume2, Mic, MicOff } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { LiveKitRoom, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;

// Inner component that has access to LiveKit hooks
function CallInterface({ onLeave }: { onLeave: () => void }) {
  const { localParticipant } = useLocalParticipant();
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);

  // Get remote audio tracks
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

  const resumeAudio = () => {
    setAudioReady(true);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
      {/* TAP TO UNMUTE OVERLAY */}
      {!audioReady && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={resumeAudio}
        >
          <div className="text-center text-white">
            <Volume2 className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg font-medium">Tap to enable audio</p>
          </div>
        </motion.div>
      )}

      {/* Avatar */}
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
        {remoteTracks.length} participant{remoteTracks.length !== 1 ? 's' : ''} in call
      </p>

      {/* Controls */}
      <div className="flex gap-4 items-center">
        <button
          onClick={toggleMute}
          className={`p-4 rounded-full transition-all ${
            isMuted 
              ? 'bg-gray-700 hover:bg-gray-600' 
              : 'bg-neonPurple hover:bg-neonMagenta'
          } text-white shadow-neon-glow`}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={onLeave}
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

  // === 2. PROFILE GUARANTEE HELPER ===
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
            // Do NOT include full_name or avatar_url unless you added them
            status: 'online',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
  
      if (insertError) {
        console.error('Failed to create missing profile:', insertError);
      } else {
        console.log('Created missing users row for', uid);
      }
    }
  };

  // Progress bar animation
  useEffect(() => {
    if (status !== 'searching') return;

    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => Math.min(100, prev + 5));
    }, 300);

    return () => clearInterval(interval);
  }, [status]);

  // Matching logic
  useEffect(() => {
    if (!user?.id || matchingRef.current) return;
    matchingRef.current = true;

    const findMatch = async () => {
      try {
        console.log('Starting match search for vibe:', vibe);

        // === 1. GUARD: user.id must exist ===
        if (!user?.id) {
          console.error('No user ID – cannot start matching');
          setError('Authentication required. Please sign in again.');
          setStatus('error');
          return;
        }

        // === 2. ENSURE PROFILE EXISTS BEFORE QUEUE INSERT ===
        await upsertProfileIfMissing(user.id);

        // Clean up old queue entries for this user
        await supabase
          .from('call_queue')
          .delete()
          .eq('user_id', user.id);

        // Add user to queue
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const { data: queueEntry, error: queueError } = await supabase
          .from('call_queue')
          .insert({
            user_id: user.id,
            duration: 5,
            status: 'waiting',
            expires_at: expiresAt,
          })
          .select()
          .single();

        if (queueError) throw queueError;
        console.log('Added to queue:', queueEntry.id);

        // Update user status
        await supabase
          .from('users')
          .update({ status: 'in_queue' })
          .eq('id', user.id);

        // Poll for matches
        const pollInterval = setInterval(async () => {
          if (cleanupRef.current) {
            clearInterval(pollInterval);
            return;
          }

          try {
            // Look for waiting users with same vibe
            const { data: waitingUsers } = await supabase
              .from('call_queue')
              .select('*')
              .eq('status', 'waiting')
              .eq('duration', 5)
              .neq('user_id', user.id)
              .order('created_at', { ascending: true })
              .limit(1);

            if (!waitingUsers || waitingUsers.length === 0) {
              // Check if someone matched with us
              const { data: matched } = await supabase
                .from('call_queue')
                .select('*, calls!inner(*)')
                .eq('id', queueEntry.id)
                .eq('status', 'matched')
                .maybeSingle();

              if (matched) {
                console.log('Found existing match!');
                clearInterval(pollInterval);
                await connectToCall(matched.calls.id);
              }
              return;
            }

            const partner = waitingUsers[0];
            const shouldCreateCall = user.id < partner.user_id;

            if (!shouldCreateCall) {
              console.log('Waiting for partner to create call...');
              return;
            }

            // Create the call
            console.log('Creating call with partner:', partner.user_id);
            const { data: newCall, error: callError } = await supabase
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

            if (callError) throw callError;

            // Update queue entries
            await Promise.all([
              supabase
                .from('call_queue')
                .update({ status: 'matched', matched_with: partner.user_id })
                .eq('id', queueEntry.id),
              supabase
                .from('call_queue')
                .update({ status: 'matched', matched_with: user.id })
                .eq('id', partner.id),
            ]);

            console.log('Match created! Call ID:', newCall.id);
            clearInterval(pollInterval);
            await connectToCall(newCall.id);
          } catch (err) {
            console.error('Polling error:', err);
          }
        }, 2000);

        // Cleanup on unmount
        return () => {
          cleanupRef.current = true;
          clearInterval(pollInterval);
        };
      } catch (err) {
        console.error('Match error:', err);
        setError('Failed to find a match. Please try again.');
        setStatus('error');
      }
    };

    const connectToCall = async (callId: string) => {
      try {
        setStatus('connecting');
        console.log('Connecting to call:', callId);

        const room = `call-${callId}`;
        setRoomName(room);

        const { data, error } = await supabase.functions.invoke('get-livekit-token', {
          body: { room, userId: user.id },
        });

        if (error || !data?.token) {
          throw new Error('Failed to get token');
        }

        setToken(data.token);
        setTimeout(() => setStatus('in-call'), 500);
      } catch (err) {
        console.error('Connection error:', err);
        setError('Failed to connect. Please try again.');
        setStatus('error');
      }
    };

    findMatch();
  }, [user?.id, vibe]);

  const handleLeave = async () => {
    cleanupRef.current = true;

    if (user?.id) {
      await supabase
        .from('call_queue')
        .delete()
        .eq('user_id', user.id);

      await supabase
        .from('users')
        .update({ status: 'online', current_call_id: null })
        .eq('id', user.id);
    }

    navigate('/onboarding');
  };

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-b from-gray-900 to-gray-800">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-full max-w-sm bg-gray-900 rounded-3xl p-8 text-center shadow-neon-glow"
        >
          <h2 className="text-2xl font-bold mb-4 text-red-400">Connection Failed</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <Button variant="primary" onClick={() => navigate('/onboarding')}>
            Try Again
          </Button>
        </motion.div>
      </div>
    );
  }

  // Searching/Connecting state
  if (status !== 'in-call') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-b from-gray-900 to-gray-800">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-full max-w-sm bg-gray-900 rounded-3xl p-8 text-center shadow-neon-glow"
        >
          <h2 className="text-2xl font-bold mb-4 neon-text">
            {status === 'searching' ? 'Finding your vibe match...' : 'Connecting...'}
          </h2>
          {status === 'searching' && (
            <>
              <motion.div
                animate={{ width: `${progress}%` }}
                className="h-2 bg-neon-gradient rounded-full mb-4"
              />
              <p className="text-sm text-gray-400 mb-6">
                Looking for someone with the same energy
              </p>
            </>
          )}
          <Button variant="secondary" onClick={handleLeave}>
            Cancel
          </Button>
        </motion.div>
      </div>
    );
  }

  // In-call state
  if (!token || !roomName) {
    return null;
  }

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