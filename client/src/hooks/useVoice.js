import { useState, useRef, useCallback } from 'react'

const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel — natural, calm
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY

export function useVoice({ onTranscript } = {}) {
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const recognitionRef = useRef(null)
  const audioRef = useRef(null)

  const startListening = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onstart = () => setListening(true)
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript
      onTranscript?.(transcript)
    }

    recognitionRef.current = recognition
    recognition.start()
  }, [onTranscript])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setListening(false)
  }, [])

  const speak = useCallback(async (text) => {
    // Stop any current audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setSpeaking(true)

    try {
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}/stream`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.0 },
          }),
        }
      )

      if (!res.ok) throw new Error('ElevenLabs error')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        setSpeaking(false)
        URL.revokeObjectURL(url)
        audioRef.current = null
      }
      audio.onerror = () => setSpeaking(false)

      await audio.play()
    } catch (err) {
      console.error('TTS error:', err)
      setSpeaking(false)
    }
  }, [])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setSpeaking(false)
  }, [])

  return { listening, speaking, startListening, stopListening, speak, stopSpeaking }
}
