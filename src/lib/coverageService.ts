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

  console.log("[checkCoverage] → request", {
    milestones: milestonesText,
    transcriptPreview: transcript.substring(0, 120),
    transcriptLength: transcript.length,
    apiKeyPresent: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 8) + "…" : "(none)",
  })

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

  console.log("[checkCoverage] → fetch", API_BASE, "payload:", JSON.stringify(payload).substring(0, 300))

  const response = await fetch(`${API_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  })

  console.log("[checkCoverage] ← HTTP", response.status, response.statusText)

  if (!response.ok) {
    const errorData = await response.text()
    console.error("[checkCoverage] ← API error body:", errorData)
    throw new Error(`Gemini API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  console.log("[checkCoverage] ← raw JSON response:", JSON.stringify(data).substring(0, 500))

  if (!data.candidates || data.candidates.length === 0) {
    console.error("[checkCoverage] No candidates in response", data)
    throw new Error("No response from Gemini API")
  }

  const text = data.candidates[0].content.parts[0].text
  console.log("[checkCoverage] ← Gemini text part:", text)

  try {
    const parsed = parseGeminiJson<{ milestones_covered: boolean[]; coverage_score: number }>(text)
    // TEMPORARY diagnostic log requested in Issue 3 — verify parse success
    console.log("[checkCoverage] ← parsed object:", parsed)
    console.log("[checkCoverage] ← parsed milestones_covered:", parsed.milestones_covered, "coverage_score:", parsed.coverage_score)

    // Validate shape
    if (!Array.isArray(parsed.milestones_covered)) {
      throw new Error("milestones_covered is not an array")
    }
    if (typeof parsed.coverage_score !== "number") {
      throw new Error("coverage_score is not a number")
    }
    // Normalise length to match milestones count (pad or truncate, log warning)
    if (parsed.milestones_covered.length !== milestones.length) {
      console.warn(
        `[checkCoverage] milestones_covered length ${parsed.milestones_covered.length} != milestones ${milestones.length}, normalising`
      )
      const normalised = milestones.map((_, i) => Boolean(parsed.milestones_covered[i]))
      parsed.milestones_covered = normalised
    }

    return {
      milestones_covered: parsed.milestones_covered,
      coverage_score: Math.max(0, Math.min(100, Math.round(parsed.coverage_score))),
    }
  } catch (parseErr) {
    console.error("[checkCoverage] Raw Gemini response:", text)
    console.error("[checkCoverage] Parse error:", parseErr)
    throw new Error(`Failed to parse coverage response. Raw: ${text.substring(0, 200)}`)
  }
}
