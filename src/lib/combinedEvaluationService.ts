import type { CoverageDetail, Milestone, SubjectDomain, AcousticMetrics, MilestoneImportance } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"
import { UNTRUSTED_CONTENT_DIRECTIVE, wrapStudyMaterial, wrapTranscript, isDemoMode } from "./security"
import { demoEvaluationResult } from "./demoFixtures"

export interface CombinedEvaluationResult {
  coverage_score: number
  factual_accuracy_score: number
  reasoning_quality_score: number
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

function importanceWeight(importance?: MilestoneImportance): number {
  return importance === "supporting" ? 1 : 2
}

/**
 * Distribute 100 points across milestones proportional to their importance weights,
 * using the largest-remainder method so the integer max_scores sum exactly to 100.
 */
function computeMaxScores(weights: number[]): number[] {
  const n = weights.length
  if (n <= 0) return []
  const totalWeight = weights.reduce((a, b) => a + b, 0) || n
  const raw = weights.map((w) => (w / totalWeight) * 100)
  const floors = raw.map((r) => Math.floor(r))
  let remainder = 100 - floors.reduce((a, b) => a + b, 0)
  // Distribute the remaining points to the largest fractional parts
  const fracOrder = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
  for (let k = 0; k < fracOrder.length && remainder > 0; k++) {
    floors[fracOrder[k].i] += 1
    remainder--
  }
  return floors
}

export async function evaluateCombined(
  milestones: Milestone[],
  transcript: string,
  options?: {
    subjectDomain?: SubjectDomain
    acousticMetrics?: AcousticMetrics
  },
): Promise<CombinedEvaluationResult> {
  // Demo mode (?demo=true): return offline fixtures, no network.
  if (isDemoMode()) {
    return demoEvaluationResult()
  }

  const subjectDomain: SubjectDomain = options?.subjectDomain ?? "technical"
  const acousticMetrics = options?.acousticMetrics

  const weights = milestones.map((m) => importanceWeight(m.importance))
  const maxScores = computeMaxScores(weights)
  const maxScoresText = maxScores
    .map((s, i) => `Concept ${i + 1} (${milestones[i]?.importance ?? "core"}): max ${s}`)
    .join(", ")

  const conceptsBlock = milestones
    .map((m, i) => {
      const src = m.sourceReference && m.sourceReference.trim() ? wrapStudyMaterial(m.sourceReference) : wrapStudyMaterial("(no source excerpt available for this concept)")
      return `Concept ${i + 1}: ${m.text}
Importance: ${m.importance ?? "core"}
Relevant source material for this concept:
${src}`
    })
    .join("\n\n")

  const acousticSection = acousticMetrics
    ? `Supplementary acoustic signals (OPTIONAL, CONFIDENCE-ONLY): Speaking rate: ${acousticMetrics.wordsPerMinute} WPM, Pause count: ${acousticMetrics.pauseCount} (total ${acousticMetrics.totalPauseDuration}ms silences >700ms), Pitch variance score: ${acousticMetrics.pitchVarianceScore}.
IMPORTANT: These acoustic signals may ONLY inform the CONFIDENCE rating. They must NEVER lower or raise the coverage_score, factual_accuracy_score, or reasoning_quality_score. Pace and pauses vary naturally by person, language background, and speaking style — do not penalize knowledge/correctness based on delivery.`
    : `No acoustic data provided — base all knowledge/correctness scores on the transcript text alone.`

  const subjectGuidance =
    subjectDomain === "technical"
      ? `TECHNICAL/STEM: Requires explicit causal/logical connectors. Penalize heavily for: excessive unexplained jargon, disconnected keyword-listing without logical flow, missing connective words (because, therefore, consequently, this means, so, thus, hence). Clarity reflects logical chain strength.`
      : `NARRATIVE/HUMANITIES: Values coherent storytelling and thematic connection over strict causal language. DO NOT require "because/therefore" specifically. Evaluate coherence based on thematic consistency, logical flow of ideas, narrative progression. Penalize only if ideas are disjointed or thematically incoherent.`

  const prompt = `${UNTRUSTED_CONTENT_DIRECTIVE}

You are an expert examiner evaluating a student's oral explanation against the provided source material.

Subject domain classification: ${subjectDomain} — ${subjectGuidance}

${conceptsBlock}

Student explanation to assess:
${wrapTranscript(transcript)}

Supplementary acoustic signals (use for CONFIDENCE only, never for knowledge scores):
${acousticSection}

Your tasks:

1. CONCEPT COVERAGE & FACTUAL CORRECTNESS: For each concept, assign sub_score 0 to max_score where per-concept max_scores are: ${maxScoresText} (total 100). A missed "core" concept therefore costs more than a missed "supporting" one. Criteria:
   - Full marks (max_score for that concept) for COMPLETE + FACTUALLY ACCURATE explanation
   - 60%-99% for partial/vague but correct coverage
   - 1-50% for vague/incomplete mention
   - 0 for NO mention OR FACTUALLY WRONG statements (even if confidently stated). Confident but factually wrong MUST score 0-5 and set is_factually_correct:false.
   Judge factual correctness PRIMARILY against the provided source material for that concept. If the source material does not address the claim, set verifiable_from_source:false and note "not verifiable from source" rather than relying solely on general knowledge.
   Set is_factly_correct true/false per concept. If false, feedback must explain specifically what was factually wrong, referencing actual words from the transcript.
   Compute coverage_score as SUM of all sub_scores (0-100).

2. REASONING QUALITY: Rate reasoning_quality_score 0-100 — did the student explain WHY, not just WHAT? For technical content: causal/logical connection (because, therefore, this means). For narrative: thematic/logical coherence of how ideas relate. Reward explanations that connect ideas and show understanding of mechanism; penalize listing facts without explaining relationships.

3. COMMUNICATION CLARITY: Rate clarity_score 0-100 — how clearly articulated, independent of correctness.
   Also set is_gaming_attempt true ONLY if the explanation is just a list of disconnected terms with no logical sentence structure (observed PATTERN — describe it factually, do not accuse the student of cheating or lying). For reasoning, describe the OBSERVED PATTERN (e.g., "the explanation lists terms without connecting them") and reference actual words; never use language implying dishonesty or intent to deceive. Consider acoustic signals ONLY for confidence, never to set is_gaming_attempt on delivery alone if text is coherent.

4. CONFIDENCE: Return overall confidence "high" | "moderate" | "low" based on transcript length/completeness, ambiguity, internal consistency, AND (optionally) acoustic naturalness. Knowledge/correctness scores must not be affected by confidence.

5. SUMMARY: One short summary line (1-2 sentences) for the student.

Return ONLY valid JSON (no markdown, no code fences):
{"coverage_score": 0-100, "factual_accuracy_score": 0-100, "reasoning_quality_score": 0-100, "clarity_score": 0-100, "is_gaming_attempt": true/false, "confidence": "high"|"moderate"|"low", "subject_domain": "technical"|"narrative", "reasoning": "descriptive clarity/gaming reasoning referencing transcript, non-accusatory", "summary": "1-2 sentence overall summary", "details": [{"concept": "concept text", "sub_score": 0-max_score, "max_score": max_score, "is_factually_correct": true/false, "verifiable_from_source": true/false, "feedback": "specific 1-sentence feedback", "reasoning_feedback": "1-sentence note on reasoning quality for this concept", "source_reference": "source excerpt this relates to"}, ...]}

Include exactly ${milestones.length} items in details, in same order as concepts above. Ensure coverage_score equals sum of sub_scores. factual_accuracy_score should reflect the share of weighted concept points that are factually correct.`

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          coverage_score: { type: "NUMBER" },
          factual_accuracy_score: { type: "NUMBER" },
          reasoning_quality_score: { type: "NUMBER" },
          clarity_score: { type: "NUMBER" },
          is_gaming_attempt: { type: "BOOLEAN" },
          confidence: { type: "STRING", enum: ["high", "moderate", "low"] },
          subject_domain: { type: "STRING", enum: ["technical", "narrative"] },
          reasoning: { type: "STRING" },
          summary: { type: "STRING" },
          details: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                concept: { type: "STRING" },
                sub_score: { type: "NUMBER" },
                max_score: { type: "NUMBER" },
                is_factually_correct: { type: "BOOLEAN" },
                verifiable_from_source: { type: "BOOLEAN" },
                feedback: { type: "STRING" },
                reasoning_feedback: { type: "STRING" },
                source_reference: { type: "STRING" },
              },
              required: ["concept", "sub_score", "max_score", "is_factually_correct", "feedback"],
            },
          },
        },
        required: ["coverage_score", "clarity_score", "is_gaming_attempt", "details"],
      },
      temperature: 0.2,
    },
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purpose: "combined_evaluation", payload }),
  })

  if (!response.ok) {
    let serverDetails = ""
    try {
      const errJson = await response.clone().json()
      serverDetails = errJson?.error || JSON.stringify(errJson).slice(0, 300)
      console.error("[combinedEvaluation] /api/gemini failed", response.status, serverDetails)
    } catch {
      try {
        serverDetails = (await response.clone().text()).slice(0, 300)
        console.error("[combinedEvaluation] /api/gemini failed", response.status, serverDetails)
      } catch {}
    }
    if (response.status === 429) {
      throw new Error("Too many requests right now — this can happen if multiple devices are using the app on the same network. Please wait about a minute before trying again.")
    }
    if (response.status >= 500) {
      throw new Error(`We couldn't complete the evaluation (server ${response.status}). Please try again shortly.`)
    }
    throw new Error("We couldn't complete the evaluation. Please try again.")
  }

  const data = await response.json()

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("We couldn't complete the evaluation. Please try again.")
  }

  const text = data.candidates[0].content.parts[0].text

  try {
    const parsed = parseGeminiJson<{
      coverage_score: number
      factual_accuracy_score: number
      reasoning_quality_score: number
      clarity_score: number
      is_gaming_attempt: boolean
      confidence: string
      subject_domain: string
      reasoning: string
      summary: string
      details: Array<{
        concept: string
        sub_score: number
        max_score: number
        is_factually_correct: boolean
        verifiable_from_source?: boolean
        feedback: string
        reasoning_feedback?: string
        source_reference?: string
        covered?: boolean
      }>
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
        if (Math.abs(max - expectedMax) > 2) max = expectedMax
        sub = Math.max(0, Math.min(max, sub))
        const isCorrect = typeof d.is_factually_correct === "boolean" ? d.is_factually_correct : true
        if (!isCorrect && sub > Math.ceil(max * 0.3)) {
          sub = Math.ceil(max * 0.3)
        }
        const legacyCovered = typeof d.covered === "boolean" ? d.covered : undefined
        const derivedCovered = isCorrect && sub >= Math.ceil(max * 0.5)
        const covered = legacyCovered !== undefined ? legacyCovered : derivedCovered
        return {
          concept: String(d.concept || milestones[i]?.text || `Concept ${i + 1}`),
          sub_score: sub,
          max_score: max,
          is_factually_correct: Boolean(isCorrect),
          verifiable_from_source: typeof d.verifiable_from_source === "boolean" ? d.verifiable_from_source : undefined,
          feedback: String(d.feedback || (covered ? "Covered well." : isCorrect ? "Not covered — revisit this concept." : "Factually incorrect — review this concept.")),
          reasoning_feedback: typeof d.reasoning_feedback === "string" ? d.reasoning_feedback : undefined,
          source_reference: typeof d.source_reference === "string" && d.source_reference.trim() ? d.source_reference : milestones[i]?.sourceReference,
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
            source_reference: m.sourceReference,
            feedback: "Not addressed in your explanation — consider adding this concept.",
          }
        })
        details = normalised
      }
    } else {
      throw new Error("Missing details")
    }

    details = details.map((d, i) => ({
      ...d,
      max_score: maxScores[i] ?? d.max_score,
      sub_score: Math.max(0, Math.min(maxScores[i] ?? d.max_score, d.sub_score)),
    }))
    details = details.map((d) => ({
      ...d,
      covered: d.is_factually_correct && d.sub_score >= Math.ceil(d.max_score * 0.5),
    }))

    const milestones_covered = details.map((d) => d.covered)
    const derivedCoverage = details.reduce((sum, d) => sum + d.sub_score, 0)
    const coverage_score = Math.max(0, Math.min(100, Math.round(derivedCoverage)))

    // Factual accuracy score = share of weighted concept points that are factually correct (traceable)
    const factualAccuracy = details.reduce((sum, d) => sum + (d.is_factually_correct ? d.max_score : 0), 0)
    const factual_accuracy_score = Math.max(0, Math.min(100, Math.round(factualAccuracy)))

    const reasoning_quality_score = Math.max(0, Math.min(100, Math.round(typeof parsed.reasoning_quality_score === "number" ? parsed.reasoning_quality_score : 0)))

    let confidence: "high" | "moderate" | "low" = "moderate"
    const rawConf = typeof parsed.confidence === "string" ? parsed.confidence.trim().toLowerCase() : ""
    if (rawConf === "high" || rawConf === "moderate" || rawConf === "low") {
      confidence = rawConf
    } else {
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
      factual_accuracy_score,
      reasoning_quality_score,
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
    throw new Error("We couldn't interpret the evaluation result. Please try again.")
  }
}
