/* eslint-disable react/only-export-components */

"use client"

import { useState, useEffect } from "react"
import { rateClarity } from "../lib/clarityService"
import type { Milestone, ClarityResult } from "../types"
import { checkCoverage } from "../lib/coverageService"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"

export interface MasteryState {
  finalScore: number
  masteryVerified: boolean
  hint: string | null
  showHint: boolean
  coverageScore: number
  clarityScore: number
  isGaming: boolean
  coverageCovered: boolean[]
}

export const useMasteryLoop = (
  milestones: Milestone[],
  apiKey: string
) => {
  const [state, setState] = useState<MasteryState>({
    finalScore: 0,
    masteryVerified: false,
    hint: null,
    showHint: false,
    coverageScore: 0,
    clarityScore: 0,
    isGaming: false,
    coverageCovered: [false, false, false],
  })

  const calculateFinalScore = (
    coverageScore: number,
    clarityScore: number
  ): number => {
    return Math.round(coverageScore * 0.6 + clarityScore * 0.4)
  }

  const generateHint = async (lowestMilestoneText: string) => {
    try {
      const response = await fetch(`${API_BASE}?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `The student's weakest area was: "${lowestMilestoneText}". Give one short coaching hint (not the answer) to help them explain it better. Output ONLY valid JSON: {"hint": "short coaching hint"}`
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          }
        })
      })

      if (!response.ok) throw new Error("API error")

      const data = await response.json()
      const text = data.candidates[0].content.parts[0].text
      const parsed = JSON.parse(text)
      return parsed.hint || "Review the key concepts and try explaining them in your own words."
    } catch {
      return "Review the key concepts and try explaining them in your own words."
    }
  }

  const evaluateCoverage = async (transcript: string) => {
    if (!transcript.trim()) return

    try {
      const result = await checkCoverage(milestones, transcript, apiKey)
      setState((prev) => ({
        ...prev,
        coverageScore: result.coverage_score,
        coverageCovered: result.milestones_covered,
        isGaming: false,
      }))
    } catch {
      // coverage error handled separately
    }
  }

  const evaluateClarity = async (transcript: string) => {
    if (!transcript.trim()) return

    try {
      const result: ClarityResult = await rateClarity(transcript, apiKey)
      const finalClarity = result.is_gaming_attempt ? 0 : result.clarity_score
      const isGaming = result.is_gaming_attempt

      setState((prev) => ({
        ...prev,
        clarityScore: finalClarity,
        isGaming,
        reasoning: result.reasoning,
      }))

      // If gaming detected, force clarity to 0
      if (isGaming) {
        setState((prev) => ({
          ...prev,
          clarityScore: 0,
        }))
      }

      // Check if mastery achieved
      const finalScore = calculateFinalScore(
        prev.coverageScore,
        finalClarity
      )
      const masteryVerified = finalScore >= 90

      setState({
        ...state,
        finalScore,
        masteryVerified,
        showHint: !masteryVerified && !state.showHint,
      })

      if (masteryVerified) {
        setState((prev) => ({
          ...prev,
          hint: null,
          showHint: false,
        }))
      } else {
        // Find the lowest covered milestone for hint
        const uncovered = milestones.filter(
          (m, i) => !prev.coverageCovered[i]
        )
        if (uncovered.length > 0) {
          const hint = await generateHint(uncovered[0].text)
          setState((prev) => ({
            ...prev,
            hint,
            showHint: true,
          }))
        } else {
          setState((prev) => ({
            ...prev,
            hint: "Great job! Review any areas you're unsure about.",
            showHint: true,
          }))
        }
      }
    } catch (err: any) {
      setState({
        ...state,
        clarityScore: 0,
        isGaming: false,
        reasoning: err.message || "Unexpected error.",
      })
    }
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
      coverageCovered: [false, false, false],
    })
  }

  return {
    state,
    calculateFinalScore,
    evaluateCoverage,
    evaluateClarity,
    reset,
  }
}

export const MasteryLoop: React.FC<{
  milestones: Milestone[]
  transcript: string
  onReset?: () => void
}> = ({ milestones, transcript, onReset }) => {
  const {
    state,
    evaluateCoverage,
    evaluateClarity,
    reset,
  } = useMasteryLoop(milestones, import.meta.env.VITE_GEMINI_API_KEY || "")

  // Initialize evaluation when transcript changes
  useEffect(() => {
    if (transcript.trim()) {
      evaluateCoverage(transcript)
      evaluateClarity(transcript)
    }
  }, [transcript, milestones, evaluateCoverage, evaluateClarity])

  const _handleMastery = () => {
    if (state.masteryVerified) {
      if (onReset) onReset()
    } else {
      setState((prev) => ({
        ...prev,
        showHint: true,
      }))
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      {state.masteryVerified && (
        <div className="bg-green-100 border-green-400 rounded-xl p-6 text-center mb-6">
          <h3 className="text-2xl font-bold text-green-800">Mastery Verified!</h3>
          <p className="text-green-600">Your explanation demonstrates excellent coverage and clarity!</p>
          <div className="inline-block mt-4">
            <svg
              className="w-12 h-12 text-green-400 animate-bounce"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
        </div>
      )}

      {!state.masteryVerified && (
        <div>
          <p className="text-slate-600 mb-2">Coverage Score: <strong>{state.coverageScore}%</strong></p>
          <div className="bg-slate-200 rounded-full h-4 w-full">
            <div
              className={`bg-indigo-600 h-4 w-full rounded-md transition-colors`}
              style={{ width: `${state.coverageScore}%` }}
            ></div>
          </div>

          <p className="text-slate-600 mt-4 mb-2">Clarity Score: <strong>{state.clarityScore}</strong>/100</p>
          {state.isGaming && (
            <div className="bg-red-100 border-l-4 border-red-500 p-3 mb-4 rounded">
              <p className="text-red-700"><strong>Gaming Detected:</strong> {state.reasoning}</p>
            </div>
          )}

          <div className="bg-slate-100 rounded p-4 mb-4">
            <p className="font-medium">Final Score: <strong>{state.finalScore}</strong>/100</p>
            <p className="text-sm text-slate-500">
              {(state.coverageScore * 0.6 + state.clarityScore * 0.4).toFixed(0)}%
              (Coverage: {state.coverageScore}% × 0.6 + Clarity: {state.clarityScore}% × 0.4)
            </p>
          </div>

          {state.showHint && !state.masteryVerified && (
            <div className="bg-yellow50 border-l-4 border-yellow-500 p-4 mb-4 rounded">
              <h4 className="font-medium text-yellow-700 mb-2">Coaching Hint</h4>
              <p>{state.hint}</p>
              <button
                onClick={() => {
                  // Reset to try again
                  reset()
                }}
                className="mt-2 text-indigo-600 hover:underline text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {!state.showHint && state.finalScore < 90 && (
            <button
              onClick={() => {
                // Trigger hint generation
                setState((prev) => ({ ...prev, showHint: true }))
              }}
              className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700 mt-2"
            >
              Get Coaching Hint
            </button>
          )}

          {state.masteryVerified && (
            <button
              onClick={() => onReset()}
              className="mt-2 w-full bg-green-600 text-white py-2 rounded-md font-medium transition-colors hover:bg-green-500 active:bg-green-700"
            >
              Continue to Export
            </button>
          )}
        </div>
      )}
    </div>
)
  }

/* eslint-enable react/only-export-components */