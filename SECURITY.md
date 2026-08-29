# Security Policy

This document describes the **actual** security measures implemented in the
FeynmanBox codebase. Nothing here is aspirational — every item maps to code
that is present in this repository.

FeynmanBox is a client-heavy single-page app: the browser does document
parsing, audio capture, and waveform rendering. The only server component is a
single Vercel serverless proxy (`api/gemini.ts`) that holds the Gemini API key
and forwards requests to Google. The security posture below follows from that
architecture.

---

## Implemented Protections

### 1. Server-side API key isolation
The Gemini API key is read **only** from the server-only environment variable
`GEMINI_API_KEY` (`api/gemini.ts:249`). It is never bundled into client
JavaScript and is never exposed to the browser. The client always calls the
relative `/api/gemini` endpoint, never Google's API directly. The proxy
explicitly ignores any `VITE_GEMINI_API_KEY` and warns if one is found.

### 2. Purpose-based request allowlisting
The proxy accepts `{ purpose, payload }` where `purpose` must be one of a fixed
allowlist — `milestone_generation`, `transcription`, `combined_evaluation`,
`followup_question` (`api/gemini.ts:17-24`). Unknown or missing purposes are
rejected with HTTP 400. Each purpose is mapped server-side to a fixed model;
**the client cannot choose an arbitrary model or endpoint**.

### 3. Origin / CORS enforcement
The proxy validates the `Origin` header against an allowlist
(`https://feynmanbox.vercel.app`, `http://localhost:5173`). Requests from any
other origin are rejected with HTTP 403; the `Access-Control-Allow-Origin`
response header is set only to the verified origin (`api/gemini.ts:129-136`).

### 4. Rate limiting (IP-based sliding window)
An in-memory sliding-window limiter caps requests at **20 per 10 minutes per
client IP** (`api/gemini.ts:11-12, 62-80`). Exceeded requests receive HTTP 429
with a `retryAfter` hint. The store auto-prunes stale entries and is capped at
1000 keys.

> Scope note: the limiter lives in serverless function memory, so it resets on
> cold start / instance rotation. It is intended to damp abuse at hackathon
> scale, not as distributed DDoS protection.

### 5. Request body size caps
Request bodies are rejected before any work is done. A global cap of 4 MB
applies pre-purpose; per-purpose caps are 2 MB for general requests and 4 MB
for transcription audio (`api/gemini.ts:26-28, 170-174, 221-226`). Oversized
bodies return HTTP 413.

### 6. Prompt-injection defense
All untrusted student/document content is wrapped in boundary tags
(`<UNTRUSTED_STUDY_MATERIAL>` / `<UNTRUSTED_STUDENT_TRANSCRIPT>`) preceded by a
system directive instructing the model to treat that content as **DATA ONLY**,
never as instructions — even if it contains "ignore previous instructions" or
similar overrides (`src/lib/security.ts:8-17`). A live injection test
(`scripts/testInjection.mjs`) confirms an injection-laden transcript scores 0
rather than being inflated.

### 7. Sanitized server-side logging
The proxy logs only metadata — method, URL, client IP, status, body size, and
the purpose→model mapping (`api/gemini.ts:122, 246, 319`). It **never logs**
`payload.contents[].parts[].text` (student/document content) nor the upstream
response content. The startup key diagnostic is masked (`AIza...XXXX`).

### 8. Input validation on file uploads
`DocumentUpload.tsx` enforces a 10 MB per-file limit and restricts accepted
types to `.pdf, .docx, .txt` (`src/components/DocumentUpload.tsx:16-24, 99`).
Oversized or unsupported files are rejected client-side with a clear message
before any parsing occurs.

### 9. History import schema validation
Imported history JSON is validated entry-by-entry via `isValidHistoryEntry`
(`src/App.tsx:918-929`), which checks `id`, `date`, `finalScore`,
`coverageScore`, `clarityScore`, `isGaming`, `milestones`, and `fingerprint`
types. Invalid or duplicate entries are skipped and reported; legacy entries
lacking `sub_score` are migrated. This prevents malformed data from polluting
`localStorage`.

---

## Out of Scope (accepted tradeoffs)

These are deliberate limitations given the project's scope, not oversights:

- **No authentication / user accounts** — any visitor can use the app; quota is
  bounded only by the IP rate limiter.
- **No end-to-end encryption at rest** — history is stored in browser
  `localStorage` unencrypted.
- **No formal proof of injection resistance** — the untrusted-content boundary
  relies on model adherence to the directive, validated by live tests rather
  than formal methods.

## Reporting a Vulnerability

This repository is public for demonstration only. If you discover a security
issue, please report it privately to the maintainer rather than opening a
public issue. See the LICENSE file for contact/permission terms.
