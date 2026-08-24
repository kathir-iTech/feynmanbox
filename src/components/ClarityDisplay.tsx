"use client"

import { useState } from "react"
import { rateClarity } from "../lib/clarityService"
import type { ClarityResult } from "../types"

export const ClarityDisplay: React.FC<{
  transcript: string
  onNext?: () => void
}> = ({ transcript, _coverageScore, onNext }) => {
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

    setState({ ...state, loading: true })

    try {
      const result: ClarityResult = await rateClarity(transcript, import.meta.env.VITE_GEMINI_API_KEY)
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
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Clarity Analysis</h2>

      <p className="text-slate-600 mb-4">{transcript || "No transcript yet"}</p>

      <button
        onClick={evaluate}
        disabled={state.loading}
        className="px-6 py-2 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700"
      >
        {state.loading ? "Evaluating clarity..." : "Rate Clarity"}
      </button>

      {state.loading && <p className="mt-3 text-sm text-slate-500">Checking clarity...</p>}

      {state.clarityScore > 0 && !state.loading && !state.isGaming && (
        <div className="mt-6">
          <p className="text-slate-600 mb-2">Clarity Score: <strong>{state.clarityScore}</strong>/100</p>
          <div className="bg-slate-200 rounded-full h-4 w-full">
            <div
              className="bg-green-500 h-4 w-full rounded-md transition-colors"
              style={{ width: `${state.clarityScore}%` }}
            ></div>
          </div>
        </div>
      )}

      {state.isGaming && !state.loading && (
        <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded">
          <h3 className="text-red-700 font-medium mb-2">Gaming Detected</h3>
          <p className="text-red-600 mb-3">{state.reasoning}</p>
          <p className="text-sm text-red-500">Your clarity score has been forced to 0 due to gaming attempt detected.</p>
        </div>
      )}

      {state.clarityScore > 0 && !state.isGaming && !state.loading && (
        <div className="mt-6">
          <p className="text-slate-600 mb-2">Clarity Score: <strong>{state.clarityScore}</strong>/100</p>
          <div className="bg-slate-200 rounded-full h-4 w-full">
            <div
              className="bg-green-500 h-4 w-full rounded-md transition-colors"
              style={{ width: `${state.clarityScore}%` }}
            ></div>
          </div>
        </div>
      )}
    </div>
  )
}