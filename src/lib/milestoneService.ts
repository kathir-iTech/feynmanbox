import type { MilestoneState } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

export async function generateMilestones(notes: string): Promise<MilestoneState> {
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `Given these lecture notes: ${notes}, extract 5 to 7 key learning concepts a student must be able to explain to prove mastery. Each concept should be a concise but substantive milestone (1 sentence). Output ONLY valid JSON (no markdown, no code fences) in this format: {"milestones": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"]}. Aim for 5-7 items depending on content density.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  }
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gemini-flash-lite-latest", payload }),
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
    const parsed = parseGeminiJson<{ milestones: string[] }>(text)
    return {
      success: true,
      milestones: parsed.milestones.map((m: string, i: number) => ({
        id: i + 1,
        text: m,
        covered: false
      })),
      error: null,
      loading: false
    }
  } catch {
    return {
      success: false,
      milestones: [],
      error: "We couldn't interpret the analysis result. Please try again.",
      loading: false
    }
  }
}
