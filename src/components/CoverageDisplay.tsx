import { useState, useRef } from "react"
import { checkCoverage } from "../lib/coverageService"
import type { Milestone } from "../types"

export const CoverageDisplay: React.FC<{
  milestones: Milestone[]
  transcript: string
  onEvaluated: () => void
}> = ({ milestones, transcript, onEvaluated }) => {
  const [state, setState] = useState<{
    covered: boolean[]
    coverageScore: number
    loading: boolean
    error: string | null
  }>({
    covered: milestones.map(() => false),
    coverageScore: 0,
    loading: false,
    error: null,
  })

  const inFlightRef = useRef(false)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  const evaluate = async () => {
    if (inFlightRef.current) return

    if (!transcript.trim()) {
      setState((prev) => ({ ...prev, error: "[ERROR] No transcript provided" }))
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, error: "[ERROR] API key not configured" }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = await checkCoverage(milestones, transcript, apiKey)
      setState({
        covered: result.milestones_covered,
        coverageScore: result.coverage_score,
        loading: false,
        error: null,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error"
      setState((prev) => ({
        ...prev,
        covered: milestones.map(() => false),
        coverageScore: 0,
        loading: false,
        error: message,
      }))
    } finally {
      inFlightRef.current = false
    }
  }

  return (
    <div className={`panel p-6 relative overflow-hidden ${
      state.error && !state.loading ? "border-flagged/40" : ""
    }`}>
      {state.loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5">
          <div className="h-full bg-brass animate-progress-bar" />
        </div>
      )}

      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 bg-brass rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">
          Coverage Analysis
        </h2>
      </div>
      <p className="label-tag mb-5">Milestone Verification</p>

      <div className="mb-5">
        <p className="label-tag text-[10px] mb-2">Input Transcript</p>
        <div className="w-full rounded-panel bg-ink border border-ink-border p-3 font-mono text-xs text-parchment/60 min-h-[60px] max-h-[120px] overflow-y-auto">
          {transcript || "(empty)"}
        </div>
      </div>

      <button
        onClick={evaluate}
        disabled={state.loading || !transcript.trim() || !apiKey}
        className={`btn-primary w-full ${
          state.loading || !transcript.trim() || !apiKey
            ? "opacity-40 cursor-not-allowed"
            : ""
        }`}
      >
        {state.loading ? "Analyzing..." : "Evaluate Coverage"}
      </button>

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 font-mono text-xs text-flagged">
          {state.error}
        </div>
      )}

      {state.coverageScore > 0 && !state.loading && (
        <div className="mt-6 animate-fade-in">
          <div className="flex items-baseline gap-3 mb-2">
            <span className="label-tag">Coverage</span>
            <span className="score-display text-3xl">{state.coverageScore}%</span>
          </div>
          <div className="h-1 bg-ink-border rounded-sm overflow-hidden">
            <div
              className="h-full bg-brass transition-all duration-1000 ease-out"
              style={{ width: `${state.coverageScore}%` }}
            />
          </div>

          <div className="mt-6">
            <p className="label-tag text-[10px] mb-3">Case File</p>
            <div className="space-y-2">
              {milestones.map((milestone, index) => {
                const verified = state.covered[index]
                return (
                  <div
                    key={milestone.id}
                    className={`flex items-start gap-3 p-3 rounded-panel border transition-all duration-500 ${
                      verified
                        ? "border-verified/30 bg-verified/5"
                        : "border-ink-border bg-ink"
                    }`}
                    style={{ transitionDelay: `${index * 300}ms` }}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      verified
                        ? "bg-brass border-brass"
                        : "border-parchment-muted/30"
                    }`}>
                      {verified && (
                        <svg className="w-2.5 h-2.5 text-ink" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-serif text-sm text-parchment leading-snug">
                        {milestone.text}
                      </p>
                    </div>
                    {verified && (
                      <span className="font-mono text-[10px] text-verified tracking-wider flex-shrink-0 mt-0.5">
                        [VERIFIED]
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {state.coverageScore > 0 && !state.loading && (
        <button onClick={onEvaluated} className="btn-primary w-full mt-6">
          Proceed to Clarity Check
        </button>
      )}
    </div>
  )
}
