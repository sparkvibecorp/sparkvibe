import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Sparkles, Globe, Zap, Heart, Users, Clock, Star } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useMatching } from './hooks/useMatching';
import { useWebRTC } from './hooks/useWebRTC';
import { useEmotionAnalysis } from './hooks/useEmotionAnalysis';
import { useLiveStats } from './hooks/useLiveStats';
import { supabase } from './lib/supabase';
import { formatTime, emotionColors, emotionWaves, getDifficultyColor, getDifficultyTextColor } from './utils/helpers';
import type { VulnerabilityQuestion } from './types';

const App = () => {
  // Clear stuck auth on load
  useEffect(() => {
    const clearStuckAuth = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('clearauth') === 'true') {
        console.log('Clearing auth state...');
        await supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = window.location.origin;
      }
    };
    clearStuckAuth();
  }, []);
  
  // Auth
  const { user, loading: authLoading, error: authError, updatePresence } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  // App state
  const [screen, setScreen] = useState<'landing' | 'setup' | 'waiting' | 'call' | 'rating'>('landing');
  const [duration, setDuration] = useState<number>(10);
  const [callTimer, setCallTimer] = useState<number>(0);
  const [rating, setRating] = useState<number>(0);

  // Matching
  const { matchedCall, startMatching, cancelMatching } = useMatching(user?.id, duration);

  // WebRTC
  const { localStream, remoteStream, isConnected, isMuted, toggleMute, cleanup, stopPolling } = useWebRTC(
    matchedCall?.id,
    user?.id,
    matchedCall?.user1_id === user?.id ? matchedCall?.user2_id : matchedCall?.user1_id
  );

  // Audio refs
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Emotional Echo
  const userEmotion = useEmotionAnalysis(localStream);
  const partnerEmotion = useEmotionAnalysis(remoteStream);
  const [isEmotionalSync, setIsEmotionalSync] = useState<boolean>(false);
  const [syncCount, setSyncCount] = useState<number>(0);

  // Vulnerability Roulette
  const [showRoulette, setShowRoulette] = useState<boolean>(false);
  const [currentQuestion, setCurrentQuestion] = useState<VulnerabilityQuestion | null>(null);
  const [questions, setQuestions] = useState<VulnerabilityQuestion[]>([]);

  // Satellite Call
  const [distance, setDistance] = useState<number>(0);
  const [partnerLocation, setPartnerLocation] = useState<string>('Unknown');

  // Live stats
  const stats = useLiveStats();
  
  // Load questions
  const loadQuestions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vulnerability_questions')
        .select('*')
        .eq('is_active', true);
  
      if (error) {
        console.error('Failed to load vulnerability questions', error);
        return;
      }
  
      if (data) setQuestions(data as VulnerabilityQuestion[]);
    } catch (err) {
      console.error('Error loading questions', err);
    }
  }, []);
  
  // End call function
  const endCall = useCallback(async () => {
    try {
      console.log('📞 Ending call...', { callId: matchedCall?.id, timer: callTimer });
      
      if (screen !== 'call') {
        console.log('⏭️ Already ending/ended call');
        return;
      }
      
      stopPolling();
      setScreen('rating');
      
      if (matchedCall?.id && user?.id) {
        await supabase
          .from('calls')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            duration_seconds: callTimer,
          })
          .eq('id', matchedCall.id);
        
        await supabase
          .from('users')
          .update({ 
            status: 'online',
            current_call_id: null 
          })
          .eq('id', user.id);
        
        console.log('✅ Call ended successfully');
      }
    } catch (err) {
      console.error('❌ Error ending call:', err);
      setScreen('rating');
    }
  }, [matchedCall?.id, callTimer, screen, user?.id, stopPolling]);
  
  // Monitor partner disconnect
  useEffect(() => {
    if (!matchedCall?.id || screen !== 'call') return;

    const callId = matchedCall.id;
    console.log('👂 Monitoring partner disconnect for call:', callId);

    const channel = supabase
      .channel(`call-status-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`,
        },
        (payload: any) => {
          console.log('📨 Call status changed:', payload.new.status);
          
          if (payload.new.status === 'ended') {
            console.log('👋 Partner ended call or call completed');
            stopPolling();
            setScreen('rating');
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🧹 Unsubscribing from call status');
      channel.unsubscribe();
    };
  }, [matchedCall?.id]);

  // Auth loading timeout
  useEffect(() => {
    if (authLoading) {
      const timeout = setTimeout(() => {
        console.log('⏰ Auth loading timeout - forcing reload');
        alert('Connection is taking too long. The page will reload.');
        window.location.reload();
      }, 15000);

      return () => clearTimeout(timeout);
    }
  }, [authLoading]);
  
  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (matchedCall?.id && screen === 'call') {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/calls?id=eq.${matchedCall.id}`;
        const payload = JSON.stringify({
          status: 'ended',
          ended_at: new Date().toISOString()
        });
        
        navigator.sendBeacon(url, new Blob([payload], {
          type: 'application/json'
        }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [matchedCall?.id, screen]);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);
  
  // Auto-end when timer reaches duration
  useEffect(() => {
    if (callTimer >= duration * 60 && screen === 'call') {
      endCall();
    }
  }, [callTimer, duration, screen, endCall]);

  // Load questions once
  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  // Update presence
  useEffect(() => {
    if (user) {
      updatePresence(screen);
      const interval = setInterval(() => updatePresence(screen), 30000);
      return () => clearInterval(interval);
    }
  }, [user, screen, updatePresence]);

  // Handle matching completion
  useEffect(() => {
    if (matchedCall && screen === 'waiting') {
      setScreen('call');
    }
  }, [matchedCall, screen]);
  
  // Attach local stream to audio element
  useEffect(() => {
    if (localAudioRef.current && localStream) {
      localAudioRef.current.srcObject = localStream;
      console.log('🎵 Local stream attached to audio element');
    }
  }, [localStream]);

  // Attach remote stream to audio element
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.volume = 1.0;
      console.log('🎵 Remote stream attached to audio element');
      
      if (remoteStream) {
        remoteStream.getAudioTracks().forEach(track => {
          console.log('Remote audio track:', {
            id: track.id,
            enabled: track.enabled,
            muted: track.muted,
            readyState: track.readyState
          });
        });
      }
    }
  }, [remoteStream]);

  // Emotional sync detection
  useEffect(() => {
    if (screen === 'call' && userEmotion === partnerEmotion && userEmotion !== 'calm') {
      setIsEmotionalSync(true);
      setSyncCount(prev => prev + 1);

      if (matchedCall?.id) {
        supabase.rpc('track_emotional_sync', {
          p_call_id: matchedCall.id,
          p_user1_emotion: userEmotion,
          p_user2_emotion: partnerEmotion,
          p_sync_strength: 1.0,
          p_seconds_into_call: callTimer,
        }).then(({ error }) => {
          if (error) console.error('track_emotional_sync rpc failed', error);
        });
      }

      const t = setTimeout(() => setIsEmotionalSync(false), 3000);
      return () => clearTimeout(t);
    }
  }, [userEmotion, partnerEmotion, screen, matchedCall?.id, callTimer]);

  // Call timer
  useEffect(() => {
    if (screen === 'call' && isConnected) {
      const timer = setInterval(() => {
        setCallTimer(prev => {
          if (prev >= duration * 60) return prev;
          return prev + 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [screen, isConnected, duration]);
  
  // Show roulette after 2 minutes
  useEffect(() => {
    if (callTimer >= 120 && screen === 'call') {
      setShowRoulette(true);
    }
  }, [callTimer, screen]);

  // Calculate distance
  useEffect(() => {
    if (matchedCall) {
      setDistance(Math.floor(Math.random() * 15000) + 1000);
      setPartnerLocation('Unknown Location');
    }
  }, [matchedCall]);

  // Listen for partner's questions
  useEffect(() => {
    if (!matchedCall?.id || !user?.id) return;

    const channel = supabase
      .channel(`call-questions-${matchedCall.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_questions',
          filter: `call_id=eq.${matchedCall.id}`,
        },
        async (payload: any) => {
          if (payload.new.shown_by_user_id !== user.id) {
            const { data: questionData } = await supabase
              .from('vulnerability_questions')
              .select('*')
              .eq('id', payload.new.question_id)
              .single();
            
            if (questionData) {
              setCurrentQuestion(questionData);
              setTimeout(() => setCurrentQuestion(null), 15000);
            }
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [matchedCall?.id, user?.id]);

  // Emergency cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        console.log('🧹 Emergency cleanup: stopping local stream');
        localStream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
          track.enabled = false;
        });
      }
      if (remoteStream) {
        console.log('🧹 Emergency cleanup: stopping remote stream');
        remoteStream.getTracks().forEach((track: MediaStreamTrack) => {
          track.stop();
        });
      }
    };
  }, [localStream, remoteStream]);
  
  const handleStartMatching = () => {
    setScreen('waiting');
    startMatching();
  };

  const spinRoulette = async () => {
    const weights = [0.5, 0.3, 0.2];
    const random = Math.random();
    let difficulty: string;
  
    if (random < weights[0]) difficulty = 'light';
    else if (random < weights[0] + weights[1]) difficulty = 'medium';
    else difficulty = 'deep';
  
    const filtered = questions.filter(q => q.difficulty === difficulty);
    if (filtered.length === 0) {
      console.log('⚠️ No questions found for difficulty:', difficulty);
      return;
    }

    const question = filtered[Math.floor(Math.random() * filtered.length)];
  
    if (question && matchedCall?.id && user?.id) {
      try {
        await supabase.from('call_questions').insert({
          call_id: matchedCall.id,
          question_id: question.id,
          shown_by_user_id: user.id,
        });
    
        setCurrentQuestion(question);
        setTimeout(() => setCurrentQuestion(null), 15000);
      } catch (error) {
        console.error('❌ Error inserting question:', error);
      }
    }
  };

  const submitRating = async () => {
    try {
      console.log('⭐ Submitting rating:', rating);
      
      if (matchedCall?.id && user?.id && rating > 0) {
        const isUser1 = matchedCall.user1_id === user.id;
        await supabase
          .from('calls')
          .update(isUser1 ? { rating_user1: rating } : { rating_user2: rating })
          .eq('id', matchedCall.id);
        
        console.log('✅ Rating submitted');
      }
    } catch (err) {
      console.error('❌ Failed to submit rating', err);
    }

    console.log('🧹 Cleaning up media streams...');
    cleanup();

    if (user?.id) {
      await supabase.from('call_queue').delete().eq('user_id', user.id);
      await supabase.from('users').update({ 
        status: 'online',
        current_call_id: null 
      }).eq('id', user.id);
    }

    console.log('🔄 Resetting state...');
    setCallTimer(0);
    setSyncCount(0);
    setShowRoulette(false);
    setRating(0);
    setCurrentQuestion(null);
    setDistance(0);
    setPartnerLocation('Unknown');
    setScreen('landing');
    
    setTimeout(() => {
      window.location.reload();
    }, 500);
    
    console.log('✅ Reset complete');
  };
  
  // Offline banner
  const OfflineBanner = !isOnline ? (
    <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50">
      ⚠️ You're offline. Reconnect to continue.
    </div>
  ) : null;
  
  // Loading screen
  if (authLoading) {
    return (
      <>
        {OfflineBanner}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="text-center">
            {authError ? (
              <div className="max-w-md">
                <div className="bg-red-500/20 border-2 border-red-400 rounded-2xl p-6 mb-4">
                  <h2 className="text-white text-xl font-bold mb-2">Connection Error</h2>
                  <p className="text-red-200 text-sm mb-4">{authError}</p>
                </div>
                <button
                  onClick={() => window.location.reload()}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-xl transition-all"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div>
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 bg-purple-500/30 rounded-full animate-ping"></div>
                  <div className="absolute inset-0 bg-purple-500/50 rounded-full animate-pulse"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-white animate-pulse" />
                  </div>
                </div>
                <h2 className="text-white text-2xl font-bold mb-2">Setting things up...</h2>
                <p className="text-purple-200">This should only take a moment</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }
  
  // Landing Screen
  if (screen === 'landing') {
    return (
      <>
        {OfflineBanner}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full">
            <div className="text-center mb-12">
              <div className="mb-6">
                <div className="inline-block p-4 bg-purple-500/20 rounded-full mb-4">
                  <Sparkles className="w-12 h-12 text-purple-300" />
                </div>
              </div>
              <h1 className="text-6xl font-bold text-white mb-4">SparkVibe</h1>
              <p className="text-2xl text-purple-200 mb-2">Talk to a stranger.</p>
              <p className="text-2xl text-purple-200">Feel something real.</p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Zap className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-white text-sm font-medium">Emotional Echo</p>
                <p className="text-purple-200 text-xs">See your connection</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Heart className="w-8 h-8 text-pink-400 mx-auto mb-2" />
                <p className="text-white text-sm font-medium">Deep Questions</p>
                <p className="text-purple-200 text-xs">Go beyond small talk</p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 text-center">
                <Globe className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <p className="text-white text-sm font-medium">Global Reach</p>
                <p className="text-purple-200 text-xs">Connect worldwide</p>
              </div>
            </div>

            <button
              onClick={() => setScreen('setup')}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xl font-bold py-6 rounded-2xl hover:from-purple-600 hover:to-pink-600 transition-all duration-300 shadow-lg hover:shadow-xl mb-4"
            >
              Start Talking
            </button>

            <div className="text-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-purple-200 text-sm">{stats.active_users} people talking right now</span>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
  
  // Setup Screen
  if (screen === 'setup') {
    return (
      <>
        {OfflineBanner}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white/10 backdrop-blur-sm rounded-3xl p-8">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Choose call duration</h2>

            <div className="space-y-3 mb-8">
              {[3, 10, 20].map((mins) => (
                <button
                  key={mins}
                  onClick={() => setDuration(mins)}
                  className={`w-full p-4 rounded-xl font-semibold transition-all ${
                    duration === mins ? 'bg-purple-500 text-white shadow-lg scale-105' : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  {mins} minutes
                </button>
              ))}
            </div>

            <button
              onClick={handleStartMatching}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-4 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              Find Someone
            </button>

            <button onClick={() => setScreen('landing')} className="w-full mt-3 text-purple-200 hover:text-white transition-colors">
              Back
            </button>
          </div>
        </div>
      </>
    );
  }

  // Waiting Screen
  if (screen === 'waiting') {
    return (
      <>
        {OfflineBanner}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="text-center">
            <div className="relative w-32 h-32 mx-auto mb-8">
              <div className="absolute inset-0 bg-purple-500/30 rounded-full animate-ping"></div>
              <div className="absolute inset-0 bg-purple-500/50 rounded-full animate-pulse"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Users className="w-12 h-12 text-white" />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-white mb-2">Finding someone...</h2>
            <p className="text-purple-200 mb-4">This usually takes less than 30 seconds</p>

            <button
              onClick={() => {
                cancelMatching();
                setScreen('setup');
              }}
              className="text-purple-300 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </>
    );
  }
  
  // Call Screen
  if (screen === 'call') {
    if (!matchedCall?.id) {
      setScreen('landing');
      return null;
    }

    return (
      <>
        {OfflineBanner}
        <audio ref={localAudioRef} autoPlay muted playsInline />
        <audio ref={remoteAudioRef} autoPlay playsInline />

        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            {isEmotionalSync && (
              <div className="mb-4 bg-yellow-500/20 border-2 border-yellow-400 rounded-2xl p-4 text-center animate-pulse">
                <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <p className="text-yellow-200 font-bold">✨ EMOTIONAL SYNC ✨</p>
                <p className="text-yellow-100 text-sm">Your energies are aligned</p>
              </div>
            )}

            {currentQuestion && (
              <div className={`mb-4 rounded-2xl p-6 text-center border-2 ${getDifficultyColor(currentQuestion.difficulty)}`}>
                <p className={`text-xs font-bold mb-2 uppercase ${getDifficultyTextColor(currentQuestion.difficulty)}`}>{currentQuestion.difficulty} question</p>
                <p className="text-white text-lg font-medium">{currentQuestion.question}</p>
              </div>
            )}

            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 mb-4">
              {!isConnected && (
                <div className="mb-4 bg-yellow-500/20 border-2 border-yellow-400 rounded-2xl p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse" />
                    <p className="text-yellow-200 font-bold">Connecting to partner...</p>
                  </div>
                  <p className="text-yellow-100 text-sm">
                    {callTimer > 10 ? 'Having trouble connecting?' : 'This usually takes a few seconds'}
                  </p>
                  {callTimer > 15 && (
                    <button
                      onClick={() => {
                        if (confirm('Connection is taking too long. Try again?')) {
                          window.location.reload();
                        }
                      }}
                      className="mt-2 text-yellow-300 underline text-sm hover:text-white"
                    >
                      Restart connection
                    </button>
                  )}
                </div>
              )}

              {isConnected && (
                <div className="mb-4 bg-green-500/20 border-2 border-green-400 rounded-2xl p-3 text-center">
                  <p className="text-green-200 font-bold flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    Connected - Start talking!
                  </p>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-purple-200 text-sm font-medium mb-3 text-center flex items-center justify-center gap-2">
                  <Zap className="w-4 h-4" />
                  Emotional Echo
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-white text-xs w-12">You</span>
                    <div className="flex-1 h-12 bg-slate-800/50 rounded-lg flex items-center justify-center overflow-hidden">
                      <div className={`h-full w-full ${emotionColors[userEmotion]} opacity-70 flex items-center justify-center text-white font-mono text-2xl animate-pulse`}>
                        {emotionWaves[userEmotion]}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${emotionColors[userEmotion]} text-white`}>
                      {userEmotion}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-white text-xs w-12">Them</span>
                    <div className="flex-1 h-12 bg-slate-800/50 rounded-lg flex items-center justify-center overflow-hidden">
                      <div className={`h-full w-full ${emotionColors[partnerEmotion]} opacity-70 flex items-center justify-center text-white font-mono text-2xl animate-pulse`}>
                        {emotionWaves[partnerEmotion]}
                      </div>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded ${emotionColors[partnerEmotion]} text-white`}>
                      {partnerEmotion}
                    </span>
                  </div>
                </div>

                {syncCount > 0 && (
                  <p className="text-center text-yellow-300 text-xs mt-3">
                    ✨ {syncCount} sync moment{syncCount > 1 ? 's' : ''} so far
                  </p>
                )}
              </div>

              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-6 py-3">
                  <Clock className="w-5 h-5 text-purple-300" />
                  <span className="text-white text-2xl font-bold font-mono">{formatTime(callTimer)}</span>
                  <span className="text-purple-300 text-sm">/ {duration}:00</span>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Globe className="w-5 h-5 text-blue-400" />
                  <span className="text-blue-200 font-semibold">Satellite Call</span>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-white text-lg font-bold">{distance.toLocaleString()} km apart</p>
                  <p className="text-blue-200 text-sm">Dubai, UAE ← → {partnerLocation}</p>
                  <p className="text-blue-300 text-xs">Your voices traveled at the speed of light</p>
                </div>
              </div>

              {showRoulette && !currentQuestion && (
                <button
                  onClick={spinRoulette}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all mb-4 flex items-center justify-center gap-2"
                >
                  <Heart className="w-5 h-5" />
                  Spin a Question
                </button>
              )}

              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={toggleMute}
                  className={`p-4 rounded-full transition-all ${
                    isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'
                  }`}
                >
                  {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
                </button>

                <button 
                  onClick={endCall} 
                  className="p-6 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg"
                >
                  <PhoneOff className="w-8 h-8 text-white" />
                </button>
              </div>
            </div>

            <div className="text-center text-purple-200 text-xs">
              <p>Press the phone icon to end call anytime</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Rating Screen
  if (screen === 'rating') {
    return (
      <>
        {OfflineBanner}
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white/10 backdrop-blur-sm rounded-3xl p-8">
            <div className="text-center mb-6">
              <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
                <Phone className="w-12 h-12 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Call ended</h2>
              <p className="text-purple-200">You talked for {formatTime(callTimer)}</p>
            </div>

            <div className="bg-white/5 rounded-xl p-4 mb-6 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-200">Distance</span>
                <span className="text-white font-semibold">{distance.toLocaleString()} km</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-200">Emotional syncs</span>
                <span className="text-yellow-400 font-semibold">✨ {syncCount}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-purple-200">Location</span>
                <span className="text-white font-semibold">{partnerLocation}</span>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-white text-center mb-4 font-semibold">How was the vibe?</h3>
              <div className="flex items-center justify-center gap-3">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className="transition-all hover:scale-125 transform active:scale-95"
                  >
                    <Star
                      className={`w-10 h-10 transition-all duration-200 ${
                        star <= rating 
                          ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]' 
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={submitRating}
              disabled={rating === 0}
              className={`w-full font-bold py-4 rounded-xl mb-3 transition-all ${
                rating > 0 
                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600' 
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {rating > 0 ? 'Talk to someone new' : 'Rate to continue'}
            </button>

            <button
              onClick={() => {
                cleanup();
                setScreen('landing');
              }}
              className="w-full text-purple-200 hover:text-white transition-colors"
            >
              Back to home
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
};

export default App;