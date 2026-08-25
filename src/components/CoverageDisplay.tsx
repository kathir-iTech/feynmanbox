import { useState, useRef, useEffect } from "react"
import { checkCoverage } from "../lib/coverageService"
import type { Milestone, CoverageDetail } from "../types"

export const CoverageDisplay: React.FC<{
  milestones: Milestone[]
  transcript: string
  onEvaluated: (result?: { covered: boolean[]; score: number; details: CoverageDetail[] }) => void
  onBack?: () => void
}> = ({ milestones, transcript, onEvaluated, onBack }) => {
  const [state, setState] = useState<{
    covered: boolean[]
    details: CoverageDetail[]
    coverageScore: number
    loading: boolean
    error: string | null
    evaluated: boolean
  }>({
    covered: milestones.map(() => false),
    details: [],
    coverageScore: 0,
    loading: false,
    error: null,
    evaluated: false,
  })

  const inFlightRef = useRef(false)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  // Reset when transcript or milestones change (new recording / new milestones)
  useEffect(() => {
    inFlightRef.current = false
    setState({
      covered: milestones.map(() => false),
      details: [],
      coverageScore: 0,
      loading: false,
      error: null,
      evaluated: false,
    })
  }, [transcript, milestones])

  const evaluate = async () => {
    if (inFlightRef.current) return

    if (!transcript.trim()) {
      setState((prev) => ({ ...prev, error: "Please provide an explanation to analyze." }))
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, error: "Analysis is temporarily unavailable. Please try again later." }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const result = await checkCoverage(milestones, transcript, apiKey)
      setState({
        covered: result.milestones_covered,
        details: result.details,
        coverageScore: result.coverage_score,
        loading: false,
        error: null,
        evaluated: true,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "We couldn't complete the analysis. Please try again."
      setState((prev) => ({
        ...prev,
        covered: milestones.map(() => false),
        details: [],
        coverageScore: 0,
        loading: false,
        error: message,
        evaluated: false,
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

      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 font-mono text-xs text-parchment-muted hover:text-parchment transition-colors mb-4 tracking-wider"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to transcript
        </button>
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
        disabled={state.loading || !transcript.trim()}
        className={`btn-primary w-full ${
          state.loading || !transcript.trim()
            ? "opacity-40 cursor-not-allowed"
            : ""
        }`}
      >
        {state.loading ? "Analyzing your explanation..." : "Evaluate Coverage"}
      </button>

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 font-mono text-xs text-flagged">
          {state.error}
        </div>
      )}

      {state.evaluated && !state.loading && (
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
          <p className="font-mono text-xs text-parchment-muted mt-2">
            {state.details.filter((d) => d.covered).length} of {state.details.length} concepts covered
          </p>

          {/* What you understood well */}
          {state.details.filter((d) => d.covered).length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-verified rounded-sm" />
                <p className="label-tag text-[10px]">What you understood well</p>
                <span className="font-mono text-[10px] text-verified">
                  {state.details.filter((d) => d.covered).length} • covered
                </span>
              </div>
              <div className="space-y-3">
                {state.details
                  .filter((d) => d.covered)
                  .map((detail, idx) => (
                    <div
                      key={`covered-${idx}`}
                      className="p-3 rounded-panel border border-verified/30 bg-verified/5"
                      style={{ transitionDelay: `${idx * 100}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-4 h-4 rounded-sm bg-verified border border-verified flex items-center justify-center flex-shrink-0">
                          <svg className="w-2.5 h-2.5 text-ink" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-sm text-parchment leading-snug">{detail.concept}</p>
                          <p className="font-mono text-xs text-verified/80 mt-1.5 leading-relaxed">{detail.feedback}</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* What you missed */}
          {state.details.filter((d) => !d.covered).length > 0 && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-flagged rounded-sm" />
                <p className="label-tag text-[10px]">What you missed or need to revisit</p>
                <span className="font-mono text-[10px] text-flagged">
                  {state.details.filter((d) => !d.covered).length} • to review
                </span>
              </div>
              <div className="space-y-3">
                {state.details
                  .filter((d) => !d.covered)
                  .map((detail, idx) => (
                    <div
                      key={`missed-${idx}`}
                      className="p-3 rounded-panel border border-flagged/20 bg-flagged/5"
                      style={{ transitionDelay: `${idx * 100}ms` }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-4 h-4 rounded-sm border-2 border-parchment-muted/30 flex items-center justify-center flex-shrink-0">
                          <span className="font-mono text-[8px] text-parchment-muted">—</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-serif text-sm text-parchment leading-snug">{detail.concept}</p>
                          <p className="font-mono text-xs text-parchment-muted mt-1.5 leading-relaxed">{detail.feedback}</p>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {state.evaluated && !state.loading && (
        <button
          onClick={() => onEvaluated({ covered: state.covered, score: state.coverageScore, details: state.details })}
          className="btn-primary w-full mt-6"
        >
          Proceed to Clarity Check
        </button>
      )}
    </div>
  )
}
