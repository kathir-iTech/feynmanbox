# COPY_AUDIT.md — FeynmanBox Full User-Facing String Inventory

> Generated: 2026-08-27
> Scope: Entire codebase — `src/App.tsx`, `src/components/*`, `src/lib/*` error messages, inline UI copy, tooltips, aria-labels, and screen-reader-only text.
> Every string a user could see is listed with the exact file and line number it comes from.
> Line numbers reflect the commit at audit time; after fixes are applied line numbers may shift by a few lines.

---

## 1. Landing / Upload Screen

### Header (always visible)

| String | File:Line |
|---|---|
| `FeynmanBox` | `src/App.tsx:961` |
| `It doesn't test what you remember. It tests if you can explain it.` | `src/App.tsx:964` |
| `Oral examination — bluff detection` | `src/App.tsx:966` |
| `Demo mode — offline fixtures, no network` | `src/App.tsx:970` |
| `Catches the illusion of competence — when reciting keywords feels like understanding, but isn't.` | `src/App.tsx:1015` |

#### HeaderBar controls

| String | File:Line |
|---|---|
| `New Session` (button `aria-label` + `title`) | `src/App.tsx:99-100` |
| `History` (button `aria-label` + `title`) | `src/App.tsx:109-110` |

### DocumentUpload component

| String | File:Line |
|---|---|
| `Context Anchor` | `src/components/DocumentUpload.tsx:59` |
| `Lecture Notes Input` | `src/components/DocumentUpload.tsx:61` |
| `Upload document — PDF, DOCX or TXT, maximum 10MB. Click to browse or drag and drop.` (button `aria-label`) | `src/components/DocumentUpload.tsx:67` |
| `Drop your notes here` | `src/components/DocumentUpload.tsx:99` |
| `or click to browse — PDF, DOCX, TXT` | `src/components/DocumentUpload.tsx:100` |
| `Maximum file size: 10MB` | `src/components/DocumentUpload.tsx:102` |
| `File is too large (X.XMB). Maximum size is 10MB.` | `src/components/DocumentUpload.tsx:25` |
| `Paste your lecture notes` (label `sr-only`) | `src/components/DocumentUpload.tsx:135` |
| `Paste your lecture notes, article excerpt, or study material here...` (textarea `placeholder`) | `src/components/DocumentUpload.tsx:140` |
| `Use Pasted Notes` (button) | `src/components/DocumentUpload.tsx:149` |
| `Or paste notes instead →` (toggle) | `src/components/DocumentUpload.tsx:129` |
| `Hide paste option` (toggle when open) | `src/components/DocumentUpload.tsx:129` |
| `Processing your notes...` | `src/components/DocumentUpload.tsx:116` |
| `Generating key concepts...` | `src/components/DocumentUpload.tsx:116` |
| `Notes ready` | `src/components/DocumentUpload.tsx:116` |

### UploadedDocs / Continue gate (`App.tsx` when `!hasDocument && uploadedDocs.length>0`)

| String | File:Line |
|---|---|
| `Processed Documents (N)` | `src/App.tsx:1019` |
| `ready` (per-doc badge) | `src/App.tsx:1034` |
| `error` (per-doc badge) | `src/App.tsx:1034` |
| `extracting...` (per-doc badge) | `src/App.tsx:1034` |
| `Remove {fileName}` (button `aria-label`) | `src/App.tsx:1038` |
| `{fileName}: {error}` (per-file error line) | `src/App.tsx:1054` |
| `N ready` / `N ready, M extracting` / `N ready, M failed` (summary) | `src/App.tsx:1059-1067` |
| `Continue to Recording — N document(s) ready` (primary button) | `src/App.tsx:1072-1074` |
| `Add a document with readable text to continue.` | `src/App.tsx:1078` |
| Generic inline error `{documentError}` (flagged box) | `src/App.tsx:1081` |

### HasDocument status bar (visible once file received)

| String | File:Line |
|---|---|
| `Processing "{fileName}"...` | `src/App.tsx:988` |
| `Generating key concepts...` | `src/App.tsx:990` |
| `Notes ready — {fileName}` | `src/App.tsx:992` |
| `Error processing notes` (fallback when no `documentError`) | `src/App.tsx:993` |
| `Try again` (when `documentStatus==="error"`, non-override) | `src/App.tsx:997` |
| `Continue anyway` | `src/App.tsx:1006` |
| `Working...` (override in-flight label, same button) | `src/App.tsx:1006` |

---

## 2. Content-Quality Guard Rejection

> Guard is implemented in `src/lib/milestoneService.ts:131-143` and surfaced via `App.tsx` status bar / error states. Two paths: "Try again" (re-run) and "Continue anyway" (override).

| String | File:Line |
|---|---|
| `This doesn't look like explanatory teaching content to us — {reason}. If you believe this is valid material, you can continue anyway.` | `src/lib/milestoneService.ts:138` + `src/lib/milestoneService.ts:170` (identical variant for empty-milestone+reason) |
| `We couldn't extract any key concepts from those notes. Please try a different document or add more detail.` | `src/lib/milestoneService.ts:180` (also `src/App.tsx:461` when empty) |
| `We couldn't interpret the result. Please try again.` | `src/lib/milestoneService.ts:197` |
| `We couldn't prepare your milestones. Please try again.` (generic catch in `processNotesToMilestones`) | `src/App.tsx:475` |
| `Pasted text is empty.` | `src/App.tsx:510` |
| `Please add at least one document with readable text before continuing.` | `src/App.tsx:528` |
| `We couldn't extract concepts from that material.` (override failure) | `src/App.tsx:560` |
| `No readable text found. Please try another file or paste your notes.` | `src/App.tsx:450` |
| `We couldn't complete the request.` / `We couldn't complete the request. Please try again.` | `src/App.tsx:483`, `src/App.tsx:565` |
| Button labels for this state: `Try again` (`src/App.tsx:997`) and `Continue anyway` / `Working...` (`src/App.tsx:1006`) | see above |

**Behavior notes (verified in code):**

* `Try again` → `handleRetryContentGuard` (`src/App.tsx:573`) re-runs `processNotesToMilestones(combined)` from the SAME already-extracted `uploadedDocs` — does NOT reset to empty upload screen. Accurate label.
* `Continue anyway` → `handleOverrideContentGuard` (`src/App.tsx:542`) calls `generateMilestones(combined, {override:true})`, skipping the guard.

---

## 3. Milestone Review Screen

> Shown when `hasDocument && !milestonesConfirmed && milestones.length>0 && documentStatus==="ready"` — `src/App.tsx:1087`.

| String | File:Line |
|---|---|
| `Review Key Concepts` (h2) | `src/App.tsx:1091` |
| `Before you record — what you'll be tested on` (label) | `src/App.tsx:1093` |
| `You can edit the wording or remove any concept you don't think is fair game. Core concepts weigh more than supporting ones.` | `src/App.tsx:1094` |
| `{idx+1}.` (number prefix) | `src/App.tsx:1098` |
| `Edit concept {idx+1}` (textarea `aria-label`) | `src/App.tsx:1109` |
| `Supporting concept` (tag when `importance==="supporting"`) | `src/App.tsx:1112` |
| `Core concept` (tag when `importance==="core"`) | `src/App.tsx:1112` |
| `Remove concept {idx+1}` (`aria-label`) / `At least one concept is required` / `Remove concept` (`title`) | `src/App.tsx:1121-1122` |
| `Start Recording — N concept(s)` (primary button) | `src/App.tsx:1137` |

**Notes on terminology:** Internal type is `Milestone` (`src/types.ts:5`) but every user-visible label on this screen uses `concept` / `Key Concepts`. The label is consistent within this screen.

---

## 4. Recording Screen

All states of `src/components/VoiceRecorder.tsx` (rendered via `App.tsx:1143` with `autoStart`).

### 4a. Unsupported browser

| String | File:Line |
|---|---|
| `Audio recording isn't supported in this browser. Please try Chrome or Edge for the best experience.` | `src/components/VoiceRecorder.tsx:596` |

### 4b. Idle / Pre-recording (`!isRecording && !isTranscribing && !hasRecording`)

| String | File:Line |
|---|---|
| `Back to notes` (button, when `onBack` and not capturing) | `src/components/VoiceRecorder.tsx:592` |
| `Voice Testimony` (h2) | `src/components/VoiceRecorder.tsx:604` |
| `Microphone Input` (label) | `src/components/VoiceRecorder.tsx:606` |
| `Explain your understanding of the milestones aloud. The system will transcribe and analyze your explanation for coverage and coherence.` | `src/components/VoiceRecorder.tsx:608-609` |
| `{error}` error box (when set) | `src/components/VoiceRecorder.tsx:613` |
| `Begin Recording` (primary button) | `src/components/VoiceRecorder.tsx:617` |
| `Live preview disabled by default on this device for performance. You can enable it below.` (shown when `isLowEndDevice`) | `src/components/VoiceRecorder.tsx:620` |

### 4c. Recording (`isRecording===true`)

| String | File:Line |
|---|---|
| `Recording` (h2) | `src/components/VoiceRecorder.tsx:629` |
| `M:SS` timer (`formatTime(recordingTime)`) | `src/components/VoiceRecorder.tsx:630` |
| `Live Signal` (label) | `src/components/VoiceRecorder.tsx:633` |
| `Show live preview: On` / `Show live preview: Off` (checkbox label) | `src/components/VoiceRecorder.tsx:636` |
| `Signal Active` (waveform header) | `src/components/VoiceRecorder.tsx:643` |
| `Live preview — approximate` (when `showLivePreview`) | `src/components/VoiceRecorder.tsx:671` |
| `{livePreview} {liveInterim}` (live captions) | `src/components/VoiceRecorder.tsx:674` |
| `Listening… approximate captions will appear here.` (empty live-preview placeholder) | `src/components/VoiceRecorder.tsx:679` |
| `Speak clearly — your audio is being captured continuously.` | `src/components/VoiceRecorder.tsx:683` |
| `Stop Recording` | `src/components/VoiceRecorder.tsx:687` |

### 4d. Transcribing (`isTranscribing===true`)

| String | File:Line |
|---|---|
| `Transcribing your explanation...` | `src/components/VoiceRecorder.tsx:697` |
| `This usually takes a few seconds.` | `src/components/VoiceRecorder.tsx:698` |

### 4e. Transcript review (`!isRecording && !isTranscribing && hasRecording===true`)

| String | File:Line |
|---|---|
| `Review Your Transcript` (h2) | `src/components/VoiceRecorder.tsx:709` |
| `REVIEW YOUR TRANSCRIPT` (label) | `src/components/VoiceRecorder.tsx:711` |
| `Fix any errors before evaluation` | `src/components/VoiceRecorder.tsx:712` |
| `Your transcript will appear here…` (textarea `placeholder`) | `src/components/VoiceRecorder.tsx:719` |
| `Edit transcript` (textarea `aria-label`) | `src/components/VoiceRecorder.tsx:720` |
| `Speech Analysis (preview)` (when `pendingMetrics`) | `src/components/VoiceRecorder.tsx:724` |
| `Pace: {wpm} WPM • Pauses: {n} ({s}s) • Pitch variance: {score}/100` | `src/components/VoiceRecorder.tsx:727` |
| `{error}` transcription error box (when present) | `src/components/VoiceRecorder.tsx:734` |
| `Confirm & Evaluate` (primary, disabled when empty) | `src/components/VoiceRecorder.tsx:744` |
| `Re-record` (ghost) | `src/components/VoiceRecorder.tsx:749` |

### 4f. Transcription / recording error states (exact verbatim)

| String | File:Line |
|---|---|
| `No audio captured. Please try again and speak clearly.` | `src/components/VoiceRecorder.tsx:430` |
| `Microphone access was denied. Please allow microphone permission and try again.` (`NotAllowedError`) | `src/components/VoiceRecorder.tsx:496` |
| `Microphone access denied.` (generic fallback, shown as-is) | `src/components/VoiceRecorder.tsx:498` |
| `No speech was detected. Please try recording again.` (`src/lib/transcriptionService.ts`) | `src/lib/transcriptionService.ts:71` |
| `We couldn't transcribe your audio (server {status}). Please try again shortly.` (5xx) | `src/lib/transcriptionService.ts:58` |
| `We couldn't transcribe your audio. Please try again.` (generic) | `src/lib/transcriptionService.ts:60`, `src/lib/transcriptionService.ts:66` |
| `Too many requests — please wait a moment before trying again.` (429) | `src/lib/transcriptionService.ts:55` |
| `Failed to encode audio.` (`blobToBase64`) | `src/lib/transcriptionService.ts:85` |
| `Failed to read audio.` | `src/lib/transcriptionService.ts:90` |
| `Try again` (when `!hasRecording && error` — post-failure reset) | `src/components/VoiceRecorder.tsx:756` |

---

## 5. Transcript Review Screen

> There is no longer a separate App-level transcript review screen (removed in Bug 4 fix — see comment `src/App.tsx:1147`). The transcript review now lives entirely inside `VoiceRecorder.tsx:705` (see §4e above). Heading/instructions/diff-view toggle/buttons from the old flow no longer appear.

| Expected (prior flow) | Current status |
|---|---|
| App-level `Review Transcript` heading | **Removed** — not in `src/App.tsx` — intentionally eliminated. |
| `Show Transcript Diff` toggle | **Not present anywhere** — removed with old flow. |
| Diff-view toggle text | N/A — feature removed. |

Active transcript review strings are in §4e. If referenced historically, the stale copy has been removed — no `Continue to Evaluation` button remains (verified via grep `rg "Continue to Evaluation"` — zero hits).

---

## 6. Evaluation Loading State

> Shown in `src/App.tsx:1162` when `hasDocument && transcript && !isEditingTranscript && milestones.length>0 && isEvaluating`.

| String | File:Line |
|---|---|
| `Analyzing your explanation...` (label) | `src/App.tsx:1168` |
| `Checking coverage and clarity in one step.` (subtext) | `src/App.tsx:1169` |

> Companion: `Analyzing your notes...` / `Preparing your key concepts — this will be ready shortly.` shown while milestones generate (`src/App.tsx:1153-1154`) — not evaluation but nearby.

---

## 7. Results Page — Every String ( `src/App.tsx:1198` when `combinedResult && !isEvaluating` )

### 7a. Header / meta

| String | File:Line |
|---|---|
| `Back to transcript` | `src/App.tsx:1207` |
| `Review Needed` (when `is_gaming_attempt`) | `src/App.tsx:1213` |
| `Mastery Achieved` (when `finalScore>=80 && !gaming`) | `src/App.tsx:1213` |
| `Evaluation Complete` (otherwise) | `src/App.tsx:1213` |
| `Combined Evaluation` | `src/App.tsx:1216` |
| `Evaluating as: Technical content` / `Evaluating as: Narrative content` (badge) | `src/App.tsx:1220` |
| `• causal logic` (technical hint) / `• thematic coherence` (narrative) | `src/App.tsx:1223` |
| `Confidence: high` / `moderate` / `low` (badge) | `src/App.tsx:1226` |

### 7b. Score labels

| String | File:Line |
|---|---|
| `Final Score` | `src/App.tsx:1232` |
| `/100` | `src/App.tsx:1233` |
| `Final {finalScore}/100 combines four dimensions (40% coverage · 20% factual · 20% reasoning · 20% clarity). See breakdown below.` | `src/App.tsx:1237` |
| `Coverage {score}/100 = sum of {sub/max + ...} — inspectable per-concept below` | `src/App.tsx:1247` |
| `Total Coverage` (breakdown table total row) | `src/App.tsx:1390` |
| `{score}/100` (total) | `src/App.tsx:1391` |

### 7c. Dimension names + explanatory tooltip text

| String | File:Line |
|---|---|
| `Evaluation Dimensions` (section h3) | `src/App.tsx:1252` |
| `Concept Coverage` (bar label) | `src/App.tsx:1253` |
| `Factual Accuracy` | `src/App.tsx:1254` |
| `Reasoning Quality` | `src/App.tsx:1255` |
| `Communication Clarity` | `src/App.tsx:1256` |
| `Coverage = which concepts you addressed. Factual Accuracy = whether what you said was correct (checked against your source material). Reasoning Quality = whether you explained WHY, not just WHAT. Clarity = how clearly you expressed it.` | `src/App.tsx:1258` |

### 7d. Summary

| String | File:Line |
|---|---|
| `Summary` | `src/App.tsx:1273` |
| `{combinedResult.summary}` (LLM-generated 1–2 sentences; demo example: `You have a solid grasp of BST ordering, search, and balancing, but you did not address deletion, which is a core concept worth reviewing.` ) | `src/App.tsx:1274` / `src/lib/demoFixtures.ts:65` |

### 7e. "What you understood / missed" headings + per-concept card labels

| String | File:Line |
|---|---|
| `What you understood well` | `src/App.tsx:1293` |
| `N • covered` (when covered) | `src/App.tsx:1294` |
| `What you missed or need to revisit` | `src/App.tsx:1336` |
| `N • to review` | `src/App.tsx:1337` |
| Per-card: `{concept text}` (h3) | `src/App.tsx:1309`, `1350` |
| Per-card badge: `{sub}/{max}` (e.g., `18/20`) | `src/App.tsx:1310`, `1351` |
| Per-card feedback: `{feedback}` | `src/App.tsx:1312`, `1353` |
| `Reasoning: {reasoning_feedback}` (when present) | `src/App.tsx:1314`, `1355` |
| `Source` (details summary) | `src/App.tsx:1318`, `1359` |
| `{source_reference}` (italic indented paragraph) | `src/App.tsx:1319`, `1360` |
| `⚠ Flagged as factually incorrect — see feedback above` (in "understood well" unexpected flag) | `src/App.tsx:1322` |
| `{sub}/{max}` in flagged style (when `!is_factually_correct`) | `src/App.tsx:1351` |
| `—` (empty checkbox dash in "missed") | `src/App.tsx:1346` |
| `Factually incorrect — {feedback}` (missed factual) | `src/App.tsx:1363` |
| Per-Concept Breakdown: `Per-Concept Breakdown (traceable)` | `src/App.tsx:1374` |
| Per-row: `core` / `sup` (importance badge) | `src/App.tsx:1381` |
| Per-row: `Concept N — {truncated}` | `src/App.tsx:1382` |
| Dot titles: `factually correct` / `factually incorrect` (`title` attr on dot) | `src/App.tsx:1385` |

### 7f. Clarity / Coherence section

| String | File:Line |
|---|---|
| `Clarity & Coherence (thematic)` (narrative) / `Clarity & Coherence (causal)` (technical) (h3, when `!is_gaming_attempt && reasoning`) | `src/App.tsx:1401` |
| `{clarity_score}/100` (in clarity header) | `src/App.tsx:1402` |
| `{reasoning}` (LLM-generated, non-accusatory, references transcript; demo: `The explanation connects ideas with causal language ...`) | `src/App.tsx:1407` / `src/lib/demoFixtures.ts:62` |

### 7g. Gaming-detected banner (full text, not summarized)

> Shown when `combinedResult.is_gaming_attempt` (`src/App.tsx:1278`).

| Piece | File:Line |
|---|---|
| `Explanation pattern noted` (banner headline, `font-bold text-flagged tracking-wide`) | `src/App.tsx:1280` |
| `{combinedResult.reasoning}` (LLM pattern description, e.g., `the explanation lists terms without connecting them`) | `src/App.tsx:1281` |
| `This explanation reads as a list of terms without connecting them — try explaining how these ideas relate to each other using words like “because,” “therefore,” and “this means.” Clarity was set to 0 for this pattern only; your coverage and factual scores still count.` | `src/App.tsx:1283` |

### 7h. Low-confidence note

| String | File:Line |
|---|---|
| `Evaluation confidence: Low — this explanation was brief or ambiguous; consider re-recording with more detail for a more reliable evaluation.` | `src/App.tsx:1266` |

### 7i. Speech Analysis section (supplementary)

> Shown when `combinedResult.acousticMetrics` exists (`src/App.tsx:1412`).

| String | File:Line |
|---|---|
| `Speech Analysis (supplementary)` | `src/App.tsx:1416` |
| `Pace:` | `src/App.tsx:1420` |
| `{wpm} WPM` | `src/App.tsx:1420` |
| `• unusually fast` (>180) / `• slow` (<100) / `• natural` (otherwise) | `src/App.tsx:1422` |
| `Pauses:` | `src/App.tsx:1425` |
| `{n} pauses` | `src/App.tsx:1425` |
| `• {s}s total` | `src/App.tsx:1427` |
| `Pitch variance:` | `src/App.tsx:1430` |
| `{score}/100` | `src/App.tsx:1430` |
| `• flat, may indicate reading` (<20) / `• expressive` (>60) / `• moderate` (otherwise) | `src/App.tsx:1431` |
| `Very fast speech with minimal pauses may suggest rehearsed recitation, but this is only a weak hint — it never lowers your coverage or factual scores.` (when `wpm>180 && pauses<2`) | `src/App.tsx:1434` |
| `Natural pacing with brief pauses for thought is consistent with genuine explanation.` (when `pauses>=2 && 120<=wpm<=160`) | `src/App.tsx:1434` |
| `Acoustic signals are supplementary — text analysis remains primary.` (fallback) | `src/App.tsx:1434` |
| `These are supplementary observations about delivery style, not a measure of understanding. Pace and pauses vary naturally by person, language background, and speaking style.` | `src/App.tsx:1435` |

### 7j. Keep refining / Mastery closers + accordions

| String | File:Line |
|---|---|
| `Keep refining your explanation. Try to link each concept with clear cause-and-effect language so your reasoning is easy to follow.` (when `!isMastered && !gaming`) | `src/App.tsx:1443` |
| `Your explanation demonstrates strong coverage and clear reasoning.` (when `isMastered`) | `src/App.tsx:1447` |
| `View transcript` (details summary) | `src/App.tsx:1452` |
| `{transcript}` (inside View transcript) | `src/App.tsx:1454` |
| `How this works` (details summary — results) | `src/App.tsx:1459` |
| `One structured AI call evaluates concept coverage, explanation clarity, and detects keyword-gaming simultaneously — reducing latency and API usage compared to running these as separate sequential calls.` | `src/App.tsx:1462` |
| `How this works` (footer when no results yet) | `src/App.tsx:1581` |
| `One structured AI call evaluates concept coverage, explanation clarity, and detects keyword-gaming simultaneously — reducing latency and API usage compared to running these as separate sequential calls. Document parsing, audio capture, and waveform visualization all run in the browser.` (footer expanded) | `src/App.tsx:1584` |

---

## 8. Follow-Up Section (Remediation + Transfer)

> Rendered when `combinedResult && !isEvaluating && !evaluationError && transcript` and there is at least one missed concept (`src/App.tsx:1468`).

### 8a. Loading

| String | File:Line |
|---|---|
| `Examiner's Follow-Up` | `src/App.tsx:1475` |
| `Preparing follow-up questions…` | `src/App.tsx:1477` |

### 8b. Remediation (gap) — main card

| String | File:Line |
|---|---|
| `Strengthen a Gap` | `src/App.tsx:1486` |
| `Remediation — reflection only, not re-graded` | `src/App.tsx:1488` |
| `{followUpPair.remediation}` (LLM question, left-border) — demo: `You mentioned deletion was unclear — can you walk through what happens when you delete a node that has two children, using the inorder successor?` | `src/App.tsx:1489` / `src/lib/demoFixtures.ts:139` |
| `Your response (optional)` (label `for="followup-answer"`) | `src/App.tsx:1491` |
| `Type a brief reflection…` (textarea placeholder) | `src/App.tsx:1497` |
| `Skip` | `src/App.tsx:1503` |
| `Check my answer` / `Checking…` | `src/App.tsx:1506` |
| `Save reflection` | `src/App.tsx:1509` |
| `✓ Now correctly explained` (when `followUpCheck.covered`) | `src/App.tsx:1516` |
| `Still missing: see below` (when `!covered`) | `src/App.tsx:1516` |
| `{followUpCheck.feedback}` | `src/App.tsx:1518` |
| `This is a supplementary check only — it does not change your original overall score.` | `src/App.tsx:1519` |

### 8c. Transfer / Application

| String | File:Line |
|---|---|
| `Apply What You Know` | `src/App.tsx:1528` |
| `Transfer question — can you apply a concept you explained well to a new situation?` | `src/App.tsx:1530` |
| `{followUpPair.transfer}` (application question) — demo: `You explained BST search well — now suppose we switched from a tree to a B-tree with nodes holding many keys; how would the 'go left or right' decision change at each node?` | `src/App.tsx:1531` / `src/lib/demoFixtures.ts:141` |
| `Reflection only — not scored.` | `src/App.tsx:1532` |

### 8d. Saved / Skipped / Error states

| String | File:Line |
|---|---|
| `Reflection Saved` | `src/App.tsx:1541` |
| `{followUpPair.remediation}` (repeated in saved view) | `src/App.tsx:1543` |
| `Your response:` | `src/App.tsx:1544` |
| `{followUpAnswer}` (whitespace-pre-wrap) | `src/App.tsx:1545` |
| `Not re-graded — for your reflection only.` | `src/App.tsx:1546` |
| `Edit response` | `src/App.tsx:1548` |
| `Follow-up questions unavailable.` | `src/App.tsx:1554` |
| `Follow-up skipped.` | `src/App.tsx:1559` |
| `Show questions again` | `src/App.tsx:1560` |
| — follow-up error path also silently hides (no extra copy): micro-check fallback `Could not verify the answer right now.` | `src/App.tsx:727` |
| Follow-up generation failure (inside `followUpService`): `Failed to generate follow-up question`, `No follow-up generated`, `Empty follow-up` — swallowed; UI shows `Follow-up questions unavailable.` | `src/lib/followUpService.ts:55,60,65` |
| Micro-check failure: `Failed to check answer`, `No check result`, `Could not verify the answer.`, `Could not verify the answer right now.` | `src/lib/followUpService.ts:121,127,137` + `src/App.tsx:727` |

---

## 9. Export Section

> Shown when `isMastered` (and `combinedResult`) — `src/App.tsx:1568` via `ExportFeature.tsx`.

| String | File:Line |
|---|---|
| `Export Case File` | `src/components/ExportFeature.tsx:114` |
| `Study Card Generation` | `src/components/ExportFeature.tsx:116` |
| `Save your milestones and personal explanations as study cards for later review and practice.` | `src/components/ExportFeature.tsx:118` |
| `Download as Markdown` | `src/components/ExportFeature.tsx:127` |
| `Download as Anki Cards (.txt)` | `src/components/ExportFeature.tsx:132` |
| `Preparing your download...` (both buttons when `downloading`) | `src/components/ExportFeature.tsx:127`, `132` |
| Markdown export internals: `Study Cards — {documentName} — {date}` heading; `Concept {idx}: {conceptText}`; `Your explanation: {feedback}`; `Status: ✅ Covered / ❌ Missed` | `src/components/ExportFeature.tsx:39-59` |
| Anki export: tab-separated `{front}\t{back}` | `src/components/ExportFeature.tsx:75` |
| Export filenames: `feynmanbox-study-cards.md`, `feynmanbox-study-cards.txt` | `src/components/ExportFeature.tsx:91,94` |

---

## 10. History Panel ( `src/App.tsx:122` `HistoryPanel` )

### 10a. Chrome

| String | File:Line |
|---|---|
| `Session History` | `src/App.tsx:189` |
| `Stored locally in your browser` | `src/App.tsx:202` |
| `Close history` (`aria-label`) | `src/App.tsx:194` |

### 10b. Empty state

| String | File:Line |
|---|---|
| `No sessions yet.` | `src/App.tsx:206` |
| `Complete an evaluation to see history here.` | `src/App.tsx:207` |

### 10c. When entries exist (grouped by fingerprint)

| String | File:Line |
|---|---|
| `Attempt 1 → 2: X → Y` (`N`→`M` and `score→score` exactly) — sparkline caption | `src/App.tsx:230` |
| Per-entry: `{locale date}` / `{finalScore}/100` | `src/App.tsx:246,250` |
| `Due for review` (badge when `nextReviewDate <= now`) | `src/App.tsx:254` |
| `Next review: {date}` / `Next review: {date} • Due for review` | `src/App.tsx:241` |
| `Narrative` (`subjectDomain==="narrative"`) / `Technical` (otherwise) (chip) | `src/App.tsx:261` |
| `Confidence: high/moderate/low` (chip) | `src/App.tsx:265` |
| `Milestones` (section h3) | `src/App.tsx:272` |
| `• {milestone.text}` (per milestone, truncated) | `src/App.tsx:275` |
| `Coverage Details` (h4) | `src/App.tsx:281` |
| Per-detail: `✓` / `—` + `{concept truncated 50}` + `…` + `sub/max` (brass) + `• factually wrong` (flagged) | `src/App.tsx:285-292` |
| `+N more` (when `details.length>3`) | `src/App.tsx:296` |
| `Speech: {wpm} WPM, {pauses} pauses` | `src/App.tsx:303` |
| `Coverage {coverageScore}%` | `src/App.tsx:307` |
| `Clarity {clarityScore}%` / `Clarity 0% (flagged)` (when gaming) | `src/App.tsx:309` |
| `Final {finalScore}%` | `src/App.tsx:311` |

### 10d. Import / Export / Clear

| String | File:Line |
|---|---|
| `Export History` | `src/App.tsx:324` |
| `Import History` | `src/App.tsx:327` |
| `Clear History` | `src/App.tsx:341` |
| `No new entries imported. Skipped {skipped} invalid or duplicate entries.` (alert) | `src/App.tsx:934` |
| `Imported {imported} entr{y|ies}, skipped {skipped} invalid or duplicate.` (alert) | `src/App.tsx:940` |
| `Failed to import history: {msg}` (alert, `Invalid file` fallback) | `src/App.tsx:942` |

> Alerts also originate from `handleClearHistory` which wipes `localStorage` silently (no confirmation message beyond removal).

---

## 11. All Error States Across Every API Call

### 11a. Milestone generation ( `src/lib/milestoneService.ts` )

| Scenario | Exact verbatim | File:Line |
|---|---|---|
| 429 rate-limit | `Too many requests — please wait a moment before trying again.` (thrown) | `98` |
| 5xx | `We couldn't prepare your key concepts (server {status}). Please try again shortly.` | `101` |
| Other non-ok | `We couldn't prepare your key concepts. Please try again.` | `103` |
| No candidates | `We couldn't prepare your key concepts. Please try again.` | `109` |
| Guard rejection (with reason) | `This doesn't look like explanatory teaching content to us — {reason}. If you believe this is valid material, you can continue anyway.` | `138, 170` |
| Empty milestones no reason | `We couldn't extract any key concepts from those notes. Please try a different document or add more detail.` | `180` |
| JSON parse failure | `We couldn't interpret the result. Please try again.` | `197` |

### 11b. Transcription ( `src/lib/transcriptionService.ts` + `VoiceRecorder.tsx` )

| Scenario | Exact verbatim | File:Line |
|---|---|---|
| 429 | `Too many requests — please wait a moment before trying again.` | `55` |
| 5xx | `We couldn't transcribe your audio (server {status}). Please try again shortly.` | `58` |
| Generic non-ok | `We couldn't transcribe your audio. Please try again.` | `60` |
| No candidates / empty | `We couldn't transcribe your audio. Please try again.` / `No speech was detected. Please try recording again.` | `66`, `71` |
| Blob too small | `No audio captured. Please try again and speak clearly.` | `VoiceRecorder.tsx:430` |
| NotAllowedError | `Microphone access was denied. Please allow microphone permission and try again.` | `VoiceRecorder.tsx:496` |
| Generic mic | `Microphone access denied.` (fallback) | `VoiceRecorder.tsx:498` printed via `err.message` |
| Base64/read | `Failed to encode audio.` / `Failed to read audio.` | `transcriptionService.ts:85,90` |

### 11c. Evaluation ( `src/lib/combinedEvaluationService.ts` + `App.tsx` error UI )

| Scenario | Exact verbatim | File:Line |
|---|---|---|
| 429 | `Too many requests — please wait a moment before trying again.` (+ extra line below) | `161` |
| 429 hint (App adds) | `Rate limit: 20 requests per 10 minutes. Please wait a minute before retrying.` | `App.tsx:1180` |
| Cooldown hint | `Cooling down — please wait a moment before re-evaluating.` | `App.tsx:1194` |
| 5xx | `We couldn't complete the evaluation (server {status}). Please try again shortly.` | `164` |
| Generic | `We couldn't complete the evaluation. Please try again.` | `166,172` |
| No candidates/details | `We couldn't complete the evaluation. Please try again.` / `Missing details` → `We couldn't interpret the evaluation result. Please try again.` | `172`, `307` |
| Buttons on error panel | `Try Again` / `Please wait...` (disabled when `evalCooldown`) + `Edit Transcript` | `App.tsx:1188,1191` |
| File-extractor generic | `We couldn't complete the request. Please try again.` appended by `App.tsx:483` catch | `App.tsx:483` |

### 11d. Follow-up

| Scenario | Verbatim | File:Line |
|---|---|---|
| Generation HTTP non-ok | `Failed to generate follow-up question` (thrown, not shown — UI shows `Follow-up questions unavailable.`) | `followUpService.ts:55` |
| No candidates / empty | `No follow-up generated` / `Empty follow-up` (thrown, UI shows unavailable) | `60`, `65` |
| Check answer HTTP non-ok | `Failed to check answer` (thrown, fallback `Could not verify the answer right now.`) | `121` |
| No check result | `No check result` | `127` |
| Parse fallback | `Could not verify the answer.` | `137` + `App.tsx:727` |

### 11e. File parsing ( `src/lib/fileExtractor.ts` / `fileParser.worker.ts` )

| Scenario | Verbatim | File:Line |
|---|---|---|
| Worker timeout (30s) | `File parsing timed out. Please try a smaller file.` | `fileExtractor.ts:28` |
| DOCX no text | `No readable text found in the DOCX file.` | `fileExtractor.ts:76` / `fileParser.worker.ts:29` |
| PDF no text | `No readable text found in the PDF. It may be a scanned image.` | `fileExtractor.ts:94` / `fileParser.worker.ts:44` |
| Unsupported | `Unsupported file type. Please upload PDF, DOCX, or TXT.` | `fileExtractor.ts:106` / `fileParser.worker.ts:54,57` |
| Client 10MB | `File is too large (X.XMB). Maximum size is 10MB.` | `DocumentUpload.tsx:25` |
| Empty paste | `Pasted text is empty.` | `App.tsx:510` |
| No extractable text | `No readable text found. Please try another file or paste your notes.` | `App.tsx:450` |
| Worker post error | `{worker error text}` forwarded verbatim | `fileExtractor.ts:41` |
| Fallback | `Worker failed to parse file` / `Unexpected worker response` | `fileExtractor.ts:50,45` |

### 11f. Rate-limit / 429 end-to-end

* Server (`api/gemini.ts:135`) responds `{error: "Too many requests — please wait a moment before trying again.", retryAfter:60}` with HTTP 429.
* All three services (milestone/transcription/evaluation) map 429 to `Too many requests — please wait a moment before trying again.` verbatim (`milestoneService.ts:98`, `transcriptionService.ts:55`, `combinedEvaluationService.ts:161`).
* App adds second-line hint for evaluation: `Rate limit: 20 requests per 10 minutes. Please wait a minute before retrying.` (`App.tsx:1180`) and disables retry for 4 s (`Please wait...` + `Cooling down — …`).

### 11g. Generic network errors (proxy)

> User-visible only if a service throws the proxy's body. Messages that can surface:

| Verbatim (as thrown) | Origin |
|---|---|
| `We couldn't prepare your key concepts (server 5xx). Please try again shortly.` | milestoneService |
| `We couldn't transcribe your audio (server 5xx). Please try again shortly.` | transcriptionService |
| `We couldn't complete the evaluation (server 5xx). Please try again shortly.` | combinedEvaluationService |
| `We couldn't complete the request. Please try again.` (catch-all for milestone override network) | `App.tsx:483` / `665` |
| `Failed to read audio.` / `Failed to encode audio.` | blob helpers |
| File-extractor: `File parsing timed out. Please try a smaller file.` / `No readable text found…` etc. | fileExtractor |

---

## 12. Tooltips, `aria-label`, and Screen-Reader-Only Text

| Text | Type | File:Line |
|---|---|---|
| `New Session` (button) | `aria-label` + `title` | `App.tsx:99-100` |
| `History` (button) | `aria-label` + `title` | `App.tsx:109-110` |
| `Close history` | `aria-label` (history modal) | `App.tsx:194` |
| `Session History` tied to `aria-labelledby="history-title"` (`role="dialog" aria-modal="true"`) | dialog title | `App.tsx:184,189` |
| `Upload document — PDF, DOCX or TXT, maximum 10MB. Click to browse or drag and drop.` | button `aria-label` | `DocumentUpload.tsx:67` |
| `Paste your lecture notes` | `sr-only` `<label>` | `DocumentUpload.tsx:135` |
| `Edit concept {idx+1}` | textarea `aria-label` | `App.tsx:1109` |
| `Remove concept {idx+1}` | button `aria-label` | `App.tsx:1121` |
| `At least one concept is required` / `Remove concept` | button `title` (disabled/enabled) | `App.tsx:1122` |
| `Remove {fileName}` | button `aria-label` (processed docs) | `App.tsx:1038` |
| `Back to notes` | button (screen-reader navigable) | `VoiceRecorder.tsx:592` |
| `Edit transcript` | textarea `aria-label` (review) | `VoiceRecorder.tsx:720` |
| `factually correct` / `factually incorrect` | dot `title` (per-concept breakdown) | `App.tsx:1385` |
| Hidden file input: `accept=".json"` + `<label>Import History<input type=file>` (screen-reader accessible) | file input label | `App.tsx:326-338` |
| Input with `sr-only` + `tabindex=-1` `aria-hidden="true"` for upload | hidden semantics | `DocumentUpload.tsx:84-85` |
| `aria-hidden="true"` on decorative icon SVGs | hides from screen reader | `DocumentUpload.tsx:91`, others |
| `role="alert"` on file upload error box | live-region | `DocumentUpload.tsx:107` |
| Focus-trap logic for `HistoryPanel` (`keydown Tab / Escape`) + backdrop `aria-hidden="true"` + `body overflow hidden` | a11y behavior | `App.tsx:140-174` |

> No tooltip copy mentions `Gemini`, `API`, or `JSON` anywhere user-visible (verified). The only `JSON` strings are code comments and `blob type: "application/json"` / `accept=".json"` — not exposed as jargon.

---

## Changes Made (Part 2 — Review & Fixes)

> Items below were fixed directly in the code after the initial extraction above. The inventory above reflects the **pre-fix** state for traceability; the notes below describe the delta.

### 1. Terminology consistency

| Finding | Before | After | File:Line | Why |
|---|---|---|---|---|
| **A. History panel heading used "Milestones" while every other user screen uses "Key Concepts" / "concept".** | `Milestones` (h3) | `Key Concepts` | `src/App.tsx:272` | Aligns to the canonical term `concept` / `Key Concepts` used on the milestone-review screen (`Review Key Concepts`) and on result cards. `Milestone` remains only as the internal type name. |
| **B. VoiceRecorder pre-recording instruction referenced "milestones".** | `Explain your understanding of the milestones aloud…` | `Explain your understanding of the key concepts aloud…` | `src/components/VoiceRecorder.tsx:608` | Removes the only user-visible instance of the internal `milestone` term. |
| **C. History chip / detail labels kept generic — verified no stale "milestone" remained elsewhere user-visible after A+B.** | — | — | — | Confirmed zero remaining user-facing `milestone` occurrences via grep after fixes. |
| **D. Follow-up "Your response" vs "Check my answer" vs "Save reflection" mixed vocabulary.** | `Your response (optional)` label + `Your response:` in saved view | `Your answer (optional)` + `Your answer:` | `src/App.tsx:1491`, `1544` | Unifies follow-up to `answer` (matches `Check my answer` button). `Save reflection` button kept as the *action* (reflection is the artifact saved), label now uses `answer` for the input. See also Fix F below. |
| **E. Export description used internal "milestones".** | `Save your milestones and personal explanations as study cards…` | `Save your key concepts and personal explanations as study cards…` | `src/components/ExportFeature.tsx:118` | Aligns export panel to `key concepts`. |
| **F. Results page "Assessment Complete" vs canonical "Evaluation Complete".** | `Assessment Complete` (when `final>=0 && !gaming && !mastered`) | `Evaluation Complete` | `src/App.tsx:1213` | Unifies to `evaluation` — see G. |
| **G. Evaluation vs analysis vs assessment — canonical term is `evaluation`.** | `We couldn't complete the analysis…` (3× in eval service) / `We couldn't interpret the analysis result…` / `more reliable assessment` / `link each milestone` | `We couldn't complete the evaluation…` / `We couldn't interpret the evaluation result…` / `more reliable evaluation` / `link each concept` | `src/lib/combinedEvaluationService.ts:164,166,172,307`, `src/App.tsx:610,1266,1443` | Picks ONE user-facing noun: `evaluation`. All `analysis`/`assessment` instances were stale copy from earlier nomenclature. Also fixes `milestone → concept` in the "Keep refining…" line (1443) and fixes the corrupted comment `</think><arg_value>` → `*/` at `App.tsx:1147`. |
| **H. Milestone-generation errors used generic "analysis".** | `We couldn't complete the analysis…` (3×) / `We couldn't interpret the analysis result…` | `We couldn't prepare your key concepts…` / `We couldn't interpret the result…` | `src/lib/milestoneService.ts:101,103,109,197` | Makes the failure mode specific (users understand "key concepts" failed to generate, not a vague "analysis"). Also aligns to `key concepts` term. |
| **I. Transcript / explanation unification — decision recorded as "no wholesale rename".** | Pre-fix mixed: `Review Your Transcript` + `Analyzing your explanation…` + `Back to transcript` + `View transcript` vs `response` in follow-up | **Kept intentional split** but normalized follow-up to `answer` (see D). `Transcript` is retained for the *verbatim text artifact* (accurate) and `explanation` for the *pedagogical act*; both are now used consistently in those roles. Duplicate heading removed (see Fix 2B). | `src/components/VoiceRecorder.tsx:709-720`, `src/App.tsx:1207,1452` | Wholesale renaming `transcript → explanation` would mislabel the editable text box (users expect "transcript" for a dictated text). Audit explicitly called out the inconsistency; investigation confirmed the split is purposeful and discoverable — only follow-up `response→answer` was a true inconsistency and was fixed. |

### 2. Leftover / stale copy

| Finding | Fix | File:Line |
|---|---|---|
| **A. No stale `Continue to Evaluation` found** — verified via `grep -r "Continue to Evaluation" src` → 0 hits. The bug-4 removal is intact. No code change needed. | — | — |
| **B. Duplicate transcript-review heading in `VoiceRecorder` — `Review Your Transcript` (h2 709) immediately followed by `REVIEW YOUR TRANSCRIPT` (label 711). Redundancy on same screen.** | Removed the all-caps `label-tag` duplicate line (`REVIEW YOUR TRANSCRIPT`), kept the semantic `h2` + subtext `Fix any errors before evaluation`. | `src/components/VoiceRecorder.tsx:711` (line deleted) |
| **C. Two "How this works" expansions with near-identical copy — results panel (1462) vs footer (1584) — distinguished by the footer adding `Document parsing, audio capture…` clause. Kept intentionally: footer is shown *before* results, results version shown *after*. No duplication on the same screen.** | No change — verified they never render simultaneously (`!combinedResult` guard vs `combinedResult` guard). | `src/App.tsx:1457-1587` |

### 3. Tone consistency

| Finding | Fix | File:Line |
|---|---|---|
| **A. Re-verified no `Gemini`, `API`, or `JSON` appears user-facing.** | `grep -r "Gemini\|API\|JSON" src/components src/App.tsx --include="*.tsx"` found only comments; user strings clean. No fix needed. | — |
| **B. Gaming banner already non-accusatory** — headline `Explanation pattern noted` + descriptive `This explanation reads as a list of terms…` + clarifying `Clarity was set to 0 for this pattern only…`. No change — tone passes. | — | `src/App.tsx:1280-1283` |

### 4. Redundancy

| Finding | Fix |
|---|---|
| **A. Landing status summary `N ready, M extracting, K failed` duplicates the per-doc badges on the same panel but serves as a total — low severity, kept.** | No change. |
| **B. Duplicate heading in transcript review (see 2B)** — fixed as above. | Removed duplicate label-tag. |
| **C. Results `Final Score 72 /100` shown as display + explanatory line `Final 72/100 combines four dimensions…` — not redundant (one is the number, one is the formula).** | No change. |

### 5. Grammar, spelling, and punctuation

| Finding | Fix | File:Line |
|---|---|---|
| **A. Em dash spacing consistent** — `Oral examination — bluff detection` and `It tests if you can explain it.` verified correct. No fix. | — | — |
| **B. "Or paste notes instead →" arrow kept — intentional affordance, not punctuation error.** | — | — |
| **C. Hyphenation check: "live preview — approximate" uses em dash correctly.** | — | — |

### 6. Clarity — error messages (WHAT happened + WHAT TO DO NEXT)

| Finding | Fix |
|---|---|
| **A. All guard / 10MB / transcription / evaluation errors already include both WHAT and NEXT:** guard adds `If you believe this is valid material, you can continue anyway.`; 10MB tells max; 429 tells wait; mic denied tells allow permission; `No speech detected… try recording again` tells next. No fix needed. | — |
| **B. Evaluation 429 hint already added** (`Rate limit: 20 requests per 10 minutes. Please wait a minute before retrying.` + cooldown). No fix. | — |

### 7. Button-label accuracy re-verification (per earlier fix)

| Button | Label | Actual action | Verdict |
|---|---|---|---|
| `Try again` (content-guard status bar, `App.tsx:997`) | `Try again` | `handleRetryContentGuard` — re-runs `generateMilestones` from SAME `uploadedDocs` (`combined`) — does **not** reset to empty upload | ✅ Accurate |
| `Continue anyway` / `Working...` (`App.tsx:1006`) | `Continue anyway` | `handleOverrideContentGuard` — calls `generateMilestones(combined,{override:true})` — skips guard | ✅ Accurate |
| `Try Again` (evaluation error, `App.tsx:1188`) | `Try Again` / `Please wait…` | `handleRetryEvaluation` — clears error, retains `transcript`+`milestones`, re-runs `evaluateCombined` after 0 ms | ✅ Accurate, retains data (re-verified in §Judgement) |
| `Try again` (transcription failure `VoiceRecorder.tsx:756`) | `Try again` | `handleReset` — resets local recorder state to idle (audio blob cannot be retained; user must re-record) — label suggests retry capture, which is what happens | ✅ Accurate given technical constraint (blob consumed) |
| `Confirm & Evaluate` (`VoiceRecorder.tsx:744`) | `Confirm & Evaluate` | `handleConfirm` → `onTranscriptReady(editableTranscript, metrics)` → auto-evaluation via `useEffect` (`App.tsx:624`) — one click commits transcript and starts evaluation with zero extra screens (Bug 4) | ✅ Accurate |
| `Continue to Recording — N document(s) ready` | accurate | Combines `ready` doc texts with `--- filename ---` framing and triggers milestone generation | ✅ |
| `Start Recording — N concept(s)` | accurate | Sets `milestonesConfirmed=true`, renders `VoiceRecorder` with `autoStart` | ✅ |
| `Download as Markdown` / `Download as Anki Cards (.txt)` | accurate | `blob type text/plain`, filenames `feynmanbox-study-cards.md/.txt` | ✅ |
| `Export History` / `Import History` / `Clear History` | accurate | Export creates timestamped JSON file, import de-dupes by `id`, clear wipes `localStorage` | ✅ |
| `Skip` / `Check my answer` / `Save reflection` | accurate | `Skip` marks `followUpSkipped`, `Check` calls `checkFollowUpAnswer`, `Save reflection` persists answer (same as skip with answer) — noted below | ⚠️ `Skip` vs `Save reflection` both set `followUpSkipped` (see 7A note) |

> **Note 7A:** `Save reflection` and `Skip` both call `setFollowUpSkipped(true)` (`App.tsx:1502`, `1508`) — the difference is `Save reflection` is disabled when empty while `Skip` is always enabled. Saving does not produce a separate persisted store beyond keeping `followUpAnswer` in React state; history does not save reflections. This is by design (reflection-only), not a label inaccuracy, but documented here for completeness.

---

## Appendix: Full text of the two answerability-critical strings (verbatim)

> These two strings were required verbatim in the prompt and are reproduced here exactly as they render:

**Transcript failure ( VoiceRecorder )** — verbatim bundle:

* `No audio captured. Please try again and speak clearly.` (`src/components/VoiceRecorder.tsx:430`)
* `We couldn't transcribe your audio. Please try again.` (`src/lib/transcriptionService.ts:60`)
* `We couldn't transcribe your audio (server 500). Please try again shortly.` (`src/lib/transcriptionService.ts:58`)
* `No speech was detected. Please try recording again.` (`src/lib/transcriptionService.ts:71`)
* `We couldn't transcribe your audio. Please try again.` (second site, `src/lib/transcriptionService.ts:66`)
* Recovery button: `Try again` (`src/components/VoiceRecorder.tsx:756`) — calls `handleReset`.

**Gaming-detected banner — full verbatim (not summarized):**

```text
Explanation pattern noted
{reasoning}  — LLM-generated, e.g.: "The explanation lists terms without connecting them"
This explanation reads as a list of terms without connecting them — try explaining how these ideas relate to each other using words like “because,” “therefore,” and “this means.” Clarity was set to 0 for this pattern only; your coverage and factual scores still count.
```

Source: `src/App.tsx:1278-1283`.

---

## Smoke Test Results (Part 3 — Untested UI States)

> Exercised 2026-08-27 post-fix via static analysis + heuristic harness + programmatic simulation of localStorage / HistoryPanel grouping logic. No visual screenshot tool was available; verification is via code inspection and node execution of the exact runtime logic.

### 1. History panel with 2+ entries sharing a fingerprint (sparkline + import/export)

**Method:** Replicated `simpleHash` + `computeFingerprint` (`src/App.tsx:32,42`) in node, created two `HistoryEntry` objects with identical `milestones=[{text:"A"},{text:"B"}]` → same fingerprint `1f7r`, different `finalScore` 45→72 and dates 1s apart. Ran the grouping logic from `HistoryPanel` (`src/App.tsx:213-234`).

**Findings:**
* ✅ Grouping: `Map` size = 1, group length = 2 — correct, shared fingerprint collapses into single visual group.
* ✅ Sparkline condition: `sorted.length>=2` → true, `showSparkline=true`; caption renders as `Attempt 1 → 2: 45 → 72` (`src/App.tsx:230`) with `width=120 height=32` polyline (`Sparkline` component). No exception when `scores.length <2` (returns `null`).
* ✅ History export: `JSON.stringify(historyEntries,null,2)` → `Blob type application/json` → `URL.createObjectURL` → download `feynmanbox-history-YYYY-MM-DD.json` (`src/App.tsx:864-871`). Verified via node stringify length 732 bytes and valid JSON round-trip.
* ✅ Import validation: `isValidHistoryEntry` (`src/App.tsx:876-887`) rejects missing `id`/`finalScore`/`fingerprint` etc; `handleImportHistory` de-dupes by `existingIds` set and migrates legacy `details` lacking `sub_score` (`src/App.tsx:909-930`). Programmatic test: valid entry passes, `{id:1}` fails as expected.
* **Verdict: PASS** — sparkline renders, export/import logic sound; grouping handles shared fingerprint deterministically.

### 2. History panel with ZERO entries (empty state)

**Method:** Inspected `HistoryPanel` conditional `entries.length===0` branch (`src/App.tsx:204-208`) and `hasHistory` dot logic (`src/App.tsx:117`, `117?`).

**Findings:**
* ✅ Empty branch renders centered `py-12` box with two lines: `No sessions yet.` (`src/App.tsx:206`) + `Complete an evaluation to see history here.` (`src/App.tsx:207`) in `font-mono text-xs text-parchment-muted`. Not blank/broken.
* ✅ No sparkline or export/import/clear buttons are NOT rendered in empty state? Actually export/import/clear are inside the `else` branch (`src/App.tsx:303`), so hidden when empty — sensible (no data to export). Could argue export should remain visible but current design hides it, which is acceptable.
* ✅ Header history dot: `hasHistory && <span w-2 h-2 bg-brass>` (`src/App.tsx:117`) — correctly absent when zero entries, so no misleading notification.
* ✅ No crash on `localStorage` empty — `useEffect` handles `null` and JSON parse failure (`src/App.tsx:404-437`).
* **Verdict: PASS** — empty state is sensible, not blank, with clear CTA.

### 3. Gaming-detected banner (full appearance, keyword-dump trigger)

**Method:** Used adversarial harness `keyword_dump` case (`src/lib/testCases.ts:62`: `BST binary tree left subtree right subtree node search O log n …`) which expects `isGaming:true`, `final 0-20 low`. Verified `combinedEvaluationService` prompt flags `is_gaming_attempt` as list-of-terms pattern (`src/lib/combinedEvaluationService.ts:117`). Demo fixture shows banner headline + body.

**Findings:**
* ✅ Trigger: harness heuristic confirms `keyword_dump` → `coverage 12 clarity 9 final 7 gaming yes` — deterministic offline; real Gemini path also flagged (see `TESTING.md`).
* ✅ Banner headline: `Explanation pattern noted` (`src/App.tsx:1280`, `font-mono text-sm font-bold text-flagged tracking-wide`) — descriptive, not accusatory.
* ✅ Body reasoning line: `{combinedResult.reasoning}` (`src/App.tsx:1281`) — LLM emits pattern description (e.g., `the explanation lists terms without connecting them`), never "cheating" language.
* ✅ Secondary guidance: `This explanation reads as a list of terms without connecting them — try explaining how these ideas relate … using words like "because," "therefore," and "this means." Clarity was set to 0 for this pattern only; your coverage and factual scores still count.` (`src/App.tsx:1283`, `text-parchment-muted`) — tells user what happened and what to do, factual scores preserved.
* ✅ Tone check: `grep -i cheating|dishonest` across banner strings → 0 hits — passes non-accusatory requirement.
* ✅ Container styling: `border-flagged/60 bg-flagged/10 p-4 rounded-panel` — visually distinct, not hidden.
* **Verdict: PASS** — banner renders full verbatim text as audited, trigger verified via harness.

### 4. Mobile viewport (375px) rendering of results page 2-column layout

**Method:** Static Tailwind breakpoint audit: results per-concept cards use `grid grid-cols-1 md:grid-cols-2 gap-3` (`src/App.tsx:1296,1339`), outer container `max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 py-12 sm:px-6` (`src/App.tsx:958`), ExportFeature buttons `btn-primary w-1/2` inside `flex gap-3` (`src/components/ExportFeature.tsx:125`), History modal `max-w-lg` (`src/App.tsx:184`).

**Findings:**
* ✅ Breakpoint: `md:` = 768px (`tailwind.config.js` default) — at 375px media query does NOT apply, so `grid-cols-1` single-column is active — correct collapse, no overflow before fix and after. Confirmed no `min-w` or `w-96 fixed` that would exceed 343px inner width (375−16*2 padding).
* ✅ History modal: `fixed inset-0 p-4` with `max-w-lg` (512px) + `flex items-center justify-center` — at 375 renders as `w-full` with 16px inset, not overflow.
* ✅ Export buttons at 375: `w-1/2` each ≈171px minus gap; text "Download as Markdown" fits without wrapping at mono 10px? Slight tightness but Tailwind `overflow-hidden` not needed; no horizontal scroll. Could consider `flex-col sm:flex-row` future but current passes no-overflow.
* ✅ Waveform SVG `w-full h-[50px] preserveAspectRatio="none"` (`VoiceRecorder.tsx:645`) scales correctly, `Sparkline` `width=120` fixed but inside `p-3` panel not overflow.
* **Verdict: PASS** — layout correctly collapses to single-column, no horizontal overflow detected at 375px via class audit (no runtime viewport bug found).

### 5. Transcription failure state (retry-with-retained-data)

**Method:** Traced `VoiceRecorder.tsx` error paths (`430, 456, 496`) and `isTranscribing` state, plus `App.tsx` `handleRetryEvaluation` (`src/App.tsx:842`) and `handleRetryContentGuard` (`src/App.tsx:573`).

**Findings:**
* ✅ Transcription blob-too-small path: `blob.size <1000` → `setError("No audio captured…")` (`VoiceRecorder:430`), `isTranscribing` → false, `hasRecording` still false → renders `!hasRecording && error` branch (`VoiceRecorder:753`) with `Try again` → `handleReset` (`VoiceRecorder:520`) which clears `editableTranscript`/`error`/`pendingMetrics` and returns to idle `Begin Recording` state. **Audio blob cannot be retained** (consumed by `Blob` creation and `transcriptionService` call) — retry necessarily means re-record, which button label suggests correctly. Not a bug.
* ✅ Transcription service failure path: `catch` sets `setError(msg)` (`VoiceRecorder:457`) with `We couldn't transcribe…` variants, `hasRecording` still false → same `Try again` reset path — consistent.
* ✅ **Retained-data retry that WAS fixed earlier** is the *evaluation* retry, not transcription: `handleRetryEvaluation` (`App.tsx:842`) explicitly does NOT clear `transcript`/`milestones`/`uploadedDocs`; it only clears `evaluationError`/`combinedResult` and re-calls `runCombinedEvaluation(transcript, milestones)` after 0 ms. Verified via git diff that `setTranscript` is absent from that function — retains data. `handleRetryContentGuard` similarly retains `uploadedDocs` (`App.tsx:573`).
* ✅ Button label accuracy for evaluation retry `Try Again` vs cooldown `Please wait…` (`App.tsx:1188`) accurately reflects state; cooldown prevents spam.
* **Verdict: PASS** — transcription "Try again" correctly resets to re-record (blob cannot be retained by design); evaluation "Try Again" correctly retains transcript and re-evaluates — earlier fix verified working, not just label.

---

*End of audit.*
