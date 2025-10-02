import { useState, useEffect } from 'react';
import { Phone, PhoneOff, Mic, Sparkles, Globe, Zap, Heart, Users, Clock, Star } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useMatching } from './hooks/useMatching';
import { useWebRTC } from './hooks/useWebRTC';
import { useEmotionAnalysis } from './hooks/useEmotionAnalysis';
import { useLiveStats } from './hooks/useLiveStats';
import { supabase } from './lib/supabase';
import { formatTime, emotionColors, emotionWaves, getDifficultyColor, getDifficultyTextColor } from './utils/helpers';
import type { VulnerabilityQuestion } from './types';

const App = () => {
  // Auth
  const { user, loading: authLoading, updatePresence } = useAuth();
  
  // App state
  const [screen, setScreen] = useState('landing');
  const [duration, setDuration] = useState(10);
  const [callTimer, setCallTimer] = useState(0);
  const [rating, setRating] = useState(0);
  
  // Matching
  const { isSearching, matchedCall, startMatching, cancelMatching } = useMatching(user?.id, duration);
  
  // WebRTC
  const { localStream, remoteStream, isConnected, isMuted, toggleMute } = useWebRTC(
    matchedCall?.id,
    user?.id,
    matchedCall?.user1_id === user?.id ? matchedCall?.user2_id : matchedCall?.user1_id
  );
  
  // Emotional Echo
  const userEmotion = useEmotionAnalysis(localStream);
  const partnerEmotion = useEmotionAnalysis(remoteStream);
  const [isEmotionalSync, setIsEmotionalSync] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  
  // Vulnerability Roulette
  const [showRoulette, setShowRoulette] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<VulnerabilityQuestion | null>(null);
  const [questions, setQuestions] = useState<VulnerabilityQuestion[]>([]);
  
  // Satellite Call
  const [distance, setDistance] = useState(0);
  const [partnerLocation, setPartnerLocation] = useState('Unknown');
  
  // Live stats
  const stats = useLiveStats();
  
  // Load questions
  useEffect(() => {
    loadQuestions();
  }, []);
  
  const loadQuestions = async () => {
    const { data } = await supabase
      .from('vulnerability_questions')
      .select('*')
      .eq('is_active', true);
    
    if (data) setQuestions(data);
  };
  
  // Update presence
  useEffect(() => {
    if (user) {
      updatePresence(screen);
      const interval = setInterval(() => updatePresence(screen), 30000);
      return () => clearInterval(interval);
    }
  }, [user, screen]);
  
  // Handle matching
  useEffect(() => {
    if (matchedCall && screen === 'waiting') {
      setScreen('call');
    }
  }, [matchedCall, screen]);
  
  // Emotional sync detection
  useEffect(() => {
    if (screen === 'call' && userEmotion === partnerEmotion) {
      setIsEmotionalSync(true);
      setSyncCount(prev => prev + 1);
      
      if (matchedCall?.id) {
        supabase.rpc('track_emotional_sync', {
          p_call_id: matchedCall.id,
          p_user1_emotion: userEmotion,
          p_user2_emotion: partnerEmotion,
          p_sync_strength: 1.0,
          p_seconds_into_call: callTimer
        });
      }
      
      setTimeout(() => setIsEmotionalSync(false), 3000);
    }
  }, [userEmotion, partnerEmotion, screen]);
  
  // Call timer
  useEffect(() => {
    if (screen === 'call' && isConnected) {
      const timer = setInterval(() => {
        setCallTimer(prev => {
          if (prev >= duration * 60) {
            endCall();
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    }
  }, [screen, isConnected, duration]);
  
  // Show roulette after 2 minutes
  useEffect(() => {
    if (callTimer >= 120) {
      setShowRoulette(true);
    }
  }, [callTimer]);
  
  // Calculate distance (mock for now)
  useEffect(() => {
    if (matchedCall) {
      setDistance(Math.floor(Math.random() * 15000) + 1000);
      setPartnerLocation('Unknown Location');
    }
  }, [matchedCall]);
  
  const handleStartMatching = () => {
    setScreen('waiting');
    startMatching();
  };
  
  const spinRoulette = async () => {
    const difficulties = ['light', 'medium', 'deep'];
    const weights = [0.5, 0.3, 0.2];
    const random = Math.random();
    let difficulty: string;
    
    if (random < weights[0]) difficulty = 'light';
    else if (random < weights[0] + weights[1]) difficulty = 'medium';
    else difficulty = 'deep';
    
    const filtered = questions.filter(q => q.difficulty === difficulty);
    const question = filtered[Math.floor(Math.random() * filtered.length)];
    
    if (question) {
      setCurrentQuestion(question);
      
      if (matchedCall?.id && user?.id) {
        await supabase.rpc('track_question_used', {
          p_question_id: question.id,
          p_call_id: matchedCall.id,
          p_user_id: user.id
        });
      }
      
      setTimeout(() => setCurrentQuestion(null), 15000);
    }
  };
  
  const endCall = async () => {
    if (matchedCall?.id) {
      await supabase
        .from('calls')
        .update({
          ended_at: new Date().toISOString(),
          duration_seconds: callTimer,
          status: 'ended'
        })
        .eq('id', matchedCall.id);
    }
    
    setScreen('rating');
  };
  
  const submitRating = async () => {
    if (matchedCall?.id && user?.id) {
      const isUser1 = matchedCall.user1_id === user.id;
      await supabase
        .from('calls')
        .update(isUser1 ? { rating_user1: rating } : { rating_user2: rating })
        .eq('id', matchedCall.id);
    }
    
    // Reset
    setCallTimer(0);
    setSyncCount(0);
    setShowRoulette(false);
    setRating(0);
    setScreen('landing');
  };
  
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading App...</div>
      </div>
    );
  }
  
  // Landing Screen
  if (screen === 'landing') {
    return (
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
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-purple-200 text-sm">{stats.active_users} people talking right now</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Setup Screen
  if (screen === 'setup') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-sm rounded-3xl p-8">
          <h2 className="text-3xl font-bold text-white mb-6 text-center">Choose call duration</h2>
          
          <div className="space-y-3 mb-8">
            {[3, 10, 20].map((mins) => (
              <button
                key={mins}
                onClick={() => setDuration(mins)}
                className={`w-full p-4 rounded-xl font-semibold transition-all ${
                  duration === mins
                    ? 'bg-purple-500 text-white shadow-lg scale-105'
                    : 'bg-white/10 text-purple-200 hover:bg-white/20'
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
          
          <button
            onClick={() => setScreen('landing')}
            className="w-full mt-3 text-purple-200 hover:text-white transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    );
  }
  
  // Waiting Screen
  if (screen === 'waiting') {
    return (
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
    );
  }
  
  // Call Screen
  if (screen === 'call') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Emotional Sync Alert */}
          {isEmotionalSync && (
            <div className="mb-4 bg-yellow-500/20 border-2 border-yellow-400 rounded-2xl p-4 text-center animate-pulse">
              <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
              <p className="text-yellow-200 font-bold">✨ EMOTIONAL SYNC ✨</p>
              <p className="text-yellow-100 text-sm">Your energies are aligned</p>
            </div>
          )}
          
          {/* Vulnerability Question */}
          {currentQuestion && (
            <div className={`mb-4 rounded-2xl p-6 text-center border-2 ${getDifficultyColor(currentQuestion.difficulty)}`}>
              <p className={`text-xs font-bold mb-2 uppercase ${getDifficultyTextColor(currentQuestion.difficulty)}`}>
                {currentQuestion.difficulty} question
              </p>
              <p className="text-white text-lg font-medium">{currentQuestion.question}</p>
            </div>
          )}
          
          {/* Main Call Card */}
          <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-8 mb-4">
            {/* Connection Status */}
            {!isConnected && (
              <div className="mb-6 text-center">
                <p className="text-yellow-300 text-sm">Connecting...</p>
              </div>
            )}
            
            {/* Emotional Echo Visualization */}
            <div className="mb-6">
              <h3 className="text-purple-200 text-sm font-medium mb-3 text-center flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" />
                Emotional Echo
              </h3>
              
              <div className="space-y-3">
                {/* User emotion */}
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
                
                {/* Partner emotion */}
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
              
              {/* Sync counter */}
              {syncCount > 0 && (
                <p className="text-center text-yellow-300 text-xs mt-3">
                  ✨ {syncCount} sync moment{syncCount > 1 ? 's' : ''} so far
                </p>
              )}
            </div>
            
            {/* Timer */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-6 py-3">
                <Clock className="w-5 h-5 text-purple-300" />
                <span className="text-white text-2xl font-bold font-mono">
                  {formatTime(callTimer)}
                </span>
                <span className="text-purple-300 text-sm">/ {duration}:00</span>
              </div>
            </div>
            
            {/* Satellite Info */}
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
            
            {/* Vulnerability Roulette Button */}
            {showRoulette && !currentQuestion && (
              <button
                onClick={spinRoulette}
                className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white font-bold py-3 rounded-xl hover:from-pink-600 hover:to-purple-600 transition-all mb-4 flex items-center justify-center gap-2"
              >
                <Heart className="w-5 h-5" />
                Spin a Question
              </button>
            )}
            
            {/* Call Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-all ${
                  isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'
                }`}
              >
                <Mic className="w-6 h-6 text-white" />
              </button>
              
              <button
                onClick={endCall}
                className="p-6 bg-red-500 rounded-full hover:bg-red-600 transition-all shadow-lg"
              >
                <PhoneOff className="w-8 h-8 text-white" />
              </button>
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="text-center text-purple-200 text-xs">
            <p>Press the phone icon to end call anytime</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Rating Screen
  if (screen === 'rating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white/10 backdrop-blur-sm rounded-3xl p-8">
          {/* Call Summary */}
          <div className="text-center mb-6">
            <div className="inline-block p-4 bg-green-500/20 rounded-full mb-4">
              <Phone className="w-12 h-12 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Call ended</h2>
            <p className="text-purple-200">You talked for {formatTime(callTimer)}</p>
          </div>
          
          {/* Call Highlights */}
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
          
          {/* Rating */}
          <div className="mb-6">
            <h3 className="text-white text-center mb-4 font-semibold">How was the vibe?</h3>
            <div className="flex items-center justify-center gap-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="transition-all hover:scale-110"
                >
                  <Star
                    className={`w-10 h-10 ${
                      star <= rating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-400'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          
          {/* Share Card Preview */}
          <div className="bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/20 rounded-xl p-4 mb-6">
            <p className="text-center text-white text-sm mb-2">📸 Share your connection</p>
            <div className="bg-slate-900/50 rounded-lg p-3 text-center">
              <p className="text-white font-bold text-lg mb-1">🌍 → 🌏</p>
              <p className="text-white font-semibold">{distance.toLocaleString()} km apart</p>
              <p className="text-purple-200 text-sm">2 strangers, 1 great talk</p>
            </div>
          </div>
          
          {/* Actions */}
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
            onClick={() => setScreen('landing')}
            className="w-full text-purple-200 hover:text-white transition-colors"
          >
            Back to home
          </button>
        </div>
      </div>
    );
  }
  
  return null;
};

export default App;