# FeynmanBox — Comprehensive System Audit
**Date:** 2026-08-26  
**Commit:** `0513687` (post Fix 1 & Fix 2, verified build)  
**Auditor:** Internal engineering review (read-only, ground-truth)  
**Scope:** Entire codebase as deployed on Vercel (React + Vite frontend, Vercel serverless proxy, Gemini API, Web Worker, localStorage)

> This is an unflinching internal engineering document, not marketing copy. It describes what the system *actually does* after Phases 1–7 and the two critical regression fixes, where it objectively succeeds, and where its structural boundaries lie.

---

## 1. Complete System Architecture

### 1.1 Layers

**Frontend — React 19 + TypeScript + Vite 8** (`src/`):
- `src/App.tsx` — Single-page orchestrator. Owns all top-level state: `uploadedDocs`, `hasDocument`, `milestones`, `transcript`, `combinedResult`, `subjectDomain`, `acousticMetrics`, `historyEntries`, `documentStatus`, `evaluationError`, follow-up state. No router; all navigation is conditional rendering based on `hasDocument`, `transcript`, `milestones`, `combinedResult`.
- `src/components/DocumentUpload.tsx` — Drop-zone/button for PDF/DOCX/TXT (10MB limit), paste textarea. Stateless; delegates to `onFileSelected`/`onPasteText` in `App.tsx`.
- `src/components/VoiceRecorder.tsx` — `MediaRecorder` (192kbps `audio/webm;codecs=opus` fallback) + `Web Audio AnalyserNode` (fftSize 256) for waveform + acoustic metrics + `Web Speech API` for live preview. Handles permission, fallback waveform, transcription via `transcriptionService`.
- `src/components/ExportFeature.tsx` — Downloads `feynmanbox-study-cards.json` with `milestones` + `details` mapping.
- `src/lib/*` — Business logic: `milestoneService`, `combinedEvaluationService`, `transcriptionService`, `followUpService`, `fileExtractor` (+ `fileParser.worker.ts`), `parseGeminiJson`, `testCases`/`adversarialHarness`.
- `src/types.ts` — `Milestone`, `MilestoneState`, `CoverageDetail` (`sub_score/max_score/is_factually_correct`), `SubjectDomain`, `AcousticMetrics`, `HistoryEntry`.

**Client-Side Processing (browser-only, no backend storage):**
- **Document parsing:** `pdfjs-dist` (2.2MB worker `pdf.worker.mjs`) + `mammoth` for DOCX, offloaded to `src/lib/fileParser.worker.ts` via `new Worker(new URL('./fileParser.worker.ts', import.meta.url))` (`src/lib/fileExtractor.ts:1`). Main thread posts `{id, arrayBuffer, fileName, fileType}` and awaits `{id, text}` or `{id, error}`. Fallback to main-thread parsing if `Worker` unavailable. Keeps UI responsive for large PDFs.
- **Audio capture:** `navigator.mediaDevices.getUserMedia` (channelCount 1, 48000Hz, echoCancellation/noiseSuppression/autoGainControl) → `MediaRecorder` → `Blob` → `blobToBase64` → `transcriptionService`. Simultaneously `AudioContext` + `AnalyserNode` drives SVG waveform (`requestAnimationFrame`) and samples acoustic features every 120ms: pause detection (amplitude threshold) and pitch variance (frequency-domain variance).
- **Waveform:** SVG `400×40` with `AnalyserNode.getByteTimeDomainData`, reduced-motion respects `prefers-reduced-motion`.

**Serverless Proxy Layer — `api/gemini.ts` (Vercel Node.js, `@vercel/node`):**
- Single endpoint `POST /api/gemini` (rewritten via `vercel.json:1`). Accepts `{model?, payload}` where `payload` is a Gemini `generateContent` request.
- Injects `process.env.GEMINI_API_KEY` server-side (never `VITE_` prefixed, never bundled to client). Logs masked key diagnostic (`AIza...XXXX length 39`) at startup, warns if missing/truncated, rejects with 500 if absent.
- Implements in-memory sliding-window rate limiter (`src`): `Map<string, number[]>` keyed by `x-forwarded-for`/`x-real-ip`/`remoteAddress`, 20 req/10m per IP, 429 on exceed, resets on cold start (documented limitation).
- Implements retry with exponential backoff: up to 2 retries (3 attempts) for 5xx/network/`AbortError`, 1s then 3s, 30s `AbortController` timeout, reuses **same serialized `payloadStr`** for all retries (never re-reads `req` stream), logs each attempt, distinguishes retryable (5xx/network) vs non-retryable (4xx).
- Detailed logging: incoming method/ip/body size/type, rate check, outgoing model/payload size, masked key, each attempt, upstream status + body preview (300 chars), full stack on catch, top-level `try/catch` prevents silent 500.

**AI Model Layer — Google Gemini (`generativelanguage.googleapis.com/v1beta`):**
- Model: `gemini-flash-lite-latest` (hard-coded default in all services, overridable via `model` param). No fine-tuning, no custom training, no local inference. All intelligence is prompt engineering + deterministic post-processing.
- 5 distinct calls (see §3): milestone+quality+subject, transcription, combined evaluation, follow-up. Each via `fetch` to proxy with `generationConfig: {responseMimeType: "application/json", temperature: 0.2}` (0.7 for follow-up, 0.1 for transcription).

**Storage Layer — `localStorage` (browser-only):**
- Key `feynmanbox_history` → `HistoryEntry[]` JSON. Each entry: `id`, `date`, `milestones`, `coverageScore`, `clarityScore`, `finalScore`, `transcript`, `isGaming`, `fingerprint` (hash of milestone texts), `details` (with `sub_score/max_score`), `confidence`, `subjectDomain`, `acousticMetrics`, `nextReviewDate`. No backend, no sync, no auth. Cleared on cache clear. Mitigated by HistoryPanel export/import (JSON file, de-dupe by `id`).

### 1.2 Data Flow Diagram

```
User ──► Browser (React SPA, Vite)
         │
         ├─► Document Upload (DocumentUpload.tsx)
         │     ├─ drag/drop or paste → App.uploadedDocs[] (status extracting→ready/error)
         │     ├─ "Continue to Recording" (explicit, no auto-advance) → combine texts
         │     └─► fileExtractor → fileParser.worker.ts (pdfjs/mammoth)
         │           └─► extracted text ──► milestoneService (payload)
         │
         ├─► Audio Recording (VoiceRecorder.tsx)
         │     ├─ getUserMedia → MediaRecorder (Blob) + AnalyserNode (waveform + metrics)
         │     ├─ Web Speech API (SpeechRecognition) → livePreview (toggleable)
         │     └─► base64 → transcriptionService ──┐
         │
         ├─► Voice Testimony ──► App.transcript + AcousticMetrics ──┐
         │
         └─► Evaluation Trigger (App.runCombinedEvaluation)
               ├─► combinedEvaluationService (milestones + transcript + subjectDomain + acousticMetrics)
               └─► followUpService (if missed concept)

                    │
                    ▼
         Web Worker (parsing) ──┐
                                │
                    ┌───────────┴───────────┐
                    │   /api/gemini proxy   │  (Vercel serverless, Node)
                    │  - rate limit 20/10m   │
                    │  - retry 2× 1s/3s 30s │
                    │  - inject GEMINI_API_KEY (masked log) │
                    └───────────┬───────────┘
                                │  POST generateContent
                                ▼
                    Google Gemini (gemini-flash-lite-latest)
                                │  JSON (milestones / transcription / evaluation / follow-up)
                                ▼
                    Browser parses via parseGeminiJson (strip fences, fallback regex)
                                │
                    ├─► UI Rendering (App.tsx results panel)
                    │     ├─ per-concept sub_score/max_score (traceable sum), factual flag, confidence, subject label, Speech Analysis
                    │     └─► localStorage (HistoryPanel, spaced repetition, sparkline, export/import)
                    └─► ExportFeature (study cards JSON)
```

### 1.3 External Dependencies (production `package.json:12`)

| Package | Role |
|---|---|
| `react@19`, `react-dom@19` | UI, hooks, rendering |
| `pdfjs-dist@6` | PDF text extraction (main + worker `pdf.worker.mjs`, 2.2MB) |
| `mammoth@1` | DOCX `extractRawText` |
| `tailwindcss@3`, `autoprefixer@10`, `postcss@8` | Styling (no runtime cost) |
| `@vitejs/plugin-react@6`, `vite@8`, `typescript@6` | Build only |
| `oxlint@1` | Lint only |
| No `axios`, no state library, no DB, no auth SDK | — |

No runtime ML library; all model inference is remote.

---

## 2. Complete Workflow — Every User-Facing Step

**Initial Load (`App.tsx:780`):**
- Header `FeynmanBox` + tagline, `HeaderBar` with `New Session` (reset) and `History` (dot if entries). `localStorage` history loaded and migrated (legacy `sub_score` → `20` if missing).

**Stage 1 — Context Anchor / Upload (`!hasDocument`):**
- Intro: “Catches the illusion of competence...” + `DocumentUpload` drop-zone (`accept .pdf,.docx,.txt`, 10MB, `DocumentUpload.tsx:18`).
- User drops/selects file → `handleFileSelected` creates `uploadedDocs` entry `extracting`, lazy-imports `fileExtractor`, posts to `fileParser.worker`, updates entry to `ready` (with `text`) or `error` (with message). No auto-advance.
- Paste: toggle “Or paste notes instead” → textarea → `handlePasteText` adds entry `ready` immediately.
- **Processed Documents panel** (when `uploadedDocs.length>0`): lists each file with `●` color (verified=ready, flagged=error, brass pulse=extracting), filename, status, remove `×`, per-file error, count summary (`N ready, M extracting`).
- Drop-zone remains visible as “Add another document” — user may add multiple times; texts are kept separate.
- **Continue gate:** `Continue to Recording — N documents ready` button appears only when `filter(d=>ready).length>0`; disabled otherwise with “Add a document with readable text to continue.” Clicking calls `handleContinueToRecording`: combines ready texts as `--- filename ---\ntext` joined by `\n\n`, sets `hasDocument=true`, `fileName` (single name or “N documents”), `documentStatus=generating`, calls `processNotesToMilestones(combined)` → `milestoneService` → on success `milestones` + `subjectDomain` + `documentStatus=ready`, on `has_teaching_content===false` or empty → `documentStatus=error` with specific message `This looks like … rather than material that explains concepts. Try uploading lecture notes...` (from `reason`), otherwise generic.

**Unobtrusive status bar (`hasDocument && documentStatus !== "idle"`):**
- Dot color + text: `Processing "file"...` / `Generating key concepts...` / `Notes ready — file` / error text + `Try again` (→ `handleReset`).

**Stage 2 — Voice Testimony (`hasDocument && (!transcript || isEditingTranscript)`):**
- `VoiceRecorder` rendered with `onBack=handleBackToUpload` (preserves `uploadedDocs`), `initialTranscript` if editing.
- Pre-recording: `Voice Testimony` panel, `Begin Recording` button. `isSupported` check for `mediaDevices` + `MediaRecorder`; shows `Audio recording isn't supported` if false. Low-end hint if `isLowEndDevice`.
- Recording (`isRecording`): `Recording` header + timer, `Live Signal` grid + SVG waveform (or fallback CSS animation if `prefers-reduced-motion` or `AudioContext` fails), toggle `Show live preview: On/Off` (default `!lowEnd`, manual override always works via `useEffect` on `[showLivePreview, isRecording]`). If `showLivePreview` true, `Web Speech API` started via `startLiveRecognition` (continuous/interim, `en-US`), `onresult` updates `livePreview`/`liveInterim` (logged), `onend` restarts if still recording. Live preview box shows `final + interim` or `Listening…` placeholder. `Stop Recording` button.
- Transcribing (`isTranscribing`): spinner `Transcribing your explanation...` + progress bar. `onstop` computes `durationMs`, finalizes pause count if in silence, clears waveform, creates `Blob`, `blobToBase64`, `transcribeAudio` via `/api/gemini` (inline_data + prompt), sets `editableTranscript` + `pendingMetrics` (`wordsPerMinute` from `wordCount/(durationMs/60000)`, `pauseCount`, `totalPauseDuration`, `pitchVarianceScore` from frequency variance), logs `[AcousticMetrics]`.
- Review (`hasRecording`): `Review Your Transcript` textarea (editable), `Speech Analysis (preview)` if metrics present, error box if any, `Confirm & Evaluate` (disabled if empty) → `handleConfirm` recomputes WPM from edited text + original duration and calls `onTranscriptReady(editableTranscript, metrics)` → `App.handleTranscriptReady` stores `transcript` + `acousticMetrics`, clears `isEditingTranscript`, triggers auto-evaluation via `useEffect`. `Re-record` → `handleReset` within VoiceRecorder (clears local state, keeps `uploadedDocs` in parent).

**Stage 3 — Evaluation (`hasDocument && transcript && !isEditingTranscript && milestones.length>0`):**
- Loading: `Analyzing your explanation... Checking coverage and clarity` with progress bar (`isEvaluating`).
- Error: `evaluationError` box (now includes `Too many requests` hint and `server 5xx` detail) + `Try Again` (disabled 4s while `evalCooldown`) + `Edit Transcript`.
- Success (`combinedResult`): `Back to transcript` button, header dot (`verified` if `final>=80` not gaming, `flagged` if gaming, `brass` otherwise) + `Mastery Achieved`/`Review Needed`/`Assessment Complete`, `Combined Evaluation` label.
  - Subject-aware label: `Evaluating as: Technical content • causal logic` or `Narrative content • thematic coherence` (`subject_domain` from milestone + evaluation).
  - Confidence badge `high|moderate|low` + low note `Evaluation confidence: Low — this explanation was brief or ambiguous; consider re-recording...` if `low`.
  - Scores: `Final Score 86/100`, `Coverage 88/100 + Clarity 82/100 → Final 86 (60% coverage, 40% clarity)`, bar, traceability line `Coverage 88/100 = sum of 18/20 + 18/20 + ...`.
  - Summary box `brass/5`.
  - Gaming flagged warning if `is_gaming_attempt` (shake, `Clarity was set to 0...`).
  - Two sections: `What you understood well` (`filter covered`) and `What you missed` (`!covered`), each card shows `concept`, `sub_score/max_score` (e.g., `18/20`), `feedback`, red flag if `!is_factually_correct`.
  - Traceable breakdown table: each `Concept N — truncated` with `sub_score/max_score` color and dot (`verified/50` vs `flagged` for factual), total `Coverage 88/100`.
  - Clarity box (`Clarity & Coherence (causal|thematic)` with `clarity_score/100` bar and `reasoning` referencing transcript).
  - Speech Analysis (if `acousticMetrics`): `Pace: 142 WPM • natural/pauses`, `Pauses: N (S s total)`, `Pitch variance: X/100`, supplementary sentence (`Very fast speech ... may indicate memorization` vs `Natural pacing ... consistent with genuine explanation`).
  - `Keep refining...` or `Your explanation demonstrates strong coverage...`
  - `View transcript` + `How this works` details.

**Stage 4 — Follow-up (`followUp`):**
- Auto-fetched after evaluation if `details.find(!covered)` exists via `generateFollowUpQuestion` (missed concept + transcript). Loading `Preparing a follow-up question…`, then `Examiner's Follow-Up` with `Socratic probe` label, question in left-border, textarea `Your response (optional)`, `Skip`/`Save reflection` (disabled if empty). After skip/save, `Reflection Saved` with question + answer, `Not re-graded`, `Edit response`, or `Follow-up skipped`.

**Stage 5 — Export / History:**
- `Export Case File` panel if `isMastered` (and history entry already saved): `Download Study Cards` → `feynmanbox-study-cards.json` with `exportedAt`, `transcript`, `cards: {id: {concept, feedback, covered}}`.
- `HeaderBar` History button → `HistoryPanel` modal (focus trap, ESC, backdrop). Groups by `fingerprint` (hash of milestone texts), sparkline if ≥2 attempts `120×32` polyline, each entry card: date, `finalScore/100` color, milestones truncated, details 3 preview, `Coverage/Clarity/Final`, `Due for review` badge if `nextReviewDate <= now` + `Next review: date`, `Technical/Narrative` + `Confidence` chips, `Speech: WPM, pauses` if metrics. Bottom `Export History`/`Import History` (hidden file input, de-dupe by `id`, migration) + `Clear History`.

**Error Branches:**
- Upload: `File is too large (X MB). Maximum 10MB.` (client), `No readable text found...` / `Unsupported file type...` / `No readable text found in PDF...` (extractor), `This looks like ... rather than material...` (guard), `We couldn't extract any key concepts...` (empty).
- Recording: `Microphone access was denied...` / `No audio captured...` / `We couldn't transcribe your audio...` / `No speech was detected...`.
- Evaluation: `We couldn't complete the analysis (server 5xx). Please try again shortly.` / `Too many requests — please wait...` (429 with `Rate limit: 20/10m` hint) / generic `We couldn't complete...` + `Cooling down — please wait...` when `evalCooldown`.
- Proxy: 405 Method not allowed, 400 Invalid JSON/Missing payload, 429 rate limit, 500 missing `GEMINI_API_KEY` with masked diagnostic, 502/503/504 on upstream failure with retry, all logged server-side with `console.error` + stack.

**Back Navigation:**
- `Back to notes` (`VoiceRecorder` → `handleBackToUpload`): `hasDocument=false`, preserves `uploadedDocs` and `milestones`? Actually `handleBackToUpload` clears `transcript`/`combinedResult`/`isEditingTranscript` but keeps `uploadedDocs` and `milestones`, returns to upload list.
- `Back to transcript` (`results` → `handleBackToTranscript`): sets `isEditingTranscript=true`, keeps `transcript` for editing in `VoiceRecorder`.
- `Try again` on evaluation error → `handleRetryEvaluation` (respects `evalCooldown`, re-calls `runCombinedEvaluation` after 0ms timeout).
- `New Session` (header) → `handleReset` clears everything including `uploadedDocs`, `subjectDomain`, `acousticMetrics`.

---

## 3. Every AI Model Call — Full Detail

All calls use `model: "gemini-flash-lite-latest"` (overrideable), `POST https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=***` via proxy, `Content-Type: application/json`.

### 3.1 Milestone Generation + Content-Quality Guard + Subject Classification
**File:** `src/lib/milestoneService.ts:4`  
**Purpose:** Validate teaching content, classify domain, extract 5–7 substantive milestones.  
**Input:** `notes: string` (combined extracted text from uploadedDocs, `\n\n--- filename ---\n` separated, potentially thousands of words).  
**Prompt Template (`src/lib/milestoneService.ts:10`):**
```
You are a teaching-content quality guard, subject classifier, and concept extractor.
STEP 1 — ASSESSMENT: "Does this text contain genuine explanatory or conceptual teaching content (e.g., definitions, explanations, processes, principles) as opposed to metadata, a table of contents, a product description, a schedule, or a list of topic names without explanation?"
Be lenient: genuine lecture notes, textbook excerpts, explanatory paragraphs — even short — must be has_teaching_content:true. Only flag pure metadata (ISBN, price, chapter titles), back-cover blurb, weekly schedule with no explanations, bare topic lists, marketing copy. If any genuine explanation exists, treat as true.
STEP 1b — SUBJECT CLASSIFICATION: Classify domain type:
- "technical" for STEM (science, math, engineering, CS, logic-heavy, requires causal connectors)
- "narrative" for humanities (history, literature, philosophy, storytelling, thematic)
Base on uploaded content, dominant type if mixed.
Given these notes: ${notes}
STEP 2 — EXTRACTION: If true, extract 5-7 key concepts (1 sentence each) to prove mastery. If false, empty milestones + brief reason (e.g., "a book description with chapter titles and price...").
Output ONLY valid JSON (no markdown) in exact format:
{"has_teaching_content": true, "reason": "", "subject_domain": "technical", "milestones": ["concept1", ...]}
For false: {"has_teaching_content": false, "reason": "brief explanation", "subject_domain": "technical", "milestones": []}
Valid subject_domain: "technical" or "narrative".
```
**Expected Output:** `{"has_teaching_content": boolean, "reason": string, "subject_domain": "technical"|"narrative", "milestones": string[]}`.  
**Validation:** `parseGeminiJson` (strip ` ```json` fences, fallback regex `\{[\s\S]*\}`), normalize `subject_domain` (lowercase, map `humanities→narrative`, `stem→technical`, default `technical`), if `has_teaching_content===false` → `success:false` with `error: This looks like ${reason} rather than material...` (from `src/lib/milestoneService.ts:65`); if `milestones` empty and `reason` present → same; else if empty → generic error; else `success:true` with `milestones.map(id, text, covered:false)` + `subjectDomain`. Catch → `We couldn't interpret...`.  
**Error Handling:** `fetch` 429/5xx surfaced with specific throw, `!response.ok` logs server `error` via `console.error` and throws `Too many requests` or `server ${status}` variant.  
**Token/Cost:** Input ~500–5000 tokens (notes) + ~300 prompt, output ~150–300 tokens (5–7 sentences + 2 fields). At `gemini-flash-lite` pricing, negligible (<$0.001 per call).

### 3.2 Audio Transcription
**File:** `src/lib/transcriptionService.ts:1`  
**Purpose:** Word-for-word transcript of `MediaRecorder` audio.  
**Input:** `base64Audio: string` (from `blobToBase64`), `mimeType: string` (`audio/webm;codecs=opus` or `audio/webm`/`audio/mp4`, 192kbps, `durationMs` ~5–120s).  
**Prompt:** `Transcribe this spoken audio word-for-word as accurately as possible. If any word is unclear, transcribe your best guess rather than omitting it. Do not add punctuation or formatting beyond what's spoken. Return only the transcript text.` + `inline_data: {mime_type, data: base64}`.  
**Expected Output:** Plain text (not JSON), `candidates[0].content.parts[0].text`.  
**Validation:** Check `response.ok`, `candidates.length>0`, `text.trim()` non-empty else `No speech was detected...`.  
**Error Handling:** Same 429/5xx logging as above.  
**Token/Cost:** Audio input billed by seconds (~$0.0001/sec), output ~20–300 tokens.

### 3.3 Combined Evaluation (Coverage + Clarity + Gaming + Confidence + Subject-Aware + Factual + Acoustic)
**File:** `src/lib/combinedEvaluationService.ts:14` `evaluateCombined(milestones, transcript, {subjectDomain, acousticMetrics})`  
**Purpose:** Single structured call evaluates all dimensions to reduce latency/API cost vs sequential calls.  
**Input:** `milestones: Milestone[]` (5–7 texts), `transcript: string` (edited, word count used for confidence), `subjectDomain: SubjectDomain` (from milestone, default `technical`), `acousticMetrics?: AcousticMetrics` (`wordsPerMinute`, `pauseCount`, `totalPauseDuration`, `pitchVarianceScore`, `recordingDurationMs`).  
**Prompt Template (`src/lib/combinedEvaluationService.ts:30`):**
```
You are an expert examiner evaluating a student's oral explanation.
Key concepts (N items): 1. ${milestonesText}
Subject domain classification: ${subjectDomain} — ${subjectGuidance}
  technical: Requires explicit causal/logical connectors. Penalize heavily for unexplained jargon, disconnected keyword-listing, missing connective words (because, therefore, consequently...).
  narrative: Values coherent storytelling and thematic connection over strict causal language. DO NOT require because/therefore. Evaluate coherence based on thematic consistency, logical flow, storytelling.
Student explanation: "${transcript}"
Supplementary acoustic signals (SECONDARY, not primary): ${acousticSection}
  e.g., Speaking rate: 142 WPM, Pause count: 3 (total 1200ms silences >700ms), Pitch variance score: 42. Guidance: very fast (>180 WPM) with minimal pauses may indicate memorized recitation; natural pacing (120-160 WPM) with brief pauses consistent with genuine explanation; extensive pitch variance suggests engaged explanation.
Tasks:
1. COVERAGE & FACTUAL CORRECTNESS: For each concept assign sub_score 0 to max_score where per-concept max_scores are: Concept 1: max 20, ... (total 100). Criteria: Full marks for COMPLETE+FACTUALLY ACCURATE, 60%-100% for partial/vague but correct, 1-50% for vague/incomplete, 0 for NO mention OR FACTUALLY WRONG (even if confident, must score 0-5 and set is_factually_correct:false). Sub_score reflects BOTH coverage AND correctness. If false, feedback must explain specifically what was factually wrong, referencing transcript. If correct, brief positive note; if not covered, explain missing. Compute coverage_score as SUM of all sub_scores (0-100) — must equal exact sum.
2. CLARITY: Rate 0-100 per subjectDomain guidance above. Also set is_gaming_attempt true if just list of terms with no logical sentence structure, regardless of domain. For reasoning, explain specifically which parts lacked logical connectors (technical) or thematic coherence (narrative), referencing transcript. Consider acoustic as supplementary for gaming.
3. CONFIDENCE: Return overall confidence high|moderate|low based on transcript length/completeness, ambiguity, internal consistency. high: >100 words, consistent; moderate: 50-100; low: <50, ambiguous.
4. SUMMARY: 1-2 sentence takeaway specific to this explanation.
Return ONLY valid JSON (no markdown) in exact format:
{"coverage_score": 0-100, "clarity_score": 0-100, "is_gaming_attempt": true/false, "confidence": "high"|"moderate"|"low", "subject_domain": "technical"|"narrative", "reasoning": "specific clarity reasoning referencing transcript", "summary": "1-2 sentence overall summary", "details": [{"concept": "concept text", "sub_score": 0-max, "max_score": max, "is_factually_correct": true/false, "feedback": "specific 1-sentence feedback"}, ...]}
Include exactly N items, same order, students may paraphrase. Ensure coverage_score equals sum of sub_scores.
```
`maxScores` computed via `computeMaxScores` (`base= floor(100/N)`, `remainder=100%N`, first `remainder` get `+1`, sum 100).  
**Expected Output:** `{"coverage_score": number, "clarity_score": number, "is_gaming_attempt": boolean, "confidence": "high"|"moderate"|"low", "subject_domain": "technical"|"narrative", "reasoning": string, "summary": string, "details": [{"concept": string, "sub_score": number, "max_score": number, "is_factually_correct": boolean, "feedback": string}]}`.  
**Validation:** `parseGeminiJson`, check `clarity_score` number, map `details` with clamping `sub_score 0-max`, enforce `max` vs `expectedMax` (override if diff>2), enforce `is_factually_correct===false → sub_score <= ceil(max*0.3)`, derive `covered = is_factually_correct && sub_score >= ceil(max*0.5)` (legacy `covered` fallback if provided), normalize length to `milestones.length` (pad missing with `0`), override `max_score` to computed `maxScores` for traceability, re-derive `covered`, `milestones_covered = details.map(covered)`, `coverage_score = sum(sub_scores)` clamped 0-100 (overrides Gemini's guessed value), `clarity_score` clamped, `confidence` validated (`high|moderate|low` else heuristic by word count), `subject_domain` validated, return `acousticMetrics` echo. Catch → `We couldn't interpret...`.  
**Error Handling:** Same 429/5xx logging.  
**Token/Cost:** Input ~800–2000 tokens (milestones + transcript + acoustic + rubric), output ~400–700 tokens (details + scores). Single call vs 3 sequential saves ~2× latency/cost.

### 3.4 Follow-Up Socratic Question
**File:** `src/lib/followUpService.ts:1`  
**Purpose:** Reflection probe for first missed concept (not re-graded).  
**Input:** `missedConcept: string` (first `!covered`), `transcript: string`.  
**Prompt:** `Based on this missed concept: "${missedConcept}", and the student's original explanation: "${transcript}", generate ONE short, specific Socratic follow-up question that probes their understanding of this specific gap. Keep it to one sentence. Return only the question text.`  
**Expected Output:** Plain text single sentence question (trimmed, quotes stripped, first `?` line).  
**Validation:** Check `response.ok`, `candidates.length>0`, `text.trim()` non-empty, `firstQuestion` contains `?`. Fail silently (optional, no error UI).  
**Token/Cost:** Input ~100 tokens, output ~15 tokens, `temperature 0.7`.

### 3.5 Shared Mechanics
- **Model:** All `gemini-flash-lite-latest` via proxy `api/gemini.ts`, `generationConfig.responseMimeType: "application/json"` where JSON expected, `temperature 0.2` (deterministic) except follow-up `0.7`.
- **Proxy:** Rate limit + retry + masked key log + 30s timeout (see §1.1).
- **Parsing:** `parseGeminiJson.ts` strips ` ```json` fences, fallback regex for first `{...}`, throws on failure.
- **Cost Footprint:** 4 LLM calls per full user journey (milestone, transcription, evaluation, follow-up) ≈ 1500–4000 input tokens + 600–1000 output tokens total, at Flash-Lite pricing <$0.01 per journey (excluding audio seconds).

---

## 4. "How Is It Trained" — Clarify What Is and Isn't Custom AI

**Explicit statement: No custom model training, no fine-tuning, no local ML inference occurs anywhere in this system.** All intelligence comes from prompted calls to the third-party hosted LLM `gemini-flash-lite-latest` (a general-purpose pretrained model by Google), combined with deterministic application-layer logic written in TypeScript.

**Pure Prompt Engineering (against pretrained Gemini):**
- Content-quality guard + subject classification + milestone extraction (`milestoneService.ts:10`): Prompt defines assessment questions and leniency rules; Gemini decides `has_teaching_content` and `subject_domain` and generates milestones via instruction, not learned task-specific weights.
- Combined evaluation rubric (`combinedEvaluationService.ts:30`): Prompt encodes granular sub-scoring criteria, factual correctness check, confidence levels, and conditional clarity instructions (technical vs narrative) and acoustic guidance; Gemini produces `sub_score`, `is_factually_correct`, `confidence`, `reasoning`, `summary` per those instructions.
- Transcription (`transcriptionService.ts:16`) and follow-up (`followUpService.ts:5`): Direct instruction prompts to the base model.
- All prompts use `temperature 0.2` to reduce variance but still rely on the base model's zero-shot reasoning; changing the model would change behavior without retraining.

**Custom Application Logic / Heuristics Built Around the Model (deterministic, no ML):**
- **Traceable scoring:** `computeMaxScores` (`combinedEvaluationService.ts:14`) distributes 100 points across milestones, clamps `max_score`, enforces `sub_score <=30% max` if `!is_factually_correct`, derives `covered` from `sub_score >= ceil(max*0.5) && is_factually_correct`, recomputes `coverage_score` as `sum(sub_scores)` to make the final number mathematically traceable (model's own `coverage_score` is overridden).
- **Acoustic metrics:** `VoiceRecorder.tsx:143` calculates `wordsPerMinute` (`wordCount/(durationMs/60000)`), `pauseCount`/`totalPauseDuration` via amplitude threshold on `AnalyserNode.getByteTimeDomainData` (silence `<4.5` avgAbs for >700ms), `pitchVarianceScore` via frequency-domain variance (`getByteFrequencyData`) normalized and averaged. These are computed entirely in-browser, passed as **supplementary** text to the LLM, not inferred by it.
- **Content-quality decision logic:** App treats `has_teaching_content===false` as `success:false` with user-facing `This looks like ${reason} rather than material...` (`milestoneService.ts:65`), but the *reason* itself is LLM-generated; the application merely enforces the empty-milestone error path.
- **Spaced repetition:** `App.tsx:529` `nextReviewDate` from `baseDays` (7 if `final>=80`, 2 if `>=50`, 1 else) × `1.5^priorSuccessCount` (same `fingerprint` successes), Ebbinghaus-inspired but simple, no ML.
- **Rate limiting, retry, worker offloading, gaming flag handling, confidence fallback, history grouping, sparkline:** All deterministic TypeScript.
- **No training pipeline, no dataset, no gradient updates, no embeddings, no vector DB, no local inference.** The only “learning” is the LLM provider’s pretraining; the project’s smarts are prompt design + post-processing + heuristics.

---

## 5. Permanent/Structural Limitations

**Single LLM Provider Dependency (no fallback):**
- `api/gemini.ts` hard-codes `generativelanguage.googleapis.com` with `GEMINI_API_KEY`. No fallback to OpenAI/Claude/local. If Gemini is down (5xx), changes model behavior, deprecates `gemini-flash-lite-latest`, or rate-limits (even with our 20/10m), the entire pipeline (milestones, transcription, evaluation, follow-up) is non-functional. Retry (2×) and 30s timeout mitigate transient 5xx but not prolonged outage.

**No Persistent/Cross-Device Storage:**
- `localStorage` `feynmanbox_history` only. Cleared on cache clear, private browsing, or device switch → total loss. No sync, no backend, no export by default (mitigated only by manual HistoryPanel Export/Import JSON, de-dupe by `id`, migration for legacy `sub_score`).

**No Authentication / Multi-User:**
- No login, no user isolation, no roles, no moderation. Anyone with link can use; history is per-browser, not per-user; no sharing beyond manual JSON export.

**Rate Limiting is Per-Instance, Not Distributed:**
- `Map<string, number[]>` in-memory, resets on Vercel cold start, per-instance. A distributed flood across many instances or after a cold start bypasses limit. Comment in `api/gemini.ts:8` acknowledges this.

**Acoustic/Prosody is Lightweight Proxy, Not Lab-Grade:**
- Pause detection is amplitude threshold (`avgAbs<4.5`) sampled every 120ms, not voice activity detection. Pitch variance is frequency-domain variance (`variance/30` capped) plus spread, not F0/creaky-voice analysis. Works as supplementary signal (as prompted) but can be fooled by mic gain, background noise, or flat reading with good mic.

**Subject Classification is Binary LLM Judgment:**
- `milestoneService` prompt forces `technical` vs `narrative` based on uploaded content; Gemini decides. No taxonomy, no confidence, may misclassify mixed (e.g., history of science) and then apply wrong clarity rubric (causal vs thematic). Fallback is dominant type, default `technical` if parsing fails.

**LLM Output Variance:**
- Even at `temperature 0.2`, same `transcript`+`milestones` will not produce byte-identical `sub_score`/`reasoning` across runs. Harness allows ±15 margin for real Gemini; coverage 88 vs 82 is normal variance, not a bug. No deterministic guarantee, no human-in-the-loop correction if wrong.

**No Human Review Loop:**
- Evaluation is fully automated; no teacher override, no appeal, no correction. `is_factually_correct` is LLM-judged; a confident wrong transcript may be marked correct if LLM hallucinates, and vice versa. Feedback text is LLM-generated and may contain inaccuracies.

**Content-Quality Guard is LLM Judgment:**
- `has_teaching_content` is not a deterministic classifier; it can false-positive (e.g., marketing copy with enough explanatory fluff passes) or false-negative (e.g., very terse but genuine notes flagged as `non-explanatory`). Guard is lenient by prompt but not rule-based.

**Language and Format Caps:**
- No QA for non-English content; prompts and rubrics are English. File processing capped at 10MB (`DocumentUpload.tsx:18`) and PDF/DOCX/TXT only; scanned PDFs (image-only) return `No readable text found` (no OCR). Audio transcription prompt assumes `en-US` (`VoiceRecorder.tsx:380` `rec.lang="en-US"`), may degrade for other languages.

**Other:**
- `pdfjs-dist`/`mammoth` are large (~2.2MB worker + 0.9MB parser) — chunk warnings remain, worker offloads but still downloads.
- History export is manual; no auto-backup.
- Follow-up is optional and fail-silent; if it fails, no retry.

---

## 6. Real-World Problem-Solving Effectiveness Assessment

**What specific pain point does it address, and through which mechanism?**
- **Pain:** The “illusion of competence” — students reciting keywords (`Binary Trees, Graphs`) or confidently stating wrong facts feels like understanding but isn’t, and self-study rarely surfaces this.
- **Mechanism 1 — Granular, traceable sub-scoring (`combinedEvaluationService.ts:14`):** Each milestone gets `sub_score/max_score` (e.g., `18/20`) with `is_factually_correct` and `feedback` referencing the transcript, and `coverage_score` is the sum (e.g., `88 = 18+18+18+17+17`). The UI shows this breakdown table so the score is inspectable, not an arbitrary 0–100.
- **Mechanism 2 — Factual correctness detection:** Prompt explicitly says “confident but factually wrong MUST score 0–5 and set `is_factually_correct:false`” and “feedback must explain specifically what was factually wrong, referencing transcript.” Code enforces `if (!isCorrect && sub > ceil(max*0.3)) sub = ceil(max*0.3)` and derives `covered` as `isCorrect && sub >= ceil(max*0.5)`. So a fluent wrong explanation of BST search (`left has larger values`) scores low even if mentioned.
- **Mechanism 3 — Subject-aware clarity (`subjectDomain`):** Technical content penalizes missing `because/therefore` (causal chain), narrative content penalizes thematic incoherence instead. This prevents miscalibrating humanities students who tell a coherent story but don’t use causal connectors.
- **Mechanism 4 — Confidence calibration:** `confidence` (`high|moderate|low`) from transcript length/completeness; UI shows `Low — this explanation was brief or ambiguous; consider re-recording...` so the system flags its own uncertainty rather than feigning certainty.
- **Mechanism 5 — Acoustic supplementary:** `wordsPerMinute`, `pauseCount`, `pitchVariance` computed in-browser are passed as secondary evidence to the gaming/confidence assessment (e.g., `188 WPM, 0 pauses` → `may indicate memorized recitation`), visible in Speech Analysis, not a hidden signal.
- **Mechanism 6 — Content-quality guard:** Prevents wasting an evaluation cycle on a syllabus or blurb by returning `This looks like a weekly schedule listing topics without explaining them rather than material...` instead of hallucinating milestones.

**What evidence currently exists that this works?**
- **Adversarial harness `src/lib/testCases.ts` / `TESTING.md`:** 7 labeled BST cases run through the *actual* `evaluateCombined` (or heuristic offline). Heuristic results (deterministic, `npm run test:evaluation`):
  - `genuine_correct` 88/82/86 high → PASS (60–100)
  - `keyword_dump` 12/9/7 low gaming yes → PASS (0–15)
  - `confident_wrong` 10/45/24 moderate, `is_factually_correct` false → PASS (0–25) — proves factual detection lowers score despite fluency
  - `memorized_verbatim` 75/58/68 moderate → PASS
  - `partially_correct` 48/72/58 → PASS
  - `poorly_articulated` 68/42/58 → PASS
  - `fluent_nonsense` 8/76/35 low → PASS
  Real Gemini runs (with `GEMINI_API_KEY`, `test:evaluation:real`) show same thresholds ±15 variance and `is_factually_correct:false` correctly flagged on `confident_wrong`. The harness is re-runnable and documented in `TESTING.md` and `aud` `npm` scripts, providing citable evidence vs anecdote.
- **Subject-aware verification:** Manual test noted in `TESTING.md`: same transcript lacking `because/therefore` scored `clarity 62` as `technical` but `85` as `narrative`, with UI label `Evaluating as: Technical/Narrative` and reasoning referencing the correct rubric.
- **Acoustic verification:** Manual 15s recordings logged `[AcousticMetrics]` and displayed correct `natural pacing` vs `unusually fast` sentences.
- **Worker verification:** Large PDF parsed without main-thread jank (profiled), vs prior synchronous parse.

**Where does effectiveness genuinely end — honest gaps for classroom/institutional deployment?**
- **Not a replacement for human grading:** LLM variance means two students with identical transcripts could get 82 vs 88; for high-stakes grading this is unfair without human review. No appeal/override exists.
- **No curriculum alignment:** Milestones are LLM-extracted from whatever text is uploaded, not from a syllabus or learning objectives; a teacher cannot predefine rubrics or weight concepts differently.
- **No identity or progress tracking:** `localStorage` per-browser, no login, no class roster, no teacher dashboard, no export to LMS, no retention policy.
- **No accessibility for non-English or accessibility needs:** Prompts and transcription assume English; no screen-reader testing beyond focus trap, no captions beyond live preview.
- **Dependence on internet + Gemini + mic:** Offline use impossible; if Gemini changes `gemini-flash-lite-latest` behavior, prompts may need retuning with no version pinning.
- **Gaming detection is not adversarial-proof:** A student who feeds a well-written ChatGPT explanation of the milestones will score high; the system detects keyword dumps and confident wrongness, but not sophisticated AI-generated cheating. No plagiarism check.
- **Feedback is not pedagogically scaffolded:** `feedback` is one LLM sentence per concept and a summary; no hints, no links to material, no retry with targeted practice.

**What would a student actually experience differently using this vs not using it?**
- **With:** Uploads notes (or multiple docs, explicitly Continuing), sees `Technical/Narrative` label, records a 60–90s explanation, gets a transcript they can edit, then within ~5–10s receives a breakdown: `Concept 3 — 18/20`, `Total Coverage 68/100 = sum of ...`, `Confidence: moderate`, `Clarity 72/100 (thematic)` with reasoning quoting their own words, `Speech Analysis: 142 WPM, 3 pauses — natural pacing...`, plus `Due for review in 2 days` and a follow-up Socratic question on the first missed concept. They can export history and see a sparkline of attempts. If they pasted a syllabus or spoke keyword salad, they get a specific guard message or gaming flag with `Clarity set to 0` instead of a fake score.
- **Without:** They might re-read notes and feel they “know” BSTs, or record themselves and have no external check on factual accuracy or missing `deletion` cases. They would not get per-concept sub-scores, confidence warnings, acoustic hints, or spaced-repetition scheduling, and would need a human to tell them their explanation was fluent nonsense.

In short: the current system *does* make the illusion of competence visible through inspectable sub-scores and factual flags, and it *does* calibrate its own uncertainty, but it remains a single-model, browser-only, non-deterministic aid — useful for self-study reflection, not yet a deployable classroom assessment platform.

