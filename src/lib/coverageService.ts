import type { Milestone } from "../types"

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
              text: `Given these milestones:\n${milestonesText}\n\nAnd this student explanation:\n"${transcript}"\n\nReturn ONLY valid JSON in this format: {"milestones_covered": [true/false, true/false, true/false], "coverage_score": 0-100}. The coverage_score should be a percentage (0-100) representing how much of the milestones were substantively mentioned in the transcript. Be thorough - students may paraphrase concepts rather than use exact wording.`
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

  if (!response.ok) {
    const errorData = await response.text()
    throw new Error(`Gemini API error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No response from Gemini API")
  }

  const text = data.candidates[0].content.parts[0].text

  try {
    const parsed = JSON.parse(text)
    return {
      milestones_covered: parsed.milestones_covered,
      coverage_score: parsed.coverage_score,
    }
  } catch {
    throw new Error("Failed to parse coverage response from Gemini")
  }
}