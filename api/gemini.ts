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
  try {
    const headers = req.headers || {}
    // x-forwarded-for can be string | string[] | undefined
    const xffRaw = headers["x-forwarded-for"] ?? headers["X-Forwarded-For"]
    if (xffRaw) {
      const xff = Array.isArray(xffRaw) ? xffRaw[0] : (xffRaw as string)
      if (typeof xff === "string" && xff.trim()) {
        const first = xff.split(",")[0]?.trim()
        if (first) return first
      }
    }
    const realIpRaw = headers["x-real-ip"] ?? headers["X-Real-Ip"]
    if (realIpRaw) {
      const realIp = Array.isArray(realIpRaw) ? realIpRaw[0] : (realIpRaw as string)
      if (typeof realIp === "string" && realIp.trim()) return realIp.trim()
    }
    if (req.socket?.remoteAddress && typeof req.socket.remoteAddress === "string") {
      return req.socket.remoteAddress
    }
    if (typeof req.ip === "string" && req.ip) return req.ip
    // Fallback for Vercel edge: try x-vercel-forwarded-for
    const vercelFwd = headers["x-vercel-forwarded-for"] ?? headers["x-vercel-forwarded-for"]
    if (vercelFwd) {
      const v = Array.isArray(vercelFwd) ? vercelFwd[0] : (vercelFwd as string)
      if (typeof v === "string" && v.trim()) return v.split(",")[0].trim()
    }
    return "unknown"
  } catch (e) {
    console.error("[gemini] getClientIp error", e)
    return "unknown"
  }
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const timestamps = rateLimitStore.get(ip) ?? []
  // Filter to window — keep only recent requests
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS)
  // Correct sliding window check: allow up to RATE_MAX_REQUESTS, reject on 21st
  if (recent.length >= RATE_MAX_REQUESTS) {
    rateLimitStore.set(ip, recent)
    return true
  }
  recent.push(now)
  rateLimitStore.set(ip, recent)
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
  const startTime = Date.now()
  let requestBodyForRetry: string | null = null
  let parsedBodyForRetry: any = null

  try {
    console.log(`[gemini] Incoming ${req.method} ${req.url || "/api/gemini"} from ip=${getClientIp(req)}`)
    if (req.method !== "POST") {
      console.warn(`[gemini] Method not allowed: ${req.method}`)
      res.status(405).json({ error: "Method not allowed" })
      return
    }

    // Rate limiting check — logged
    const clientIp = getClientIp(req)
    const rateLimited = isRateLimited(clientIp)
    console.log(`[gemini] Rate check ip=${clientIp} limited=${rateLimited} storeSize=${rateLimitStore.size}`)
    if (rateLimited) {
      console.warn(`[gemini] Rate limit exceeded for ip=${clientIp}`)
      res.status(429).json({
        error: "Too many requests — please wait a moment before trying again.",
        retryAfter: 60,
      })
      return
    }

    // Read request body ONCE at the start and reuse for all retries (critical fix for body reuse bug)
    // Node.js/Vercel request bodies can only be read once — never re-read from stream on retry
    let body: any
    try {
      const rawBody = req.body
      const bodySize = rawBody
        ? typeof rawBody === "string"
          ? Buffer.byteLength(rawBody, "utf8")
          : Buffer.byteLength(JSON.stringify(rawBody), "utf8")
        : 0
      console.log(`[gemini] Incoming body type=${typeof rawBody} size=${bodySize} bytes`)

      if (typeof rawBody === "string") {
        body = JSON.parse(rawBody)
        requestBodyForRetry = rawBody
        parsedBodyForRetry = body
      } else if (rawBody && typeof rawBody === "object") {
        body = rawBody
        // Serialize once for logging and for potential retry reuse
        try {
          requestBodyForRetry = JSON.stringify(rawBody)
          parsedBodyForRetry = body
        } catch (e) {
          console.error("[gemini] Failed to stringify body for retry", e)
          requestBodyForRetry = null
          parsedBodyForRetry = body
        }
      } else if (rawBody === undefined || rawBody === null) {
        // Try to handle case where body is a stream or not yet parsed (edge runtime)
        // Attempt to read as text if req has text method
        if (typeof req.text === "function") {
          const text = await req.text()
          console.log(`[gemini] Read body via req.text() size=${text.length}`)
          requestBodyForRetry = text
          body = text ? JSON.parse(text) : null
          parsedBodyForRetry = body
        } else {
          body = rawBody
          parsedBodyForRetry = body
        }
      } else {
        body = rawBody
        parsedBodyForRetry = body
      }
    } catch (e) {
      console.error("[gemini] Invalid JSON body", e, (e as Error)?.stack)
      res.status(400).json({ error: "Invalid JSON body", details: (e as Error)?.message })
      return
    }

    // Use parsedBodyForRetry for all subsequent logic — never re-read from req
    const effectiveBody = parsedBodyForRetry ?? body

    const model: string =
      typeof effectiveBody?.model === "string" && effectiveBody.model.trim()
        ? effectiveBody.model.trim()
        : "gemini-flash-lite-latest"
    const payload = effectiveBody?.payload
    if (!payload || typeof payload !== "object") {
      console.warn("[gemini] Missing payload", { bodyKeys: effectiveBody ? Object.keys(effectiveBody) : null })
      res.status(400).json({ error: "Missing payload" })
      return
    }

    // Log outgoing request (sanitized)
    const payloadStr = JSON.stringify(payload)
    console.log(`[gemini] Outgoing to Gemini model=${model} payloadSize=${Buffer.byteLength(payloadStr, "utf8")} bytes`)

    // API key handling — startup diagnostic (masked) for Vercel verification
    const rawKey = process.env.GEMINI_API_KEY
    if (rawKey) {
      const masked = `${rawKey.slice(0, 4)}...${rawKey.slice(-4)} (length ${rawKey.length})`
      console.log(`[gemini] Diagnostic: GEMINI_API_KEY present — ${masked}`)
      // Safety: warn if key looks too short/truncated (real Gemini keys are ~39 chars, AIza...)
      if (rawKey.length < 30) {
        console.warn(`[gemini] WARNING: GEMINI_API_KEY length ${rawKey.length} is unusually short — may be truncated or invalid. Expected ~39 chars.`)
      }
      if (!rawKey.startsWith("AIza")) {
        console.warn(`[gemini] WARNING: GEMINI_API_KEY does not start with "AIza" — may be invalid or wrong variable.`)
      }
    } else {
      console.error("[gemini] Diagnostic: GEMINI_API_KEY is MISSING at runtime — check Vercel Dashboard → Project Settings → Environment Variables (Production)")
      if (process.env.VITE_GEMINI_API_KEY) {
        console.error("[gemini] Found VITE_GEMINI_API_KEY but IGNORED — server must use GEMINI_API_KEY (non-VITE_) only. VITE_ vars are client-exposed and stale fallback is disabled.")
      }
    }

    const apiKey = rawKey
    if (!apiKey) {
      console.error("[gemini] Missing GEMINI_API_KEY — server cannot call Gemini. Set it in Vercel Dashboard → Settings → Environment Variables for Production, then redeploy.")
      res.status(500).json({ error: "Server misconfigured: missing GEMINI_API_KEY. Please set a valid server-side GEMINI_API_KEY in Vercel and redeploy." })
      return
    }
    console.log(`[gemini] Using API key from GEMINI_API_KEY, length=${apiKey.length}`)

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

    // Retry logic: up to 2 retries (3 total attempts) with exponential backoff 1s then 3s
    // FIX: Reuse parsedBodyForRetry/payloadStr for every attempt — never re-read request stream
    // Increase timeout to 30s for large prompts (multi-thousand-word docs)
    const maxRetries = 2
    const backoffs = [1000, 3000]
    const TIMEOUT_MS = 30000
    let lastError: unknown = null
    let lastStatus: number | null = null
    // Reuse the same serialized payload for all retries to avoid body consumption issues
    const serializedPayload = payloadStr

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStart = Date.now()
      console.log(`[gemini] Attempt ${attempt + 1}/${maxRetries + 1} to ${apiUrl.replace(/key=.*/, "key=***")}`)

      let controller: AbortController | null = null
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      try {
        controller = new AbortController()
        timeoutId = setTimeout(() => {
          console.warn(`[gemini] Abort timeout after ${TIMEOUT_MS}ms on attempt ${attempt + 1}`)
          controller!.abort()
        }, TIMEOUT_MS)

        const upstream = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: serializedPayload,
          signal: controller.signal,
        })

        if (timeoutId) clearTimeout(timeoutId)
        timeoutId = null

        console.log(`[gemini] Upstream response status=${upstream.status} attempt=${attempt + 1} duration=${Date.now() - attemptStart}ms`)

        // If retryable 5xx and retries remain, log and retry
        if (upstream.status >= 500 && upstream.status <= 599 && attempt < maxRetries) {
          lastStatus = upstream.status
          const rawBody = await upstream.text().catch(() => "<failed to read body>")
          console.warn(`[gemini] Retryable 5xx status=${upstream.status} body=${rawBody.slice(0, 500)} attempt=${attempt + 1} — backing off ${backoffs[attempt]}ms`)
          await sleep(backoffs[attempt] ?? 3000)
          continue
        }

        // For all other statuses (2xx, 4xx, final 5xx after retries), return to client
        const text = await upstream.text()
        console.log(`[gemini] Upstream body size=${text.length} status=${upstream.status} preview=${text.slice(0, 300)}`)

        res.status(upstream.status)
        try {
          const json = JSON.parse(text)
          res.json(json)
        } catch {
          res.send(text)
        }
        console.log(`[gemini] Completed successfully in ${Date.now() - startTime}ms total`)
        return
      } catch (err: unknown) {
        if (timeoutId) clearTimeout(timeoutId)
        lastError = err
        const isAbort = err instanceof Error && err.name === "AbortError"
        console.error(`[gemini] Fetch error on attempt ${attempt + 1}:`, err, (err as Error)?.stack)

        // Distinguish retryable vs non-retryable
        // Retryable: network errors, timeouts (AbortError), fetch failures
        // Non-retryable: programming errors (should not retry)
        const isRetryable = isAbort || (err instanceof Error && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("aborted")))

        if (attempt < maxRetries && isRetryable) {
          console.warn(`[gemini] Retryable error, backing off ${backoffs[attempt]}ms before retry`)
          await sleep(backoffs[attempt] ?? 3000)
          continue
        }

        // If not retryable or exhausted retries, surface error
        const msg = err instanceof Error ? err.message : "Upstream request failed"
        const stack = err instanceof Error ? err.stack : String(err)
        console.error(`[gemini] Final failure after ${attempt + 1} attempts in ${Date.now() - startTime}ms: ${msg}\n${stack}`)

        if (isAbort) {
          res.status(504).json({ error: "Service temporarily unavailable — request timed out, please try again shortly.", details: msg })
        } else {
          res.status(502).json({ error: `Service temporarily unavailable, please try again shortly. (${msg})`, details: stack?.slice(0, 1000) })
        }
        return
      }
    }

    // Exhausted retries for 5xx
    if (lastStatus !== null && lastStatus >= 500) {
      console.error(`[gemini] All retries exhausted for 5xx status=${lastStatus}`)
      res.status(503).json({ error: "Service temporarily unavailable, please try again shortly.", status: lastStatus })
      return
    }
    const msg = lastError instanceof Error ? lastError.message : "Upstream request failed"
    console.error(`[gemini] All retries exhausted, last error: ${msg}`)
    res.status(502).json({ error: `Service temporarily unavailable, please try again shortly. (${msg})` })
  } catch (outerErr: unknown) {
    // Top-level catch — ensures no silent 500 without logging
    console.error("[gemini] UNHANDLED handler error:", outerErr, (outerErr as Error)?.stack)
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error in Gemini proxy",
        details: outerErr instanceof Error ? outerErr.message : String(outerErr),
        stack: outerErr instanceof Error ? outerErr.stack?.slice(0, 2000) : undefined,
      })
    }
  }
}
