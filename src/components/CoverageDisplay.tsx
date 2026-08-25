import { useState, useRef, useEffect } from "react"
import { checkCoverage } from "../lib/coverageService"
import type { Milestone } from "../types"

export const CoverageDisplay: React.FC<{
  milestones: Milestone[]
  transcript: string
  onEvaluated: (result?: { covered: boolean[]; score: number }) => void
}> = ({ milestones, transcript, onEvaluated }) => {
  const [state, setState] = useState<{
    covered: boolean[]
    coverageScore: number
    loading: boolean
    error: string | null
    evaluated: boolean
  }>({
    covered: milestones.map(() => false),
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
      coverageScore: 0,
      loading: false,
      error: null,
      evaluated: false,
    })
  }, [transcript, milestones])

  const evaluate = async () => {
    console.log("[CoverageDisplay] button onClick → evaluate() fired", {
      hasTranscript: !!transcript.trim(),
      transcriptLength: transcript.length,
      transcriptPreview: transcript.substring(0, 80),
      hasApiKey: !!apiKey,
      apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "…" : "(none)",
      inFlight: inFlightRef.current,
    })

    if (inFlightRef.current) {
      console.log("[CoverageDisplay] Ignoring click — request already in flight")
      return
    }

    if (!transcript.trim()) {
      console.warn("[CoverageDisplay] No transcript to evaluate")
      setState((prev) => ({ ...prev, error: "Please provide an explanation to analyze." }))
      return
    }

    if (!apiKey) {
      console.warn("[CoverageDisplay] API key missing")
      setState((prev) => ({ ...prev, error: "Analysis is temporarily unavailable. Please try again later." }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null }))
    console.log("[CoverageDisplay] → calling checkCoverage(milestones, transcript, apiKey)")

    try {
      const result = await checkCoverage(milestones, transcript, apiKey)
      console.log("[CoverageDisplay] ← checkCoverage SUCCESS, raw result:", result)
      // Temporary log required by Issue 3 — proves parse succeeded and data is used
      console.log("[CoverageDisplay] parsed milestones_covered:", result.milestones_covered, "coverage_score:", result.coverage_score)
      console.log("[CoverageDisplay] → setState({ covered, coverageScore, evaluated:true }) — UI should update now")
      setState({
        covered: result.milestones_covered,
        coverageScore: result.coverage_score,
        loading: false,
        error: null,
        evaluated: true,
      })
      console.log("[CoverageDisplay] UI state updated — coverageScore displayed should be", result.coverage_score)
    } catch (err: unknown) {
      console.error("[CoverageDisplay] ← checkCoverage FAILED:", err)
      const message = err instanceof Error ? err.message : "Unexpected error"
      setState((prev) => ({
        ...prev,
        covered: milestones.map(() => false),
        coverageScore: 0,
        loading: false,
        error: message,
        evaluated: false,
      }))
      console.log("[CoverageDisplay] error state set, UI should show red error box with message:", message)
    } finally {
      inFlightRef.current = false
      console.log("[CoverageDisplay] evaluate() finally — inFlight reset to false")
    }
  }

  // Debug trace: log render state each time
  console.log("[CoverageDisplay] render", {
    transcriptLength: transcript.length,
    loading: state.loading,
    evaluated: state.evaluated,
    coverageScore: state.coverageScore,
    error: state.error,
  })

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

      {state.evaluated && !state.loading && (
        <button onClick={() => onEvaluated({ covered: state.covered, score: state.coverageScore })} className="btn-primary w-full mt-6">
          Proceed to Clarity Check
        </button>
      )}
    </div>
  )
}
