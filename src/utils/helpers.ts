import type { Emotion } from '../types'; // Changed from './types' to '../types'

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const emotionColors: Record<Emotion, string> = {
  calm: 'bg-blue-500',
  excited: 'bg-yellow-500',
  happy: 'bg-green-500',
  anxious: 'bg-orange-500',
  sad: 'bg-indigo-500',
  angry: 'bg-red-500',
};

export const emotionWaves: Record<Emotion, string> = {
  calm: '～～～',
  excited: '⚡⚡⚡',
  happy: '✨✨✨',
  anxious: '〰〰〰',
  sad: '︵︵︵',
  angry: '▲▲▲',
};

export const getDifficultyColor = (difficulty: string): string => {
  switch (difficulty) {
    case 'light':
      return 'bg-green-500/20 border-green-400';
    case 'medium':
      return 'bg-yellow-500/20 border-yellow-400';
    case 'deep':
      return 'bg-red-500/20 border-red-400';
    default:
      return 'bg-gray-500/20 border-gray-400';
  }
};

export const getDifficultyTextColor = (difficulty: string): string => {
  switch (difficulty) {
    case 'light':
      return 'text-green-300';
    case 'medium':
      return 'text-yellow-300';
    case 'deep':
      return 'text-red-300';
    default:
      return 'text-gray-300';
  }
};