import { useState } from "react"
import type { Milestone, CoverageDetail } from "../types"

export const ExportFeature: React.FC<{
  milestones: Milestone[]
  transcript: string
  details?: CoverageDetail[]
  onReset?: () => void
}> = ({ milestones, transcript, details }) => {
  const [downloading, setDownloading] = useState(false)

  // Build export mapping milestone.id -> { concept, feedback, covered }
  // Uses actual evaluation feedback when available, avoiding the broken sentence-splitting logic.
  const buildExportData = (): Record<string, { concept: string; feedback: string; covered: boolean }> => {
    const out: Record<string, { concept: string; feedback: string; covered: boolean }> = {}
    milestones.forEach((milestone) => {
      const matched = details?.find((d) => d.concept === milestone.text) ?? details?.[milestone.id - 1]
      const feedback = matched?.feedback ?? (transcript.trim() ? "No evaluation feedback available." : "")
      const covered = matched ? Boolean(matched.covered) : false
      out[String(milestone.id)] = {
        concept: milestone.text,
        feedback,
        covered,
      }
    })
    return out
  }

  const exportData = buildExportData()

  const handleDownload = () => {
    if (Object.keys(exportData).length === 0) return

    setDownloading(true)

    const payload = {
      exportedAt: new Date().toISOString(),
      transcript: transcript.trim(),
      cards: exportData,
    }

    const jsonString = JSON.stringify(payload, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = "feynmanbox-study-cards.json"
    a.click()

    URL.revokeObjectURL(url)
    setDownloading(false)
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-2 h-2 bg-verified rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">Export Case File</h2>
      </div>
      <h3 className="label-tag mb-4">Study Card Generation</h3>

      <p className="font-mono text-xs text-parchment-muted mb-5 leading-relaxed">
        Save your milestones and personal explanations as study cards for later review and practice.
      </p>

      <button
        onClick={handleDownload}
        disabled={Object.keys(exportData).length === 0 || downloading}
        className={`btn-primary w-full ${downloading ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        {downloading ? "Preparing your download..." : "Download Study Cards"}
      </button>
    </div>
  )
}
