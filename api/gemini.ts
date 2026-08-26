/**
 * Vercel serverless function: proxies Gemini API requests.
 * Client sends { model?: string, payload: GeminiRequestPayload }.
 * Server injects API key from GEMINI_API_KEY env (never exposed to client).
 */
// Vercel Node.js runtime handler (works with @vercel/node)

// ---- Rate limiting: in-memory sliding window ----
// Note: in-memory rate limiting resets on each serverless cold start (a known limitation without an external
// store like Redis) — but this still provides meaningful protection against rapid automated abuse within a single
// warm instance, which is the realistic threat model for this deployment.
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const RATE_MAX_REQUESTS = 20
const rateLimitStore = new Map<string, number[]>()

function getClientIp(req: any): string {
  const xff = req.headers?.["x-forwarded-for"] as string | undefined
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = req.headers?.["x-real-ip"] as string | undefined
  if (realIp) return realIp.trim()
  if (req.socket?.remoteAddress) return req.socket.remoteAddress as string
  if (req.ip) return req.ip as string
  return "unknown"
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitStore.get(ip) ?? []
  // Filter to window
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= RATE_MAX_REQUESTS) {
    // Still update store to reflect recent
    rateLimitStore.set(ip, recent)
    return true
  }
  recent.push(now)
  rateLimitStore.set(ip, recent)
  // Optional cleanup of other IPs periodically to prevent unbounded growth
  if (rateLimitStore.size > 1000) {
    for (const [key, times] of rateLimitStore.entries()) {
      const filtered = times.filter((t) => now - t < RATE_WINDOW_MS)
      if (filtered.length === 0) rateLimitStore.delete(key)
      else rateLimitStore.set(key, filtered)
    }
  }
  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  // Rate limiting check
  const clientIp = getClientIp(req)
  if (isRateLimited(clientIp)) {
    res.status(429).json({
      error: "Too many requests — please wait a moment before trying again.",
      retryAfter: 60,
    })
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

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  // Retry logic: up to 2 retries (3 total attempts) with exponential backoff 1s then 3s
  // Only retry on retryable errors: network errors/timeouts, 5xx from upstream
  // Do NOT retry on 4xx (client errors like invalid request)
  const maxRetries = 2
  const backoffs = [1000, 3000]
  let lastError: unknown = null
  let lastStatus: number | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000)
      const upstream = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      // If retryable status (5xx) and we have retries left, backoff and retry
      if (upstream.status >= 500 && upstream.status <= 599 && attempt < maxRetries) {
        lastStatus = upstream.status
        await sleep(backoffs[attempt] ?? 3000)
        continue
      }

      // For 4xx, do not retry — return immediately
      // For success (2xx) or other, return
      const text = await upstream.text()
      res.status(upstream.status)
      try {
        const json = JSON.parse(text)
        res.json(json)
      } catch {
        res.send(text)
      }
      return
    } catch (err: unknown) {
      lastError = err
      const isAbort = err instanceof Error && err.name === "AbortError"
      const isNetworkError = err instanceof Error && (err.message.includes("fetch") || isAbort)
      // Retry on network/timeout if attempts remain
      if (attempt < maxRetries) {
        // Only retry if it's a network/timeout error (retryable)
        // Non-retryable would be programming errors, but fetch network errors are retryable
        await sleep(backoffs[attempt] ?? 3000)
        continue
      }
      // Exhausted retries
      const msg = err instanceof Error ? err.message : "Upstream request failed"
      if (isAbort) {
        res.status(504).json({ error: "Service temporarily unavailable — request timed out, please try again shortly." })
      } else {
        res.status(502).json({ error: `Service temporarily unavailable, please try again shortly. (${msg})` })
      }
      return
    }
  }

  // If we exited loop without returning, all retries exhausted for 5xx case
  if (lastStatus !== null && lastStatus >= 500) {
    res.status(503).json({ error: "Service temporarily unavailable, please try again shortly." })
    return
  }
  const msg = lastError instanceof Error ? lastError.message : "Upstream request failed"
  res.status(502).json({ error: `Service temporarily unavailable, please try again shortly. (${msg})` })
}
