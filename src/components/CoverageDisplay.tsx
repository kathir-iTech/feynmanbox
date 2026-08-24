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
    rawResponse: string | null
  }>({
    covered: milestones.map(() => false),
    coverageScore: 0,
    loading: false,
    error: null,
    rawResponse: null,
  })

  const inFlightRef = useRef(false)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  const evaluate = async () => {
    if (inFlightRef.current) {
      console.log("[CoverageDisplay] Ignoring click — request already in flight")
      return
    }

    console.log("[CoverageDisplay] evaluate clicked", {
      hasTranscript: !!transcript.trim(),
      hasApiKey: !!apiKey,
      transcriptLength: transcript.length,
    })

    if (!transcript.trim()) {
      setState((prev) => ({ ...prev, error: "No transcript to evaluate" }))
      return
    }

    if (!apiKey) {
      setState((prev) => ({
        ...prev,
        error: "Gemini API key not configured. Add VITE_GEMINI_API_KEY in Vercel dashboard settings.",
        rawResponse: null,
      }))
      return
    }

    inFlightRef.current = true
    setState((prev) => ({ ...prev, loading: true, error: null, rawResponse: null }))

    try {
      console.log("[CoverageDisplay] calling checkCoverage...")
      const result = await checkCoverage(milestones, transcript, apiKey)
      console.log("[CoverageDisplay] SUCCESS — result:", result)
      setState({
        covered: result.milestones_covered,
        coverageScore: result.coverage_score,
        loading: false,
        error: null,
        rawResponse: null,
      })
    } catch (err: unknown) {
      console.error("[CoverageDisplay] FAILED:", err)
      const message = err instanceof Error ? err.message : "Unexpected error"
      setState((prev) => ({
        ...prev,
        covered: milestones.map(() => false),
        coverageScore: 0,
        loading: false,
        error: message,
        rawResponse: null,
      }))
    } finally {
      inFlightRef.current = false
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto relative overflow-hidden">
      {state.loading && (
        <div className="absolute top-0 left-0 right-0 h-1">
          <div className="h-full bg-indigo-500 animate-progress-bar" />
        </div>
      )}

      <h2 className="text-xl font-bold text-slate-800 mb-4">Coverage Analysis</h2>

      <div className="mb-4">
        <p className="text-sm text-slate-500 mb-2">Your transcript ({transcript.length} chars):</p>
        <div className="w-full border border-slate-200 rounded-lg p-3 bg-slate-50 min-h-[80px] max-h-[150px] overflow-y-auto text-sm text-slate-700">
          {transcript || "(empty)"}
        </div>
      </div>

      <button
        onClick={evaluate}
        disabled={state.loading || !transcript.trim() || !apiKey}
        className={`px-6 py-2 rounded-md font-medium transition-colors ${
          state.loading || !transcript.trim() || !apiKey
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
        ) : !apiKey ? "API Key Not Configured" : "Evaluate Coverage"}
      </button>

      {!apiKey && (
        <p className="mt-2 text-sm text-amber-600">
          Add <code className="bg-amber-50 px-1 rounded">VITE_GEMINI_API_KEY</code> in Vercel dashboard Settings → Environment Variables, then redeploy.
        </p>
      )}

      {state.error && !state.loading && (
        <div className="mt-4 p-4 rounded-lg border-2 border-red-300 bg-red-50 text-red-800 text-sm">
          <p className="font-bold mb-1">Coverage evaluation failed</p>
          <p className="font-mono text-xs break-all">{state.error}</p>
        </div>
      )}

      {state.coverageScore > 0 && !state.loading && (
        <div className="mt-6 animate-fade-in">
          <p className="text-slate-600 mb-2">Coverage Score: <strong>{state.coverageScore}%</strong></p>
          <div className="bg-slate-200 rounded-full h-4 w-full overflow-hidden">
            <div
              className="bg-indigo-600 h-4 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${state.coverageScore}%` }}
            />
          </div>

          <div className="mt-4">
            <h3 className="font-medium text-slate-700 mb-3">Milestone Coverage</h3>
            <div className="space-y-2">
              {milestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-3 p-2 rounded transition-all duration-500 ${
                    state.covered[index] ? "bg-green-50" : "bg-red-50"
                  }`}
                  style={{ transitionDelay: `${index * 300}ms` }}
                >
                  <span className={`text-sm font-bold transition-colors duration-500 ${
                    state.covered[index] ? "text-green-600" : "text-red-500"
                  }`}>
                    {state.covered[index] ? "\u2713" : "\u2717"}
                  </span>
                  <span className="text-sm text-slate-700">{milestone.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {state.coverageScore > 0 && !state.loading && (
        <button
          onClick={onEvaluated}
          className="mt-4 w-full px-6 py-2 rounded-md font-medium transition-colors bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        >
          Continue to Clarity Check
        </button>
      )}
    </div>
  )
}
