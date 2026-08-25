/**
 * Vercel serverless function: proxies Gemini API requests.
 * Client sends { model?: string, payload: GeminiRequestPayload }.
 * Server injects API key from GEMINI_API_KEY env (never exposed to client).
 */
// Vercel Node.js runtime handler (works with @vercel/node)
export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: "Server misconfigured: missing GEMINI_API_KEY" })
    return
  }

  let body: any
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
  } catch {
    res.status(400).json({ error: "Invalid JSON body" })
    return
  }

  const model: string = typeof body?.model === "string" && body.model.trim() ? body.model.trim() : "gemini-flash-lite-latest"
  const payload = body?.payload
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ error: "Missing payload" })
    return
  }

  // Allow only expected top-level keys to reduce abuse surface
  // For now forward payload as-is after basic validation
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  try {
    const upstream = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const text = await upstream.text()
    // Pass through status and body
    res.status(upstream.status)
    // Preserve content-type if JSON, else send as json
    try {
      const json = JSON.parse(text)
      res.json(json)
    } catch {
      res.send(text)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Upstream request failed"
    res.status(502).json({ error: msg })
  }
}
