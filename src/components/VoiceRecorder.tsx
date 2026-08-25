import { useEffect, useRef, useState } from "react"
import { transcribeAudio, blobToBase64 } from "../lib/transcriptionService"

export const VoiceRecorder: React.FC<{
  onTranscriptReady: (transcript: string) => void
  initialTranscript?: string
  onBack?: () => void
}> = ({ onTranscriptReady, initialTranscript, onBack }) => {
  const [isSupported, setIsSupported] = useState<boolean>(true)
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [editableTranscript, setEditableTranscript] = useState("")
  const [hasRecording, setHasRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  // FIX 1: live preview captions (visual only, discarded after)
  const [livePreview, setLivePreview] = useState("")
  const [liveInterim, setLiveInterim] = useState("")

  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number | null>(null)
  const timerRef = useRef<number | null>(null)
  const mainPathRef = useRef<SVGPathElement>(null)
  const shadowPathRef = useRef<SVGPathElement>(null)
  const [useFallbackWaveform, setUseFallbackWaveform] = useState(false)
  // FIX 1: Web Speech refs
  const liveRecognitionRef = useRef<any>(null)
  const liveFinalRef = useRef<string>("")

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  // If editing an existing transcript, show it immediately
  useEffect(() => {
    if (initialTranscript && initialTranscript.trim()) {
      setEditableTranscript(initialTranscript)
      setHasRecording(true)
    }
  }, [initialTranscript])

  useEffect(() => {
    const supported = !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined"
    setIsSupported(supported)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {})
      }
      // FIX 1: cleanup live caption recognition
      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop()
        } catch {}
        liveRecognitionRef.current = null
      }
    }
  }, [])

  const drawWaveform = () => {
    if (!analyserRef.current || !mainPathRef.current) {
      animationRef.current = requestAnimationFrame(drawWaveform)
      return
    }
    const analyser = analyserRef.current
    const bufferLength = analyser.fftSize
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteTimeDomainData(dataArray)

    const segments = 50
    const step = 400 / segments
    let d = "M 0 20"
    for (let i = 0; i <= segments; i++) {
      const dataIdx = Math.floor((i / segments) * (dataArray.length - 1))
      const v = dataArray[dataIdx]
      const deviation = (v - 128) / 128
      const y = 20 + deviation * 18
      const x = i * step
      if (i === 0) {
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
      } else {
        const prevIdx = Math.floor(((i - 1) / segments) * (dataArray.length - 1))
        const prevV = dataArray[prevIdx]
        const prevDev = (prevV - 128) / 128
        const prevY = 20 + prevDev * 18
        const prevX = (i - 1) * step
        const cpx = prevX + step / 2
        const cpy = (prevY + y) / 2
        d += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
      }
    }
    mainPathRef.current.setAttribute("d", d)

    if (shadowPathRef.current) {
      let sd = "M 0 20"
      for (let i = 0; i <= segments; i++) {
        const dataIdx = Math.floor((i / segments) * (dataArray.length - 1))
        const v = dataArray[dataIdx]
        const deviation = ((v - 128) / 128) * 0.55
        const y = 20 + deviation * 18
        const x = i * step
        if (i === 0) {
          sd += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
        } else {
          const prevIdx = Math.floor(((i - 1) / segments) * (dataArray.length - 1))
          const prevV = dataArray[prevIdx]
          const prevDev = ((prevV - 128) / 128) * 0.55
          const prevY = 20 + prevDev * 18
          const prevX = (i - 1) * step
          const cpx = prevX + step / 2
          const cpy = (prevY + y) / 2
          sd += ` Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`
        }
      }
      shadowPathRef.current.setAttribute("d", sd)
    }

    animationRef.current = requestAnimationFrame(drawWaveform)
  }

  const startRecording = async () => {
    setError(null)
    setEditableTranscript("")
    setHasRecording(false)
    setRecordingTime(0)
    setUseFallbackWaveform(false)
    setLivePreview("")
    setLiveInterim("")
    liveFinalRef.current = ""
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      // Setup waveform
      try {
        const AudioCtx =
          (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        audioContextRef.current = ctx
        if (ctx.state === "suspended") await ctx.resume()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = analyser
        drawWaveform()
      } catch {
        setUseFallbackWaveform(true)
      }

      // Setup MediaRecorder — FIX 2: high bitrate for better accuracy
      let mimeType = "audio/webm"
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus"
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm"
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4"
      }

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 192000 } as MediaRecorderOptions)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        // Cleanup waveform
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current)
          animationRef.current = null
        }
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close().catch(() => {})
          audioContextRef.current = null
        }
        analyserRef.current = null
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        if (timerRef.current) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
        }
        setIsRecording(false)
        setUseFallbackWaveform(false)
        // FIX 1: stop and discard live preview (visual only)
        if (liveRecognitionRef.current) {
          try {
            liveRecognitionRef.current.stop()
          } catch {}
          liveRecognitionRef.current = null
        }
        setLivePreview("")
        setLiveInterim("")
        liveFinalRef.current = ""
        const flat = "M 0 20 L 400 20"
        if (mainPathRef.current) mainPathRef.current.setAttribute("d", flat)
        if (shadowPathRef.current) shadowPathRef.current.setAttribute("d", flat)

        if (blob.size < 1000) {
          setError("No audio captured. Please try again and speak clearly.")
          return
        }

        // Transcribe via Gemini — FIX 2: correct MIME, higher accuracy
        if (!apiKey) {
          setError("Transcription is temporarily unavailable. Please try again later.")
          return
        }
        setIsTranscribing(true)
        try {
          const base64 = await blobToBase64(blob)
          // FIX 2: ensure MIME matches actual MediaRecorder output (base type)
          const apiMime = mimeType.split(";")[0].trim() || "audio/webm"
          const transcript = await transcribeAudio(base64, apiMime, apiKey)
          setEditableTranscript(transcript)
          setHasRecording(true)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "We couldn't transcribe your audio. Please try again."
          setError(msg)
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setIsRecording(true)

      // Timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)

      // FIX 1: Start lightweight live captions (Web Speech, visual only, parallel — discarded after)
      // No debouncing/throttling: every onresult is processed immediately
      try {
        const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        if (SpeechRecognition) {
          liveFinalRef.current = ""
          setLivePreview("")
          setLiveInterim("")
          const rec = new SpeechRecognition()
          rec.continuous = true
          rec.interimResults = true
          rec.lang = "en-US"
          rec.onresult = (event: any) => {
            let interim = ""
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const t: string = event.results[i][0].transcript
              if (event.results[i].isFinal) {
                liveFinalRef.current += (liveFinalRef.current ? " " : "") + t
              } else {
                interim += t
              }
            }
            setLivePreview(liveFinalRef.current)
            setLiveInterim(interim)
          }
          rec.onerror = () => {}
          rec.onend = () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
              try {
                rec.start()
              } catch {}
            }
          }
          liveRecognitionRef.current = rec
          try {
            rec.start()
          } catch {}
        }
      } catch {}
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Microphone access denied."
      if ((err as any)?.name === "NotAllowedError") {
        setError("Microphone access was denied. Please allow microphone permission and try again.")
      } else {
        setError(msg)
      }
      setIsRecording(false)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    // FIX 1: also stop live preview immediately on user stop
    if (liveRecognitionRef.current) {
      try {
        liveRecognitionRef.current.stop()
      } catch {}
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleReset = () => {
    setEditableTranscript("")
    setHasRecording(false)
    setError(null)
    setRecordingTime(0)
    setIsTranscribing(false)
    setIsRecording(false)
    setLivePreview("")
    setLiveInterim("")
    liveFinalRef.current = ""
    if (liveRecognitionRef.current) {
      try {
        liveRecognitionRef.current.stop()
      } catch {}
      liveRecognitionRef.current = null
    }
    chunksRef.current = []
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  return (
    <div className="panel p-6">
      {onBack && !isRecording && !isTranscribing && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-mono text-xs text-parchment-muted hover:text-parchment transition-colors mb-4 tracking-wider"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to notes
        </button>
      )}
      {!isSupported && (
        <div className="p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
          Audio recording isn't supported in this browser. Please try Chrome or Edge for the best experience.
        </div>
      )}

      {isSupported && !isRecording && !isTranscribing && !hasRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-brass rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">Voice Testimony</h2>
          </div>
          <p className="label-tag mb-3">Microphone Input</p>
          <p className="text-parchment-muted text-sm mb-5 leading-relaxed">
            Explain your understanding of the milestones aloud. The system will transcribe and analyze your explanation for
            coverage and coherence.
          </p>
          {error && (
            <div className="mb-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
              {error}
            </div>
          )}
          <button onClick={startRecording} className="btn-primary w-full">
            Begin Recording
          </button>
        </div>
      )}

      {isRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-flagged rounded-full animate-pulse" />
            <h2 className="font-serif text-xl font-semibold text-parchment">Recording</h2>
            <span className="ml-auto font-mono text-xs text-parchment-muted">{formatTime(recordingTime)}</span>
          </div>
          <p className="label-tag mb-4">Live Signal</p>

          <div className="polygraph-grid rounded-panel border border-ink-border p-4 bg-ink">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-brass rounded-full animate-pulse" />
              <span className="label-tag text-[10px]">Signal Active</span>
            </div>
            <svg viewBox="0 0 400 40" className="w-full h-[50px]" preserveAspectRatio="none">
              <line x1="0" y1="20" x2="400" y2="20" stroke="#2A333D" strokeWidth="1" />
              <line x1="0" y1="10" x2="400" y2="10" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
              <line x1="0" y1="30" x2="400" y2="30" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
              {useFallbackWaveform ? (
                <>
                  <path
                    className="waveform-line waveform-animate"
                    d="M 0 20 Q 12.5 10 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 T 225 20 T 250 20 T 275 20 T 300 20 T 325 20 T 350 20 T 375 20 T 400 20 T 425 20 T 450 20"
                  />
                  <path
                    className="waveform-line waveform-animate"
                    style={{ animationDelay: "0.15s", opacity: 0.5, strokeWidth: 1.5 } as React.CSSProperties}
                    d="M 0 20 Q 12.5 14 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 T 225 20 T 250 20 T 275 20 T 300 20 T 325 20 T 350 20 T 375 20 T 400 20 T 425 20 T 450 20"
                  />
                </>
              ) : (
                <>
                  <path ref={mainPathRef} className="waveform-line" d="M 0 20 L 400 20" />
                  <path ref={shadowPathRef} className="waveform-line" style={{ opacity: 0.5, strokeWidth: 1.5 } as React.CSSProperties} d="M 0 20 L 400 20" />
                </>
              )}
            </svg>
          </div>
          {/* FIX 1: Live preview captions — visual only, discarded after */}
          <div className="mt-3 p-3 rounded-panel bg-ink border border-ink-border min-h-[52px] max-h-[96px] overflow-y-auto">
            <p className="label-tag text-[10px] mb-1">Live preview — approximate</p>
            {livePreview || liveInterim ? (
              <p className="font-mono text-xs text-parchment/60 leading-relaxed whitespace-pre-wrap">
                {livePreview}
                {livePreview && liveInterim ? " " : ""}
                <span className="italic text-parchment/40">{liveInterim}</span>
              </p>
            ) : (
              <p className="font-mono text-xs text-parchment-muted/40 italic">Listening… approximate captions will appear here.</p>
            )}
          </div>
          <p className="font-mono text-[10px] text-parchment-muted mt-2 text-center">Speak clearly — your audio is being captured continuously.</p>

          <button
            onClick={stopRecording}
            className="mt-4 w-full bg-flagged/20 border border-flagged/40 text-flagged rounded-panel px-6 py-2 font-semibold transition-colors hover:bg-flagged/30"
          >
            Stop Recording
          </button>
        </div>
      )}

      {isTranscribing && (
        <div className="text-center py-8">
          <div className="w-2 h-2 bg-brass rounded-full animate-pulse mx-auto mb-3" />
          <p className="label-tag">Transcribing your explanation...</p>
          <p className="font-mono text-xs text-parchment-muted mt-2">This usually takes a few seconds.</p>
          <div className="mt-6 h-0.5 bg-ink-border rounded-sm overflow-hidden">
            <div className="h-full bg-brass animate-progress-bar" />
          </div>
        </div>
      )}

      {!isRecording && !isTranscribing && hasRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-verified rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">Review Your Transcript</h2>
          </div>
          <p className="label-tag mb-1">REVIEW YOUR TRANSCRIPT</p>
          <p className="font-mono text-xs text-parchment-muted mb-3">Fix any errors before evaluation</p>

          <textarea
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            rows={6}
            className="w-full rounded-panel bg-ink border border-ink-border p-4 font-mono text-sm text-parchment placeholder:text-parchment-muted/50 focus:outline-none focus:border-brass transition-colors min-h-[120px] max-h-[220px] overflow-y-auto leading-relaxed"
            placeholder="Your transcript will appear here…"
          />

          {error && (
            <div className="mt-3 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => onTranscriptReady(editableTranscript)}
              disabled={!editableTranscript.trim()}
              className={`btn-primary flex-1 ${!editableTranscript.trim() ? "opacity-40 cursor-not-allowed" : ""}`}
            >
              Confirm &amp; Evaluate
            </button>
            <button onClick={handleReset} className="btn-ghost">
              Re-record
            </button>
          </div>
        </div>
      )}

      {!isRecording && !isTranscribing && !hasRecording && error && (
        <div className="mt-4">
          <button onClick={handleReset} className="btn-ghost w-full">
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
