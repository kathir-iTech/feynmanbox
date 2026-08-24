"use client"

import { useState } from "react"
import type { Milestone } from "../types"

export interface MasteryState {
  finalScore: number
  masteryVerified: boolean
  hint: string | null
  showHint: boolean
  coverageScore: number
  clarityScore: number
  isGaming: boolean
  coverageCovered: boolean[]
  reasoning: string
}

export const useMasteryLoop = (
  milestones: Milestone[],
  onMastery?: (isMastered: boolean) => void,
  onReset?: () => void
) => {
  const [state, setState] = useState<MasteryState>({
    finalScore: 0,
    masteryVerified: false,
    hint: null,
    showHint: false,
    coverageScore: 0,
    clarityScore: 0,
    isGaming: false,
    coverageCovered: milestones.map(() => false),
    reasoning: "",
  })

  const calculateFinalScore = (coverage: number, clarity: number): number => {
    return Math.round(coverage * 0.6 + clarity * 0.4)
  }

  const reset = () => {
    setState({
      finalScore: 0,
      masteryVerified: false,
      hint: null,
      showHint: false,
      coverageScore: 0,
      clarityScore: 0,
      isGaming: false,
      coverageCovered: milestones.map(() => false),
      reasoning: "",
    })
    onReset?.()
  }

  const showHintAction = () => {
    setState((prev) => ({ ...prev, showHint: true }))
  }

  return {
    state,
    setState,
    calculateFinalScore,
    reset,
    showHintAction,
    onMastery,
  }
}

export const MasteryLoop: React.FC<{
  milestones: Milestone[]
  transcript: string
  onMastery?: (isMastered: boolean) => void
  onReset?: () => void
}> = ({ milestones, transcript, onMastery, onReset }) => {
  const { state, reset, showHintAction } = useMasteryLoop(
    milestones,
    onMastery,
    onReset
  )

  const hasScore = state.finalScore > 0

  let content: React.ReactNode

  if (state.masteryVerified) {
    content = (
      <div className="bg-green-100 border border-green-400 rounded-xl p-6 text-center mb-6">
        <h3 className="text-2xl font-bold text-green-800">Mastery Verified!</h3>
        <p className="text-green-600 mb-2">
          Score: <strong>{state.finalScore}</strong>/100
        </p>
        <p className="text-green-600">
          Your explanation demonstrates excellent coverage and clarity!
        </p>
        <div className="inline-block mt-4">
          <svg
            className="w-12 h-12 text-green-400 animate-bounce"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
      </div>
    )
  } else if (state.showHint) {
    content = (
      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded">
        <h4 className="font-medium text-yellow-700 mb-2">Coaching Hint</h4>
        <p className="text-yellow-600">{state.hint}</p>
        <button
          onClick={reset}
          className="mt-3 text-indigo-600 hover:underline text-sm"
        >
          Try Again
        </button>
      </div>
    )
  } else if (hasScore) {
    const barColor = state.finalScore >= 90 ? "bg-green-500" : "bg-indigo-600"
    content = (
      <div>
        <p className="text-slate-600 mb-2">
          Final Score: <strong>{state.finalScore}</strong>/100
        </p>
        <div className="bg-slate-200 h-4 w-full rounded-full">
          <div
            className={`${barColor} h-4 rounded-full transition-colors`}
            style={{ width: `${state.finalScore}%` }}
          />
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Coverage {state.coverageScore}% x 0.6 + Clarity {state.clarityScore} x 0.4
        </p>
        {state.finalScore < 90 && (
          <button
            onClick={showHintAction}
            className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium mt-4 transition-colors hover:bg-indigo-500 active:bg-indigo-700"
          >
            Get Coaching Hint
          </button>
        )}
      </div>
    )
  } else {
    content = (
      <p className="text-slate-500">
        Complete the coverage and clarity evaluations to see your mastery score.
      </p>
    )
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Mastery Check</h2>
      {content}
      {transcript && (
        <details className="mt-4">
          <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
            View Transcript
          </summary>
          <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap">{transcript}</p>
        </details>
      )}
      <button
        onClick={reset}
        className="mt-4 w-full bg-slate-200 text-slate-700 py-2 rounded-md font-medium transition-colors hover:bg-slate-300 active:bg-slate-400"
      >
        Start Over
      </button>
    </div>
  )
}
