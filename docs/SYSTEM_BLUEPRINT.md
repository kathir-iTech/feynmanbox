# FEYNMANBOX — EXHAUSTIVE SYSTEM BLUEPRINT

> Read-only structural mapping generated 2026-08-29. No source logic was modified. All line ranges are against the committed tree at `447ae17` on `main` (`origin/main`).

## 1. CORE ARCHITECTURAL PIPELINE

### 1.1 Client-Side Parsing Tree (Off-Main-Thread File Extraction)

**Primary files:** `src/lib/fileExtractor.ts:1-140`, `src/lib/fileParser.worker.ts:1-67`, `src/components/DocumentUpload.tsx:1-156`

**Dependency:** `pdfjs-dist@^6.2.108` (PDF), `mammoth@^1.12.1` (DOCX). Both are bundled as ESM; PDF worker URL is resolved via Vite `?url` import: `pdfjs-dist/build/pdf.worker.mjs?url` (`fileExtractor.ts:4`, `fileParser.worker.ts:3`) and assigned to `pdfjsLib.GlobalWorkerOptions.workerSrc`.

**Data flow:**
1. `DocumentUpload.tsx:21-35` validates on client: `MAX_FILE_SIZE = 10 * 1024 * 1024` (10 MB), extension whitelist `/\.(pdf|docx|txt)$/`. Drag-over state (`dragOver: boolean`) toggles `border-brass bg-brass/5` vs `border-ink-border`. Paste path via `onPasteText` is parallel.
2. `fileExtractor.ts:109-140` `extractTextFromFile(file)` is the orchestrator. If `Worker` exists:
   - `file.arrayBuffer()` once (`fileExtractor.ts:114`).
   - Fast-path: small TXT `< 50 KiB` decoded directly with `TextDecoder` without worker overhead (`fileExtractor.ts:116-118`).
   - Otherwise `extractViaWorker(arrayBuffer, fileName, fileType)` (`fileExtractor.ts:15-62`): creates `new Worker(new URL("./fileParser.worker.ts", import.meta.url), {type:"module"})`, posts `{id, arrayBuffer, fileName, fileType}` with **Transferable** `[arrayBuffer]` so the buffer is detached zero-copy (`fileExtractor.ts:56`). A 30 s timeout guards the worker (`fileExtractor.ts:26-30`). `worker.onmessage` resolves only when `data.id === id`; `worker.onerror` rejects. `cleanup()` clears timeout and `terminate()`s the worker.
   - On worker failure, falls back to **main-thread** `extractDirect(file)` (`fileExtractor.ts:64-107`, `fileExtractor.ts:124-133`) which re-reads via `file.text()` / `file.arrayBuffer()` because the transferred buffer is detached.
3. `fileParser.worker.ts:1-67` is the **off-main-thread parser** itself — identical branching logic to `extractDirect` but inside `self.onmessage`:
   - `.txt` / `text/plain` → `TextDecoder.decode(arrayBuffer)` (`worker:21-22`).
   - `.docx` → `mammoth.extractRawText({arrayBuffer})`, throws "No readable text found in the DOCX file." if `!value.trim()` (`worker:23-31`).
   - `.pdf` → `pdfjsLib.getDocument({data: arrayBuffer})` → loop `1..numPages` → `page.getTextContent()` → `items[].str` joined with space, trimmed, throws if empty (scanned image hint) (`worker:32-46`).
   - Fallback: text-decode and length check `>20` else "Unsupported file type" (`worker:47-59`). Result posted as `{id, text}` or `{id, error}` (`worker:62-65`).
4. Main-thread `extractDirect` (`fileExtractor.ts:64-107`) mirrors this but also uses `file.text()` fast-path for TXT and `mammoth` + `pdfjs` directly, producing the same cleaned string.
5. `App.tsx:493-510` `handleFileSelected` creates a doc entry `{id, fileName, text:"", status:"extracting"}`, dynamically imports `./lib/fileExtractor` (code-split), awaits `extractTextFromFile`, then patches the entry to `{status:"ready", text}` or `{status:"error", error}`. Multiple docs are kept in `uploadedDocs: Array<{id,fileName,text,status}>` (`App.tsx:370`), enabling `handleContinueToRecording` to combine all ready docs as `"--- fileName ---\ntext"` joined by `\n\n` (`App.tsx:531-540`) before `processNotesToMilestones`.

**Visual / concurrency guarantees:** File parsing never blocks the UI thread for large PDFs/DOCXs; the spinner/status (`DocumentUpload.tsx:113-120`) and per-doc rows (`App.tsx:1139-1155`, `App.tsx:1069-1123`) stay interactive. Worker termination + timeout prevents leaked workers. Generation request is guarded by `milestoneGenIdRef` token so stale async results are discarded (`App.tsx:453-490`).

### 1.2 Serverless Proxy Path (`/api/gemini.ts` → Gemini Flash-Lite)

**Primary file:** `api/gemini.ts:1-371`. Deployed as Vercel Node.js runtime handler `export default async function handler(req,res)`. All client service layers (`milestoneService`, `transcriptionService`, `combinedEvaluationService`, `followUpService`) `fetch("/api/gemini")` with `{purpose, payload}` — they **never** hold the API key.

**Interception & sanitization chain (in handler order):**
1. Method gate `POST` only → `405` else (`gemini.ts:123-127`).
2. CORS allowlist `["https://feynmanbox.vercel.app","http://localhost:5173"]`, `403` on foreign `origin`, `Vary: Origin` (`gemini.ts:129-140`).
3. **IP-based sliding window rate limit** (`gemini.ts:11-13`, `62-80`, `142-153`): `RATE_WINDOW_MS = 10 * 60 * 1000` (10 min), `RATE_MAX_REQUESTS = 20`, `rateLimitStore: Map<string, number[]>`. `getClientIp` reads `x-forwarded-for` (first entry), then `x-real-ip`, then `socket.remoteAddress` / `req.ip` / `x-vercel-forwarded-for` (`gemini.ts:30-60`). `isRateLimited` filters timestamps `< window`, denies if `recent.length >= 20`, else pushes `now`. Map is lazily GC'd when `size>1000` by pruning expired entries (`gemini.ts:72-78`). On limit, returns `429 {error:"Too many requests — please wait…", retryAfter:60}` (`gemini.ts:148-152`).
4. **Body size caps** (`gemini.ts:26-28`, `156-174`, `220-226`): `MAX_PAYLOAD_BYTES = 2 MiB` (generic), `MAX_TRANSCRIPTION_PAYLOAD_BYTES = 4 MiB`, pre-check vs `MAX_ANY_PURPOSE_PAYLOAD_BYTES` before `purpose` is known, then per-purpose re-check (`gemini.ts:221-226`). Body is read once into `requestBodyForRetry` / `parsedBodyForRetry` to allow retry without re-reading a consumed stream (`gemini.ts:155-212`).
5. **Purpose allowlist** (`gemini.ts:16-24`, `214-219`): `type Purpose = "milestone_generation"|"transcription"|"combined_evaluation"|"followup_question"` → `PURPOSE_MODELS` all map to `gemini-flash-lite-latest`. `ALLOWED_PURPOSES.has(purpose)` else `400 "Invalid or missing 'purpose'"`. Client cannot override model; `const model = PURPOSE_MODELS[purpose]` (`gemini.ts:244`).
6. **Runtime payload schema validation** (`gemini.ts:90-114`, `235-241`): `validatePayload` ensures `{contents:[{parts:[{text}|{inline_data}]}]}` non-empty arrays, each part contains `text` or `inline_data`. On failure `400 "Invalid payload shape: ..."`.
7. **API key handling** (`gemini.ts:248-273`): `process.env.GEMINI_API_KEY` only (masked log `xxxx...xxxx (length N)`). `VITE_GEMINI_API_KEY` is explicitly ignored with error log (`gemini.ts:261-263`). Missing key → `500`. URL: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}` (`gemini.ts:274`).
8. **Upstream dispatch with retry/backoff** (`gemini.ts:276-354`): `maxRetries=2` (3 attempts), `backoffs=[1000,3000]` ms, per-attempt `AbortController` with `TIMEOUT_MS=30000` (`gemini.ts:292-295`). On `5xx` and attempt `< max`, reads body, `sleep(backoff)` and `continue`. Logs only `status` + `responseBytes`, never content (`gemini.ts:319`). On abort → `504`, on other network errors → `502`. Exhaustion after `5xx` → `503`. Outer `try/catch` returns `500` if `headersSent` false.
9. **Response forwarding**: proxy streams `upstream.text()` (parsed JSON) with same status (`gemini.ts:317-327`).

**Client decoding:** Every service uses `parseGeminiJson` (`src/lib/parseGeminiJson.ts:1-35`) — strips ```json fences (`/^```(?:json)?...```$/`) and falls back to first balanced `\{...\}` match before `JSON.parse`. All `fetch` callers surface `429` as a user-facing `Error("Too many requests right now — this can happen if multiple devices are using the app on the same network. Please wait about a minute…")` (`transcriptionService.ts:54-55`, `milestoneService.ts:97-98`, `combinedEvaluationService.ts:192-193`, `followUpService.ts:55-56`/`125-126`).

### 1.3 State Tree Inside `App.tsx` (Multi-Step Flow)

**File:** `src/App.tsx:351-1757` (`export default function App()`). The flow is **strictly gated** — each stage's JSX is conditionally rendered only when prior stage's state invariants hold. No route; single page with conditional panels under `<main className="space-y-6">`.

**Core milestone / document state (Upload → Milestones):**
- `milestones: Milestone[]` (`App.tsx:352`) — current extracted concepts, each `Milestone {id, text, importance: "core"|"supporting", sourceReference?, covered:false}` (`types.ts:5-11`).
- `hasDocument: boolean` (`App.tsx:365`) — tracks whether user has pressed "Continue to Recording" (i.e., left upload stage).
- `fileName: string|null`, `documentStatus: "idle"|"extracting"|"generating"|"ready"|"error"` (`App.tsx:366-368`), `documentError: string|null` (`App.tsx:368`), `uploadedDocs: Array<{id,fileName,text,status,error?}>` (`App.tsx:370`) — multi-file accumulator.
- `milestonesConfirmed: boolean` (`App.tsx:390`) — gates Record stage; set true only via "Start Recording — N concepts" button (`App.tsx:1252`).
- `subjectDomain: SubjectDomain|null` (`App.tsx:360`) — `"technical"|"narrative"` from milestone generation, threaded into evaluation.
- Tokens `milestoneGenIdRef: useRef<number>` (`App.tsx:374`) — increments each `processNotesToMilestones` to discard stale results (generation race guard).

**Transcript state (Record → Review):**
- `transcript: string` (`App.tsx:353`) — editable transcript string (initially empty).
- `originalTranscript: string` (`App.tsx:385`) — **immutable** original spoken transcript set only in `handleTranscriptReady` (`App.tsx:861`).
- `transcriptCommitted: boolean` (`App.tsx:386`) — true after "Confirm & Evaluate" equivalent; drives auto-evaluation.
- `transcriptSignificantlyEdited: boolean` (`App.tsx:388`) — intended word-level diff flag but is **always reset to false** (see §3.2); consumed by `getEvaluationTranscript()` (`App.tsx:592-594`): if true returns `originalTranscript`, else `transcript`.
- `isEditingTranscript: boolean` (`App.tsx:372`) — true when user is in back-edit state via `handleBackToTranscript`.
- `acousticMetrics: AcousticMetrics|null` (`App.tsx:361`) — `{wordsPerMinute, pauseCount, totalPauseDuration, pitchVarianceScore, recordingDurationMs?}` passed from `VoiceRecorder` into evaluation and history.
- `hasDocument && milestonesConfirmed && !transcript && !isEditingTranscript` → renders `<VoiceRecorder onTranscriptReady onBack>` (`App.tsx:1262-1265`).

**Evaluation state (Combined Evaluation → Results):**
- `combinedResult: CombinedEvaluationResult|null` (`App.tsx:354`) — the sole result object from `evaluateCombined` (`combinedEvaluationService.ts:6-19`). Contains `coverage_score, factual_accuracy_score, reasoning_quality_score, clarity_score, is_gaming_attempt, reasoning, summary, details: CoverageDetail[], milestones_covered, confidence, subject_domain, acousticMetrics`.
- `isEvaluating: boolean` (`App.tsx:355`), `evaluationError: string|null` (`App.tsx:356`), `evalCooldown: boolean` (`App.tsx:362`), `evalGenIdRef: useRef<number>` and `evalInFlightRef: useRef<boolean>` (`App.tsx:375-376`) — dedup + 4 s cooldown (`App.tsx:615-616`).
- `followUpPair: FollowUpPair|null` (`App.tsx:393`), `followUpCheck: FollowUpCheck|null` (`App.tsx:394`), `followUpLoading/Checking/Skipped/Error` (`App.tsx:378-382`), `followUpGenIdRef` (`App.tsx:382`) — remediation + transfer probes after results.
- `historyEntries: HistoryEntry[]` (`App.tsx:358`), `historyOpen: boolean`, `hasSaved: boolean` (`App.tsx:359`) — persisted via `localStorage "feynmanbox_history"` with pruning/migration (`App.tsx:404-451`).
- Derived: `finalScore = round(coverage*0.4 + factual*0.2 + reasoning*0.2 + clarity*0.2)` with gaming zeroes (`App.tsx:988-992`), `isMastered = finalScore>=80 && !is_gaming_attempt` (`App.tsx:995`).

**Flow graph traced through `App.tsx:998-1757` (`return ()`):**
```
<header> always
<main>
  [hasDocument && status!=idle && status!=error] status pill            1024
  [hasDocument && status=="error"]  milestone error panel + retry + underlying docs  1044-1130
  [!hasDocument] upload stage: tagline + <DocumentUpload> + Continue button  1132-1204
  [hasDocument && !milestonesConfirmed && milestones>0 && ready] Review Key Concepts  1206-1260
  [hasDocument && milestonesConfirmed && !transcript && !isEditingTranscript] <VoiceRecorder> 1262-1265
  [hasDocument && status!=ready && status!=error && milestones==0] Analyzing notes spinner 1269-1279
  [hasDocument && transcript && !isEditingTranscript && milestones>0 && isEvaluating] Analyzing explanation 1281-1294
  [hasDocument && transcript && !isEditingTranscript && milestones>0 && evaluationError] eval error + Retry + underlying preview 1296-1335
  [hasDocument && transcript && !isEditingTranscript && milestones>0 && combinedResult] Results panel (score, DimBars, breakdowns, acoustic, summaries) 1337-1604
  [hasDocument && transcript && ... && combinedResult && !isEvaluating && !evaluationError] follow-ups panel (remediation+transfer, check, skipped states) 1607-1721
  [isMastered && milestones>0 && combinedResult] <ExportFeature>         1723-1730
  footer how-it-works <details> when no result yet                        1733-1742
  {historyOpen && <HistoryPanel>}                                         1744-1751
```
Navigation mutations: `handleContinueToRecording` sets `hasDocument`, calls `processNotesToMilestones` (`App.tsx:531-545`); `handleTranscriptReady` (`App.tsx:856-882`) stores immutable original, commits transcript, triggers `useEffect` auto-run `runCombinedEvaluation` (`App.tsx:631-645`); `handleRetryEvaluation`, `handleBackToTranscript`, `handleBackToUpload`, `handleReset` each bump `evalGenIdRef`/`followUpGenIdRef` and reset slices.

---

## 2. PRODUCTION FEATURE INVENTORY (VISIBLE UI)

> Rendered order follows `<main>`. Responsive behavior draws from Tailwind classes and `src/index.css:1-86`.

### 2.1 Header & Toolbar
| Element | File:Lines | Purpose / Input Vars | Visual Behavior |
|---|---|---|---|
| `HeaderBar` | `App.tsx:94-121` (def), `1001-1008` (use) | Props `onNewSession()`, `onHistory()`, `hasHistory: boolean`. Renders two 40 px square icon buttons (New Session `+`, History clock). | Outer container `App.tsx:1002` is `flex flex-row justify-between items-center w-full gap-3` — replaces absolute centering so title clears toolbar at 320–414 px. Each button `w-10 h-10 rounded-panel border border-ink-border bg-ink-light` with hover `text-parchment border-brass`. History dot `absolute -top-1 -right-1 w-2 h-2 bg-brass rounded-full` only when `hasHistory`. |
| Title `FeynmanBox` | `App.tsx:1004-1006` | Static brand. | `font-serif font-bold tracking-tight leading-none truncate text-xl sm:text-2xl md:text-3xl text-parchment`; `truncate` inside `flex-1 min-w-0 text-left sm:text-center` prevents clipping against toolbar. Decorative `w-16 h-0.5 bg-brass` centered below (`App.tsx:1010`). |
| Taglines | `App.tsx:1011-1014`, `1134-1136` | Supportive positioning copy. | `font-serif text-sm italic text-parchment-muted` and `label-tag text-[10px]` "Oral examination — bluff detection". Second tagline pre-upload: mono `text-xs text-parchment-muted text-center` with sacrifice of competence illusion. |
| Demo mode banner | `App.tsx:1015-1020` | `isDemoMode()` (`security.ts:20-26`) | When `?demo` present, `border-brass/40 bg-brass/10` pill with `w-2 h-2 bg-brass rounded-full animate-pulse` + mono `Demo mode — offline fixtures, no network`. `animate-fade-in` not applied here, static. |

### 2.2 Document Upload Stage (`!hasDocument`)
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| `DocumentUpload` dropzone | `DocumentUpload.tsx:55-105` | Accepts `onFileSelected(File)`, `onPasteText(string)`, `error`, `status`. `accept=".pdf,.docx,.txt"`, `MAX_FILE_SIZE 10MB`. | `panel p-6 relative overflow-hidden`; header row `w-2 h-2 bg-brass rounded-sm` + `font-serif text-xl`. Drop zone itself: `role="button" tabIndex=0 aria-label="Upload document — PDF, DOCX or TXT, maximum 10MB. Click to browse or drag and drop."` — `border-2 border-dashed rounded-panel p-8 text-center cursor-pointer` with `focus:ring-2 focus:ring-brass`. Idle state `border-ink-border bg-ink hover:border-brass/50`; `dragOver` state `border-brass bg-brass/5`. Center column: 40 px icon tile (`w-10 h-10 rounded-panel border bg-ink-light` + upload SVG), labels `font-mono text-sm text-parchment` ("Drop your notes here") and `text-xs text-parchment-muted` ("or click to browse — PDF, DOCX, TXT"), footnote `text-[10px] Maximum file size: 10MB`. |
| Hidden file input | `DocumentUpload.tsx:96-105` | Bridges click → `handleFiles` | `sr-only tabIndex=-1 aria-hidden`. `onChange→handleFiles`, `onClick stopPropagation`. |
| File error banner | `DocumentUpload.tsx:107-111` | `fileError` (size/unsupported) or `error` (from `App`) | `role="alert" mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs`. |
| Status row | `DocumentUpload.tsx:113-120` | `status` (`extracting`/`generating`/`ready`) | `flex items-center gap-2 mt-3` with `w-2 h-2 bg-brass rounded-full animate-pulse` + `font-mono text-xs text-parchment-muted`. Messages: "Processing your notes…" / "Generating key concepts…" / "Notes ready". |
| Paste toggle | `DocumentUpload.tsx:122-152` | `showPaste: boolean`, `pasteText: string` | Ghost link `font-mono text-xs text-parchment-muted hover:text-brass tracking-wider` toggling label "Or paste notes instead →" / "Hide paste option". Textarea `id="paste-notes"` `sr-only` label, `rows=4 min-h-[120px] bg-ink border border-ink-border rounded-panel p-3 font-mono text-sm placeholder:text-parchment-muted focus:border-brass`. Button "Use Pasted Notes" `btn-primary` disabled `opacity-40` when empty, collapses with `animate-fade-in`. |
| Processed Documents list (pre-continue) | `App.tsx:1137-1196` | `uploadedDocs[]` derived display | `panel p-4 space-y-3` with `label-tag Processed Documents (N)`. Each row `flex items-center gap-3 p-3 rounded-panel border border-ink-border bg-ink` with status dot `w-2 h-2 bg-verified / bg-flagged / bg-brass animate-pulse`, filename `font-mono text-xs text-parchment flex-1 truncate`, state text `text-[10px]`. Error lines per doc `text-flagged text-[10px]`. Summary line `text-[10px] text-parchment-muted` "(N ready, M extracting, K failed)". Delete `×` per row `hover:text-flagged`. |
| Continue to Recording button | `App.tsx:1191-1195` | `uploadedDocs.filter(status=="ready")` | `btn-primary w-full` text `"Continue to Recording — N document(s) ready"` only when at least one doc is `ready`. |

### 2.3 Upload-Step Post-Transition Indicators
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Doc processing pill | `App.tsx:1024-1042` | `hasDocument && documentStatus != idle && !=error` | `flex items-center gap-2 px-3 py-2 rounded-panel border border-ink-border bg-ink-light animate-fade-in` with dot `bg-verified` when `ready` else `bg-brass animate-pulse`. Mono `text-xs text-parchment-muted truncate` messages per enum (`extracting: Processing "file"...`, `generating: Generating key concepts…`, `ready: Notes ready — file`). |
| Milestone error panel | `App.tsx:1044-1130` | `hasDocument && documentStatus=="error"` | `space-y-4 animate-fade-in`. 429 path renders `<RateLimitAlert>` (see §3.4). Non-429 path `panel p-4 border-flagged/40 bg-flagged/10` with dot `bg-flagged` + mono `text-flagged` error text, buttons "Try again" (`btn-primary flex-1`) + "Back to notes" (`btn-ghost`). Optional override CTA `Continue anyway` `w-full font-mono bg-brass`. Underlying `uploadedDocs` preview + bare `<DocumentUpload status="idle">` remain visible so workspace is never blank; continue button reappears if ready docs exist. |
| Analyzing notes spinner | `App.tsx:1269-1279` | `hasDocument && status!=ready && status!=error && milestones.length==0` | `panel p-6 text-center` with `w-2 h-2 bg-brass rounded-full animate-pulse`, `label-tag Analyzing your notes…`, mono subtitle, `h-0.5 bg-ink-border rounded-sm overflow-hidden` + inner `h-full bg-brass animate-progress-bar` (`@keyframes progress-slide 1.5s ease-in-out infinite`). |

### 2.4 Review Key Concepts (Modal-like Panel)
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Concepts shell | `App.tsx:1206-1260` | Shown when `hasDocument && !milestonesConfirmed && milestones.length>0 && status=="ready"` | `panel p-6 animate-fade-in` with header `w-2 h-2 bg-brass rounded-sm` + `font-serif text-xl`. Subcopy `label-tag` + mono `text-xs text-parchment-muted`. |
| Concept list | `App.tsx:1215-1251` | `milestones[].{id,text,importance,sourceReference}` | `space-y-3`. Each row `p-3 rounded-panel border border-ink-border bg-ink flex items-start gap-3` with index `font-mono text-xs text-brass`, editable `textarea` `w-full bg-ink-light border border-ink-border rounded-panel p-2 font-mono text-xs focus:border-brass overflow-hidden` with `autoResize` on input/ref, importance pill `text-[9px] px-1.5 py-0.5 rounded border` (`border-brass/40 text-brass` for core vs `border-ink-border text-parchment-muted` for supporting), delete `×` `hover:text-flagged disabled:opacity-30` (min-one guard). |
| Start Recording CTA | `App.tsx:1252-1258` | `setMilestonesConfirmed(true)` | `btn-primary w-full mt-5` → `"Start Recording — N concept(s)"`, disabled when empty. No `autoStart` prop is ever passed — recorder mounts idle. |

### 2.5 Voice Recorder (`VoiceRecorder.tsx:618-820`)
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Component shell & Back link | `VoiceRecorder.tsx:618-635` | Props `onTranscriptReady(string,metrics?)`, `initialTranscript?`, `onBack?`. `onBack` tied to `handleBackToUpload` | `panel p-6` parent. Back link only when `!isRecording && !isTranscribing` → `flex items-center gap-1.5 font-mono text-xs text-parchment-muted hover:text-parchment tracking-wider mb-4` with left chevron SVG. Unsupported banner `p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs` when `!navigator.mediaDevices.getUserMedia || !MediaRecorder`. |
| **Idle (IDLE) state** | `VoiceRecorder.tsx:637-683` | Default mount: `!isRecording && !isTranscribing && !hasRecording`. **No `getUserMedia` until button pressed** — verified by only calling within `startRecording` (`VoiceRecorder.tsx:297-505`). | Header `w-2 h-2 bg-brass rounded-sm` + `font-serif text-xl Voice Testimony`, `label-tag Microphone Input`. Two paragraphs instructional: `text-parchment-muted text-sm leading-relaxed` + mono `text-xs ... Press Start Recording when you're ready…`. Waveform shell `polygraph-grid rounded-panel border border-ink-border p-4 bg-ink opacity-60 mb-4` with dot `bg-parchment-muted` + chip `label-tag text-[10px] "System Ready — Press button to initiate active recording"`. SVG `viewBox="0 0 400 40" w-full h-[50px]` with 3 horizontal guides (solid `stroke #2A333D` at y=20 plus dashed at y=10,30) and flat dashed path `M 0 20 L 400 20 stroke #3A4550 width1.5 dash 6 4 opacity 0.6`. Error chip: non-429 → `border-flagged/40 bg-flagged/10 text-flagged`; 429 → `<RateLimitAlert onRetry=retryTranscription>` in same `mb-4` wrapper (`VoiceRecorder.tsx:671-674`). Button `btn-brass-sharp w-full` (sharp-cornered, `bg-brass` `border-radius:0` `hover:bg-brass-light`) label **"Start Recording Capture"**. Footer mono `text-[10px] text-center` "Microphone not yet active — no capture until you press the button above." + low-end device note when `isLowEndDevice` (hardwareConcurrency ≤2 or iPhone/Android UA) `ShowLivePreview default false` (`VoiceRecorder.tsx:64-73`). Idle card is annotated `// Two-click flow verification: 1) Start Recording — N concepts 2) Start Recording Capture` (`VoiceRecorder.tsx:677-681`). |
| **Recording (active) state** | `VoiceRecorder.tsx:684-751` | `isRecording==true` after `mediaRecorder.start()` + `setIsRecording(true)`. Background `MediaStream` + optional `AudioContext`/`AnalyserNode(fftSize=256,smoothing=0.8)` with `requestAnimationFrame drawWaveform` & metrics sampling interval. | Header `w-2 h-2 bg-flagged rounded-full animate-pulse` + `Recording` + `formatTime(recordingTime)` `font-mono text-xs ml-auto`. `label-tag Live Signal` + checkbox `Show live preview: On/Off` (`VoiceRecorder.tsx:692-696`, `_mounted` hooks at `60-175`). Waveform `polygraph-grid ... p-4 bg-ink` with `Signal Active` dot `bg-brass animate-pulse`. SVG same guides; animated path is either `mainPathRef` + `shadowPathRef` curved via `quadraticCurve` quantized over 50 segments sampled from `analyser.getByteTimeDomainData` (full routing at `VoiceRecorder.ts:178-238`), or fallback CSS `waveform-line waveform-animate` (`@keyframes waveShift 0.8s linear infinite translateX`) when AudioContext fails (`useFallbackWaveform`). Live caption box (`VoiceRecorder.tsx:728-741`) only when `showLivePreview`: `mt-3 p-3 rounded-panel bg-ink border min-h[52px] max-h[96px] overflow-y-auto`, tag `Live preview — approximate`, body `font-mono text-xs whitespace-pre-wrap` (`livePreview` + italic `liveInterim`) else italic "Listening…". Footer `Speak clearly…`. Stop button `mt-4 w-full bg-flagged/20 border border-flagged/40 text-flagged rounded-panel hover:bg-flagged/30`. |
| **Transcribing state** | `VoiceRecorder.tsx:753-762` | `isTranscribing==true` (blob → base64 → `transcribeAudio` pending) | `text-center py-8` with `w-2 h-2 bg-brass rounded-full animate-pulse`, `label-tag Transcribing your explanation…`, mono subtitle, `mt-6 h-0.5 bg-ink-border rounded-sm overflow-hidden` + `bg-brass animate-progress-bar`. |
| **Review / editable transcript state** | `VoiceRecorder.tsx:764-809` | `!isRecording && !isTranscribing && hasRecording` | Header `w-2 h-2 bg-verified rounded-sm` + `Review Your Transcript`. Subcopy mono `text-xs`. `textarea rows=6` `w-full rounded-panel bg-ink border border-ink-border p-4 font-mono text-sm min-h120 max-h220 overflow-y-auto`. Preview chip when `pendingMetrics` set: `rounded-panel border bg-ink p-3` with `Pace: WPM • Pauses: count (s) • Pitch variance: /100`. `Confirm & Evaluate` `btn-primary flex-1 opacity-40 when !trim`, `Re-record` `btn-ghost`; layout `flex gap-3 mt-4`. Error chip when flagged. |
| Metrics math (preview) | `VoiceRecorder.tsx:284-295`, `445-457` | Computes `AcousticMetrics` from recording duration + word count | `durationMs = Date.now()-startTime`, `wpm = round(wordCount / max(0.1, durationMs/60000))`, pause `silence >=700ms` via `avgAbs<4.5` (`VoiceRecorder.tsx:253`), pitch score from `frequencyBinCount` variance `/30` capped 100 plus `combined = min(100, avg*0.7 + spread*1.8)`. Debug `[AcousticMetrics]` console log. |

### 2.6 Combined Evaluation Loading & Errors
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Analyzing explanation | `App.tsx:1281-1294` | `hasDocument && transcript && !isEditingTranscript && milestones.length>0 && isEvaluating` | `panel p-6 text-center relative overflow-hidden` with top `h-0.5 bg-brass animate-progress-bar` absolute bar, `w-2 h-2 bg-brass rounded-full animate-pulse`, `label-tag Analyzing your explanation…`, subtitle `font-mono text-xs`, bottom progress bar mirror. |
| Evaluation error panel | `App.tsx:1296-1335` | `evaluationError && !isEvaluating` | `panel p-6 space-y-4`. 429 path → `<RateLimitAlert onRetry=handleRetryEvaluation retrying=evalCooldown>` (`App.tsx:1298-1300`). Non-429 → flagged `border-flagged/40 bg-flagged/10 text-flagged`. Button row `Try again` (`btn-primary flex-1`, `evalCooldown` → `opacity-40 Please wait…`) + `Edit Transcript` (`btn-ghost`). Cooldown note mono `text-[10px]`. Underlying persistent preview `pt-4 border-t border-ink-border`: `label-tag` + transcript snippet `font-mono text-xs whitespace-pre-wrap max-h120 overflow-y-auto` + milestones mini list (top 3 `slice(0,3)`). Keeps workspace intact on error. |

### 2.7 Results Panel (`combinedResult && !isEvaluating`)
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Master header | `App.tsx:1339-1367` | `Back to transcript` chevron button + status dot `bg-verified/bg-flagged/bg-brass` per `isMastered` / `is_gaming_attempt` + `Mastery Achieved / Review Needed / Evaluation Complete`. Domain chip `border-brass/30 bg-brass/10` "Evaluating as: Technical/Narrative … causal logic / thematic coherence" + confidence pill `bg-verified/20 / bg-flagged/20 / bg-ink-border`. All `animate-fade-in relative overflow-hidden`. |
| Overall score | `App.tsx:1369-1388` | `finalScore` (weighted 0.4/0.2/0.2/0.2, `App.tsx:988-992`) | Row `label-tag Final Score` + `score-display` (`font-mono text-4xl font-bold text-brass`) + `/100`. Explanation `Final N/100 combines four dimensions…` mono `text-[10px]`. Bar `h-1 bg-ink-border rounded-sm` fill `bg-verified/bg-flagged/bg-brass` width `${finalScore}%` with `transition-all duration-1000 ease-out`. Coverage trace `Coverage N/100 = sum of sub/max…` mono. |
| Evaluation Dimensions | `App.tsx:1389-1399` | Four `DimBar` (`App.tsx:82-92`): Coverage, Factual, Reasoning, Clarity | `rounded-panel border bg-ink p-4` + `label-tag text-[10px]` each row `flex items-center gap-3 mb-2 last:mb-0`: label mono `w-40 flex-shrink-0`, bar `flex-1 h-1.5 bg-ink-border rounded-sm overflow-hidden` inner `h-full transition-all duration-1000` with color `bg-brass/bg-verified` and `width score%`, value mono `text-xs font-bold w-10 text-right`. Footer defining sentence mono `text-[10px]`. Low-confidence note (`confidence=="low"`): `p-3 rounded-panel border border-brass/30 bg-brass/5` mono `text-brass` (`App.tsx:1402-1408`). |
| Summary | `App.tsx:1410-1414` | `combinedResult.summary` model output | `rounded-panel border border-brass/20 bg-brass/5 p-4`: `label-tag text-[10px] Summary` + `font-serif text-sm text-parchment leading-relaxed`. |
| Gaming attempt note | `App.tsx:1417-1425` | When `is_gaming_attempt==true` | `border border-flagged/60 bg-flagged/10 p-4` with title `font-mono text-sm font-bold text-flagged tracking-wide "Explanation pattern noted"` + description `text-flagged` + support sentence `text-parchment-muted`. Never accuses cheating. |
| What you understood well | `App.tsx:1427-1468` | `details.filter(covered==true)` | Grid `grid-cols-1 md:grid-cols-2 gap-3` — **responsive 1 col on mobile → 2 col ≥768 px**. Each card `p-3 rounded-panel border border-verified/30 bg-verified/5` with 16 px checkbox `bg-verified` + check SVG, concept `font-serif text-sm`, score `font-mono text-xs font-bold text-verified sub/max`, feedback mono `text-verified`, optional `reasoning_feedback` `text-[10px]`, collapsible `<details>` Source (`text-brass` summary + `border-l-2 border-brass/30 italic` source excerpt), flag notice if `!is_factually_correct`. |
| What you missed | `App.tsx:1470-1510` | `details.filter(!covered)` | Same responsive grid; cards `border-flagged/20 bg-flagged/5` with hollow box `—` glyph, score `text-flagged` or `text-parchment-muted`, feedback `text-parchment-muted`. Same source_details pattern. |
| Per-Concept Breakdown (traceable) | `App.tsx:1511-1533` | Traceable ledger mapping milestones to sub-scores | `rounded-panel border bg-ink p-3` `space-y-1.5 font-mono text-xs` rows `flex justify-between gap-2` with importance pill `sup/core` (`border-brass/40` vs `border-ink-border`), `Concept i+1 — slice(0,40)`, score `font-bold text-verified/text-flagged/text-brass` per threshold, dot `w-2 h-2 rounded-sm bg-verified/50|bg-flagged` for factual correctness. Footer `border-t Total Coverage N/100`. |
| Clarity feedback (when not gaming) | `App.tsx:1535-1548` | `reasoning` text + clarity bar | `border bg-ink p-4` with dot `bg-brass` + tag "Clarity & Coherence (causal/thematic)" + score `ml-auto`, bar `h-1 bg-ink-border` with fill. |
| Speech Analysis | `App.tsx:1550-1578` | `acousticMetrics` supplementary | `border bg-ink p-4 mb-6` with `Speech Analysis (supplementary)` tag, grid `grid-cols-2 gap-3 font-mono text-xs`: pace `WPM` + qualifier `unusually fast (>180)/ slow (<100)/ natural`, pauses `N • s total`, pitch variance `/100` + qualifier `<20 flat, >60 expressive`. Footer mono `text-[10px]` supplementary disclaimer with conditional phrasing (`Very fast… may suggest rehearsed… but weak hint` vs `Natural pacing… genuine explanation`). Explicitly never lowers knowledge scores. |
| Details | `App.tsx:1589-1603` | `transcript` and `How this works` | Two `<details>` blocks with `font-mono text-xs text-parchment-muted hover:text-parchment tracking-wider` summaries revealing transcript (`whitespace-pre-wrap`) and "One structured AI call evaluates coverage, clarity, and gaming simultaneously…". |

### 2.8 Follow-Up Probes (post-results)
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| Loading | `App.tsx:1610-1618` | `followUpLoading` after result with missed concept | `panel p-6 animate-fade-in` with `bg-brass animate-pulse` dot + `Examiner's Follow-Up` tag + mono "Preparing follow-up…" |
| Remediation + Transfer pair | `App.tsx:1619-1680` | `followUpPair && !skipped && !loading` | `panel p-6 border-brass/30 space-y-5 animate-fade-in`. Remediation: `w-2 h-2 bg-flagged rounded-sm` + `Strengthen a Gap` `font-serif text-lg`, mono `Remediation — reflection only, not re-graded text-[10px]`, quote `font-serif text-base border-l-2 border-flagged pl-4`. Textarea `id=followup-answer rows=3 min-h80 bg-ink border rounded-panel p-3 font-mono`. Row: `Skip` (`btn-ghost`), `Check my answer` (`btn-ghost disabled opacity-40`), `Save reflection` (`btn-primary`). Check result box `mt-3 p-3 rounded-panel border` (`brass` rate-limited vs `verified` covered vs `flagged` missed) with feedback and `Retry` button if 429 + footnote "supplementary check only — does not change original score". Transfer section `border-t pt-4` with `w-2 h-2 bg-verified`, `Apply What You Know` + `border-l-2 border-verified` quote. |
| Saved reflection | `App.tsx:1681-1695` | `followUpSkipped && answer.trim()` | `panel p-6 animate-fade-in` with `border-verified` quote of remediation + answer preview `bg-ink border rounded-panel p-3 whitespace-pre-wrap` + success mono `text-verified`. |
| Error & skipped stubs | `App.tsx:1696-1719` | `followUpError` or `skipped && !trim` | Error `panel p-4 border brass vs flagged` with mono message + `Try again` if 429 + `Skip for now`. Skipped stub mono `Follow-up skipped.` + `Show questions again` brass link. |

### 2.9 Export & History
| Element | File:Lines | Purpose | Visual Behavior |
|---|---|---|---|
| `ExportFeature` | `ExportFeature.tsx:109-139` (shell), `ExportFeature.tsx:31-106` (logic) | Rendered only when `isMastered && milestones.length>0 && combinedResult` (`App.tsx:1723-1730`) | `panel p-6` with `w-2 h-2 bg-verified` + `Export Case File`/`Study Card Generation`. Mono "Save your key concepts…". Two buttons `w-1/2` (`flex gap-3 mb-4` → single row on all viewports, wraps gracefully): `Download as Markdown` (`btn-primary`) and `Download as Anki Cards (.txt)` (`btn-secondary` — Note: class `btn-secondary` is not defined in `index.css`, falls back to unstyled; intended distinction is visual secondary). Disabled `opacity-50` while `downloading`. `generateMarkdown` produces `# Study Cards — …` with `## Concept i:` + `**Your explanation:** feedback` + `**Status:** ✅/❌`. `generateAnkiCards` produces `front\tback` TSV. Download via `Blob → URL.createObjectURL → <a>.click`. |
| `HistoryPanel` | `App.tsx:123-349` | Modal overlay `historyOpen` | `fixed inset-0 z-50 flex items-center justify-center p-4` with backdrop `absolute inset-0 bg-ink/80 backdrop-blur-sm` click-to-close. Dialog `role="dialog" aria-modal="true" aria-labelledby="history-title"` `relative panel p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col` with focus trap (`Tab` cycle between `querySelectorAll(button,input,textarea,select,[tabindex])`), `Escape` closes, auto-focus close button (`closeButtonRef`), `body.overflow=hidden`. Header with brass dot + `Session History` + ✕ `aria-label="Close history"` SVG. Subcopy `label-tag Stored locally in your browser`. Empty state: centered monos `No sessions yet. … Complete an evaluation…`. With entries: grouped by `fingerprint` via `Map<string,HistoryEntry[]>`, each group shows sparkline chip (`p-3 rounded-panel border border-brass/20 bg-brass/5` with `font-mono text-[10px] text-brass Attempt 1→2→3: scores`). Entry card `p-4 rounded-panel border bg-ink`: date `text-brass`, score `/100` `text-verified / text-flagged / text-parchment-muted`, "Due for review" banner `bg-brass/20 border` when `nextReviewDate ≤ now`, labels for subjectDomain + confidence pills, key concepts `truncate`, details (top 3 `✓/— concept slice50 + sub/max + factually wrong flag`), WPM/pauses mono, `Coverage % / Clarity % (flagged) / Final %`. Utility row `Export History` (`btn-ghost flex-1`) triggering `Blob` download `feynmanbox-history-YYYY-MM-DD.json` + provider pattern `ExportFeature.tsx:81-106` analogue; `Import History` `label` with hidden `input type=file accept=.json` → `handleImportHistory` validates `isValidHistoryEntry` then merges; `Clear History` `btn-ghost w-full`. Persists via `localStorage["feynmanbox_history"]` with quota pruning (`App.tsx:439-451`). |
| Shared `Sparkline` | `App.tsx:54-80` | `(scores: number[])` | Returns `null` if `<2`. SVG `120×32 viewBox 0 0 120 32` `overflow-visible` with `polyline stroke #C9962C width1.8 round` and per-point `circle r2.5 fill #C9962C` scaled linearly between 0–100. Inline per-fingerprint attempt strip. |
| `DimBar` | `App.tsx:82-92` | `(label, score, color)` | Row `flex items-center gap-3 mb-2 last:mb-0` label `font-mono text-[10px] text-parchment-muted w-40 flex-shrink-0` + bar `flex-1 h-1.5 bg-ink-border rounded-sm overflow-hidden` fill `transition-all duration-1000 ease-out` + value `font-mono text-xs font-bold text-parchment w-10 text-right`. |
| `RateLimitAlert` | `src/components/RateLimitAlert.tsx:1-31` (def), `App.tsx:1047-1048`/`1298`/`VoiceRecorder.tsx:671-674` (uses) | Shared 429 viewport | `p-3 rounded-panel border border-flagged/50 bg-flagged/10` with dot `w-2 h-2 bg-flagged rounded-sm` + `font-mono text-xs text-flagged leading-relaxed` hard-coded copy "System Request Threshold Exceeded — This occurs when multiple client iterations run simultaneously on the same local network footprint. Please pause for 60 seconds before re-submitting current state." + `btn-primary w-full mt-3 Retry Request` (`retrying` → `opacity-40 Please wait…`). Rendered **nested within the active viewport** so buffered extracts / milestones / transcript / audio blob retained. |
| Footer details | `App.tsx:1733-1742` | `!combinedResult && !isEvaluating && hasDocument && status=="ready"` | Collapsible `<details className="panel p-4">` with summary mono and body "One structured AI call evaluates… Document parsing, audio capture, and waveform visualization all run in the browser." |

**Responsive behavior summary:** Outer `max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8`. Header `flex-row justify-between` avoids absolute positioning. Coverage cards and sparkline groups flip `1 → 2` columns at `md` (768 px). `Sparkline` and waveform SVGs use `preserveAspectRatio="none"` / fluid `w-full` to stretch across. All score bars animate `duration-1000 ease-out`. `animate-progress-bar` (`@keyframes progress-slide 1.5s ease-in-out infinite translateX`) and `animate-fade-in` (`fadeIn 0.5s translateY 8px → 0`) degrade to `duration:0.01ms` under `prefers-reduced-motion` (`index.css:77-85`). All panels use `panel = bg-ink-light border border-ink-border rounded-panel (4px)` (`index.css:12-14`), `label-tag = font-mono text-xs uppercase tracking-widest text-parchment-muted`.

---

## 3. ADVANCED HOOKS & HIDDEN ARCHITECTURAL ENGINE LOGIC

### 3.1 Linguistic Coherence & Coherence Topology (Single-Call Prompt)

**Location:** `src/lib/combinedEvaluationService.ts:84-126` (prompt assembly), `src/lib/milestoneService.ts:36-38` (subject classification that drives it), `src/types.ts:1-3` (`SubjectDomain`).

**Mechanism:** `combinedEvaluationService` uses **one** structured network call per evaluation. Prompt inserts:
- `UNTRUSTED_CONTENT_DIRECTIVE` (`security.ts:8-9`) before all content so the transcriptions/material cannot hijack rubric.
- Domain-adaptive guidance (`combinedEvaluationService.ts:84-87`):
  ```ts
  subjectDomain === "technical"
    ? `TECHNICAL/STEM: Requires explicit causal/logical connectors. Penalize heavily for:
       excessive unexplained jargon, disconnected keyword-listing without logical flow,
       missing connective words (because, therefore, consequently, this means, so, thus, hence).
       Clarity reflects logical chain strength.`
    : `NARRATIVE/HUMANITIES: Values coherent storytelling… DO NOT require
       "because/therefore" specifically. Evaluate coherence based on thematic
       consistency, logical flow of ideas, narrative progression.`
  ```
  Domain is set upstream by `milestoneService` (`milestoneService.ts:36-38`): distinguishes "technical" (STEM requiring causal connectors) vs "narrative" (humanities valuing thematic connection). `options.subjectDomain` is threaded from `App.tsx:360` → `runCombinedEvaluation` (`App.tsx:608`) → prompt (`combinedEvaluationService.ts:93`).

- Tasks (§3.1-3.3 as written in the prompt strings): `REASONING QUALITY 0-100` asks for WHY not WHAT; for technical: `causal/logical connection (because, therefore, this means)`; for narrative: `thematic/logical coherence`. `COMMUNICATION CLARITY 0-100` penalizes disconnected lists; `is_gaming_attempt true ONLY if the explanation is just a list of disconnected terms with no logical sentence structure` (`combinedEvaluationService.ts:117`). The output JSON contract (`combinedEvaluationService.ts:136-166`, `responseSchema`) forces numeric `coverage_score`, `factual_accuracy_score`, `reasoning_quality_score`, `clarity_score`, `is_gaming_attempt`, etc., at `temperature:0.2`.

- **Scoring consequence:** When `is_gaming_attempt == true`, `computeFinalScore` (`App.tsx:988-992`) zeroes both `reasoning_quality_score` and `clarity_score`: `effClarity = is_gaming ? 0 : clarity`, `effReasoning = is_gaming ? 0 : reasoning`; final `= coverage*0.4 + factual*0.2 + effReasoning*0.2 + effClarity*0.2`. Thus keyword dumps can lose up to 40% regardless of coverage. Factual wrongness caps per-concept sub_score at `ceil(max*0.3)` (`combinedEvaluationService.ts:247-248`) and maps to `covered = is_factually_correct && sub>=ceil(max*0.5)` (`combinedEvaluationService.ts:292-293`). The topology rationale is intentionally described non-accusatorily: "observed PATTERN — do not accuse" (`combinedEvaluationService.ts:117` and display wording `App.tsx:1419-1423`: "Explanation pattern noted… This reads as a list of terms without connecting them — try …").

### 3.2 Immutable Transcript Diff-Gating (Versioned Transcript)

**Location:** `src/App.tsx:384-593` (state + `getEvaluationTranscript`).

**Mechanism (as shipped):**
- `App.tsx:385-388` declares `originalTranscript: string` (immutable spoken form), `transcriptCommitted: boolean`, `transcriptSignificantlyEdited: boolean = false`. All three are set **together** only in `handleTranscriptReady(newTranscript, metrics?)` (`App.tsx:856-862`): `setOriginalTranscript(newTranscript); setTranscript(newTranscript); setTranscriptCommitted(true); setTranscriptSignificantlyEdited(false);`. Subsequent `Transcript Review` textarea (`VoiceRecorder.tsx:773-779`) mutates `transcript` freely via `setEditableTranscript`, but `originalTranscript` is never mutated except by a new recording or `handleBackToTranscript` which clears both (`App.tsx:845-847`).
- `App.tsx:589-594` comments describe intent: "Phase 8.1: choose which transcript to evaluate. Minor edits (typo/mishear fixes, <= threshold) transparently improve accuracy, so we evaluate the EDITED version. Significant rewrites (> threshold) are evaluated against the ORIGINAL spoken transcript…"
- `getEvaluationTranscript()` (`App.tsx:592-594`):
  ```ts
  const getEvaluationTranscript = (): string => {
    if (transcriptSignificantlyEdited) return originalTranscript;
    return transcript;
  };
  ```
  Every evaluation entry point uses this accessor: `runCombinedEvaluation` → `const currentTranscript = getEvaluationTranscript()` (`App.tsx:597-598`), `useEffect` follow-ups (`App.tsx:706`, `758`). This gates the LLM from post-recording substantive rewriting.

- **Threshold ratio:** The comment references a word-level diff ratio (`<= threshold` vs `> threshold`) but **no numeric threshold is defined in the shipped tree**. Grep across `src` for `ratio|threshold|levenshtein|distance|word.*diff` returns only the comment itself (`App.tsx:589-590`) and an unrelated pause threshold (`VoiceRecorder.tsx:253 avgAbs<4.5`). `setTranscriptSignificantlyEdited(true)` is **never called** in `App.tsx` — only `false` resets exist (`App.tsx:785,821,847,868`). Therefore the "significant rewording" branch is currently **dead code / reserved**: the system always evaluates `transcript` (the editable copy). If re-enabled, the intended wiring would compare `transcript` vs `originalTranscript` by word-level diff and flip the flag; as shipped, it documents the architectural topology without enforcement. Follow-up generation subscribes to the same flag via `useEffect` dep `[..., transcriptSignificantlyEdited]` (`App.tsx:722`) so a flip would also regenerate prompts from the original.

### 3.3 Acoustic / Prosody Feature Extraction (Web Audio API `AnalyserNode`)

**Location:** `src/components/VoiceRecorder.tsx:23-296` (refs + math), `src/types.ts:40-46` (`AcousticMetrics`), consumed in `combinedEvaluationService.ts:63,79-82,117-119`.

**Signal chain:**
- `startRecording` (`VoiceRecorder.tsx:297-505`) calls `navigator.mediaDevices.getUserMedia({audio:{channelCount:1, sampleRate:16000, echoCancellation:true, noiseSuppression:true, autoGainControl:true}})`. Creates `AudioContext` (or `webkitAudioContext`), `createAnalyser()` with `fftSize=256` (`VoiceRecorder.tsx:344-346`), `smoothingTimeConstant=0.8`, connects `MediaStreamSource → analyser`, then `drawWaveform()` (`VoiceRecorder.tsx:178-238`) inside `requestAnimationFrame`.
- Guarded by `prefersReducedMotion` (`VoiceRecorder.tsx:176` via `matchMedia("(prefers-reduced-motion: reduce)")`); fallback boolean `useFallbackWaveform` toggles CSS `waveShift` animation if `AudioContext` creation fails (`VoiceRecorder.tsx:334-361`).

**Waveform math (`drawWaveform`, `VoiceRecorder.tsx:178-238`):** Each frame reads `analyser.getByteTimeDomainData(dataArray)` (`Uint8Array length=256`). Quantizes into `segments=50`, `step=400/segments`. For each segment index `i`: `dataIdx = floor(i/segments * (len-1))`, `deviation=(v-128)/128`, `y=20+deviation*18`, builds SVG `d` with `Q` quadratic curves via midpoint `cpx=prevX+step/2, cpy=(prevY+y)/2`. Shadow path uses `deviation*0.55` for second hairline (`VoiceRecorder.tsx:216-235`). Flat line `M 0 20 L 400 20` restored after `onstop` (`VoiceRecorder.tsx:429-430`). Disabled under reduced motion.

**Acoustic metric sampling (`sampleAcousticFeatures`, `VoiceRecorder.tsx:240-282`, run every 120 ms via `metricsIntervalRef`):**
- **Silence / pause detection:** each tick reads `getByteTimeDomainData`, sums `|sample-128|` → `avgAbs = sumAbs / len`. `isSilent = avgAbs < 4.5` (`VoiceRecorder.tsx:253`). On `isSilent` transition, stamps `silenceStartRef = now`; on exit, computes `dur = now - silenceStart`, increments `pauseCountRef` only if `dur >= 700 ms`, adding to `totalPauseDurationRef` (`VoiceRecorder.tsx:255-261`). Final silence is also tallied in `recorder.onstop` (`VoiceRecorder.tsx:382-392`).
- **Pitch variance proxy:** also each tick reads `getByteFrequencyData` (`frequencyBinCount` = 128), computes `mean = sum(freqData)/len`, `variance = sum((bucket-mean)^2)/len`, maps to `pitchScore = min(100, variance/30)` and appends to `pitchSamplesRef[≤200]` (`VoiceRecorder.tsx:266-278`). `computePitchVarianceScore()` (`VoiceRecorder.tsx:284-295`) then computes `avg = sum/ n`, `spread = sqrt(sum((s-avg)^2)/n)`, `combined = min(100, avg*0.7 + spread*1.8)` rounded to 1 dp.
- **Duration / pace:** `startTimeRef` at `Date.now()` on record, `durationMsRef = endTime - startTime` on stop (`VoiceRecorder.tsx:383`). On transcription success `wordCount = transcript.split(/\s+/).filter(Boolean).length`, `durationMinutes = max(0.1, durationMs/60000)`, `wpm = round(wordCount / durationMinutes)` (`VoiceRecorder.tsx:446-448`, `580-582`). Edited transcript recomputes WPM against archived duration in `handleConfirm` (`VoiceRecorder.tsx:606-614`).
- Emitted `pendingMetrics` (`VoiceRecorder.tsx:449-456`): `{wordsPerMinute, pauseCount, totalPauseDuration, pitchVarianceScore, recordingDurationMs}` displayed in `VoiceRecorder.tsx:791-792` and forwarded via `onTranscriptReady(editableTranscript, finalMetrics)` (`VoiceRecorder.tsx:615`) → `App.tsx:861-872` → `acousticMetrics` state and `evaluateCombined(options.acousticMetrics)`.
- **Constraint in LLM prompt:** (`combinedEvaluationService.ts:79-82` and task §3) acoustic section is labeled `Supplementary acoustic signals (OPTIONAL, CONFIDENCE-ONLY): … IMPORTANT: These … may ONLY inform the CONFIDENCE rating. They must NEVER lower or raise the coverage/factual/reasoning scores. Pace and pauses vary naturally…`. Scoring normalization also enforces this: `factual_accuracy_score` from `details[].max_score` sums, `reasoning_quality_score` from model, none derived from WPM/pauses. Only `confidence` is heuristic-augmented: `parse confidence || wordCount<50→low / >100→high` (`combinedEvaluationService.ts:306-314`).

### 3.4 Secure Sandbox Allowance & Rate-Limiting (`api/gemini.ts`)

**Allowlist parameter schema (`gemini.ts:16-28`, `90-114`, `214-241`):**
- `PURPOSE_MODELS: Record<Purpose,string> = {milestone_generation, transcription, combined_evaluation, followup_question : "gemini-flash-lite-latest"}` enumerates the only 4 client intents; model is **fixed server-side**, client cannot supply arbitrary model/endpoint.
- Per-purpose byte caps: generic `MAX_PAYLOAD_BYTES=2 MiB`, transcription `MAX_TRANSCRIPTION_PAYLOAD_BYTES=4 MiB` (audio base64), global ceiling `MAX_ANY_PURPOSE_PAYLOAD_BYTES=max(...)` used before `purpose` is parsed (`gemini.ts:170-174`).
- `validatePayload(payload)` (`gemini.ts:90-114`) enforces `contents: Array<{parts: Array<{text? string, inline_data? object}>}>` where each part has `text` or `inline_data`; otherwise `400 "Invalid payload shape"`.
- Allowed payload shapes observed: text-only `{contents:[{parts:[{text: prompt}]}]}` for milestones/evaluation/followup (plus `generationConfig {responseMimeType, responseSchema, temperature}`), and audio hybrid `[{inline_data:{mime_type,data:base64}}, {text: "Transcribe…"}]` for transcription.

**IP-based sliding window (`gemini.ts:11-13`, `30-80`, `142-153`):**
- Window `RATE_WINDOW_MS = 10*60*1000` (10 min), budget `RATE_MAX_REQUESTS = 20` per window.
- `getClientIp(req)` prefers `x-forwarded-for` first entry, then `x-real-ip`, then `socket.remoteAddress` / `req.ip` / `x-vercel-forwarded-for`, else `"unknown"` (`gemini.ts:30-60`).
- `isRateLimited(ip)` → `recent = timestamps.filter(t => now - t < RATE_WINDOW_MS)`; if `recent.length >= 20` → deny (counts stored even on deny); else push `now`. `rateLimitStore.size>1000` triggers full sweep GC pruning empty buckets (`gemini.ts:72-78`).
- On denial returns `429 {error:"Too many requests — please wait a moment…", retryAfter:60}` (`gemini.ts:148-152`). Client maps any `429` to the shared banner copy (see §3.5). Note: `api/gemini.ts` also retries internally for **5xx** only (`gemini.ts:309-315` with `backoffs [1000,3000]` and 30 s abort timeout) — `429` is **not** retried server-side; it is surfaced.

### 3.5 Data Portability & Local Memory (`App.tsx` fingerprint → `localStorage` → `Sparkline`)

**Location:** `App.tsx:32-45`, `404-451` (persistence), `54-92` (Sparkline/DimBar), `123-349` (HistoryPanel), `342-376` (types), `types.ts:25-38`.

**Fingerprinting:** `simpleHash(str)` (`App.tsx:32-40`) is a 32-bit rolling `(hash<<5)-hash + charCode`, `|0` then `Math.abs(...).toString(36)`; `computeFingerprint(milestones)` (`App.tsx:42-45`) joins `milestones.map(m=>m.text).join("|")` and hashes. Stored as `HistoryEntry.fingerprint: string` (`App.tsx:25`). Migration path at load (`App.tsx:411-423`) synthesizes missing `details[].sub_score/max_score/is_factually_correct` when absent (legacy history).

**Stacking attempts & sparklines:**
- On each new `combinedResult` (once, when `!hasSaved`), `App.tsx:648-686` computes `finalScore`, `fingerprint`, then `priorSameFp = historyEntries.filter(e=>e.fingerprint===fingerprint)` and `priorSuccessCount = priorSameFp.filter(e=>e.finalScore>=80).length`. Uses this to extend spaced-repetition interval (see next) and to stack attempts.
- History read: `useEffect` on mount `localStorage.getItem("feynmanbox_history")` → parse JSON → migrate → `setHistoryEntries` (`App.tsx:404-437`). Write path `persistHistory(entries)` (`App.tsx:439-451`): `JSON.stringify` to `localStorage`; on `QuotaExceededError` prunes to `entries.slice(-10)` and retries with `alert("Your history storage was full…")`. `handleClearHistory`, `handleExportHistory` (Blob `application/json` → `URL.createObjectURL` → `a.download = feynmanbox-history-YYYY-MM-DD.json`), `handleImportHistory` (file.text → JSON.parse → `isValidHistoryEntry` + `existingIds` dedupe + `QuotaExceededError` handling) all operate client-side (`App.tsx:901-986`).
- Rendering: `HistoryPanel` groups entries by fingerprint via `Map<string,HistoryEntry[]>` (`App.tsx:214-318`). Per group, sorts by `date`, derives `scores = sorted.map(e=>e.finalScore)`. `showSparkline = sorted.length>=2` renders chip `Attempt 1→2→3: N→M→P` and `<Sparkline scores>` (`App.tsx:221-234`). `Sparkline` (`App.tsx:54-80`) is pure SVG 120×32 mapping 0–100 linearly (`stepX = (width-8)/(n-1)`, `y = height-4 - (score/range)*(height-8)`) with `polyline stroke #C9962C` + per-point `circle r2.5`.

**Spaced repetition / local memory bonus:** Interval derived from `finalScore` baseDays (`>=80:7, >=50:2, else 1`) multiplied by `1.5^priorSuccessCount` (`App.tsx:656-659`), then `nextReviewDate = today + round(intervalDays)` stored on the entry — used to show "Due for review" banner when `nextReviewDate≤now` (`App.tsx:239-255`, `App.tsx:256`).

### 3.6 Demo Mode Override (Early-Return Fencing)

**Location:** `src/lib/security.ts:19-26` (`isDemoMode`), `src/lib/demoFixtures.ts:1-150`, call sites in `milestoneService.ts:13-21`, `transcriptionService.ts:8-11`, `combinedEvaluationService.ts:55-58`, `followUpService.ts:19,92`, `App.tsx:402,1015`.

**Mechanism:** `isDemoMode() = typeof window!=='undefined' && new URLSearchParams(window.location.search).has("demo")` (`security.ts:20-26`). Returns true on presence of the param (value ignored; `?demo=true` is the documented trigger but `?demo` or `?demo=1` also match). On true, every network-dependent service **early-returns before fetch** with typed fixtures:
- `generateMilestones` → `{success:true, milestones: DEMO_MILESTONES cloned, subjectDomain: "technical"}` (`milestoneService.ts:13-21`) (5 BST milestones 1:1 from `demoFixtures.ts:7-48`).
- `transcribeAudio` → `DEMO_TRANSCRIPT` (`transcriptionService.ts:8-11`) — polished ~100-word BST paragraph with `because/therefore/so` (`demoFixtures.ts:50-51`).
- `evaluateCombined` → `demoEvaluationResult()` (`combinedEvaluationService.ts:55-58`) = 72/100 coverage, 100 factual, 70 reasoning, 75 clarity, 4/5 covered, remediation pointer, acoustic `WPM138, pause3, variance46, duration22s` (`demoFixtures.ts:55-134`).
- `generateFollowUpPair` → `demoFollowUpPair()` and `checkFollowUpAnswer` → `demoFollowUpCheck()` (`followUpService.ts:19,92`).
- UI: `App.tsx:402 const demoMode=isDemoMode()` → banner (`App.tsx:1015-1020`) described in §2.1. No API key required; full flow (upload → record → results → follow-up → export/history) exercisable offline.

---

## 4. COMPREHENSIVE USER COPY & LEXICON AUDIT

> All verbatim strings that a learner, assistive device, or tester encounters. Grouped by surface class. Every item is supportive / descriptive, never accusatory — gaming detections are phrased as "Explanation pattern noted" / "reads as a list without connecting them."

### 4.1 Static Instructional Headings & Labels (`label-tag` and serif titles)
- `App.tsx:1013` "Oral examination — bluff detection"
- `DocumentUpload.tsx:59` "Context Anchor" / `DocumentUpload.tsx:61` "Lecture Notes Input"
- `App.tsx:643` "Review Key Concepts" / `App.tsx:1213` "Before you record — what you'll be tested on" / mono `App.tsx:1214` "You can edit the wording or remove any concept … Core concepts weigh more than supporting ones."
- `VoiceRecorder.tsx:642` "Voice Testimony" / chip `VoiceRecorder.tsx:643` "Microphone Input"
- `VoiceRecorder.tsx:655` "System Ready — Press button to initiate active recording" (idle chip — sharp-gated recorder)
- `VoiceRecorder.tsx:702` "Live Signal" / checkbox label `VoiceRecorder.tsx:694` "Show live preview: On/Off"
- `VoiceRecorder.tsx:702-703` box tags "Signal Active", "Live preview — approximate"
- `App.tsx:1046` stats/indicators "Generating key concepts…" / "Processing \"…\"…" / "Notes ready — …"
- Results: `App.tsx:1355` "Combined Evaluation", chip `App.tsx:1358` "Evaluating as: Technical/Narrative content", confidence pill `App.tsx:1364-1365` "Confidence: high/moderate/low", `App.tsx:1371` "Final Score /100" + explanatory `App.tsx:1375` "Final N/100 combines four dimensions (40% coverage · 20% factual · 20% reasoning · 20% clarity)…", `App.tsx:1385` coverage trace `Coverage N/100 = sum of sub/max … inspectable per-concept below`
- Dimensions: `App.tsx:1391` "Evaluation Dimensions" / bars `App.tsx:1392-1395` "Concept Coverage / Factual Accuracy / Reasoning Quality / Communication Clarity" + legend `App.tsx:1396-1397` "Coverage = which concepts you addressed. Factual = whether correct (checked against source)…"
- Summaries: `App.tsx:1412` "Summary" (per-concept reasoning) and `App.tsx:1537` "Clarity & Coherence (thematic/causal)"
- Breakdown sections: `App.tsx:1430` "What you understood well — covered", `App.tsx:1473` "What you missed or need to revisit — to review", `App.tsx:1513` "Per-Concept Breakdown (traceable)" / row tags `App.tsx:1520` `core`/`sup` + `Total Coverage`, `App.tsx:1554` "Speech Analysis (supplementary)" + stats `Pace: … WPM • … / Pitch variance`, disclaimer `App.tsx:1572-1574`
- Follow-ups: `App.tsx:1614` "Examiner's Follow-Up" / `App.tsx:1625` "Strengthen a Gap" + chip `App.tsx:1627` "Remediation — reflection only, not re-graded" / `App.tsx:1670` "Apply What You Know" + `Transfer question — can you apply …`
- Export: `App.tsx:112` `ExportFeature.tsx:113` "Export Case File" / `ExportFeature.tsx:115` "Study Card Generation" + `App.tsx:117-119` "Save your key concepts and personal explanations as study cards for later review and practice."
- History modal: `App.tsx:189` "Session History" / `App.tsx:202` "Stored locally in your browser" / grouped sparkline caption `App.tsx:230` "Attempt 1→2→3: …"
- App-global via `App.tsx:1011-1014` footer/tagline & `App.tsx:1736` details summary "How this works" with body (`App.tsx:1738-1739` / `App.tsx:1600-1601`) "One structured AI call evaluates concept coverage, explanation clarity, and detects keyword-gaming simultaneously — reducing latency and API usage compared to running these as separate sequential calls… Document parsing, audio capture, and waveform visualization all run in the browser."

### 4.2 Instructional Body Copy (paragraph / micro-copy)
- `DocumentUpload.tsx:90-92` "Drop your notes here / or click to browse — PDF, DOCX, TXT" + "Maximum file size: 10MB"
- `DocumentUpload.tsx:116-117` status "Processing your notes… / Generating key concepts… / Notes ready"
- `DocumentUpload.tsx:130-131` toggle "Or paste notes instead → / Hide paste option" + textarea placeholder `DocumentUpload.tsx:141` "Paste your lecture notes, article excerpt, or study material here…"
- `VoiceRecorder.tsx:644-649` idle paragraphs: "Explain your understanding of the key concepts aloud. The system will transcribe and analyze… Press Start Recording when you're ready — you'll be asked for microphone permission, then speak clearly."
- `VoiceRecorder.tsx:676` sharp button footer "Microphone not yet active — no capture until you press the button above." + conditional low-end note `VoiceRecorder.tsx:678-679` "Live preview disabled by default on this device for performance. You can enable it during recording."
- `VoiceRecorder.tsx:738-739` live box empty state "Listening… approximate captions will appear here." + fallback `VoiceRecorder.tsx:738-741` rendering `livePreview` + italic `liveInterim`
- `VoiceRecorder.tsx:742` "Speak clearly — your audio is being captured continuously."
- `VoiceRecorder.tsx:754-757` transcribing "Transcribing your explanation… / This usually takes a few seconds."
- `VoiceRecorder.tsx:770` review subtitle "Fix any errors before evaluation" + placeholder `VoiceRecorder.tsx:778` "Your transcript will appear here…"
- Results conditional guidance: `App.tsx:1405-1407` low-confidence "Evaluation confidence: Low — this explanation was brief or ambiguous; consider re-recording…" / when `!isMastered && !gaming` `App.tsx:1580-1583` "Keep refining your explanation. Try to link each concept with clear cause-and-effect…"
- Mastery line `App.tsx:1586` "Your explanation demonstrates strong coverage and clear reasoning."
- Speech dynamic help: `App.tsx:1561-1573` qualifiers `unusually fast / slow / natural`, `flat, may indicate reading / expressive / moderate`, and hedging `"Very fast speech with minimal pauses may suggest rehearsed recitation, but this is only a weak hint — it never lowers your coverage or factual scores." / "Natural pacing… consistent with genuine explanation." / "These are supplementary observations about delivery style, not a measure of understanding. Pace and pauses vary naturally…"`
- Follow-up helpers: textarea placeholder `App.tsx:1636` "Type a brief reflection…" / transfer footer `App.tsx:1676` "Reflection only — not scored." / check footnote `App.tsx:1663` "This is a supplementary check only — it does not change your original overall score." / saved state `App.tsx:1690` "Not re-graded — for your reflection only." / skipped `App.tsx:1714` "Follow-up skipped."
- How-it-works details: `App.tsx:1598-1603` / `App.tsx:1738-1739` already cited.

### 4.3 Buttons & Controls (CTAs)
- Upload: `DocumentUpload.tsx:150` "Use Pasted Notes" (disabled style when empty)
- App flow: `App.tsx:1193` "Continue to Recording — N document(s) ready" / `App.tsx:1257` "Start Recording — N concept(s)" / **sharp gate** `VoiceRecorder.tsx:684` "Start Recording Capture" → active `VoiceRecorder.tsx:745` "Stop Recording"
- Recorder review: `VoiceRecorder.tsx:798` "Confirm & Evaluate" (disabled `opacity-40` when empty) + `VoiceRecorder.tsx:804` "Re-record" (`btn-ghost`) + `VoiceRecorder.tsx:671` rate-limited "Retry Request" via `<RateLimitAlert>` and non-rate `VoiceRecorder.tsx:814` "Clear error"
- Doc error: non-429 `App.tsx:1052` "Try again" + `App.tsx:1055` "Back to notes" + override `App.tsx:1065` "Continue anyway" (or "Working…")
- Evaluation error: non-429 `App.tsx:1305` "Try again" (cooldown → "Please wait…") + `App.tsx:1309` "Edit Transcript"; 429 branch uniformly `RateLimitAlert.tsx:27` "Retry Request" (`retrying` → `Please wait…`) for milestone, transcription, and evaluation paths; also follow-up `App.tsx:1659` "Try again"/"Checking…", remediation row `App.tsx:1641` "Skip", `App.tsx:1644-1647` "Check my answer"/"Checking…", `App.tsx:1648` "Save reflection", skipped `App.tsx:1716` "Show questions again".
- History: `App.tsx:323-341` "Export History", "Import History" (input `accept=.json`), "Clear History", `App.tsx:192-199` close `×` with `aria-label="Close history"`.
- Navigation after error/result: `App.tsx:1339-1342` "Back to transcript" (chevron left), `App.tsx:621` recorder's "Back to notes" similarly.

### 4.4 ARIA Labels, Roles, Tooltips & Accession Text
- `DocumentUpload.tsx:67` dropzone explicit `aria-label="Upload document — PDF, DOCX or TXT, maximum 10MB. Click to browse or drag and drop."` + `role="button" tabIndex=0` + `onKeyDown Enter/Space → click` (`DocumentUpload.tsx:48-52,74-77`) + `focus:ring-2 focus:ring-brass` visible focus.
- Hidden input `DocumentUpload.tsx:101` `aria-hidden="true" tabIndex=-1` + `sr-only` class, labelled by dropzone; paste textarea has `DocumentUpload.tsx:136` `label[for=paste-notes] sr-only "Paste your lecture notes"` + explicit `id="paste-notes"`.
- Title composition per `index.css:30-32` `.label-tag = font-mono text-xs uppercase tracking-widest text-parchment-muted` is applied consistently to every small header, never icon-only.
- `VoiceRecorder.tsx:773-781` transcript textarea has `aria-label="Edit transcript"` + `placeholder="Your transcript will appear here…"`; follows editing.
- `VoiceRecorder.tsx:539` / `App.tsx:620` back links use chevron SVG with textual label "Back to notes / Back to transcript" (not icon-only).
- `App.tsx:98-118` `HeaderBar` buttons have `aria-label="New Session"/"History"` + native `title`; keyboard reachable.
- `App.tsx:107-111` generic error banner (`DocumentUpload` via `role="alert"`) announces filings.
- `App.tsx:136-186` `HistoryPanel` dialog has `role="dialog" aria-modal="true" aria-labelledby="history-title"`, close button `ref=closeButtonRef aria-label="Close history"` with `Escape` handler + focus trap ping-pong (`Tab`/`Shift+Tab` wrapping, `App.tsx:139-174`), and deliberately traps `body.overflow=hidden` during open.
- Polygraph SVG and decorative icons (`DocumentUpload` upload icon, sparkline dots, header spacers) are marked `aria-hidden="true"` (`DocumentUpload.tsx:82`, `RateLimitAlert.tsx` dot, etc.) and are non-focusable.

### 4.5 Error / Edge-Case Messages (tone-checked)
All errors use `We couldn't… Please try…` or `Too many requests…` — no blame, no accusation:
- `DocumentUpload.tsx:25` size guard: "File is too large (X.MB). Maximum size is 10MB."
- `App.tsx:455` empty text: "No readable text found. Please try another file or paste your notes."
- `milestoneService.ts:138` content guard rejection: "This doesn't look like explanatory teaching content to us — … If you believe this is valid material, you can continue anyway." (also `milestoneService.ts:170` mirrored, shown in `App.tsx:1065` "Continue anyway")
- `milestoneService.ts:177-179` no concepts: "We couldn't extract any key concepts … Please try a different document or add more detail." / fallback `milestoneService.ts:196` vs `App.tsx:465-482` accordingly.
- Generic service failures: `milestoneService.ts:101-103` "We couldn't prepare your key concepts (server ${status})…" / `transcriptionService.ts:58-60` "We couldn't transcribe your audio…" / `combinedEvaluationService.ts:195-198` "We couldn't complete the evaluation…" — always with `(server ${status})` detail only for `>=500`.
- Worker timeout: `fileExtractor.ts:28` "File parsing timed out. Please try a smaller file."
- Unsupported type: `fileExtractor.ts:106` / `fileParser.worker.ts:57` "Unsupported file type. Please upload PDF, DOCX, or TXT."
- Empty docx/pdf: `fileExtractor.ts:76` / `fileParser.worker.ts:43` "No readable text found in the PDF. It may be a scanned image." / docx equivalent.
- Microphone: `VoiceRecorder.tsx:499` "Microphone access was denied. Please allow microphone permission and try again." / generic `VoiceRecorder.tsx:501` "We couldn't transcribe…", empty speech `transcriptionService.ts:70` "No speech was detected. Please try recording again."
- Short audio: `VoiceRecorder.tsx:432` "No audio captured. Please try again and speak clearly."
- Storage: `App.tsx:446` quota prune alert "Your history storage was full, so older sessions were removed … Consider exporting…"
- Rate-limit **shared** copy (rate-limited three planes via `RateLimitAlert.tsx:19`): **"System Request Threshold Exceeded — This occurs when multiple client iterations run simultaneously on the same local network footprint. Please pause for 60 seconds before re-submitting current state."** — dark-red flagged banner (not accusatory; explains local-network IP sharing). Embedded footnote in evaluation error path `App.tsx:1312` "Cooling down — please wait a moment…" and transcription `VoiceRecorder.tsx:616` follow-up hint.
- Follow-up / check: `App.tsx:1698-1700` follow-up error `border-brass` / flagged variant + "You can still review your results above — this section will remain visible." ; check success `App.tsx:1654` `✓ Now correctly explained` else missing message; all explicitly `supplementary check only`.
- History: `App.tsx:210` empty `No sessions yet. Complete an evaluation…` / import outcomes `App.tsx:981-982` `Imported N, skipped M…` / zero-import `No new entries…` / `App.tsx:944` alert `Your history storage was full…`.

**Lexicon conclusion:** Every heading, tip, ARIA label, and banner was captured above (70+ unique strings). Tone is uniformly **supportive, procedural, non-accusatory**: failures are attributed to system capacity, content shape, or permissions, never to the learner; gaming is described as an "observed pattern" with remediation prompts rather than accusations.

---

## 5. DEPENDENCY INVENTORY & COMPILATION STATE

### 5.1 Core Package Inventory (`package.json:14-21` — 7 runtime deps)

| Package | Version constraint | Deployment role & actual usage in layout |
|---|---|---|
| `react` | `^19.2.8` | UI framework — used by `src/App.tsx`, `src/main.tsx:2-8`, `DocumentUpload.tsx`, `VoiceRecorder.tsx`, `ExportFeature.tsx`, `RateLimitAlert.tsx`, `HistoryPanel/Sparkline/DimBar`. `StrictMode` root in `main.tsx`. No class components. |
| `react-dom` | `^19.2.8` | Renderer — only `main.tsx:2,6` (`createRoot(document.getElementById('root')).render(<StrictMode><App/>)`). |
| `pdfjs-dist` | `^6.2.108` | Client PDF parser — imported by `fileExtractor.ts:1` and `fileParser.worker.ts:1` (`* as pdfjsLib`), worker URL via Vite `?url` (`fileParser.worker.ts:3`), `getDocument({data:buf})` → per-page `getTextContent()`. Bundled as `pdf.worker-CLesOks4.mjs` (~2.2 MB pre-gzip, 252 kB-like chunk when extracted) — broken into dedicated chunk `dist/assets/pdf.worker-*.mjs`. |
| `mammoth` | `^1.12.1` | DOCX parser — imported as `mammoth` in both extractor paths (`fileExtractor.ts:2` / `fileParser.worker.ts:2`), entry `mammoth.extractRawText({arrayBuffer})`. Used only on `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. |
| `tailwindcss` | `^3.4.19` | Utility runtime — content globs `index.html, src/**/*.{js,ts,jsx,tsx}` (`tailwind.config.js:3-6`). Theme tokens `ink/ink-light/ink-border`, `parchment/parchment-muted`, `brass/brass-dark/brass-light`, `verified #5A9B6F`, `flagged #E06A5E`, fonts `Fraunces, Inter, JetBrains Mono`, radius `panel:4px`. Outputs `index.css:12-32` utilities (`panel, btn-primary, btn-brass-sharp, btn-ghost, score-display, label-tag`) + manual `.polygraph-grid, .waveform-line, @keyframes waveShift/progress-slide/fadeIn` (`index.css:35-86`). |
| `postcss` | `^8.5.26` | Build-time CSS pass — configured implicitly via `postcss.config.js` (present in repo); Tailwind + autoprefixer pipeline feeding `vite build`. |
| `autoprefixer` | `^10.5.4` | Build-time autoprefixer — required peer of `postcss`/`tailwindcss`, applied by PostCSS chain; no runtime import. |

Dev-equipped chain completes the layout: `vite@^8.2.2` + `@vitejs/plugin-react@^6`, `typescript@~6.0.2` (`tsc -b` via `tsconfig.app.json / tsconfig.json`), `oxlint@^1.79.0` (`lint`), `@types/react`, `@types/react-dom`, `@types/node`.

### 5.2 Compilation State (verified — no writes)

**`npx tsc -b`** (2026-08-29, committed tree): exits with **zero diagnostics** (no output to stderr/stdout — clean).

**`npm run build` ≡ `tsc -b && vite build`** (fresh run `10.11 s` as captured from the 2026-08-29 post-push trace — same output re-validated read-only here):
```
vite v8.2.2 building client environment for production...
✓ 312 modules transformed.
rendering chunks...
dist/index.html                          0.82 kB │ gzip: 0.44 kB
dist/assets/index-8dZGqJwj.css          19.29 kB │ gzip: 4.59 kB
dist/assets/index-CwMquai-.js           301.74 kB │ gzip: 88.74 kB
dist/assets/fileExtractor-Df0-Za_y.js   925.88 kB │ gzip: 252.95 kB
dist/assets/fileParser.worker-D8CLzYKu.js 927.06 kB
dist/assets/pdf.worker-CLesOks4.mjs    2222.99 kB
✓ built in 10.11s
```
CSS remains **tightly compiled** (19.29 kB → 4.59 kB gz). Dynamic imports resolve cleanly: `fileExtractor` async chunk and `fileParser.worker` both code-split; warnings only about `chunk >500 kB post-minification` (pre-existing — `pdf.worker` and `fileExtractor`/`fileParser.worker` individually bundle `pdfjs-dist` + `mammoth`). All hooks closed: `useState/useEffect/useRef` in `App.tsx` and `VoiceRecorder.tsx` resolve under static conditions; `MediaRecorder`/`AudioContext`/`SpeechRecognition` vendor prefixes guarded (`VoiceRecorder.tsx:64-67`, `340-349`).

**Last committed delta (read-only check):** `git show --stat 447ae17`: 4 files changed, `+107 -52`, adding `src/components/RateLimitAlert.tsx` and amending `src/App.tsx`, `src/components/VoiceRecorder.tsx`, `src/index.css` — which correspond exactly to Phases 18/20 gating, 429 hardening, and header viewport fixes described above — all without breaking build.

---
*End of system blueprint — generated as `docs/SYSTEM_BLUEPRINT.md`. For evidence re-check, run locally: `npx tsc -b && npm run build` and diff against the benchmarks above.*
