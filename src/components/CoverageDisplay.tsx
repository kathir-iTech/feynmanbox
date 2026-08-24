import { useState } from "react"
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

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  const evaluate = async () => {
    if (!transcript.trim()) {
      setState((prev) => ({ ...prev, error: "No transcript to evaluate" }))
      return
    }

    if (!apiKey) {
      setState((prev) => ({ ...prev, error: "Gemini API key not configured" }))
      return
    }

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
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Coverage Analysis</h2>

      <div className="mb-4">
        <p className="text-sm text-slate-500 mb-2">Your transcript:</p>
        <div className="w-full border border-slate-200 rounded-lg p-3 bg-slate-50 min-h-[80px] max-h-[150px] overflow-y-auto text-sm text-slate-700">
          {transcript}
        </div>
      </div>

      <button
        onClick={evaluate}
        disabled={state.loading || !transcript.trim()}
        className={`px-6 py-2 rounded-md font-medium transition-colors ${
          state.loading || !transcript.trim()
            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
            : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        }`}
      >
        {state.loading ? "Evaluating..." : "Evaluate Coverage"}
      </button>

      {state.loading && <p className="mt-3 text-sm text-slate-500">Checking milestone coverage...</p>}

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded bg-red-100 text-red-800 text-sm mb-4">
          {state.error}
        </div>
      )}

      {state.coverageScore > 0 && !state.loading && (
        <div className="mt-6">
          <p className="text-slate-600 mb-2">Coverage Score: <strong>{state.coverageScore}%</strong></p>
          <div className="bg-slate-200 rounded-full h-4 w-full">
            <div
              className="bg-indigo-600 h-4 rounded-full transition-colors"
              style={{ width: `${state.coverageScore}%` }}
            />
          </div>

          <div className="mt-4">
            <h3 className="font-medium text-slate-700 mb-3">Milestone Coverage</h3>
            <div className="space-y-2">
              {milestones.map((milestone, index) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-3 p-2 rounded ${
                    state.covered[index] ? "bg-green-50" : "bg-red-50"
                  }`}
                >
                  <span className={`text-sm ${state.covered[index] ? "text-green-600" : "text-red-500"}`}>
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
