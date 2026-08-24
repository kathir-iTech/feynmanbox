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

  return <strong className="text-lg">{displayed}</strong>
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
  }>({
    clarityScore: 0,
    isGaming: false,
    reasoning: "",
    loading: false,
  })

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  const evaluate = async () => {
    if (!transcript.trim()) {
      setState({
        clarityScore: 0,
        isGaming: false,
        reasoning: "No transcript to evaluate",
        loading: false,
      })
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, reasoning: "Gemini API key not configured", loading: false }))
      return
    }

    setState((prev) => ({ ...prev, loading: true }))

    try {
      const result: ClarityResult = await rateClarity(transcript, apiKey)
      const finalClarity = result.is_gaming_attempt ? 0 : result.clarity_score
      setState({
        clarityScore: finalClarity,
        isGaming: result.is_gaming_attempt,
        reasoning: result.reasoning,
        loading: false,
      })

      if (result.is_gaming_attempt && onNext) {
        onNext()
      }
    } catch {
      setState({
        clarityScore: 0,
        isGaming: false,
        reasoning: "Unexpected error. Please try again.",
        loading: false,
      })
    }
  }

  return (
    <div className={`p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto relative overflow-hidden ${
      state.isGaming ? "animate-shake animate-pulse-red" : ""
    }`}>
      {state.loading && (
        <div className="absolute top-0 left-0 right-0 h-1">
          <div className="h-full bg-indigo-500 animate-progress-bar" />
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-800 mb-4">Clarity Analysis</h2>

      <button
        onClick={evaluate}
        disabled={state.loading || !transcript.trim()}
        className={`px-6 py-2 rounded-md font-medium transition-colors ${
          state.loading || !transcript.trim()
            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
            : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        }`}
      >
        {state.loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Evaluating...
          </span>
        ) : "Rate Clarity"}
      </button>

      {state.isGaming && !state.loading && (
        <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded animate-fade-in">
          <h3 className="text-red-700 font-medium mb-2">Gaming Detected!</h3>
          <p className="text-red-600 mb-3">{state.reasoning}</p>
          <p className="text-sm text-red-500">Clarity score forced to 0.</p>
        </div>
      )}

      {state.clarityScore > 0 && !state.isGaming && !state.loading && (
        <div className="mt-6 animate-fade-in">
          <p className="text-slate-600 mb-2">
            Clarity Score: <AnimatedScore value={state.clarityScore} />/100
          </p>
          <div className="bg-slate-200 rounded-full h-4 w-full overflow-hidden">
            <div
              className="bg-green-500 h-4 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${state.clarityScore}%` }}
            />
          </div>
          {state.reasoning && (
            <p className="mt-3 text-sm text-slate-500">{state.reasoning}</p>
          )}
        </div>
      )}

      {(state.clarityScore > 0 || state.isGaming) && !state.loading && (
        <button
          onClick={onNext}
          className="mt-4 w-full px-6 py-2 rounded-md font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        >
          Continue
        </button>
      )}
    </div>
  )
}
