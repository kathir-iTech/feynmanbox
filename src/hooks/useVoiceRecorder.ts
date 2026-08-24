import { useState, useEffect, useRef, useCallback } from "react"

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
  const manuallyStoppedRef = useRef(false)
  const [isSupported, setIsSupported] = useState<boolean | null>(null)

  const startRecognition = useCallback(() => {
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.start()
    } catch {
      // already started, ignore
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (SpeechRecognition) {
      setIsSupported(true)
      const recognition = new SpeechRecognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = "en-US"

      recognition.onstart = () => {
        setState((prev) => ({ ...prev, isRecording: true }))
      }

      recognition.onresult = (event: any) => {
        const finalParts: string[] = []
        const interimParts: string[] = []

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript

          if (event.results[i].isFinal) {
            finalParts.push(transcript)
          } else {
            interimParts.push(transcript)
          }
        }

        setState((prev) => ({
          ...prev,
          finalTranscript: prev.finalTranscript + (prev.finalTranscript && finalParts.length > 0 ? " " : "") + finalParts.join(" "),
          interimTranscript: interimParts.join(" "),
        }))
      }

      recognition.onerror = (event: { error: string }) => {
        if (event.error === "aborted" || event.error === "no-speech") {
          return
        }
        console.error("Speech recognition error:", event.error)
      }

      recognition.onend = () => {
        if (!manuallyStoppedRef.current) {
          // Auto-restart: browsers stop continuous recognition after timeout
          try {
            recognition.start()
          } catch {
            // ignore if already started
          }
        } else {
          setState((prev) => ({ ...prev, isRecording: false, interimTranscript: "" }))
        }
      }

      recognitionRef.current = recognition

      return () => {
        manuallyStoppedRef.current = true
        try {
          recognition.stop()
        } catch {
          // ignore
        }
        recognitionRef.current = null
      }
    } else {
      setIsSupported(false)
    }
  }, [])

  const startRecording = useCallback(() => {
    manuallyStoppedRef.current = false
    setState((prev) => ({ ...prev, finalTranscript: "", interimTranscript: "" }))
    startRecognition()
  }, [startRecognition])

  const stopRecording = useCallback(() => {
    manuallyStoppedRef.current = true
    if (!recognitionRef.current) return
    try {
      recognitionRef.current.stop()
    } catch {
      // ignore
    }
    setState((prev) => ({ ...prev, isRecording: false, interimTranscript: "" }))
  }, [])

  const resetTranscript = useCallback(() => {
    manuallyStoppedRef.current = true
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {
        // ignore
      }
    }
    setState({
      finalTranscript: "",
      interimTranscript: "",
      isRecording: false,
    })
  }, [])

  return {
    state,
    isSupported: isSupported === true,
    startRecording,
    stopRecording,
    resetTranscript,
  }
}
