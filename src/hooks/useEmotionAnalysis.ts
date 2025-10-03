import { useEffect, useState } from 'react'
import type { EmotionType } from '../types'

export const useEmotionAnalysis = (audioStream: MediaStream | null) => {
  const [emotion, setEmotion] = useState<EmotionType>('calm')

  useEffect(() => {
    if (!audioStream) return

    const audioContext = new AudioContext()
    const analyser = audioContext.createAnalyser()
    const source = audioContext.createMediaStreamSource(audioStream)

    source.connect(analyser)
    analyser.fftSize = 256

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    let lastUpdate = 0
    let animationId: number | null = null

    const detectEmotion = () => {
      const now = Date.now()
      if (now - lastUpdate < 100) {
        animationId = requestAnimationFrame(detectEmotion)
        return
      }
      lastUpdate = now
      
      analyser.getByteFrequencyData(dataArray)
      
      // Calculate average amplitude
      const average = dataArray.reduce((a, b) => a + b, 0) / bufferLength
      
      // Calculate frequency distribution
      const lowFreq = dataArray.slice(0, 85).reduce((a, b) => a + b, 0) / 85
      const midFreq = dataArray.slice(85, 170).reduce((a, b) => a + b, 0) / 85
      const highFreq = dataArray.slice(170).reduce((a, b) => a + b, 0) / 86

      // Simple emotion detection logic
      if (average > 150 && highFreq > 100) {
        setEmotion('excited')
      } else if (average < 50) {
        setEmotion('calm')
      } else if (midFreq > lowFreq && midFreq > highFreq) {
        setEmotion('happy')
      } else {
        setEmotion('contemplative')
      }

      animationId = requestAnimationFrame(detectEmotion)
    }

    detectEmotion()

    return () => {
      // CRITICAL FIX: Cancel the animation frame to prevent memory leak
      if (animationId !== null) {
        cancelAnimationFrame(animationId)
      }
      source.disconnect()
      audioContext.close()
    }
  }, [audioStream])

  return emotion
}