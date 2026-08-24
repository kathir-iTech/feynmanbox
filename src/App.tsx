"use client"

import "./index.css"
import { MilestoneGenerator } from "./components/MilestoneGenerator"
import { VoiceRecorder } from "./components/VoiceRecorder"
import { CoverageDisplay } from "./components/CoverageDisplay"
import { ClarityDisplay } from "./components/ClarityDisplay"
import { MasteryLoop } from "./components/MasteryLoop"
import { ExportFeature } from "./components/ExportFeature"
import type { Milestone } from "./types"
import { useState } from "react"

export default function App() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [transcript, setTranscript] = useState<string>("")
  const [showCoverage, setShowCoverage] = useState(false)
  const [showClarity, setShowClarity] = useState(false)
  const [isMastered, setIsMastered] = useState(false)

  const handleCoverageComplete = () => {
    setShowClarity(true)
    setTranscript("")
  }

  const handleMastery = (isMastered: boolean) => {
    setIsMastered(isMastered)
  }

  const handleReset = () => {
    setMilestones([])
    setTranscript("")
    setShowCoverage(false)
    setShowClarity(false)
    setIsMastered(false)
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-6 text-center">
          FeynmanBox
        </h1>

        {milestones.length === 0 && (
          <MilestoneGenerator />
        )}

        {milestones.length > 0 && !transcript && (
          <VoiceRecorder />
        )}

        {milestones.length > 0 && transcript && !showCoverage && (
          <CoverageDisplay
            milestones={milestones}
            onEvaluated={handleCoverageComplete}
          />
        )}

        {showCoverage && milestones.length > 0 && transcript && (
          <CoverageDisplay
            milestones={milestones}
            onEvaluated={handleCoverageComplete}
          />
        )}

        {showClarity && milestones.length > 0 && transcript && (
          <ClarityDisplay
            transcript={transcript}
            onNext={() => setShowClarity(false)}
          />
        )}

        {milestones.length > 0 && transcript && (
          <MasteryLoop
            milestones={milestones}
            transcript={transcript}
            onMastery={handleMastery}
            onReset={handleReset}
          />
        )}

        {isMastered && milestones.length > 0 && (
          <ExportFeature
            milestones={milestones}
            transcript={transcript}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}