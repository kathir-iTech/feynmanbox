export async function generateFollowUpQuestion(
  missedConcept: string,
  transcript: string
): Promise<string> {
  const prompt = `Based on this missed concept: "${missedConcept}", and the student's original explanation: "${transcript}", generate ONE short, specific Socratic follow-up question that probes their understanding of this specific gap. Keep it to one sentence. Return only the question text.`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
    },
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gemini-flash-lite-latest", payload }),
  })

  if (!response.ok) {
    throw new Error("Failed to generate follow-up question")
  }

  const data = await response.json()
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No follow-up generated")
  }
  const text: string = data.candidates[0]?.content?.parts?.[0]?.text ?? ""
  const trimmed = text.trim().replace(/^["']|["']$/g, "")
  if (!trimmed) throw new Error("Empty follow-up")
  // Ensure single sentence: take first sentence if multiple returned
  // But keep as is if it's already one sentence; if Gemini returns extra prose, first line that ends with ?
  const firstQuestion = trimmed.split("\n").find((s) => s.includes("?")) ?? trimmed
  return firstQuestion.trim()
}
