import { UNTRUSTED_CONTENT_DIRECTIVE, wrapTranscript, isDemoMode } from "./security"
import { demoFollowUpPair, demoFollowUpCheck } from "./demoFixtures"

export interface FollowUpPair {
  remediation: string
  transfer: string
}

/**
 * Generates two distinct reflections (both reflection-only, not re-graded):
 *  - remediation: a Socratic probe for the WEAKEST missed concept (gap-filling)
 *  - transfer: an application question for a WELL-COVERED concept (tests transfer to a new scenario)
 */
export async function generateFollowUpPair(
  missedConcept: string,
  coveredConcept: string | null,
  transcript: string,
): Promise<FollowUpPair> {
  if (isDemoMode()) return demoFollowUpPair()

  const prompt = `${UNTRUSTED_CONTENT_DIRECTIVE}

You are a Socratic tutor. Based on the student's explanation below, produce TWO short reflections.

Student explanation:
${wrapTranscript(transcript)}

Missed concept (student struggled with this): "${missedConcept}"
${coveredConcept ? `Well-covered concept (student explained this well): "${coveredConcept}"` : "Well-covered concept: (none available)"}

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"remediation": "ONE short Socratic follow-up question probing the missed concept, one sentence", "transfer": "ONE short application/transfer question that asks the student to apply the well-covered concept to a NEW, slightly changed scenario, one sentence"}

The remediation should probe understanding of the gap. The transfer question should test whether they can APPLY a concept they explained well to a new situation (not just recite it). Keep each to a single sentence.`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.7,
      responseMimeType: "application/json",
    },
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "followup_question", payload }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests right now — this can happen if multiple devices are using the app on the same network. Please wait about a minute before trying again.")
    }
    throw new Error("Failed to generate follow-up question")
  }

  const data = await response.json()
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No follow-up generated")
  }
  const text: string = data.candidates[0]?.content?.parts?.[0]?.text ?? ""
  const trimmed = text.trim()
  if (!trimmed) throw new Error("Empty follow-up")

  try {
    const parsed = JSON.parse(trimmed)
    const remediation = String(parsed.remediation || "").trim()
    const transfer = String(parsed.transfer || "").trim()
    if (!remediation) throw new Error("Missing remediation")
    return { remediation, transfer }
  } catch {
    // Fallback: if not JSON, treat whole text as remediation
    const firstQuestion = trimmed.split("\n").find((s) => s.includes("?")) ?? trimmed
    return { remediation: firstQuestion.trim(), transfer: "" }
  }
}

export interface FollowUpCheck {
  covered: boolean
  feedback: string
}

/**
 * Lightweight micro-check of a student's follow-up answer against ONE concept.
 * This is a supplementary check ONLY — it must NOT change the original scores.
 */
export async function checkFollowUpAnswer(concept: string, answer: string): Promise<FollowUpCheck> {
  if (isDemoMode()) return demoFollowUpCheck()

  const prompt = `${UNTRUSTED_CONTENT_DIRECTIVE}

A student was asked to address this concept: "${concept}".

Their answer:
${wrapTranscript(answer)}

Assess ONLY whether this response correctly addresses the concept. Return ONLY valid JSON (no markdown, no code fences):
{"covered": true/false, "feedback": "one sentence of specific feedback"}

Do not re-grade the whole session. Be concise and specific.`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
    },
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "followup_question", payload }),
  })

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Too many requests right now — this can happen if multiple devices are using the app on the same network. Please wait about a minute before trying again.")
    }
    throw new Error("Failed to check answer")
  }

  const data = await response.json()
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("No check result")
  }
  const text: string = data.candidates[0]?.content?.parts?.[0]?.text ?? ""
  try {
    const parsed = JSON.parse(text.trim())
    return {
      covered: Boolean(parsed.covered),
      feedback: String(parsed.feedback || ""),
    }
  } catch {
    return { covered: false, feedback: "Could not verify the answer." }
  }
}
