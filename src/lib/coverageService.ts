import type { CoverageDetail, Milestone } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

export interface CoverageResult {
  details: CoverageDetail[]
  coverage_score: number
  milestones_covered: boolean[]
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
            text: `Given these key concepts:\n${milestonesText}\n\nAnd this student explanation:\n"${transcript}"\n\nFor each concept, determine if the student covered it substantively. If covered, provide a brief positive note (1 sentence) on how well they explained it. If not covered, explain specifically what was missing or what to add. Return ONLY valid JSON (no markdown, no code fences) in this format: {"details": [{"concept": "concept text", "covered": true/false, "feedback": "specific 1-sentence feedback"}, ...], "coverage_score": 0-100}. The coverage_score should be a percentage (0-100) representing how many concepts were covered. Include exactly ${milestones.length} items in details, in the same order as the concepts above. Be thorough - students may paraphrase concepts rather than use exact wording.`
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
    const parsed = parseGeminiJson<{
      details?: Array<{ concept: string; covered: boolean; feedback: string }>
      milestones_covered?: boolean[]
      coverage_score: number
    }>(text)

    if (typeof parsed.coverage_score !== "number") {
      throw new Error("coverage_score is not a number")
    }

    // Prefer detailed format
    let details: CoverageDetail[] | null = null
    if (Array.isArray(parsed.details) && parsed.details.length > 0) {
      details = parsed.details.map((d, i) => ({
        concept: String(d.concept || milestones[i]?.text || `Concept ${i + 1}`),
        covered: Boolean(d.covered),
        feedback: String(d.feedback || (d.covered ? "Covered well." : "Not covered — revisit this concept.")),
      }))
      // Normalise length
      if (details.length !== milestones.length) {
        const normalised: CoverageDetail[] = milestones.map((m, i) => {
          const existing = details![i]
          if (existing) return existing
          return {
            concept: m.text,
            covered: false,
            feedback: "Not addressed in your explanation — consider adding this concept.",
          }
        })
        details = normalised
      }
    } else if (Array.isArray(parsed.milestones_covered)) {
      // Backward compat: convert boolean array to details with generic feedback
      const boolArr = parsed.milestones_covered
      details = milestones.map((m, i) => ({
        concept: m.text,
        covered: Boolean(boolArr[i]),
        feedback: Boolean(boolArr[i])
          ? "You addressed this concept clearly."
          : "This concept was missing — add an explanation of how it connects to the main idea.",
      }))
    } else {
      throw new Error("Invalid coverage result shape")
    }

    const milestones_covered = details.map((d) => d.covered)

    return {
      details,
      milestones_covered,
      coverage_score: Math.max(0, Math.min(100, Math.round(parsed.coverage_score))),
    }
  } catch {
    throw new Error("We couldn't interpret the analysis result. Please try again.")
  }
}
