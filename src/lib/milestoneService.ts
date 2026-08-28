import type { MilestoneState, SubjectDomain, MilestoneImportance } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"
import { UNTRUSTED_CONTENT_DIRECTIVE, wrapStudyMaterial, isDemoMode } from "./security"
import { DEMO_MILESTONES, DEMO_SUBJECT_DOMAIN } from "./demoFixtures"

export async function generateMilestones(
  notes: string,
  options?: { override?: boolean },
): Promise<MilestoneState> {
  const override = Boolean(options?.override)

  // Demo mode (?demo=true): return offline fixtures, no network.
  if (isDemoMode()) {
    return {
      success: true,
      milestones: DEMO_MILESTONES.map((m) => ({ ...m })),
      error: null,
      loading: false,
      subjectDomain: DEMO_SUBJECT_DOMAIN,
    }
  }

  const guardInstruction = override
    ? `OVERRIDE MODE: The user has chosen to proceed despite a prior content-quality check. Skip the teaching-content assessment entirely and extract concepts directly from the provided material as if it were valid study material.`
    : `STEP 1 — ASSESSMENT: First evaluate: "Does this text contain genuine explanatory or conceptual teaching content (e.g., definitions, explanations, processes, principles) as opposed to metadata, a table of contents, a product description, a schedule, or a list of topic names without explanation?"

Be lenient: genuine lecture notes, textbook excerpts, explanatory paragraphs, or study notes that teach ideas — even if short, informal, or imperfect — must be considered has_teaching_content: true. Only flag clearly non-explanatory content such as:
- pure metadata (ISBN, price, author, publisher, chapter titles with no explanations)
- a book's back-cover blurb or product listing
- a weekly schedule/plan listing topics by week/day with no explanation of what those topics involve
- a bare list of topic names or table of contents with no definitions
- marketing copy with no teaching content
If the text contains at least some genuine explanation of ideas (even a single paragraph explaining how something works), treat it as has_teaching_content: true and proceed to extract milestones normally.

STEP 1b — SUBJECT CLASSIFICATION: Also classify the material's domain type:
- "technical" for STEM/technical content (science, math, engineering, computer science, logic-heavy material that requires explicit causal/logical connectors like "because", "therefore", "consequently")
- "narrative" for humanities/narrative content (history, literature, philosophy, social sciences, storytelling, thematic analysis that values coherent narrative and thematic connection over strict causal language)
Base this strictly on the uploaded content's nature, not the student's explanation. If uncertain or mixed, choose the dominant type. This classification will adjust how clarity is evaluated later.`

  const prompt = `${UNTRUSTED_CONTENT_DIRECTIVE}

You are a teaching-content quality guard, subject classifier, and concept extractor.

${guardInstruction}

Given the following study material, extract 5 to 7 key learning concepts a student must be able to explain to prove mastery. Each concept should be a concise but substantive milestone (1 sentence).

For EACH milestone also provide:
- "importance": either "core" (central concept, frequently discussed or foundational in the source) or "supporting" (secondary/peripheral concept). Base this on how central the concept appears in the source material (frequency of discussion, depth of explanation, foundational role).
- "source_reference": a brief excerpt (1-3 sentences, quoted or closely paraphrased) from the study material that this concept is drawn from. If the source does not clearly address the concept, return an empty string.

${wrapStudyMaterial(notes)}

Output ONLY valid JSON (no markdown, no code fences) in this exact format:
{"has_teaching_content": true, "reason": "", "subject_domain": "technical", "milestones": [{"text": "concept 1", "importance": "core", "source_reference": "excerpt from material"}, ...]}
For the false case (only when not in override mode):
{"has_teaching_content": false, "reason": "brief explanation of why this is not teaching content", "subject_domain": "technical", "milestones": []}
Valid subject_domain values: "technical" or "narrative". When has_teaching_content is true, provide 5-7 milestones depending on content density. When false, provide [] for milestones. Use the "core"/"supporting" importance labels and a source_reference excerpt for each milestone.`

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

  if (override) {
    // Override mode still contacts the API so milestones are extracted from the actual material.
    // (Kept as a real call for accuracy; the guard is simply instructed to skip rejection.)
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ purpose: "milestone_generation", payload }),
  })

  if (!response.ok) {
    let serverDetails = ""
    try {
      const errJson = await response.clone().json()
      serverDetails = errJson?.error || JSON.stringify(errJson).slice(0, 300)
      console.error("[milestoneService] /api/gemini failed", response.status, serverDetails)
    } catch {
      try {
        serverDetails = (await response.clone().text()).slice(0, 300)
        console.error("[milestoneService] /api/gemini failed", response.status, serverDetails)
      } catch {}
    }
    if (response.status === 429) {
      throw new Error("Too many requests right now — this can happen if multiple devices are using the app on the same network. Please wait about a minute before trying again.")
    }
    if (response.status >= 500) {
      throw new Error(`We couldn't prepare your key concepts (server ${response.status}). Please try again shortly.`)
    }
    throw new Error("We couldn't prepare your key concepts. Please try again.")
  }

  const data = await response.json()

  if (!data.candidates || data.candidates.length === 0) {
    throw new Error("We couldn't prepare your key concepts. Please try again.")
  }

  const text = data.candidates[0].content.parts[0].text

  try {
    const parsed = parseGeminiJson<{
      has_teaching_content?: boolean
      reason?: string
      milestones?: Array<{ text?: string; importance?: string; source_reference?: string } | string>
      subject_domain?: string
    }>(text)

    const rawDomain = typeof parsed.subject_domain === "string" ? parsed.subject_domain.trim().toLowerCase() : ""
    let subjectDomain: SubjectDomain = "technical"
    if (rawDomain === "narrative" || rawDomain === "humanities" || rawDomain === "narrative/humanities") {
      subjectDomain = "narrative"
    } else if (rawDomain === "technical" || rawDomain === "stem" || rawDomain === "technical/stem") {
      subjectDomain = "technical"
    }

    // Content-quality guard (skip when override requested)
    if (!override && parsed.has_teaching_content === false) {
      const rawReason = typeof parsed.reason === "string" ? parsed.reason.trim() : ""
      const reason = rawReason || "non-explanatory content with no conceptual explanations"
      const snippet = reason.replace(/\.$/, "")
      return {
        success: false,
        milestones: [],
        error: `This doesn't look like explanatory teaching content to us — ${snippet}. If you believe this is valid material, you can continue anyway.`,
        loading: false,
        subjectDomain,
        canOverride: true,
        reason: snippet,
      }
    }

    const rawMilestones = Array.isArray(parsed.milestones) ? parsed.milestones : []
    const milestones = rawMilestones
      .map((m, i) => {
        const textVal = typeof m === "string" ? m : typeof m?.text === "string" ? m.text : ""
        const importance: MilestoneImportance = typeof m === "object" && m && m.importance === "supporting" ? "supporting" : "core"
        const sourceReference = typeof m === "object" && m && typeof m.source_reference === "string" ? m.source_reference : ""
        return textVal
          ? {
              id: i + 1,
              text: textVal,
              covered: false,
              importance,
              sourceReference,
            }
          : null
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)

    if (milestones.length === 0) {
      if (!override && typeof parsed.reason === "string" && parsed.reason.trim()) {
        const snippet = parsed.reason.trim().replace(/\.$/, "")
        return {
          success: false,
          milestones: [],
          error: `This doesn't look like explanatory teaching content to us — ${snippet}. If you believe this is valid material, you can continue anyway.`,
          loading: false,
          subjectDomain,
          canOverride: true,
          reason: snippet,
        }
      }
      return {
        success: false,
        milestones: [],
        error: "We couldn't extract any key concepts from those notes. Please try a different document or add more detail.",
        loading: false,
        subjectDomain,
      }
    }

    return {
      success: true,
      milestones,
      error: null,
      loading: false,
      subjectDomain,
    }
  } catch {
    return {
      success: false,
      milestones: [],
      error: "We couldn't interpret the result. Please try again.",
      loading: false,
    }
  }
}
