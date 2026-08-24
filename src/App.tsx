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
  const [showClarity, setShowClarity] = useState(false)
  const [isMastered, setIsMastered] = useState(false)

  const handleCoverageComplete = () => {
    setShowClarity(true)
  }

  const handleMastery = (mastered: boolean) => {
    setIsMastered(mastered)
  }

  const handleReset = () => {
    setMilestones([])
    setTranscript("")
    setShowClarity(false)
    setIsMastered(false)
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-parchment tracking-tight">
            FeynmanBox
          </h1>
          <div className="mt-3 mx-auto w-16 h-0.5 bg-brass" />
          <p className="mt-3 label-tag">Oral Examination System</p>
        </header>

        <main className="space-y-6">
          {milestones.length === 0 && (
            <MilestoneGenerator onMilestonesGenerated={setMilestones} />
          )}

          {milestones.length > 0 && !transcript && (
            <VoiceRecorder onTranscriptReady={setTranscript} />
          )}

          {milestones.length > 0 && transcript && !showClarity && (
            <CoverageDisplay
              milestones={milestones}
              transcript={transcript}
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
        </main>
      </div>
    </div>
  )
}
