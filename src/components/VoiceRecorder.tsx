import { useEffect, useRef, useState } from "react"
import { transcribeAudio, blobToBase64 } from "../lib/transcriptionService"
import { RateLimitAlert } from "./RateLimitAlert"
import type { AcousticMetrics } from "../types"

export const VoiceRecorder: React.FC<{
  onTranscriptReady: (transcript: string, metrics?: AcousticMetrics) => void
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
  const [livePreview, setLivePreview] = useState("")
  const [liveInterim, setLiveInterim] = useState("")
  const [pendingMetrics, setPendingMetrics] = useState<AcousticMetrics | null>(null)

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
  const liveRecognitionRef = useRef<any>(null)
  const liveFinalRef = useRef<string>("")

  // Phase 5: acoustic metrics refs
  const startTimeRef = useRef<number>(0)
  const durationMsRef = useRef<number>(0)
  const pauseCountRef = useRef<number>(0)
  const totalPauseDurationRef = useRef<number>(0)
  const silenceStartRef = useRef<number | null>(null)
  const metricsIntervalRef = useRef<number | null>(null)
  const pitchSamplesRef = useRef<number[]>([])
  // Retain last recording for rate-limit retry (same blob without re-recording)
  const lastBlobRef = useRef<Blob | null>(null)
  const lastMimeRef = useRef<string>("audio/webm")
  // Phase 6.4: device capability + toggle for live preview
  const [showLivePreview, setShowLivePreview] = useState<boolean>(true)
  const [isLowEndDevice, setIsLowEndDevice] = useState(false)
  const isRecordingRef = useRef(isRecording)
  const showLivePreviewRef = useRef(showLivePreview)
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])
  useEffect(() => {
    showLivePreviewRef.current = showLivePreview
  }, [showLivePreview])

  useEffect(() => {
    if (initialTranscript && initialTranscript.trim()) {
      setEditableTranscript(initialTranscript)
      setHasRecording(true)
    }
  }, [initialTranscript])

  useEffect(() => {
    const supported = !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined"
    setIsSupported(supported)
    // Phase 6.4: detect low-end / mobile for live preview default
    const hardwareConcurrency = (navigator as any).hardwareConcurrency as number | undefined
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const lowEnd = (hardwareConcurrency !== undefined && hardwareConcurrency <= 2) || isMobile
    setIsLowEndDevice(lowEnd)
    setShowLivePreview(!lowEnd)
    console.log(`[VoiceRecorder] Device check: hardwareConcurrency=${hardwareConcurrency} isMobile=${isMobile} lowEnd=${lowEnd} showLivePreview default=${!lowEnd}`)
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        try {
          mediaRecorderRef.current.stop()
        } catch {}
      }
      if (timerRef.current) window.clearInterval(timerRef.current)
      if (metricsIntervalRef.current) window.clearInterval(metricsIntervalRef.current)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop()
        } catch {}
        liveRecognitionRef.current = null
      }
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (audioContextRef.current?.state !== "closed") audioContextRef.current?.close().catch(() => {})
    }
  }, [])

  // IDLE state: component mounts showing ready shell; mic NOT requested until user clicks "Start Recording Capture".

  // Fix 2: ensure manual toggle overrides automatic default and actually starts/stops recognition during recording
  const startLiveRecognition = () => {
    try {
      const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        console.warn("[VoiceRecorder] SpeechRecognition not supported in this browser")
        return
      }
      if (liveRecognitionRef.current) {
        try {
          liveRecognitionRef.current.stop()
        } catch {}
        liveRecognitionRef.current = null
      }
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
        console.log(`[VoiceRecorder] Live preview update: final="${liveFinalRef.current}" interim="${interim}"`)
      }
      rec.onerror = (e: any) => {
        console.warn("[VoiceRecorder] SpeechRecognition error", e?.error || e)
      }
      rec.onend = () => {
        console.log("[VoiceRecorder] SpeechRecognition onend, isRecording=", isRecordingRef.current)
        // BUG 3 FIX: Always restart recognition while recording is active (toggle only controls UI visibility)
        if (isRecordingRef.current && mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          try {
            rec.start()
            console.log("[VoiceRecorder] Restarted SpeechRecognition after onend")
          } catch (err) {
            console.warn("[VoiceRecorder] Failed to restart recognition", err)
          }
        }
      }
      liveRecognitionRef.current = rec
      try {
        rec.start()
        console.log("[VoiceRecorder] SpeechRecognition started successfully")
      } catch (err) {
        console.warn("[VoiceRecorder] Failed to start recognition", err)
      }
    } catch (err) {
      console.warn("[VoiceRecorder] startLiveRecognition failed", err)
    }
  }

  // BUG 3 FIX: Start recognition immediately when recording begins (always in background).
  // The toggle ONLY controls visibility of the live caption text, not whether recognition runs.
  useEffect(() => {
    if (!isRecording) return
    if (!liveRecognitionRef.current) {
      startLiveRecognition()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording])

  // Restart recognition if it ends unexpectedly while still recording (regardless of toggle state)
  useEffect(() => {
    if (!isRecording) return
    if (liveRecognitionRef.current) return
    startLiveRecognition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePreview, liveInterim, isRecording])

  const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches

  const drawWaveform = () => {
    if (prefersReducedMotion) return
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

  // Phase 5: sample acoustic features during recording
  const sampleAcousticFeatures = () => {
    const analyser = analyserRef.current
    if (!analyser) return
    const now = Date.now()
    // Pause detection via amplitude threshold
    const bufferLength = analyser.fftSize
    const timeData = new Uint8Array(bufferLength)
    analyser.getByteTimeDomainData(timeData)
    let sumAbs = 0
    for (let i = 0; i < timeData.length; i++) sumAbs += Math.abs(timeData[i] - 128)
    const avgAbs = sumAbs / timeData.length
    const isSilent = avgAbs < 4.5 // threshold for silence
    if (isSilent) {
      if (silenceStartRef.current === null) silenceStartRef.current = now
    } else {
      if (silenceStartRef.current !== null) {
        const silenceDuration = now - silenceStartRef.current
        if (silenceDuration >= 700) {
          pauseCountRef.current += 1
          totalPauseDurationRef.current += silenceDuration
        }
        silenceStartRef.current = null
      }
    }
    // Pitch variance via frequency-domain variance (lightweight proxy)
    try {
      const freqData = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(freqData)
      let mean = 0
      for (let i = 0; i < freqData.length; i++) mean += freqData[i]
      mean /= freqData.length
      let variance = 0
      for (let i = 0; i < freqData.length; i++) variance += (freqData[i] - mean) * (freqData[i] - mean)
      variance /= freqData.length
      // Normalize variance to 0-100 score: typical variance 0-3000, map via /30 capped at 100
      const pitchScore = Math.min(100, variance / 30)
      pitchSamplesRef.current.push(pitchScore)
      if (pitchSamplesRef.current.length > 200) pitchSamplesRef.current.shift()
    } catch {
      // ignore frequency errors
    }
  }

  const computePitchVarianceScore = (): number => {
    const samples = pitchSamplesRef.current
    if (samples.length === 0) return 50
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length
    // Also consider variance of pitch scores themselves (expressiveness)
    let varSum = 0
    for (const s of samples) varSum += (s - avg) * (s - avg)
    const spread = Math.sqrt(varSum / samples.length)
    // Combine avg and spread: expressive speech has moderate avg (20-60) + some spread
    const combined = Math.min(100, avg * 0.7 + spread * 1.8)
    return Math.round(combined * 10) / 10
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
    setPendingMetrics(null)
    lastBlobRef.current = null
    lastMimeRef.current = "audio/webm"
    // Reset acoustic metrics
    startTimeRef.current = Date.now()
    durationMsRef.current = 0
    pauseCountRef.current = 0
    totalPauseDurationRef.current = 0
    silenceStartRef.current = null
    pitchSamplesRef.current = []
    if (metricsIntervalRef.current) {
      window.clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const shouldAnimate = !prefersReducedMotion
      if (!shouldAnimate) {
        setUseFallbackWaveform(false)
      } else {
        try {
          const AudioCtx =
            (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
          const ctx = new AudioCtx()
          audioContextRef.current = ctx
          if (ctx.state === "suspended") await ctx.resume()
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.8
          const source = ctx.createMediaStreamSource(stream)
          source.connect(analyser)
          analyserRef.current = analyser
          drawWaveform()
          // Start acoustic sampling
          metricsIntervalRef.current = window.setInterval(sampleAcousticFeatures, 120)
        } catch {
          setUseFallbackWaveform(true)
        }
      }
      if (!analyserRef.current && !metricsIntervalRef.current) {
        // Fallback: still try to sample if analyser missing but we have stream
        // No analyser, metrics will be defaults
      }

      let mimeType = "audio/webm"
      if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus"
      } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus"
      } else if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm"
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4"
      }

      const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 } as MediaRecorderOptions)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const endTime = Date.now()
        durationMsRef.current = endTime - startTimeRef.current
        // Finalize pause: if currently in silence, count it if >=700ms
        if (silenceStartRef.current !== null) {
          const dur = endTime - silenceStartRef.current
          if (dur >= 700) {
            pauseCountRef.current += 1
            totalPauseDurationRef.current += dur
          }
          silenceStartRef.current = null
        }
        if (metricsIntervalRef.current) {
          window.clearInterval(metricsIntervalRef.current)
          metricsIntervalRef.current = null
        }
        const blob = new Blob(chunksRef.current, { type: mimeType })
        lastBlobRef.current = blob
        lastMimeRef.current = mimeType
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

        setIsTranscribing(true)
        try {
          const base64 = await blobToBase64(blob)
          const apiMime = mimeType.split(";")[0].trim() || "audio/webm"
          const transcript = await transcribeAudio(base64, apiMime)
          setEditableTranscript(transcript)
          setHasRecording(true)
          // Phase 5: compute acoustic metrics from transcript + duration + pause/pitch data
          const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
          const durationMinutes = Math.max(0.1, durationMsRef.current / 60000)
          const wpm = Math.round(wordCount / durationMinutes)
          const pitchVarianceScore = computePitchVarianceScore()
          const metrics: AcousticMetrics = {
            wordsPerMinute: Number.isFinite(wpm) ? wpm : 0,
            pauseCount: pauseCountRef.current,
            totalPauseDuration: totalPauseDurationRef.current,
            pitchVarianceScore,
            recordingDurationMs: durationMsRef.current,
          }
          setPendingMetrics(metrics)
          console.log("[AcousticMetrics]", metrics, "words:", wordCount, "durationMs:", durationMsRef.current)
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "We couldn't transcribe your audio. Please try again."
          setError(msg)
        } finally {
          setIsTranscribing(false)
        }
      }

      recorder.start()
      setIsRecording(true)

      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)

      // Live preview will be started by the useEffect watching [showLivePreview, isRecording]
      // (manual toggle overrides low-end default — Fix 2)
    } catch (err: unknown) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (metricsIntervalRef.current) {
        window.clearInterval(metricsIntervalRef.current)
        metricsIntervalRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {})
        audioContextRef.current = null
      }
      analyserRef.current = null
      if (timerRef.current) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
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
    if (liveRecognitionRef.current) {
      try {
        liveRecognitionRef.current.stop()
      } catch {}
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    // metrics interval cleared in onstop to capture final silence
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
    setPendingMetrics(null)
    lastBlobRef.current = null
    lastMimeRef.current = "audio/webm"
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
    if (metricsIntervalRef.current) {
      window.clearInterval(metricsIntervalRef.current)
      metricsIntervalRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {})
      audioContextRef.current = null
    }
    startTimeRef.current = 0
    durationMsRef.current = 0
    pauseCountRef.current = 0
    totalPauseDurationRef.current = 0
    silenceStartRef.current = null
    pitchSamplesRef.current = []
  }

  const retryTranscription = async () => {
    const blob = lastBlobRef.current
    const mimeType = lastMimeRef.current || "audio/webm"
    if (!blob) return
    setError(null)
    setIsTranscribing(true)
    try {
      const base64 = await blobToBase64(blob)
      const apiMime = mimeType.split(";")[0].trim() || "audio/webm"
      const transcript = await transcribeAudio(base64, apiMime)
      setEditableTranscript(transcript)
      setHasRecording(true)
      const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
      const durationMinutes = Math.max(0.1, durationMsRef.current / 60000)
      const wpm = Math.round(wordCount / durationMinutes)
      const pitchVarianceScore = computePitchVarianceScore()
      const metrics: AcousticMetrics = {
        wordsPerMinute: Number.isFinite(wpm) ? wpm : 0,
        pauseCount: pauseCountRef.current,
        totalPauseDuration: totalPauseDurationRef.current,
        pitchVarianceScore,
        recordingDurationMs: durationMsRef.current,
      }
      setPendingMetrics(metrics)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "We couldn't transcribe your audio. Please try again."
      setError(msg)
    } finally {
      setIsTranscribing(false)
    }
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const handleConfirm = () => {
    if (!editableTranscript.trim()) return
    // Recompute WPM based on possibly edited transcript and original duration
    let finalMetrics = pendingMetrics
    if (pendingMetrics && durationMsRef.current > 0) {
      const wordCount = editableTranscript.trim().split(/\s+/).filter(Boolean).length
      const durationMinutes = Math.max(0.1, durationMsRef.current / 60000)
      const wpm = Math.round(wordCount / durationMinutes)
      finalMetrics = { ...pendingMetrics, wordsPerMinute: wpm }
    }
    onTranscriptReady(editableTranscript, finalMetrics ?? undefined)
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
          <h3 className="label-tag mb-3">Microphone Input</h3>
          <p className="text-parchment-muted text-sm mb-3 leading-relaxed">
            Explain your understanding of the key concepts aloud. The system will transcribe and analyze your explanation for
            coverage and coherence.
          </p>
          <p className="font-mono text-xs text-parchment-muted mb-4 leading-relaxed">
            Press <span className="text-brass font-semibold">Start Recording</span> when you&apos;re ready — you&apos;ll be asked for microphone permission, then speak clearly.
          </p>
           {/* Idle waveform placeholder — same shell as active, but muted/ready.
              Mic is NOT requested and MediaRecorder is NOT instantiated here. */}
          <div className="polygraph-grid rounded-panel border border-ink-border p-4 bg-ink opacity-60 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1.5 h-1.5 bg-parchment-muted rounded-full" />
              <span className="label-tag text-[10px]">System Ready — Press button to initiate active recording</span>
            </div>
            <svg viewBox="0 0 400 40" className="w-full h-[50px]" preserveAspectRatio="none">
              <line x1="0" y1="20" x2="400" y2="20" stroke="#2A333D" strokeWidth="1" />
              <line x1="0" y1="10" x2="400" y2="10" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
              <line x1="0" y1="30" x2="400" y2="30" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
              <path d="M 0 20 L 400 20" stroke="#3A4550" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeDasharray="6 4" opacity="0.6" />
            </svg>
          </div>
          {error && !error.includes("Too many requests") && (
            <div className="mb-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs leading-relaxed">
              {error}
            </div>
          )}
          {/* 429 rate-limit: dark-red alert with Retry Request; the captured audio blob is retained in lastBlobRef so no re-recording is needed */}
          {error?.includes("Too many requests") && lastBlobRef.current && (
            <div className="mb-4">
              <RateLimitAlert onRetry={retryTranscription} />
            </div>
          )}
          {/* Two-click flow verification:
              1) Click "Start Recording — N concepts" on the milestone review panel (sets milestonesConfirmed, mounts this component in IDLE).
              2) Click "Start Recording Capture" below — this is the ONLY action that triggers getUserMedia + MediaRecorder.start().
              => exactly 2 distinct click inputs from concept review to live audio spectrum. */}
          <button onClick={startRecording} className="btn-brass-sharp w-full">
            Start Recording Capture
          </button>
          <p className="font-mono text-[10px] text-parchment-muted mt-2 text-center">Microphone not yet active — no capture until you press the button above.</p>
          {isLowEndDevice && (
            <p className="font-mono text-[10px] text-parchment-muted mt-2 text-center">Live preview disabled by default on this device for performance. You can enable it during recording.</p>
          )}
        </div>
      )}

      {isRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-flagged rounded-full animate-pulse" />
            <h2 className="font-serif text-xl font-semibold text-parchment">Recording</h2>
            <span className="ml-auto font-mono text-xs text-parchment-muted">{formatTime(recordingTime)}</span>
          </div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="label-tag">Live Signal</h3>
            <label className="flex items-center gap-1.5 font-mono text-[10px] text-parchment-muted cursor-pointer">
              <input type="checkbox" checked={showLivePreview} onChange={(e) => setShowLivePreview(e.target.checked)} className="accent-brass w-3 h-3" />
              Show live preview: {showLivePreview ? "On" : "Off"}
            </label>
          </div>

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
          {showLivePreview && (
            <div className="mt-3 p-3 rounded-panel bg-ink border border-ink-border min-h-[52px] max-h-[96px] overflow-y-auto">
              <h3 className="label-tag text-[10px] mb-1">Live preview — approximate</h3>
              {livePreview || liveInterim ? (
                <p className="font-mono text-xs text-parchment-muted leading-relaxed whitespace-pre-wrap">
                  {livePreview}
                  {livePreview && liveInterim ? " " : ""}
                  <span className="italic text-parchment-muted">{liveInterim}</span>
                </p>
              ) : (
                <p className="font-mono text-xs text-parchment-muted italic">Listening… approximate captions will appear here.</p>
              )}
            </div>
          )}
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
          <h3 className="label-tag">Transcribing your explanation...</h3>
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
          <p className="font-mono text-xs text-parchment-muted mb-3">Fix any errors before evaluation</p>

          <textarea
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            rows={6}
            className="w-full rounded-panel bg-ink border border-ink-border p-4 font-mono text-sm text-parchment placeholder:text-parchment-muted focus:outline-none focus:border-brass transition-colors min-h-[120px] max-h-[220px] overflow-y-auto leading-relaxed"
            placeholder="Your transcript will appear here…"
            aria-label="Edit transcript"
          />

          {pendingMetrics && (
            <div className="mt-3 p-3 rounded-panel border border-ink-border bg-ink">
              <h3 className="label-tag text-[10px] mb-1">Speech Analysis (preview)</h3>
              <p className="font-mono text-xs text-parchment-muted">
                Pace: {pendingMetrics.wordsPerMinute} WPM • Pauses: {pendingMetrics.pauseCount} ({(pendingMetrics.totalPauseDuration / 1000).toFixed(1)}s) • Pitch variance: {pendingMetrics.pitchVarianceScore.toFixed(1)}/100
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleConfirm}
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

      {!isRecording && !isTranscribing && !hasRecording && error && !error.includes("Too many requests") && (
        <div className="mt-4">
          <button onClick={handleReset} className="btn-ghost w-full">
            Clear error
          </button>
        </div>
      )}
    </div>
  )
}
