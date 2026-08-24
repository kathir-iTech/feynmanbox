/* eslint-disable react/only-export-components */

"use client"

import { useState, useEffect } from "react"
import { checkCoverage } from "../lib/coverageService"
import type { Milestone, CoverageState } from "../types"

export const useCoverageEvaluator = (milestones: Milestone[], apiKey: string) => {
  const [state, setState] = useState<CoverageState>({
    covered: [false, false, false],
    coverageScore: 0,
    error: null,
    loading: false,
  })

  const evaluate = async (transcript: string) => {
    if (!transcript.trim()) {
      setState({
        covered: [false, false, false],
        coverageScore: 0,
        error: "Please provide a transcript first",
        loading: false,
      })
      return
    }

    if (!apiKey) {
      setState({
        covered: [false, false, false],
        coverageScore: 0,
        error: "Gemini API key not configured",
        loading: false,
      })
      return
    }

    setState({ ...state, loading: true, error: null })

    try {
      const result = await checkCoverage(milestones, transcript, apiKey)
      setState({
        covered: result.milestones_covered,
        coverageScore: result.coverage_score,
        error: null,
        loading: false,
      })
    } catch (err: any) {
      setState({
        covered: [false, false, false],
        coverageScore: 0,
        error: err.message || "Unexpected error. Please try again.",
        loading: false,
      })
    }
  }

  const retry = () => {
    setState({
      covered: [false, false, false],
      coverageScore: 0,
      error: null,
      loading: false,
    })
  }

  return {
    state,
    evaluate,
    retry,
  }
}

/* eslint-enable react/only-export-components */

export const CoverageDisplay: React.FC<{
  milestones: Milestone[]
  onEvaluated: () => void
}> = ({ milestones, onEvaluated }) => {
  const { state, evaluate } = useCoverageEvaluator(milestones, import.meta.env.VITE_GEMINI_API_KEY || "")

  // Initialize evaluation when transcript changes
  useEffect(() => {
    if (state.coverageScore > 0) {
      evaluate("placeholder transcript")
    }
  }, [state.coverageScore])

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Coverage Analysis</h2>

      <div className="mb-4">
        <textarea
          placeholder="Transcript will appear here after voice recording..."
          readOnly
          className="w-full border border-slate-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors min-h-[100px] mb-3"
        />
      </div>

      <button
        onClick={() => evaluate("placeholder transcript")}
        disabled={state.loading}
        className={`px-6 py-2 rounded-md font-medium transition-colors ${
          state.loading || state.error
            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
            : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        }`}
      >
        Evaluate Coverage
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
              className={`bg-indigo-600 h-4 w-full transition-colors`}
              style={{ width: `${state.coverageScore}%` }}
            ></div>
          </div>

          <div className="mt-4">
            <h3 className="text-semibold text-slate-700 mb-3">Milestone Coverage</h3>
            <div className="space-y-1">
              {/* Milestones will be rendered here */}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onEvaluated}
        disabled={state.loading}
        className={`px-6 py-2 rounded-md font-medium transition-colors ${
          state.loading ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
        }`}
      >
        Evaluate
      </button>
    </div>
  )
}