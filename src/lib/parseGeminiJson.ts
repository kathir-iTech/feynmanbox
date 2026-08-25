/**
 * Strips markdown code fences (```json ... ```) that Gemini sometimes wraps
 * around JSON responses, then parses the result.
 * Attempts to extract the first JSON object if extra prose surrounds it.
 */
export function parseGeminiJson<T>(text: string): T {
  let cleaned = text.trim()

  // Strip markdown code fences: ```json\n...\n``` or ```\n...\n```
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  }

  // Also handle single-line fences: ```json{"key":"val"}```
  const singleLineMatch = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  if (singleLineMatch && !fenceMatch) {
    cleaned = singleLineMatch[1].trim()
  }

  try {
    return JSON.parse(cleaned) as T
  } catch (firstErr) {
    // Fallback: try to locate the first balanced JSON object in the text
    const jsonObjectMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonObjectMatch) {
      try {
        return JSON.parse(jsonObjectMatch[0]) as T
      } catch {
        // fall through to throw original error
      }
    }
    throw firstErr
  }
}
