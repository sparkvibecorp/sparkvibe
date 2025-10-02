export const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  export const emotionColors: Record<string, string> = {
    excited: 'bg-orange-500',
    calm: 'bg-blue-500',
    happy: 'bg-yellow-500',
    contemplative: 'bg-purple-500'
  }
  
  export const emotionWaves: Record<string, string> = {
    excited: '∿∿∿∿∿∿∿∿',
    calm: '~~~∼∼∼~~~',
    happy: '∿∿~~~∿∿',
    contemplative: '∼∼∼∼∼∼∼∼'
  }
  
  export const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case 'light':
        return 'bg-green-500/20 border-green-400'
      case 'medium':
        return 'bg-yellow-500/20 border-yellow-400'
      case 'deep':
        return 'bg-red-500/20 border-red-400'
      default:
        return 'bg-gray-500/20 border-gray-400'
    }
  }
  
  export const getDifficultyTextColor = (difficulty: string): string => {
    switch (difficulty) {
      case 'light':
        return 'text-green-300'
      case 'medium':
        return 'text-yellow-300'
      case 'deep':
        return 'text-red-300'
      default:
        return 'text-gray-300'
    }
  }