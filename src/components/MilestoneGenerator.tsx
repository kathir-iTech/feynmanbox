/* eslint-disable react/only-export-components */

import { useState } from "react"
import { generateMilestones } from "../lib/milestoneService"
import type { MilestoneState } from "../types"

export const useMilestoneGenerator = () => {
  const [state, setState] = useState<MilestoneState>({
    success: false,
    milestones: [],
    error: null,
    loading: false,
  })

  const [apiKey, _setApiKey] = useState(() => {
    // Read from environment variable
    return import.meta.env.VITE_GEMINI_API_KEY || ""
  })

  const generate = async (notes: string) => {
    if (!notes.trim()) {
      setState({
        success: false,
        milestones: [],
        error: "Please paste lecture notes first",
        loading: false,
      })
      return
    }

    if (!apiKey) {
      setState({
        success: false,
        milestones: [],
        error: "Gemini API key not configured. Check .env file.",
        loading: false,
      })
      return
    }

    setState({ ...state, loading: true, error: null })

    try {
      const result = await generateMilestones(notes, apiKey)
      setState(result)
    } catch (err: any) {
      setState({
        success: false,
        milestones: [],
        error: err.message || "Unexpected error. Please try again.",
        loading: false,
      })
    }
  }

  const retry = () => {
    // Keep current state but clear error, allow regeneration
    setState({
      success: state.success,
      milestones: state.milestones,
      error: null,
      loading: false,
    })
  }

  return {
    state,
    generate,
    retry,
  }
}

/* eslint-enable react/only-export-components */

export const MilestoneGenerator: React.FC = () => {
  const { state, generate, retry } = useMilestoneGenerator()
  const [notes, setNotes] = useState("")

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Context Anchor: Lecture Notes</h2>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your lecture notes here..."
        rows={4}
        className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors min-h-[150px]"
      />

      <div className="mt-4">
        <button
          onClick={() => generate(notes)}
          disabled={!notes.trim() || state.loading || !import.meta.env.VITE_GEMINI_API_KEY}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            state.loading || !notes.trim() || !import.meta.env.VITE_GEMINI_API_KEY
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
          }`}
        >
          {state.loading
            ? "Generating milestones..."
            : notes.trim() && import.meta.env.VITE_GEMINI_API_KEY
              ? "Generate 3 Milestones"
              : "Enter notes and set API key"}
        </button>
      </div>

      {state.loading && (
        <p className="mt-3 text-sm text-slate-500">Calling Gemini 1.5 Flash...</p>
      )}

      {state.error && !state.loading && (
        <div className="mt-4 p-3 rounded bg-red-100 text-red-800 text-sm mb-4">
          {state.error}
        </div>
      )}

      {state.success && !state.loading && (
        <div className="mt-6">
          <h3 className="text-semibold text-slate-800 mb-3">Generated Milestones</h3>
          <div className="space-y-2">
            {state.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-center justify-between p-3 rounded bg-slate-50"
              >
                <span className="text-slate-700">{milestone.text}</span>
                <svg
                  className="w-5 h-5 text-indigo-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 18l6-6-6-6M9 6l6 6 6-6" />
                </svg>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.error && state.loading && (
        <button
          onClick={retry}
          className="mt-3 px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700 text-sm"
        >
          Retry
        </button>
      )}
    </div>
  )
}