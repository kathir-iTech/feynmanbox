import { useVoiceRecorder } from "../hooks/useVoiceRecorder"
import { useEffect, useRef, useState } from "react"

function LivePolygraphWaveform({ isRecording }: { isRecording: boolean }) {
  const mainPathRef = useRef<SVGPathElement>(null)
  const shadowPathRef = useRef<SVGPathElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animationRef = useRef<number | null>(null)
  const [useFallback, setUseFallback] = useState(false)

  useEffect(() => {
    if (!isRecording) {
      // Cleanup when recording stops
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        const ctx = audioContextRef.current
        audioContextRef.current = null
        analyserRef.current = null
        if (ctx.state !== "closed") {
          ctx.close().catch(() => {})
        }
        console.log("[Waveform] AudioContext closed, stream stopped")
      } else {
        analyserRef.current = null
      }
      // Reset fallback when not recording so next recording retries real mic
      setUseFallback(false)
      // Reset paths to flat centre line
      const flat = "M 0 20 L 400 20"
      if (mainPathRef.current) mainPathRef.current.setAttribute("d", flat)
      if (shadowPathRef.current) shadowPathRef.current.setAttribute("d", flat)
      return
    }

    let cancelled = false

    async function startAudio() {
      try {
        console.log("[Waveform] Requesting microphone for waveform visualisation…")
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const AudioCtx =
          (window as unknown as { AudioContext: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        audioContextRef.current = ctx
        if (ctx.state === "suspended") {
          await ctx.resume()
        }

        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)
        analyserRef.current = analyser

        console.log("[Waveform] AudioContext active", {
          sampleRate: ctx.sampleRate,
          fftSize: analyser.fftSize,
          state: ctx.state,
        })

        const bufferLength = analyser.fftSize
        const dataArray = new Uint8Array(bufferLength)

        const draw = () => {
          if (!analyserRef.current || !mainPathRef.current) {
            animationRef.current = requestAnimationFrame(draw)
            return
          }
          analyserRef.current.getByteTimeDomainData(dataArray)

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

          animationRef.current = requestAnimationFrame(draw)
        }

        draw()
      } catch (err) {
        console.warn("[Waveform] getUserMedia failed — using decorative fallback", err)
        setUseFallback(true)
      }
    }

    startAudio()

    return () => {
      cancelled = true
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        const ctx = audioContextRef.current
        audioContextRef.current = null
        analyserRef.current = null
        if (ctx.state !== "closed") ctx.close().catch(() => {})
      }
    }
  }, [isRecording])

  return (
    <div className="polygraph-grid rounded-panel border border-ink-border p-4 bg-ink">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 bg-brass rounded-full animate-pulse" />
        <span className="label-tag text-[10px]">Signal Active</span>
      </div>
      <svg viewBox="0 0 400 40" className="w-full h-[50px]" preserveAspectRatio="none">
        <line x1="0" y1="20" x2="400" y2="20" stroke="#2A333D" strokeWidth="1" />
        <line x1="0" y1="10" x2="400" y2="10" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="0" y1="30" x2="400" y2="30" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
        {useFallback ? (
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
  )
}

export const VoiceRecorder: React.FC<{
  onTranscriptReady: (transcript: string) => void
}> = ({ onTranscriptReady }) => {
  const {
    state,
    isSupported,
    startRecording,
    stopRecording,
    resetTranscript,
  } = useVoiceRecorder()

  const [editableTranscript, setEditableTranscript] = useState("")

  useEffect(() => {
    if (!state.isRecording && state.finalTranscript) {
      setEditableTranscript(state.finalTranscript)
    }
    if (state.isRecording) {
      setEditableTranscript("")
    }
  }, [state.finalTranscript, state.isRecording])

  const handleReset = () => {
    resetTranscript()
    setEditableTranscript("")
  }

  return (
    <div className="panel p-6">
      {!isSupported && (
        <div className="p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
          Voice input isn't supported in this browser. Please try Chrome or Edge for the best experience.
        </div>
      )}

      {isSupported && !state.isRecording && state.finalTranscript.length === 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-brass rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Voice Testimony
            </h2>
          </div>
          <p className="label-tag mb-3">Microphone Input</p>
          <p className="text-parchment-muted text-sm mb-5 leading-relaxed">
            Explain your understanding of the milestones aloud. The system will
            transcribe and analyze your explanation for coverage and coherence.
          </p>

          <button onClick={startRecording} className="btn-primary w-full">
            Begin Recording
          </button>
        </div>
      )}

      {state.isRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-flagged rounded-full animate-pulse" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Recording
            </h2>
          </div>
          <p className="label-tag mb-4">Live Signal</p>

          <LivePolygraphWaveform isRecording={state.isRecording} />

          <div className="mt-4 p-4 rounded-panel bg-ink border border-ink-border min-h-[96px] max-h-[180px] overflow-y-auto">
            <p className="label-tag text-[10px] mb-2">Live Transcript — Read Only</p>
            {state.finalTranscript || state.interimTranscript ? (
              <p className="font-mono text-xs text-parchment leading-relaxed whitespace-pre-wrap">
                {state.finalTranscript}
                {state.finalTranscript && state.interimTranscript ? " " : ""}
                <span className="italic text-parchment/70">{state.interimTranscript}</span>
              </p>
            ) : (
              <p className="font-mono text-xs text-parchment-muted/50 italic">
                Listening… your words will appear here as you speak.
              </p>
            )}
          </div>
          <p className="font-mono text-[10px] text-parchment-muted mt-2">
            Your finalized words stay pinned above while you speak. Only the faint italic text is still being formed.
          </p>

          <button
            onClick={stopRecording}
            className="mt-4 w-full bg-flagged/20 border border-flagged/40 text-flagged rounded-panel px-6 py-2 font-semibold transition-colors hover:bg-flagged/30"
          >
            Stop Recording
          </button>
        </div>
      )}

      {!state.isRecording && state.finalTranscript.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-verified rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Review Your Transcript
            </h2>
          </div>
          <p className="label-tag mb-1">REVIEW YOUR TRANSCRIPT</p>
          <p className="font-mono text-xs text-parchment-muted mb-3">
            Fix any errors before evaluation
          </p>

          <textarea
            value={editableTranscript}
            onChange={(e) => setEditableTranscript(e.target.value)}
            rows={6}
            className="w-full rounded-panel bg-ink border border-ink-border p-4 font-mono text-sm text-parchment placeholder:text-parchment-muted/50 focus:outline-none focus:border-brass transition-colors min-h-[120px] max-h-[220px] overflow-y-auto leading-relaxed"
            placeholder="Your transcript will appear here…"
          />

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
    </div>
  )
}
