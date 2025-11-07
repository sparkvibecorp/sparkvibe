/**
 * @experimental
 * Emotion detection from audio analysis.
 * Not currently used in UI - planned for future feature.
 */

import { useEffect, useState, useRef } from 'react';

type Emotion = 'calm' | 'excited' | 'happy' | 'anxious' | 'sad' | 'angry';

export const useEmotionAnalysis = (stream: MediaStream | null): Emotion => {
  const [emotion, setEmotion] = useState<Emotion>('calm');
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!stream) {
      setEmotion('calm');
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      setEmotion('calm');
      return;
    }

    try {
      // Create audio context and analyzer
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyzer = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyzer.fftSize = 2048;
      analyzer.smoothingTimeConstant = 0.8;
      source.connect(analyzer);

      audioContextRef.current = audioContext;
      analyzerRef.current = analyzer;

      const dataArray = new Uint8Array(analyzer.frequencyBinCount);

      const analyze = () => {
        if (!analyzerRef.current) return;

        analyzer.getByteFrequencyData(dataArray);

        // Calculate metrics
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const max = Math.max(...Array.from(dataArray));
        
        // Low frequencies (bass) - 0-200 Hz bins
        const lowFreq = dataArray.slice(0, 20).reduce((a, b) => a + b, 0) / 20;
        
        // Mid frequencies - 200-2000 Hz bins
        const midFreq = dataArray.slice(20, 200).reduce((a, b) => a + b, 0) / 180;
        
        // High frequencies - 2000+ Hz bins
        const highFreq = dataArray.slice(200, 500).reduce((a, b) => a + b, 0) / 300;

        // Variance (measure of dynamic range)
        const variance = dataArray.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / dataArray.length;
        const stdDev = Math.sqrt(variance);

        // Only update emotion every 500ms to avoid flickering
        const now = Date.now();
        if (now - lastUpdateRef.current < 500) {
          animationFrameRef.current = requestAnimationFrame(analyze);
          return;
        }
        lastUpdateRef.current = now;

        // Emotion detection logic
        let newEmotion: Emotion = 'calm';

        if (average < 15) {
          newEmotion = 'calm';
        } else if (max > 180 && stdDev > 40) {
          // High energy with high variance = excited
          newEmotion = 'excited';
        } else if (highFreq > 30 && midFreq > 25) {
          // High pitched with good mid range = happy
          newEmotion = 'happy';
        } else if (stdDev > 35 && lowFreq < 20) {
          // High variance but low bass = anxious
          newEmotion = 'anxious';
        } else if (lowFreq > 25 && midFreq < 20 && highFreq < 15) {
          // Deep voice, monotone = sad
          newEmotion = 'sad';
        } else if (max > 150 && lowFreq > 30) {
          // Loud with strong bass = angry
          newEmotion = 'angry';
        } else if (average > 20) {
          // Default to happy if there's moderate activity
          newEmotion = 'happy';
        }

        setEmotion(newEmotion);
        animationFrameRef.current = requestAnimationFrame(analyze);
      };

      analyze();

      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
      };
    } catch (err) {
      console.error('Error in emotion analysis:', err);
      setEmotion('calm');
    }
  }, [stream]);

  return emotion;
};