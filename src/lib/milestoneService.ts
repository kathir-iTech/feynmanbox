import type { MilestoneState } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export async function generateMilestones(notes: string, apiKey: string): Promise<MilestoneState> {
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
              text: `Given these lecture notes: ${notes}, extract exactly 3 key learning milestones a student must be able to explain to prove mastery. Output ONLY valid JSON (no markdown, no code fences) in this format: {"milestones": ["milestone 1", "milestone 2", "milestone 3"]}`
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
