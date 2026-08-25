import { useState } from "react"
import type { Milestone } from "../types"

export const ExportFeature: React.FC<{
  milestones: Milestone[]
  transcript: string
  onReset?: () => void
}> = ({ milestones, transcript }) => {
  const [downloading, setDownloading] = useState(false)

  const exportData: Record<string, string> = {}
  milestones.forEach((milestone, index) => {
    exportData[milestone.text] =
      transcript.split(". ").length > index
        ? transcript.split(". ")[index].trim() + "."
        : transcript.trim() || ""
  })

  const handleDownload = () => {
    if (Object.keys(exportData).length === 0) return

    setDownloading(true)

    const jsonString = JSON.stringify(exportData, null, 2)
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
        <h2 className="font-serif text-xl font-semibold text-parchment">
          Export Case File
        </h2>
      </div>
      <p className="label-tag mb-4">Study Card Generation</p>

      <p className="font-mono text-xs text-parchment-muted mb-5 leading-relaxed">
        Save your milestones and personal explanations as study cards for
        later review and practice.
      </p>

      <button
        onClick={handleDownload}
        disabled={Object.keys(exportData).length === 0 || downloading}
        className={`btn-primary w-full ${
          downloading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {downloading ? "Preparing your download..." : "Download Study Cards"}
      </button>
    </div>
  )
}
