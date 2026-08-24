"use client"

import { useState } from "react"
import type { Milestone } from "../types"

export const ExportFeature: React.FC<{
  milestones: Milestone[]
  transcript: string
  _onReset: () => void
}> = ({ milestones, transcript, _onReset }) => {
  const [downloading, setDownloading] = useState(false)

  // Compute export data directly - no setState in effect needed
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
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      <h3 className="text-xl font-bold text-slate-800 mb-4">Download Study Cards</h3>
      <p className="text-slate-600 mb-4">
        Export your milestones and explanations as a JSON file for spaced-repetition
        study. Front: milestone question, Back: your explanation.
      </p>

      <button
        onClick={handleDownload}
        disabled={Object.keys(exportData).length === 0 || downloading}
        className={`w-full bg-indigo-600 text-white py-3 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700 mt-4 ${
          downloading ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {downloading ? "Downloading..." : "Download Study Cards"}
      </button>
    </div>
  )
}