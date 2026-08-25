import type { ClarityResult } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export async function rateClarity(
  transcript: string,
  apiKey: string
): Promise<ClarityResult> {
  console.log("[rateClarity] → request", {
    transcriptPreview: transcript.substring(0, 120),
    transcriptLength: transcript.length,
    apiKeyPresent: !!apiKey,
  })

  const payload = {
    contents: [
      {
        parts: [
          {
            text: `Rate this explanation's clarity from 0-100. Penalize heavily for: excessive unexplained jargon, disconnected keyword-listing without logical flow, missing connective words (because, therefore, consequently, this means). Also return a boolean 'is_gaming_attempt' set to true if the explanation is just a list of terms with no logical sentence structure. For the reasoning field, explain specifically which parts of THIS explanation lacked logical connectors or coherent structure, referencing actual words or phrases from the transcript. Be concrete and specific — do not give a generic template sentence. Output ONLY valid JSON (no markdown, no code fences): {"clarity_score": 0-100, "is_gaming_attempt": true/false, "reasoning": "specific explanation referencing transcript content"}. Transcript: "${transcript}"`
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    }
  }

  console.log("[rateClarity] → fetch", API_BASE)

  const response = await fetch(`${API_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload)
  })

  console.log("[rateClarity] ← HTTP", response.status, response.statusText)

  if (!response.ok) {
    const errorData = await response.text()
    console.error("[rateClarity] ← API error body:", errorData)
    throw new Error(`Analysis service error: ${response.status} - ${errorData}`)
  }

  const data = await response.json()
  console.log("[rateClarity] ← raw JSON response:", JSON.stringify(data).substring(0, 500))

  if (!data.candidates || data.candidates.length === 0) {
    console.error("[rateClarity] No candidates", data)
    throw new Error("We couldn't complete the analysis. Please try again.")
  }

  const text = data.candidates[0].content.parts[0].text
  console.log("[rateClarity] ← Gemini text part:", text)

  try {
    const parsed = parseGeminiJson<{ clarity_score: number; is_gaming_attempt: boolean; reasoning: string }>(text)
    console.log("[rateClarity] ← parsed object:", parsed)
    return {
      clarity_score: Math.max(0, Math.min(100, Math.round(parsed.clarity_score))),
      is_gaming_attempt: Boolean(parsed.is_gaming_attempt),
      reasoning: String(parsed.reasoning || ""),
    }
  } catch (parseErr) {
    console.error("[rateClarity] Raw Gemini response:", text)
    console.error("[rateClarity] Parse error:", parseErr)
    throw new Error("We couldn't interpret the analysis result. Please try again.")
  }
}
