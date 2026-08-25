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
  onNext?: (result?: { score: number; isGaming: boolean; reasoning: string }) => void
  onBack?: () => void
}> = ({ transcript, onNext, onBack }) => {
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
    inFlightRef.current = false
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
    if (inFlightRef.current) return

    if (!transcript.trim()) {
      setState({ clarityScore: 0, isGaming: false, reasoning: "", loading: false, error: "Please provide an explanation to analyze.", evaluated: false })
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, error: "Analysis is temporarily unavailable. Please try again later.", loading: false }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result: ClarityResult = await rateClarity(transcript, apiKey)
      const finalClarity = result.is_gaming_attempt ? 0 : result.clarity_score
      setState({
        clarityScore: finalClarity,
        isGaming: result.is_gaming_attempt,
        reasoning: result.reasoning,
        loading: false,
        error: null,
        evaluated: true,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "We couldn't complete the analysis. Please try again."
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

      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-mono text-xs text-parchment-muted hover:text-parchment transition-colors mb-4 tracking-wider"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to coverage
        </button>
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
        disabled={state.loading || !transcript.trim()}
        className={`btn-primary w-full ${
          state.loading || !transcript.trim()
            ? "opacity-40 cursor-not-allowed"
            : ""
        }`}
      >
        {state.loading ? "Analyzing your explanation..." : "Rate Clarity"}
      </button>

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 font-mono text-xs text-flagged">
          {state.error}
        </div>
      )}

      {isFlagged && (
        <div className="mt-6 p-4 rounded-panel border border-flagged/60 bg-flagged/10 animate-fade-in">
          <p className="font-mono text-sm font-bold text-flagged tracking-wide">
            Explanation flagged for review
          </p>
          <p className="font-mono text-xs text-flagged/70 mt-2">{state.reasoning}</p>
          <p className="font-mono text-[10px] text-parchment-muted mt-3">
            Clarity was set to 0. Focus on connecting ideas with words like
            “because,” “therefore,” and “this means” to show how concepts relate.
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
        <button onClick={() => onNext?.({ score: state.clarityScore, isGaming: state.isGaming, reasoning: state.reasoning })} className="btn-primary w-full mt-6">
          Continue
        </button>
      )}
    </div>
  )
}
