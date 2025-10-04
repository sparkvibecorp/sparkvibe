import { useState, useEffect, useCallback, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Sparkles, Globe, Zap, Heart, Users, Clock } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useMatching } from './hooks/useMatching';
import { useWebRTC } from './hooks/useWebRTC';
import { useEmotionAnalysis } from './hooks/useEmotionAnalysis';
import { useLiveStats } from './hooks/useLiveStats';
import { supabase } from './lib/supabase';
import { formatTime, emotionColors, emotionWaves, getDifficultyColor, getDifficultyTextColor } from './utils/helpers';
import type { VulnerabilityQuestion } from './types';

console.log('🔌 Testing Supabase connection...');
supabase.from('users').select('count').limit(1).then(result => {
  console.log('✅ Supabase connected!', result);
}).catch(err => {
  console.error('❌ Supabase connection failed:', err);
});

const App = () => {
  const callStartTimeRef = useRef<number | null>(null);
  const isEndingCallRef = useRef(false);
  const hasInitializedCallRef = useRef(false);

  useEffect(() => {
    const clearStuckAuth = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('clearauth') === 'true') {
        console.log('🧹 Clearing auth state...');
        await supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = window.location.origin;
      }
    };
    clearStuckAuth();
  }, []);

  const { user, loading: authLoading, error: authError, updatePresence } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [screen, setScreen] = useState<'landing' | 'setup' | 'waiting' | 'call'>('landing');
  const [duration, setDuration] = useState<number>(10);
  const [callTimer, setCallTimer] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  const { matchedCall, startMatching, cancelMatching } = useMatching(user?.id, duration);
  const { localStream, remoteStream, isConnected, isMuted, toggleMute, cleanup, stopPolling } = useWebRTC(
    matchedCall?.id,
    user?.id,
    matchedCall?.user1_id === user?.id ? matchedCall?.user2_id : matchedCall?.user1_id
  );

  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const userEmotion = useEmotionAnalysis(localStream);
  const partnerEmotion = useEmotionAnalysis(remoteStream);
  const [isEmotionalSync, setIsEmotionalSync] = useState<boolean>(false);
  const [syncCount, setSyncCount] = useState<number>(0);
  const [showRoulette, setShowRoulette] = useState<boolean>(false);
  const [currentQuestion, setCurrentQuestion] = useState<VulnerabilityQuestion | null>(null);
  const [questions, setQuestions] = useState<VulnerabilityQuestion[]>([]);
  const [distance, setDistance] = useState<number>(0);
  const [partnerLocation, setPartnerLocation] = useState<string>('Unknown');

  const stats = useLiveStats();

  const loadQuestions = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('vulnerability_questions')
        .select('*')
        .eq('is_active', true);

      if (error) throw error;
      setQuestions(data as VulnerabilityQuestion[]);
      console.log('✅ Loaded questions:', data.length);
    } catch (err) {
      console.error('❌ Error loading questions:', err);
    }
  }, []);

  const endCall = useCallback(async () => {
    if (isEndingCallRef.current) {
      console.log('⏭️ Already ending call');
      return;
    }
    
    if (callStartTimeRef.current && Date.now() - callStartTimeRef.current < 3000) {
      console.log('⏭️ Too soon to end call, ignoring');
      return;
    }
    
    if (screen !== 'call') {
      console.log('⏭️ Not in call screen, skipping end');
      return;
    }
    
    isEndingCallRef.current = true;
    
    try {
      const timeRemaining = (duration * 60) - callTimer;
      const isTimeUp = timeRemaining <= 0;
      
      console.log('📞 Ending call...', { 
        callId: matchedCall?.id, 
        timer: callTimer,
        reason: isTimeUp ? "Time's up" : "User ended"
      });
      
      stopPolling();
      
      if (matchedCall?.id && user?.id) {
        const { error: callError } = await supabase
          .from('calls')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            duration_seconds: callTimer,
            ended_by: user.id,
          })
          .eq('id', matchedCall.id)
          .eq('status', 'active');
        
        if (callError) {
          console.error('❌ End call update failed:', callError);
        } else {
          console.log('✅ Call ended in DB');
        }
        
        const { error: userError } = await supabase
          .from('users')
          .update({ status: 'online', current_call_id: null })
          .eq('id', user.id);
        
        if (userError) {
          console.error('❌ User status update failed:', userError);
        } else {
          console.log('✅ User status updated');
        }
        
        await supabase.from('call_queue').delete().eq('user_id', user.id);
      }
      
      cleanup();
      cancelMatching();
      
      setCallTimer(0);
      setSyncCount(0);
      setShowRoulette(false);
      setCurrentQuestion(null);
      setDistance(0);
      setPartnerLocation('Unknown');
      
      setScreen('landing');
      
    } catch (err) {
      console.error('❌ Error ending call:', err);
      cleanup();
      cancelMatching();
      setScreen('landing');
    } finally {
      isEndingCallRef.current = false;
    }
  }, [matchedCall?.id, callTimer, duration, screen, user?.id, stopPolling, cleanup, cancelMatching]);

  const playRemoteAudio = useCallback(() => {
    if (remoteAudioRef.current && remoteStream) {
      const audioTracks = remoteStream.getAudioTracks();
      console.log('🔊 Attempting to play remote audio:', {
        tracks: audioTracks.length,
        enabled: audioTracks[0]?.enabled,
        state: audioTracks[0]?.readyState
      });
  
      if (audioTracks.length > 0 && audioTracks[0].enabled && audioTracks[0].readyState === 'live') {
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play()
          .then(() => console.log('✅ Remote audio playing'))
          .catch(err => {
            console.warn('⚠️ Auto-play prevented:', err);
            setTimeout(() => {
              remoteAudioRef.current?.play()
                .then(() => console.log('✅ Remote audio playing (retry)'))
                .catch(e => console.error('❌ Still cannot play:', e));
            }, 500);
          });
      } else {
        console.warn('⚠️ Remote stream has no valid audio tracks');
      }
    }
  }, [remoteStream]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (matchedCall?.id && screen === 'call') {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/calls?id=eq.${matchedCall.id}`;
        const payload = JSON.stringify({
          status: 'ended',
          ended_at: new Date().toISOString(),
        });
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [matchedCall?.id, screen]);

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

  useEffect(() => {
    if (callTimer >= duration * 60 && screen === 'call') {
      console.log("⏰ Time's up!");
      endCall();
    }
  }, [callTimer, duration, screen, endCall]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (user) {
      updatePresence(screen);
      const interval = setInterval(() => updatePresence(screen), 30000);
      return () => clearInterval(interval);
    }
  }, [user, screen, updatePresence]);

  useEffect(() => {
    console.log('🔄 Checking transition:', { matchedCall: matchedCall?.id, screen });
    if (matchedCall && screen === 'waiting') {
      console.log('🎬 Transitioning to call screen!');
      hasInitializedCallRef.current = false;
      callStartTimeRef.current = Date.now();
      setScreen('call');
      setCallTimer(0);
    }
  }, [matchedCall, screen]);

  useEffect(() => {
    if (localAudioRef.current && localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0 && audioTracks[0].enabled && audioTracks[0].readyState === 'live') {
        localAudioRef.current.srcObject = localStream;
        localAudioRef.current.muted = true;
        console.log('🎵 Local stream attached:', audioTracks);
      } else {
        console.warn('⚠️ Local stream has no valid audio tracks');
      }
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream && screen === 'call') {
      const audioTracks = remoteStream.getAudioTracks();
      console.log('🎵 Attaching remote stream in call screen:', {
        tracks: audioTracks.length,
        enabled: audioTracks[0]?.enabled,
        state: audioTracks[0]?.readyState
      });
  
      if (audioTracks.length > 0 && audioTracks[0].enabled && audioTracks[0].readyState === 'live') {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.volume = 1.0;
        playRemoteAudio();
        
        if (isConnected) {
          setTimeout(playRemoteAudio, 1000);
        }
      }
    }
  }, [remoteStream, playRemoteAudio, screen, isConnected]);

  useEffect(() => {
    if (isConnected && screen === 'call' && remoteAudioRef.current) {
      console.log('🎉 Connection established! Ensuring audio plays...');
      setTimeout(() => {
        playRemoteAudio();
      }, 500);
    }
  }, [isConnected, screen, playRemoteAudio]);

  useEffect(() => {
    if (screen === 'call' && userEmotion === partnerEmotion && userEmotion !== 'calm') {
      setIsEmotionalSync(true);
      setSyncCount(prev => prev + 1);
      if (matchedCall?.id) {
        supabase
          //@ts-ignore
          .rpc('track_emotional_sync', {
            p_call_id: matchedCall.id,
            p_user1_emotion: userEmotion,
            p_user2_emotion: partnerEmotion,
            p_sync_strength: 1.0,
            p_seconds_into_call: callTimer,
          })
          .then(({ error }) => {
            if (error) console.error('❌ track_emotional_sync rpc failed:', error);
          });
      }
      const t = setTimeout(() => setIsEmotionalSync(false), 3000);
      return () => clearTimeout(t);
    }
  }, [userEmotion, partnerEmotion, screen, matchedCall?.id, callTimer]);

  useEffect(() => {
    if (screen === 'call' && isConnected && !hasInitializedCallRef.current) {
      hasInitializedCallRef.current = true;
      callStartTimeRef.current = Date.now();
      console.log('⏱️ Starting call timer');
    }

    if (screen === 'call' && isConnected) {
      const timer = setInterval(() => {
        setCallTimer(prev => {
          const next = prev + 1;
          
          if (next % 10 === 0) {
            console.log('⏱️ Call timer:', next, '/', duration * 60);
          }
          
          if (next >= duration * 60) {
            console.log("⏰ Time's up! Auto-ending call");
            endCall();
            return prev;
          }
          
          return next;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [screen, isConnected, duration, endCall]);

  useEffect(() => {
    if (callTimer >= 120 && screen === 'call') {
      setShowRoulette(true);
    }
  }, [callTimer, screen]);

  useEffect(() => {
    if (matchedCall) {
      setDistance(Math.floor(Math.random() * 15000) + 1000);
      setPartnerLocation('Unknown Location');
    }
  }, [matchedCall]);

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

    return () => channel.unsubscribe();
  }, [matchedCall?.id, user?.id]);

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
        remoteStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      }
    };
  }, [localStream, remoteStream]);

  useEffect(() => {
    if (!matchedCall?.id || screen !== 'call') return;
  
    const channel = supabase
      .channel(`call-${matchedCall.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'calls',
        filter: `id=eq.${matchedCall.id}`
      }, (payload: any) => {
        console.log('📞 Call status changed:', payload.new.status);
        if (payload.new.status === 'ended' && !isEndingCallRef.current) {
          const endedBy = payload.new.ended_by;
          const wasEndedByPartner = endedBy && endedBy !== user?.id;
          
          if (wasEndedByPartner) {
            console.log('🛑 Partner disconnected');
            stopPolling();
            setError('Partner disconnected');
            
            setTimeout(async () => {
              cleanup();
              cancelMatching();
              
              if (user?.id) {
                await supabase.from('call_queue').delete().eq('user_id', user.id);
              }
              
              setCallTimer(0);
              setSyncCount(0);
              setShowRoulette(false);
              setCurrentQuestion(null);
              setDistance(0);
              setPartnerLocation('Unknown');
              setError(null);
              setScreen('landing');
            }, 2000);
          }
        }
      })
      .subscribe();
  
    return () => {
      channel.unsubscribe();
    };
  }, [matchedCall?.id, screen, user?.id, stopPolling, cleanup, cancelMatching]);

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
        //@ts-ignore
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
    playRemoteAudio();
  };

  const debugAudio = () => {
    console.log('🔍 Debugging audio:');
    console.log('Local stream:', localStream?.getAudioTracks());
    console.log('Remote stream:', remoteStream?.getAudioTracks());
    console.log('Peer connection state:', (window as any).peerConnectionRef?.current?.connectionState);
    console.log('Audio element volume:', remoteAudioRef.current?.volume);
  };

  const OfflineBanner = !isOnline ? (
    <div className="fixed top-0 left-0 right-0 bg-red-500 text-white text-center py-2 z-50">
      ⚠️ You're offline. Reconnect to continue.
    </div>
  ) : null;

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

  if (screen === 'call') {
    if (!matchedCall?.id) {
      setScreen('landing');
      return null;
    }
    console.log('🎨 UI State:', { isConnected, screen, hasRemoteStream: !!remoteStream });

    return (
      <>
        {OfflineBanner}
        <audio ref={localAudioRef} autoPlay muted playsInline />
        <audio ref={remoteAudioRef} autoPlay playsInline volume={1.0}/>
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
                <p className={`text-xs font-bold mb-2 uppercase ${getDifficultyTextColor(currentQuestion.difficulty)}`}>
                  {currentQuestion.difficulty} question
                </p>
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

            {isConnected && (
              <button
                onClick={() => {
                  if (remoteAudioRef.current) {
                    remoteAudioRef.current.play().catch(e => console.log('Play failed:', e));
                  }
                }}
                className="mb-4 w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600"
              >
                🔊 Enable Audio
              </button>
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
                      <div
                        className={`h-full w-full ${emotionColors[userEmotion]} opacity-70 flex items-center justify-center text-white font-mono text-2xl animate-pulse`}
                      >
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
                      <div
                        className={`h-full w-full ${emotionColors[partnerEmotion]} opacity-70 flex items-center justify-center text-white font-mono text-2xl animate-pulse`}
                      >
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
                  onClick={() => {
                    toggleMute();
                    playRemoteAudio();
                  }}
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
                <button
                  onClick={debugAudio}
                  className="p-4 bg-blue-500 rounded-full hover:bg-blue-600 transition-all"
                >
                  <Sparkles className="w-6 h-6 text-white" />
                </button>
              </div>
            </div>
            <div className="text-center text-purple-200 text-xs">
              <p>Press the phone icon to end call or the sparkles to debug audio</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
};

export default App;