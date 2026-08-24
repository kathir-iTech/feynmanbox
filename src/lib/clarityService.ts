const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export interface ClarityResult {
  clarity_score: number
  is_gaming_attempt: boolean
  reasoning: string
}

export async function rateClarity(
  transcript: string,
  apiKey: string
): Promise<ClarityResult> {
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
              text: `Rate this explanation's clarity from 0-100. Penalize heavily for: excessive unexplained jargon, disconnected keyword-listing without logical flow, missing connective words (because, therefore, consequently, this means). Also return a boolean 'is_gaming_attempt' set to true if the explanation is just a list of terms with no logical sentence structure. Output ONLY valid JSON: {"clarity_score": 0-100, "is_gaming_attempt": true/false, "reasoning": "one sentence explanation"}. Transcript: "${transcript}"`
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
      clarity_score: parsed.clarity_score,
      is_gaming_attempt: parsed.is_gaming_attempt,
      reasoning: parsed.reasoning,
    }
  } catch {
    throw new Error("Failed to parse clarity response from Gemini")
  }
}