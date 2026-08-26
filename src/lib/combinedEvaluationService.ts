import type { CoverageDetail, Milestone, SubjectDomain, AcousticMetrics } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

export interface CombinedEvaluationResult {
  coverage_score: number
  clarity_score: number
  is_gaming_attempt: boolean
  reasoning: string
  summary: string
  details: CoverageDetail[]
  milestones_covered: boolean[]
  confidence: "high" | "moderate" | "low"
  subject_domain: SubjectDomain
  acousticMetrics?: AcousticMetrics
}

function computeMaxScores(count: number): number[] {
  if (count <= 0) return []
  const base = Math.floor(100 / count)
  const remainder = 100 % count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

export async function evaluateCombined(
  milestones: Milestone[],
  transcript: string,
  options?: {
    subjectDomain?: SubjectDomain
    acousticMetrics?: AcousticMetrics
  },
): Promise<CombinedEvaluationResult> {
  const milestonesText = milestones.map((m, i) => `${i + 1}. ${m.text}`).join("\n")
  const subjectDomain: SubjectDomain = options?.subjectDomain ?? "technical"
  const acousticMetrics = options?.acousticMetrics

  const maxScores = computeMaxScores(milestones.length)
  const maxScoresText = maxScores.map((s, i) => `Concept ${i + 1}: max ${s}`).join(", ")
  const acousticSection = acousticMetrics
    ? `Speaking rate: ${acousticMetrics.wordsPerMinute} WPM, Pause count: ${acousticMetrics.pauseCount} (total ${acousticMetrics.totalPauseDuration}ms silences >700ms), Pitch variance score: ${acousticMetrics.pitchVarianceScore}. Guidance: very fast speech (>180 WPM) with minimal pauses on a complex topic may indicate memorized recitation rather than genuine understanding; natural pacing (120-160 WPM) with brief pauses for thought is consistent with genuine explanation; extensive pitch variance suggests engaged explanation, flat pitch may indicate reading. Use this as a SUPPLEMENTARY signal to adjust confidence/gaming assessment, not to override text analysis.`
    : `No acoustic data provided — base confidence/gaming assessment on text alone.`

  const subjectGuidance =
    subjectDomain === "technical"
      ? `TECHNICAL/STEM: Requires explicit causal/logical connectors. Penalize heavily for: excessive unexplained jargon, disconnected keyword-listing without logical flow, missing connective words (because, therefore, consequently, this means, so, thus, hence). Clarity reflects logical chain strength.`
      : `NARRATIVE/HUMANITIES: Values coherent storytelling and thematic connection over strict causal language. DO NOT require "because/therefore" specifically. Evaluate coherence based on thematic consistency, logical flow of ideas, narrative progression, and how well themes/events are connected. Penalize only if ideas are disjointed or thematically incoherent.`

  const prompt = `You are an expert examiner evaluating a student's oral explanation.

Key concepts (${milestones.length} items):
${milestonesText}

Subject domain classification: ${subjectDomain} — ${subjectGuidance}

Student explanation:
"${transcript}"

Supplementary acoustic signals (use as SECONDARY, not primary, evidence):
${acousticSection}

Tasks:

1. COVERAGE & FACTUAL CORRECTNESS: For each concept, assign sub_score 0 to max_score where per-concept max_scores are: ${maxScoresText} (total 100). Criteria:
   - Full marks (${maxScores[0]} for Concept 1 etc.) for COMPLETE + FACTUALLY ACCURATE explanation
   - ${Math.floor((maxScores[0] ?? 20) * 0.6)}-${(maxScores[0] ?? 20) - 1} for partial/vague but correct coverage
   - 1-${Math.floor((maxScores[0] ?? 20) * 0.5)} for vague/incomplete mention
   - 0 for NO mention OR FACTUALLY WRONG statements (even if confidently stated). Confident but factually wrong MUST score 0-5 and set is_factually_correct:false.
   Also set is_factually_correct true/false per concept. Sub_score must reflect BOTH coverage AND correctness combined.
   If is_factually_correct is false, feedback must explain specifically what was factually wrong, referencing actual words/phrases from the transcript.
   If covered correctly, provide a brief positive note (1 sentence) on how well explained. If not covered, explain specifically what was missing or what to add.
   Compute coverage_score as SUM of all sub_scores (0-100) — must equal exact sum, not independently guessed.

2. CLARITY: Rate clarity 0-100.
   ${subjectGuidance}
   Also set is_gaming_attempt true if the explanation is just a list of terms with no logical sentence structure, regardless of domain. For reasoning, explain specifically which parts of THIS explanation lacked logical connectors (technical) or thematic coherence (narrative), referencing actual words or phrases from the transcript. Be concrete — no generic template. Consider acoustic signals as supplementary: e.g., unusually fast speech with no pauses may support gaming flag, but do not flag gaming on acoustic alone if text is coherent.

3. CONFIDENCE: Return overall confidence "high" | "moderate" | "low" based on: transcript length/completeness, ambiguity of the explanation, and internal consistency.
   - high: detailed, complete (>100 words), internally consistent, unambiguous
   - moderate: some ambiguity or missing detail (50-100 words, generally clear but incomplete)
   - low: brief (<50 words), highly ambiguous, contradictory, or very short making assessment uncertain

4. SUMMARY: Provide one short summary line (1-2 sentences) giving a high-level takeaway for the student, e.g., "You have a solid grasp of the basics but are missing the advanced concepts around X and Y." Be specific to THIS explanation and concepts.

Return ONLY valid JSON (no markdown, no code fences) in this exact format:
{"coverage_score": 0-100, "clarity_score": 0-100, "is_gaming_attempt": true/false, "confidence": "high"|"moderate"|"low", "subject_domain": "technical"|"narrative", "reasoning": "specific clarity reasoning referencing transcript", "summary": "1-2 sentence overall summary", "details": [{"concept": "concept text", "sub_score": 0-max_score, "max_score": max_score, "is_factually_correct": true/false, "feedback": "specific 1-sentence feedback"}, ...]}

Include exactly ${milestones.length} items in details, in same order as concepts above. Be thorough — students may paraphrase. Ensure coverage_score equals sum of sub_scores.`

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
    const parsed = parseGeminiJson<{
      coverage_score: number
      clarity_score: number
      is_gaming_attempt: boolean
      confidence: string
      subject_domain: string
      reasoning: string
      summary: string
      details: Array<{ concept: string; sub_score: number; max_score: number; is_factually_correct: boolean; feedback: string; covered?: boolean }>
    }>(text)

    if (typeof parsed.clarity_score !== "number") {
      throw new Error("Invalid scores")
    }

    // Validate and normalize details
    let details: CoverageDetail[] = []
    if (Array.isArray(parsed.details) && parsed.details.length > 0) {
      details = parsed.details.map((d, i) => {
        const expectedMax = maxScores[i] ?? 20
        let sub = typeof d.sub_score === "number" ? Math.round(d.sub_score) : 0
        let max = typeof d.max_score === "number" ? Math.round(d.max_score) : expectedMax
        // Clamp max to expectedMax to enforce traceability (use computed max if Gemini deviates)
        // But keep Gemini's max if within 2 of expected to allow slight variance; otherwise override
        if (Math.abs(max - expectedMax) > 2) max = expectedMax
        sub = Math.max(0, Math.min(max, sub))
        // If factually incorrect, ensure sub_score is low (0-5 or at most 30% of max) — enforce rule
        const isCorrect = typeof d.is_factually_correct === "boolean" ? d.is_factually_correct : true
        if (!isCorrect && sub > Math.ceil(max * 0.3)) {
          sub = Math.ceil(max * 0.3)
        }
        // Legacy covered handling
        const legacyCovered = typeof d.covered === "boolean" ? d.covered : undefined
        // Derive covered from sub_score if not provided: threshold 50% and factually correct
        const derivedCovered = isCorrect && sub >= Math.ceil(max * 0.5)
        const covered = legacyCovered !== undefined ? legacyCovered : derivedCovered
        return {
          concept: String(d.concept || milestones[i]?.text || `Concept ${i + 1}`),
          sub_score: sub,
          max_score: max,
          is_factually_correct: Boolean(isCorrect),
          feedback: String(d.feedback || (covered ? "Covered well." : isCorrect ? "Not covered — revisit this concept." : "Factually incorrect — review this concept.")),
          covered: Boolean(covered),
        }
      })
      if (details.length !== milestones.length) {
        const normalised: CoverageDetail[] = milestones.map((m, i) => {
          const existing = details[i]
          if (existing) return existing
          const max = maxScores[i] ?? 20
          return {
            concept: m.text,
            covered: false,
            sub_score: 0,
            max_score: max,
            is_factually_correct: true,
            feedback: "Not addressed in your explanation — consider adding this concept.",
          }
        })
        details = normalised
      }
    } else {
      throw new Error("Missing details")
    }

    // Enforce max_score to computed values to guarantee sum=100 traceability
    details = details.map((d, i) => ({
      ...d,
      max_score: maxScores[i] ?? d.max_score,
      sub_score: Math.max(0, Math.min(maxScores[i] ?? d.max_score, d.sub_score)),
    }))
    // Re-derive covered after max enforcement
    details = details.map((d) => ({
      ...d,
      covered: d.is_factually_correct && d.sub_score >= Math.ceil(d.max_score * 0.5),
    }))

    const milestones_covered = details.map((d) => d.covered)
    // Coverage_score is derived SUM of sub_scores — mathematically traceable, not guessed
    const derivedCoverage = details.reduce((sum, d) => sum + d.sub_score, 0)
    // Clamp to 0-100 (should already be 0-100 since sum of maxScores =100)
    const coverage_score = Math.max(0, Math.min(100, Math.round(derivedCoverage)))

    let confidence: "high" | "moderate" | "low" = "moderate"
    const rawConf = typeof parsed.confidence === "string" ? parsed.confidence.trim().toLowerCase() : ""
    if (rawConf === "high" || rawConf === "moderate" || rawConf === "low") {
      confidence = rawConf
    } else {
      // Fallback heuristic based on transcript length if Gemini omits confidence
      const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length
      if (wordCount < 50) confidence = "low"
      else if (wordCount > 100) confidence = "high"
      else confidence = "moderate"
    }

    let subject_domain: SubjectDomain = subjectDomain
    const rawDomain = typeof parsed.subject_domain === "string" ? parsed.subject_domain.trim().toLowerCase() : ""
    if (rawDomain === "technical" || rawDomain === "stem" || rawDomain === "narrative" || rawDomain === "humanities") {
      if (rawDomain === "narrative" || rawDomain === "humanities") subject_domain = "narrative"
      else subject_domain = "technical"
    }

    return {
      coverage_score,
      clarity_score: Math.max(0, Math.min(100, Math.round(parsed.clarity_score))),
      is_gaming_attempt: Boolean(parsed.is_gaming_attempt),
      reasoning: String(parsed.reasoning || ""),
      summary: String(parsed.summary || "Review the detailed feedback below."),
      details,
      milestones_covered,
      confidence,
      subject_domain,
      acousticMetrics,
    }
  } catch {
    throw new Error("We couldn't interpret the analysis result. Please try again.")
  }
}
