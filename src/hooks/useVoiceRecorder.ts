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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      setIsSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isRecording: true, interimTranscript: "" }))
      }

      recognition.onresult = (event: any) => {
        const final: string[] = []
        const interim: string[] = []

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
          finalTranscript: prev.finalTranscript + (prev.finalTranscript ? " " : "") + final.join(" "),
          interimTranscript: interim.join(" "),
        }))
      }

      recognition.onerror = (event: { error: string }) => {
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
    } else {
      setIsSupported(false)
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