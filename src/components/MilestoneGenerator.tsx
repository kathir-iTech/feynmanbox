import { useState } from "react"
import { generateMilestones } from "../lib/milestoneService"
import type { Milestone } from "../types"

export const MilestoneGenerator: React.FC<{
  onMilestonesGenerated: (milestones: Milestone[]) => void
}> = ({ onMilestonesGenerated }) => {
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  const generate = async () => {
    if (!notes.trim()) {
      setError("Please paste lecture notes first")
      return
    }

    if (!apiKey) {
      setError("Gemini API key not configured. Check Vercel environment variables.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await generateMilestones(notes, apiKey)
      if (result.success) {
        onMilestonesGenerated(result.milestones)
      } else {
        setError(result.error || "Failed to generate milestones.")
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unexpected error. Please try again."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 relative overflow-hidden">
      {loading && (
        <div className="absolute top-0 left-0 right-0 h-1">
          <div className="h-full bg-indigo-500 animate-progress-bar" />
        </div>
      )}

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
          onClick={generate}
          disabled={!notes.trim() || loading || !apiKey}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            loading || !notes.trim() || !apiKey
              ? "bg-slate-200 text-slate-500 cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-500 active:bg-indigo-700"
          }`}
        >
          {loading
            ? "Generating milestones..."
            : "Generate 3 Milestones"}
        </button>
      </div>

      {loading && (
        <p className="mt-3 text-sm text-slate-500">Calling Gemini Flash...</p>
      )}

      {error && (
        <div className="mt-4 p-3 rounded bg-red-100 text-red-800 text-sm mb-4">
          {error}
        </div>
      )}
    </div>
  )
}
