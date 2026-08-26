/**
 * Vercel serverless function: proxies Gemini API requests.
 * Client sends { purpose: Purpose, payload: GeminiRequestPayload }.
 * The server maps each known PURPOSE to a fixed model (the client can NEVER
 * choose an arbitrary model or arbitrary endpoint) and validates the payload
 * shape before forwarding. API key comes from GEMINI_API_KEY env (never exposed).
 */
// Vercel Node.js runtime handler (works with @vercel/node)

// ---- Rate limiting: in-memory sliding window ----
const RATE_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const RATE_MAX_REQUESTS = 20
const rateLimitStore = new Map<string, number[]>()

// ---- Purpose allowlist: maps a known client purpose to a FIXED model ----
// The client cannot request an arbitrary model — only these purposes are accepted.
type Purpose = "milestone_generation" | "transcription" | "combined_evaluation" | "followup_question"
const PURPOSE_MODELS: Record<Purpose, string> = {
  milestone_generation: "gemini-flash-lite-latest",
  transcription: "gemini-flash-lite-latest",
  combined_evaluation: "gemini-flash-lite-latest",
  followup_question: "gemini-flash-lite-latest",
}
const ALLOWED_PURPOSES = new Set<string>(Object.keys(PURPOSE_MODELS))

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024 // 2MB hard cap on incoming request body

function getClientIp(req: any): string {
  try {
    const headers = req.headers || {}
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
  const recent = timestamps.filter((t) => now - t < RATE_WINDOW_MS)
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

/**
 * Validates the Gemini request payload shape at runtime.
 * We do NOT trust the client to send a well-formed payload.
 */
function validatePayload(payload: any): { ok: boolean; error?: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "payload must be an object" }
  }
  if (!Array.isArray(payload.contents) || payload.contents.length === 0) {
    return { ok: false, error: "payload.contents must be a non-empty array" }
  }
  for (let i = 0; i < payload.contents.length; i++) {
    const part = payload.contents[i]
    if (!part || typeof part !== "object") return { ok: false, error: `contents[${i}] must be an object` }
    if (!Array.isArray(part.parts) || part.parts.length === 0) {
      return { ok: false, error: `contents[${i}].parts must be a non-empty array` }
    }
    for (let j = 0; j < part.parts.length; j++) {
      const p = part.parts[j]
      if (!p || typeof p !== "object") return { ok: false, error: `contents[${i}].parts[${j}] must be an object` }
      const hasText = typeof p.text === "string" && p.text.length > 0
      const hasInline = typeof p.inline_data === "object" && p.inline_data !== null
      if (!hasText && !hasInline) {
        return { ok: false, error: `contents[${i}].parts[${j}] must contain text or inline_data` }
      }
    }
  }
  return { ok: true }
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

    // Rate limiting check
    const clientIp = getClientIp(req)
    const rateLimited = isRateLimited(clientIp)
    console.log(`[gemini] Rate check ip=${clientIp} limited=${rateLimited}`)
    if (rateLimited) {
      console.warn(`[gemini] Rate limit exceeded for ip=${clientIp}`)
      res.status(429).json({
        error: "Too many requests — please wait a moment before trying again.",
        retryAfter: 60,
      })
      return
    }

    // Read request body ONCE at the start and reuse for all retries (critical fix for body reuse bug)
    let body: any
    try {
      const rawBody = req.body
      const bodySize = rawBody
        ? typeof rawBody === "string"
          ? Buffer.byteLength(rawBody, "utf8")
          : Buffer.byteLength(JSON.stringify(rawBody), "utf8")
        : 0
      console.log(`[gemini] Incoming body type=${typeof rawBody} size=${bodySize} bytes`)

      // 9.1: reject oversized bodies before doing any work / forwarding
      if (bodySize > MAX_PAYLOAD_BYTES) {
        console.warn(`[gemini] Rejected oversized body: ${bodySize} bytes (max ${MAX_PAYLOAD_BYTES})`)
        res.status(413).json({ error: "Request body too large." })
        return
      }

      if (typeof rawBody === "string") {
        body = JSON.parse(rawBody)
        requestBodyForRetry = rawBody
        parsedBodyForRetry = body
      } else if (rawBody && typeof rawBody === "object") {
        body = rawBody
        try {
          requestBodyForRetry = JSON.stringify(rawBody)
          parsedBodyForRetry = body
        } catch (e) {
          console.error("[gemini] Failed to stringify body for retry", e)
          requestBodyForRetry = null
          parsedBodyForRetry = body
        }
      } else if (rawBody === undefined || rawBody === null) {
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
      console.error("[gemini] Invalid JSON body", e)
      res.status(400).json({ error: "Invalid JSON body" })
      return
    }

    const effectiveBody = parsedBodyForRetry ?? body

    // 9.1: strict purpose allowlist — reject any unknown purpose with 400
    const purpose: string = typeof effectiveBody?.purpose === "string" ? effectiveBody.purpose.trim() : ""
    if (!purpose || !ALLOWED_PURPOSES.has(purpose)) {
      console.warn(`[gemini] Rejected unknown/invalid purpose: ${JSON.stringify(purpose)}`)
      res.status(400).json({ error: "Invalid or missing 'purpose'. Allowed purposes: " + Array.from(ALLOWED_PURPOSES).join(", ") })
      return
    }

    const payload = effectiveBody?.payload
    if (!payload || typeof payload !== "object") {
      console.warn("[gemini] Missing payload")
      res.status(400).json({ error: "Missing payload" })
      return
    }

    // 9.1: runtime schema validation of payload shape
    const validation = validatePayload(payload)
    if (!validation.ok) {
      console.warn(`[gemini] Invalid payload shape: ${validation.error}`)
      res.status(400).json({ error: "Invalid payload shape: " + validation.error })
      return
    }

    // 9.1: map purpose -> fixed model server-side (client cannot override the model)
    const model = PURPOSE_MODELS[purpose as Purpose]
    const payloadStr = JSON.stringify(payload)
    console.log(`[gemini] Purpose=${purpose} -> model=${model} payloadSize=${Buffer.byteLength(payloadStr, "utf8")} bytes`)

    // API key handling — startup diagnostic (masked)
    const rawKey = process.env.GEMINI_API_KEY
    if (rawKey) {
      const masked = `${rawKey.slice(0, 4)}...${rawKey.slice(-4)} (length ${rawKey.length})`
      console.log(`[gemini] Diagnostic: GEMINI_API_KEY present — ${masked}`)
      if (rawKey.length < 20) {
        console.warn(`[gemini] WARNING: GEMINI_API_KEY length ${rawKey.length} is unusually short — may be truncated or invalid.`)
      }
      if (rawKey === "your_gemini_api_key_here" || rawKey.includes("your_gemini")) {
        console.warn(`[gemini] WARNING: GEMINI_API_KEY appears to be a placeholder — set a real key from Google AI Studio.`)
      }
    } else {
      console.error("[gemini] Diagnostic: GEMINI_API_KEY is MISSING at runtime — check Vercel Dashboard → Project Settings → Environment Variables (Production)")
      if (process.env.VITE_GEMINI_API_KEY) {
        console.error("[gemini] Found VITE_GEMINI_API_KEY but IGNORED — server must use GEMINI_API_KEY (non-VITE_) only.")
      }
    }

    const apiKey = rawKey
    if (!apiKey) {
      console.error("[gemini] Missing GEMINI_API_KEY — server cannot call Gemini.")
      res.status(500).json({ error: "Server misconfigured: missing GEMINI_API_KEY. Please set a valid server-side GEMINI_API_KEY in Vercel and redeploy." })
      return
    }
    console.log(`[gemini] Using API key from GEMINI_API_KEY, length=${apiKey.length}`)

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

    // Retry logic: up to 2 retries (3 total attempts) with exponential backoff
    const maxRetries = 2
    const backoffs = [1000, 3000]
    const TIMEOUT_MS = 30000
    let lastError: unknown = null
    let lastStatus: number | null = null
    const serializedPayload = payloadStr

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const attemptStart = Date.now()
      console.log(`[gemini] Attempt ${attempt + 1}/${maxRetries + 1} (purpose=${purpose})`)

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

        if (upstream.status >= 500 && upstream.status <= 599 && attempt < maxRetries) {
          lastStatus = upstream.status
          const rawBodyText = await upstream.text().catch(() => "<failed to read body>")
          console.warn(`[gemini] Retryable 5xx status=${upstream.status} attempt=${attempt + 1} — backing off ${backoffs[attempt]}ms`)
          await sleep(backoffs[attempt] ?? 3000)
          continue
        }

        const text = await upstream.text()
        // 9.2: log ONLY status + size metadata, never response content
        console.log(`[gemini] Upstream done status=${upstream.status} responseBytes=${text.length}`)

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
        console.error(`[gemini] Fetch error on attempt ${attempt + 1}:`, err?.constructor?.name ?? "unknown")

        const isRetryable = isAbort || (err instanceof Error && (err.message.includes("fetch") || err.message.includes("network") || err.message.includes("aborted")))

        if (attempt < maxRetries && isRetryable) {
          console.warn(`[gemini] Retryable error, backing off ${backoffs[attempt]}ms before retry`)
          await sleep(backoffs[attempt] ?? 3000)
          continue
        }

        const msg = err instanceof Error ? err.message : "Upstream request failed"
        console.error(`[gemini] Final failure after ${attempt + 1} attempts in ${Date.now() - startTime}ms`)

        if (isAbort) {
          res.status(504).json({ error: "Service temporarily unavailable — request timed out, please try again shortly." })
        } else {
          res.status(502).json({ error: `Service temporarily unavailable, please try again shortly.` })
        }
        return
      }
    }

    if (lastStatus !== null && lastStatus >= 500) {
      console.error(`[gemini] All retries exhausted for 5xx status=${lastStatus}`)
      res.status(503).json({ error: "Service temporarily unavailable, please try again shortly.", status: lastStatus })
      return
    }
    console.error(`[gemini] All retries exhausted`)
    res.status(502).json({ error: `Service temporarily unavailable, please try again shortly.` })
  } catch (outerErr: unknown) {
    console.error("[gemini] UNHANDLED handler error")
    if (!res.headersSent) {
      res.status(500).json({
        error: "Internal server error in Gemini proxy",
      })
    }
  }
}
