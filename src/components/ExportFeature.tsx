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

  const generateMarkdown = (): string => {
    const lines: string[] = []
    const documentName = transcript.trim().split("\n")[0].substring(0, 40) || "Study Cards"
    const date = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
    lines.push(`# Study Cards — ${documentName} — ${date}`)
    lines.push("")

    const sortedMilestones = milestones.sort(
      (a, b) => Number(a.id) - Number(b.id),
    )

    sortedMilestones.forEach((milestone, idx) => {
      const matched = details?.find((d) => d.concept === milestone.text) ?? details?.[milestone.id - 1]
      const feedback = matched?.feedback ?? (transcript.trim() ? "No evaluation feedback available." : "")
      const status = matched ? (Boolean(matched.covered) ? "✅ Covered" : "❌ Missed") : "❌ Missed"
      const conceptText = milestone.text
      const explanation = feedback

      lines.push(`## Concept ${idx + 1}: ${conceptText}`)
      lines.push(`**Your explanation:** ${explanation}`)
      lines.push(`**Status:** ${status}`)
      lines.push("")
    })

    return lines.join("\n")
  }

  const generateAnkiCards = (): string => {
    const lines: string[] = []

    const sortedMilestones = milestones.sort(
      (a, b) => Number(a.id) - Number(b.id),
    )

    sortedMilestones.forEach((milestone) => {
      const matched = details?.find((d) => d.concept === milestone.text) ?? details?.[milestone.id - 1]
      const feedback = matched?.feedback ?? (transcript.trim() ? "No evaluation feedback available." : "")
      const front = milestone.text
      const back = feedback

      lines.push(`${front}\t${back}`)
    })

    return lines.join("\n")
  }

  const handleDownload = (format: "markdown" | "anki") => {
    if (Object.keys(exportData).length === 0) return

    setDownloading(true)

    let content: string
    let filename: string

    if (format === "markdown") {
      content = generateMarkdown()
      filename = "feynmanbox-study-cards.md"
    } else {
      content = generateAnkiCards()
      filename = "feynmanbox-study-cards.txt"
    }

    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = filename
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
        Save your key concepts and personal explanations as study cards for later review and practice.
      </p>

      <div className="flex gap-3 mb-4">
        <button
          onClick={() => handleDownload("markdown")}
          disabled={Object.keys(exportData).length === 0 || downloading}
          className={`btn-primary w-1/2 ${downloading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {downloading ? "Preparing your download..." : "Download as Markdown"}
        </button>
        <button
          onClick={() => handleDownload("anki")}
          disabled={Object.keys(exportData).length === 0 || downloading}
          className={`btn-secondary w-1/2 ${downloading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {downloading ? "Preparing your download..." : "Download as Anki Cards (.txt)"}
        </button>
      </div>
    </div>
  )
}
