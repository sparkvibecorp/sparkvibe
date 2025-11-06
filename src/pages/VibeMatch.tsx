console.log('VibeMatch file loaded');

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Button from '../components/Button';
import { Mic, MicOff, PhoneOff, User, Volume2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { LiveKitRoom, DisconnectButton } from '@livekit/components-react';
import '@livekit/components-styles';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL;

export default function VibeMatch() {
  const [status, setStatus] = useState<'searching' | 'connecting' | 'in-call'>('searching');
  const [progress, setProgress] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const navigate = useNavigate();

  // Resume AudioContext on user tap
  const resumeAudio = async () => {
    if (audioReady) return;
    try {
      setAudioReady(true);
    } catch (err) {
      console.error('Audio resume failed:', err);
    }
  };

  // Progress bar
  useEffect(() => {
    console.log('useEffect triggered', { status, progress });
    setProgress(0);
    setStatus('searching');

    const interval = setInterval(() => {
      setProgress(prev => {
        const next = Math.min(100, prev + 6);
        console.log('Progress:', next);
        return next;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  // Token fetch
  useEffect(() => {
    if (progress >= 100 && status === 'searching') {
      (async () => {
        setStatus('connecting');
        console.log('=== TOKEN FETCH START ===');

        try {
          const { data, error } = await supabase.functions.invoke('get-livekit-token', {
            body: { room: `vibe-${Date.now()}` },
          });

          console.log('Function response:', { data, error });

          if (error || !data?.token) {
            alert('Failed to connect. Try again.');
            navigate('/');
            return;
          }

          setToken(data.token);
          setTimeout(() => setStatus('in-call'), 800);
        } catch (err) {
          console.error('Network error:', err);
          alert('Connection failed');
          navigate('/');
        }
      })();
    }
  }, [progress, status, navigate]);

  // SEARCH / CONNECTING
  if (status !== 'in-call') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-gradient-to-b from-gray-900 to-gray-800">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="w-full max-w-sm bg-gray-900 rounded-3xl p-8 text-center shadow-neon-glow"
        >
          <h2 className="text-2xl font-bold mb-4 neon-text">
            {status === 'searching' ? 'Searching Vibes...' : 'Connecting...'}
          </h2>
          {status === 'searching' && (
            <motion.div
              animate={{ width: `${progress}%` }}
              className="h-2 bg-neon-gradient rounded-full mb-4"
            />
          )}
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cancel
          </Button>
        </motion.div>
      </div>
    );
  }

  // IN-CALL
  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={token!}
      connect={true}
      audio={true}
      video={false}
      className="min-h-screen bg-gray-900 flex flex-col"
    >
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {/* Tap to unmute overlay */}
        {!audioReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
            onClick={resumeAudio}
          >
            <div className="text-center text-white">
              <Volume2 className="w-12 h-12 mx-auto mb-4" />
              <p className="text-lg font-medium">Tap to unmute</p>
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
        </div>

        <p className="text-lg text-gray-300 mb-8">You’re connected – say hi!</p>

        {/* Controls */}
        <div className="flex gap-4 items-center">
          <button
            onClick={() => setIsMuted(prev => !prev)}
            className={`p-4 rounded-full transition-all ${
              isMuted
                ? 'bg-gray-700 text-gray-400'
                : 'bg-neon-gradient text-white shadow-neon-glow'
            }`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          <DisconnectButton className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-neon-glow">
            <PhoneOff className="w-6 h-6" />
          </DisconnectButton>

          <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white">
            <Volume2 className="w-6 h-6" />
          </button>
        </div>
      </div>
    </LiveKitRoom>
  );
}