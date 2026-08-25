import type { Milestone } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

export interface CoverageResult {
  milestones_covered: boolean[]
  coverage_score: number
}

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export async function checkCoverage(
  milestones: Milestone[],
  transcript: string,
  apiKey: string
): Promise<CoverageResult> {
  const milestonesText = milestones
    .map((m, i) => `${i + 1}. ${m.text}`)
    .join("\n")

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `Given these milestones:\n${milestonesText}\n\nAnd this student explanation:\n"${transcript}"\n\nReturn ONLY valid JSON (no markdown, no code fences) in this format: {"milestones_covered": [true/false, true/false, true/false], "coverage_score": 0-100}. The coverage_score should be a percentage (0-100) representing how much of the milestones were substantively mentioned in the transcript. Be thorough - students may paraphrase concepts rather than use exact wording.`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  }

  const response = await fetch(`${API_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error("We couldn't complete the analysis. Please try again.")
  }

  const data = await response.json()

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("We couldn't complete the analysis. Please try again.")
  }

  const text = data.candidates[0].content.parts[0].text

  try {
    const parsed = parseGeminiJson<{ milestones_covered: boolean[]; coverage_score: number }>(text)

    // Validate shape
    if (!Array.isArray(parsed.milestones_covered)) {
      throw new Error("milestones_covered is not an array")
    }
    if (typeof parsed.coverage_score !== "number") {
      throw new Error("coverage_score is not a number")
    }
    // Normalise length to match milestones count (pad or truncate)
    if (parsed.milestones_covered.length !== milestones.length) {
      const normalised = milestones.map((_, i) => Boolean(parsed.milestones_covered[i]))
      parsed.milestones_covered = normalised
    }

    return {
      milestones_covered: parsed.milestones_covered,
      coverage_score: Math.max(0, Math.min(100, Math.round(parsed.coverage_score))),
    }
  } catch {
    throw new Error("We couldn't interpret the analysis result. Please try again.")
  }
}
