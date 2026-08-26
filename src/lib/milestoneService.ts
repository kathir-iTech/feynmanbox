import type { MilestoneState } from "../types"
import { parseGeminiJson } from "./parseGeminiJson"

export async function generateMilestones(notes: string): Promise<MilestoneState> {
  const payload = {
    contents: [
      {
        parts: [
          {
            text: `You are a teaching-content quality guard and concept extractor.

STEP 1 — ASSESSMENT: First evaluate: "Does this text contain genuine explanatory or conceptual teaching content (e.g., definitions, explanations, processes, principles) as opposed to metadata, a table of contents, a product description, a schedule, or a list of topic names without explanation?"

Be lenient: genuine lecture notes, textbook excerpts, explanatory paragraphs, or study notes that teach ideas — even if short, informal, or imperfect — must be considered has_teaching_content: true. Only flag clearly non-explanatory content such as:
- pure metadata (ISBN, price, author, publisher, chapter titles with no explanations)
- a book's back-cover blurb or product listing
- a weekly schedule/plan listing topics by week/day with no explanation of what those topics involve
- a bare list of topic names or table of contents with no definitions
- marketing copy with no teaching content
If the text contains at least some genuine explanation of ideas (even a single paragraph explaining how something works), treat it as has_teaching_content: true and proceed to extract milestones normally.

Given these notes: ${notes}

STEP 2 — EXTRACTION: If has_teaching_content is true, extract 5 to 7 key learning concepts a student must be able to explain to prove mastery. Each concept should be a concise but substantive milestone (1 sentence). If has_teaching_content is false, return an empty milestones array and a brief reason (e.g., "a book description with chapter titles and price but no explanations", "a weekly schedule listing topics without explaining them").

Output ONLY valid JSON (no markdown, no code fences) in this exact format:
{"has_teaching_content": true, "reason": "", "milestones": ["concept 1", "concept 2", "concept 3", "concept 4", "concept 5"]}
For the false case:
{"has_teaching_content": false, "reason": "brief explanation of why this is not teaching content", "milestones": []}
When has_teaching_content is true, provide 5-7 milestones depending on content density. When false, provide [] for milestones.`,
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
    const parsed = parseGeminiJson<{ has_teaching_content?: boolean; reason?: string; milestones?: string[] }>(text)

    // Lightweight content-quality guard: if Gemini flags non-teaching material, surface a specific error
    if (parsed.has_teaching_content === false) {
      const rawReason = typeof parsed.reason === "string" ? parsed.reason.trim() : ""
      const reason = rawReason || "non-explanatory content with no conceptual explanations"
      const snippet = reason.replace(/\.$/, "")
      return {
        success: false,
        milestones: [],
        error: `This looks like ${snippet} rather than material that explains concepts. Try uploading lecture notes, a textbook excerpt, or content that actually explains ideas, not just names them.`,
        loading: false
      }
    }

    const milestones = Array.isArray(parsed.milestones) ? parsed.milestones : []

    // Treat empty milestones as an error (Phase 1.9 behavior) — use reason if provided by the guard
    if (milestones.length === 0) {
      if (typeof parsed.reason === "string" && parsed.reason.trim()) {
        const snippet = parsed.reason.trim().replace(/\.$/, "")
        return {
          success: false,
          milestones: [],
          error: `This looks like ${snippet} rather than material that explains concepts. Try uploading lecture notes, a textbook excerpt, or content that actually explains ideas, not just names them.`,
          loading: false
        }
      }
      return {
        success: false,
        milestones: [],
        error: "We couldn't extract any key concepts from those notes. Please try a different document or add more detail.",
        loading: false
      }
    }

    return {
      success: true,
      milestones: milestones.map((m: string, i: number) => ({
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
