# FeynmanBox

It doesn't test what you remember. It tests if you can explain it.

Voice-driven active-learning app that catches the illusion of competence — when reciting keywords feels like understanding, but isn't. Paste lecture notes, explain them out loud, and get an oral-examination style evaluation that detects keyword gaming, shallow coverage, and incoherent reasoning.

## Core Concept

Students upload or paste lecture notes. The app extracts **5–7** key learning milestones via AI, then requires the student to explain those concepts **out loud** via voice. Evaluation scores:

- **Coverage** — Which milestones were substantively addressed?
- **Clarity** — Was the explanation coherent, with logical connectors (`because`, `therefore`, `this means`) rather than buzzword dumping?
- **Gaming Detection** — Flags attempts that list terms without sentence structure or logical flow.

Mastery is verified at **final score ≥ 80** (weighted: 60% coverage + 40% clarity; clarity is forced to 0 if flagged as gaming). Final score and per-concept feedback are shown in a unified results panel.

## How It Works — Current Flow

1. **Upload / Paste Document** — Drop a PDF, DOCX, or TXT, or paste notes directly. File parsing runs client-side (see below).
2. **Background Milestone Generation** — A single Gemini call extracts 5–7 substantive milestones as JSON. UI stays responsive; progress is shown unobtrusively.
3. **Voice Recording** — `MediaRecorder` captures audio with a live waveform (Web Audio API `AnalyserNode`) and an approximate live caption preview (Web Speech API, visual-only, discarded after recording).
4. **Stop → Transcription** — Audio is encoded to base64 and sent to Gemini via `inline_data` for word-for-word transcription (not the browser's Web Speech API final transcript).
5. **Editable Transcript Review** — User can correct transcription errors, then confirms.
6. **Single Combined Evaluation** — One structured Gemini call returns coverage, clarity, gaming flag, summary, and per-concept feedback together (see Architecture).
7. **Unified Results** — Summary, final score (0–100), covered/missed concepts with specific feedback, clarity score, and flagged warning if applicable. Transcript is collapsible. Mastery export unlocks at ≥ 80.

History is stored in `localStorage`. Re-attempting the same material is fingerprinted for progress tracking (see Phase 3 feature).

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **AI**: Google `gemini-flash-lite-latest` via Google AI Studio API (proxied server-side)
- **Storage**: Browser `localStorage` only (no database)
- **Deployment**: Vercel

## Architecture — Deliberate Engineering Choices

**Single structured Gemini call.** Coverage scoring, clarity analysis, and gaming detection return together in one JSON response — reducing what would otherwise be 3 sequential API calls into 1, cutting latency and quota usage on the free tier.

**Client-side pipeline.** Document parsing (`pdfjs-dist` for PDF, `mammoth` for DOCX), audio capture (`MediaRecorder`), and waveform visualization (Web Audio API `AnalyserNode`) all run entirely in the browser — no server infrastructure beyond a minimal API-key-holding proxy function.

**Server-side API key proxy.** The Gemini API key is never bundled to client JS. A Vercel serverless function at `/api/gemini.ts` reads `GEMINI_API_KEY` from a server-only env var (no `VITE_` prefix) and forwards the request to `generativelanguage.googleapis.com`. Client code calls `/api/gemini` with `{ model, payload }`. See `api/gemini.ts`, `src/lib/milestoneService.ts`, `src/lib/combinedEvaluationService.ts`, `src/lib/transcriptionService.ts`.

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

**Server-side (required):** `GEMINI_API_KEY` — set in Vercel Project Settings → Environment Variables (NOT prefixed with `VITE_`, never exposed to the client). For local dev with `vercel dev`, set it in `.env` or your shell:

```bash
# .env (local, gitignored)
GEMINI_API_KEY=your_gemini_api_key_here
```

`VITE_GEMINI_API_KEY` is **not used** and must not be set — it would expose the key in the client bundle. See `.env.example`.

## Deployment to Vercel

### Prerequisites

- GitHub account with the FeynmanBox repo
- Vercel account (free at vercel.com)
- Gemini API key from Google AI Studio

### Step 1: Push to GitHub

```bash
git add -A
git commit -m "feat: complete FeynmanBox implementation"
git branch -M main
git remote add origin git@github.com:YOUR_USERNAME/feynmanbox.git
git push -u origin main
```

### Step 2: Connect to Vercel

1. Go to https://vercel.com and create a new account (free)
2. Click "Add New..." → "Import Project"
3. Select "GitHub" and choose the feynmanbox repo
4. Vercel will auto-detect it's a Vite + React project

### Step 3: Configure Environment Variables

In the Vercel dashboard, go to your project → Settings → Environment Variables:

- Add variable: `GEMINI_API_KEY`
- Value: Your Google AI Studio API key
- Environment: Production, Preview, Development
- Click "Save"

Do **not** use `VITE_GEMINI_API_KEY`.

### Step 4: Deploy

1. Go to the "Deployments" tab
2. Click "Trigger Deploy" → "Deploy Now"
3. Wait for the build to complete (1–3 minutes)

### Step 5: Enable Auto-Deploy

Vercel will automatically redeploy on every push to the `main` branch.

### Step 6: Verify the Deploy

Once deployed, Vercel will provide a URL like `https://feynmanbox.vercel.app`

- Test the full flow: upload/paste document → background milestone generation → voice recording with waveform → stop → review transcript → single combined evaluation → unified results
- Verify mastery badge appears at score **≥ 80**
- Confirm no API key appears in the client bundle (search built JS for `generativelanguage` — it should only appear in `/api/gemini.ts` on the server, client uses `/api/gemini`)
- Test History and "Download Study Cards" (study cards export per-milestone feedback keyed by `milestone.id`)

## Project Structure Highlights

- `api/gemini.ts` — Vercel serverless proxy (server-only key)
- `src/lib/fileExtractor.ts` — lazy-loaded PDF/DOCX parsing (dynamically imported only on file upload)
- `src/lib/milestoneService.ts` — 5–7 milestone generation via proxy
- `src/lib/transcriptionService.ts` — `MediaRecorder` → base64 → Gemini `inline_data` transcription via proxy
- `src/lib/combinedEvaluationService.ts` — single-call coverage + clarity + gaming evaluation
- `src/components/DocumentUpload.tsx` — accessible drop zone (`<button>` with keyboard handling, `sr-only` file input)
- `src/components/VoiceRecorder.tsx` — recording, waveform (respects `prefers-reduced-motion`), live preview (Web Speech API, discarded)
- `src/App.tsx` — generation/evaluation tokens guard against stale race conditions, lazy file extraction, 10MB file validation

## Zero Cost Constraints

- No paid APIs — `gemini-flash-lite-latest` has free tier; single-call architecture minimizes quota use
- No paid hosting — Vercel free tier
- No database — Browser `localStorage` only
- No server beyond proxy — Document parsing, audio capture, waveform all run in-browser; voice transcription and evaluation use Gemini via the proxy

## License

MIT
