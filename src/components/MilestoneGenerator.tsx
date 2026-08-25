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
      setError("Preparation is temporarily unavailable. Please try again later.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await generateMilestones(notes, apiKey)
      if (result.success) {
        onMilestonesGenerated(result.milestones)
      } else {
        setError(result.error || "We couldn't prepare your milestones. Please try again.")
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "We couldn't complete the request. Please try again."
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="panel p-6 relative overflow-hidden">
      {loading && (
        <div className="absolute top-0 left-0 right-0 h-0.5">
          <div className="h-full bg-brass animate-progress-bar" />
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        <div className="w-2 h-2 bg-brass rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">
          Context Anchor
        </h2>
      </div>
      <p className="label-tag mb-4">Lecture Notes Input</p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your lecture notes, article excerpt, or study material here..."
        rows={4}
        className="w-full bg-ink border border-ink-border rounded-panel p-3 font-mono text-sm text-parchment placeholder:text-parchment-muted/50 focus:outline-none focus:border-brass transition-colors min-h-[150px]"
      />

      <div className="mt-4">
        <button
          onClick={generate}
          disabled={!notes.trim() || loading}
          className={`btn-primary w-full sm:w-auto ${
            loading || !notes.trim()
              ? "opacity-40 cursor-not-allowed"
              : ""
          }`}
        >
          {loading ? "Preparing your milestones..." : "Generate 3 Milestones"}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
          {error}
        </div>
      )}
    </div>
  )
}
