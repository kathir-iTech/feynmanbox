import type { CoverageDetail, Milestone } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent"

export interface CombinedEvaluationResult {
  coverage_score: number
  clarity_score: number
  is_gaming_attempt: boolean
  reasoning: string
  summary: string
  details: CoverageDetail[]
  milestones_covered: boolean[]
}

export async function evaluateCombined(
  milestones: Milestone[],
  transcript: string,
  apiKey: string
): Promise<CombinedEvaluationResult> {
  const milestonesText = milestones.map((m, i) => `${i + 1}. ${m.text}`).join("\n")

  const prompt = `You are an expert examiner evaluating a student's oral explanation.

Key concepts (5-7 items):
${milestonesText}

Student explanation:
"${transcript}"

Tasks:

1. COVERAGE: For each concept, determine if the student covered it substantively (covered: true/false). If covered, provide a brief positive note (1 sentence) on how well they explained it. If not covered, explain specifically what was missing or what to add. Compute coverage_score 0-100 as percentage of concepts covered.

2. CLARITY: Rate clarity 0-100. Penalize heavily for: excessive unexplained jargon, disconnected keyword-listing without logical flow, missing connective words (because, therefore, consequently, this means). Also set is_gaming_attempt true if the explanation is just a list of terms with no logical sentence structure. For reasoning, explain specifically which parts of THIS explanation lacked logical connectors or coherent structure, referencing actual words or phrases from the transcript. Be concrete — no generic template.

3. SUMMARY: Provide one short summary line (1-2 sentences) giving a high-level takeaway for the student, e.g., "You have a solid grasp of the basics but are missing the advanced concepts around X and Y." Be specific to THIS explanation and concepts.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"coverage_score": 0-100, "clarity_score": 0-100, "is_gaming_attempt": true/false, "reasoning": "specific clarity reasoning referencing transcript", "summary": "1-2 sentence overall summary", "details": [{"concept": "concept text", "covered": true/false, "feedback": "specific 1-sentence feedback"}, ...]}

Include exactly ${milestones.length} items in details, in same order as concepts above. Be thorough — students may paraphrase.`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  }

  const response = await fetch(`${API_BASE}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
      coverage_score: number
      clarity_score: number
      is_gaming_attempt: boolean
      reasoning: string
      summary: string
      details: Array<{ concept: string; covered: boolean; feedback: string }>
    }>(text)

    if (typeof parsed.coverage_score !== "number" || typeof parsed.clarity_score !== "number") {
      throw new Error("Invalid scores")
    }

    let details: CoverageDetail[] = []
    if (Array.isArray(parsed.details) && parsed.details.length > 0) {
      details = parsed.details.map((d, i) => ({
        concept: String(d.concept || milestones[i]?.text || `Concept ${i + 1}`),
        covered: Boolean(d.covered),
        feedback: String(d.feedback || (d.covered ? "Covered well." : "Not covered — revisit this concept.")),
      }))
      if (details.length !== milestones.length) {
        const normalised: CoverageDetail[] = milestones.map((m, i) => {
          const existing = details[i]
          if (existing) return existing
          return {
            concept: m.text,
            covered: false,
            feedback: "Not addressed in your explanation — consider adding this concept.",
          }
        })
        details = normalised
      }
    } else {
      throw new Error("Missing details")
    }

    const milestones_covered = details.map((d) => d.covered)

    return {
      coverage_score: Math.max(0, Math.min(100, Math.round(parsed.coverage_score))),
      clarity_score: Math.max(0, Math.min(100, Math.round(parsed.clarity_score))),
      is_gaming_attempt: Boolean(parsed.is_gaming_attempt),
      reasoning: String(parsed.reasoning || ""),
      summary: String(parsed.summary || "Review the detailed feedback below."),
      details,
      milestones_covered,
    }
  } catch {
    throw new Error("We couldn't interpret the analysis result. Please try again.")
  }
}
