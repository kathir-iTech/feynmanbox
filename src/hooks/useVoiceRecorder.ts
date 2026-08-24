"use client"

import { useState, useEffect, useRef } from "react"

export interface TranscriptState {
  finalTranscript: string
  interimTranscript: string
  isRecording: boolean
}

export const useVoiceRecorder = () => {
  const [state, setState] = useState<TranscriptState>({
    finalTranscript: "",
    interimTranscript: "",
    isRecording: false,
  })
  const recognitionRef = useRef<window.SpeechRecognition | null>(null)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const checkSupport = () => {
      const SpeechRecognition =
        window.SpeechRecognition || (window as any).webkitSpeechRecognition

      if (SpeechRecognition) {
        setIsSupported(true)
      } else {
        setIsSupported(false)
      }
    }

    checkSupport()

    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isRecording: true, interimTranscript: "" }))
      }

      recognition.onresult = (event: any) => {
        const final = []
        const interim = []

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            final.push(transcript)
          } else {
            interim.push(transcript)
          }
        }

        setState((prev) => ({
          ...prev,
          finalTranscript: final.join(" "),
          interimTranscript: interim.join(" "),
        }))
      }

      recognition.onerror = (event: any) => {
        setState((prev) => ({ ...prev, isRecording: false }))
        if (event.error !== "abort") {
          // handled gracefully
        }
      }

      recognition.onend = () => {
        setState((prev) => ({ ...prev, isRecording: false }))
      }

      recognitionRef.current = recognition

      return () => {
        recognition.stop()
        recognitionRef.current = null
      }
    }
  }, [])

  const startRecording = () => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.start()
    } catch (e) {
      console.error("Speech recognition error:", e)
    }
  }

  const stopRecording = () => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch (e) {
      console.error("Speech recognition stop error:", e)
    }
  }

  const resetTranscript = () => {
    setState({
      finalTranscript: "",
      interimTranscript: "",
      isRecording: false,
    })
  }

  return {
    state,
    isSupported: isSupported === true,
    startRecording,
    stopRecording,
    resetTranscript,
  }
}