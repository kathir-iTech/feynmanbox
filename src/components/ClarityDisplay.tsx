import { useState, useEffect, useRef } from "react"
import { rateClarity } from "../lib/clarityService"
import type { ClarityResult } from "../types"

function AnimatedScore({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 1000
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(eased * value))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value])

  return <span className="score-display">{displayed}</span>
}

export const ClarityDisplay: React.FC<{
  transcript: string
  onNext?: () => void
}> = ({ transcript, onNext }) => {
  const [state, setState] = useState<{
    clarityScore: number
    isGaming: boolean
    reasoning: string
    loading: boolean
    error: string | null
    evaluated: boolean
  }>({
    clarityScore: 0,
    isGaming: false,
    reasoning: "",
    loading: false,
    error: null,
    evaluated: false,
  })

  const inFlightRef = useRef(false)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  useEffect(() => {
    setState({
      clarityScore: 0,
      isGaming: false,
      reasoning: "",
      loading: false,
      error: null,
      evaluated: false,
    })
  }, [transcript])

  const evaluate = async () => {
    console.log("[ClarityDisplay] button onClick → evaluate() fired", {
      hasTranscript: !!transcript.trim(),
      transcriptLength: transcript.length,
      hasApiKey: !!apiKey,
    })

    if (inFlightRef.current) {
      console.log("[ClarityDisplay] Ignoring click — in flight")
      return
    }

    if (!transcript.trim()) {
      setState({ clarityScore: 0, isGaming: false, reasoning: "", loading: false, error: "[ERROR] No transcript", evaluated: false })
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, error: "[ERROR] API key not configured", loading: false }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null }))
    console.log("[ClarityDisplay] → calling rateClarity")

    try {
      const result: ClarityResult = await rateClarity(transcript, apiKey)
      console.log("[ClarityDisplay] ← rateClarity result:", result)
      console.log("[ClarityDisplay] parsed object:", result)
      const finalClarity = result.is_gaming_attempt ? 0 : result.clarity_score
      setState({
        clarityScore: finalClarity,
        isGaming: result.is_gaming_attempt,
        reasoning: result.reasoning,
        loading: false,
        error: null,
        evaluated: true,
      })
      console.log("[ClarityDisplay] UI should now show", result.is_gaming_attempt ? "FLAGGED" : `Clarity ${finalClarity}%`)
    } catch (err: unknown) {
      console.error("[ClarityDisplay] FAILED:", err)
      const message = err instanceof Error ? err.message : "Unexpected error"
      setState({ clarityScore: 0, isGaming: false, reasoning: "", loading: false, error: message, evaluated: false })
    } finally {
      inFlightRef.current = false
    }
  }

  const isFlagged = state.isGaming && !state.loading

  return (
    <div className={`panel p-6 relative overflow-hidden ${
      isFlagged ? "animate-shake animate-pulse-red border-flagged/60" : ""
    }`}>
      {state.loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5">
          <div className="h-full bg-brass animate-progress-bar" />
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 bg-brass rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">
          Clarity Analysis
        </h2>
      </div>
      <p className="label-tag mb-5">Coherence Diagnostic</p>

      <button
        onClick={evaluate}
        disabled={state.loading || !transcript.trim() || !apiKey}
        className={`btn-primary w-full ${
          state.loading || !transcript.trim() || !apiKey
            ? "opacity-40 cursor-not-allowed"
            : ""
        }`}
      >
        {state.loading ? "Analyzing..." : "Rate Clarity"}
      </button>

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 font-mono text-xs text-flagged">
          {state.error}
        </div>
      )}

      {isFlagged && (
        <div className="mt-6 p-4 rounded-panel border border-flagged/60 bg-flagged/10 animate-fade-in">
          <p className="font-mono text-sm font-bold text-flagged tracking-wide">
            [ANALYSIS FLAGGED: INCOHERENT PATTERN DETECTED]
          </p>
          <p className="font-mono text-xs text-flagged/70 mt-2">{state.reasoning}</p>
          <p className="font-mono text-[10px] text-parchment-muted mt-3">
            Clarity score overridden to 0. The system detected keyword-listing
            without logical sentence structure.
          </p>
        </div>
      )}

      {state.evaluated && !state.isGaming && !state.loading && (
        <div className="mt-6 animate-fade-in">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="label-tag">Clarity</span>
            <AnimatedScore value={state.clarityScore} />
            <span className="label-tag">/100</span>
          </div>
          <div className="h-1 bg-ink-border rounded-sm overflow-hidden">
            <div
              className="h-full bg-brass transition-all duration-1000 ease-out"
              style={{ width: `${state.clarityScore}%` }}
            />
          </div>
          {state.reasoning && (
            <p className="mt-3 font-mono text-xs text-parchment-muted">
              {state.reasoning}
            </p>
          )}
        </div>
      )}

      {state.evaluated && !state.loading && (
        <button onClick={onNext} className="btn-primary w-full mt-6">
          Proceed
        </button>
      )}
    </div>
  )
}
