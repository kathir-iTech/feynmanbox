# FeynmanBox — Technical Notes

A condensed engineering reference. For the project overview and usage, see
[README.md](../README.md). For the security posture, see
[SECURITY.md](../SECURITY.md).

---

## 1. Adversarial Test Harness Results

Reference concept for all cases: **Binary Search Trees (BST)** — 5 milestones.
The harness (`src/lib/testCases.ts` + `src/lib/adversarialHarness.ts`) runs the
real `evaluateCombined` path against seven labeled transcripts. Offline
heuristic results (deterministic, `npm run test:evaluation`):

| Category | Coverage | Clarity | Final | Expected Final | Confidence | Gaming | Result |
|---|---|---|---|---|---|---|---|
| genuine_correct | 88 | 82 | 86 | 70–100 | high | no | PASS |
| keyword_dump | 12 | 9 | 7 | 0–20 | low | yes | PASS |
| confident_wrong | 10 | 45 | 24 | 0–25 | moderate | no | PASS |
| memorized_verbatim | 75 | 58 | 68 | 45–75 | moderate | no | PASS |
| partially_correct | 48 | 72 | 58 | 35–65 | moderate | no | PASS |
| poorly_articulated | 68 | 42 | 58 | 40–70 | moderate | no | PASS |
| fluent_nonsense | 8 | 76 | 35 | 10–40 | low | no | PASS |

**Summary: 7/7 passed.** Real Gemini runs (with `GEMINI_API_KEY`) track the same
thresholds with ±15 margin for nondeterminism at `temperature 0.2`.

Interpretation: genuine explanations score high; keyword dumps are flagged as
gaming with near-zero clarity; confidently-wrong answers are penalized via
`factually_incorrect` capping (even when fluent); fluent-but-empty answers score
low on coverage despite smooth delivery.

---

## 2. Architecture & Directory Layout

```
FeynmanBox/
├── api/
│   └── gemini.ts                 # Vercel serverless proxy — purpose allowlist,
│                                 #   rate limit, body caps, logging hygiene
├── public/
│   └── favicon.svg
├── scripts/
│   ├── testEvaluation.js         # adversarial harness (heuristic + real API)
│   ├── testInjection.mjs         # live prompt-injection test
│   └── testDiffThreshold.mjs     # transcript-edit diff unit test
├── src/
│   ├── components/
│   │   ├── DocumentUpload.tsx    # accessible drop zone, drag+paste, 10 MB guard
│   │   ├── VoiceRecorder.tsx     # recording, waveform, live preview, acoustic
│   │   └── ExportFeature.tsx     # Markdown + Anki (.txt) export
│   ├── lib/
│   │   ├── adversarialHarness.ts # in-browser harness
│   │   ├── combinedEvaluationService.ts # single-call evaluation
│   │   ├── demoFixtures.ts       # offline fixtures (demo mode)
│   │   ├── fileExtractor.ts      # TXT/DOCX/PDF via Web Worker
│   │   ├── fileParser.worker.ts  # worker entry — mammoth + pdfjs-dist
│   │   ├── followUpService.ts    # remediation + transfer pair
│   │   ├── milestoneService.ts    # guard + subject classification + extraction
│   │   ├── parseGeminiJson.ts    # fence-stripping + JSON fallback
│   │   ├── security.ts           # UNTRUSTED_CONTENT_DIRECTIVE + wrap helpers
│   │   ├── testCases.ts          # 7 transcripts + expected ranges
│   │   └── transcriptionService.ts # base64 audio → /api/gemini transcription
│   ├── App.tsx                   # orchestration, history, import validation
│   ├── main.tsx
│   ├── types.ts
│   └── index.css
├── index.html
├── package.json / package-lock.json
├── vite.config.ts
├── vercel.json
└── .env.example                  # GEMINI_API_KEY template (server-side only)
```

### Key design decisions

- **Single structured Gemini call** for evaluation — one prompt returns coverage,
  factual accuracy, reasoning quality, clarity, and gaming flag together
  (replaces three sequential calls), cutting latency and quota.
- **Client-side pipeline** — PDF/DOCX parsing (`fileParser.worker.ts`), audio
  capture (`MediaRecorder`), and waveform (Web Audio `AnalyserNode`) all run in
  the browser. The only server component is the key-holding proxy.
- **Serverless proxy** (`api/gemini.ts`) — accepts `{ purpose, payload }` where
  `purpose` is an allowlisted value mapped to a fixed model. The client can
  never choose an arbitrary model or endpoint.
- **Security boundary** — `UNTRUSTED_CONTENT_DIRECTIVE` (`src/lib/security.ts`)
  plus `wrapStudyMaterial` / `wrapTranscript` tags enclose all student/document
  content in prompts as DATA ONLY.

---

## 3. Known Limitations

- **Single LLM provider dependency** — Only Gemini `gemini-flash-lite-latest`
  via Google AI Studio. No fallback provider or local model; outages or
  deprecations directly affect availability.
- **localStorage-only persistence** — History lives in browser `localStorage`
  (~5–10 MB per origin), no sync, no backend, no encryption at rest.
- **In-memory rate limiting resets on cold start** — `api/gemini.ts` uses a
  `Map` in serverless memory; resets on deploy / scale-to-zero / instance
  rotation. Intended for abuse damping, not production DDoS protection.
- **No multi-language support** — Prompts and UI are English-only; non-English
  scoring is untested and likely degraded.
- **Acoustic metrics are supplementary heuristics, not lab-grade analysis** —
  WPM from word count / duration, pause detection via amplitude threshold,
  pitch variance via frequency-bin variance. Environment- and device-dependent.
  They never influence coverage/factual scores.
- **Content guard is LLM-based and lenient by design** — The teaching-content
  assessment is a prompt instruction, not a deterministic classifier; rare
  false positives/negatives are possible (an override exists).
- **Evaluation nondeterminism** — Even at `temperature 0.2`, scores vary
  run-to-run (±~10–15). The harness allows a 15-point margin for the real API.
- **File parsing limitations** — `pdfjs-dist` extracts text from selectable
  PDFs, not scanned images/OCR. DOCX via `mammoth` extracts raw text only.
- **No audio persistence** — Recorded `Blob` is held in memory for
  transcription only; never stored. History stores transcript text, not audio.
- **No user accounts / auth** — Any user can trigger evaluation; only IP-based
  rate limiting applies.
- **Client-side cooldown is advisory** — 4 s `evalCooldown` disables the
  retry button but can be bypassed via console.

---

*This document consolidates the technical reference material previously spread
across `PROJECT_STATUS.md` and `TESTING.md`.*
