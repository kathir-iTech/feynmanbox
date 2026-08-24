# FeynmanBox

Voice-driven active-learning web app for the Prometheus September AI Challenge.

## Core Concept

Students paste lecture notes, get 3 auto-generated learning milestones, then must explain each milestone OUT LOUD via voice. The app scores their:
- **Coverage**: Did they hit the milestones?
- **Clarity**: Did they explain simply, with logical connectors, not just buzzword-dumping?
- **Gaming Detection**: Catches attempts where users just rattle off keywords.

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS
- **Voice Input**: Browser's native Web Speech API (SpeechRecognition) — free, no backend needed
- **AI**: Google Gemini 1.5 Flash via Google AI Studio API
- **Storage**: Browser localStorage only (no database)
- **Deployment**: Vercel (connected to GitHub for auto-deploy)

## Getting Started

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` to `.env` and add your Gemini API key:

```bash
cp .env.example .env
```

Edit `.env` and set `VITE_GEMINI_API_KEY` to your Google AI Studio API key.

## Steps

1. **Project Setup** — Vite + React + TS + Tailwind CSS ✅
2. **Context Anchor + Milestone Generator** — Paste notes, get 3 milestones via Gemini ✅
3. **Voice Recording + Transcription** — Web Speech API for voice input ✅
4. **Coverage Score** — Gemini checks which milestones are covered in the transcript ✅
5. **Clarity Score + Anti-Gaming** — Gemini rates clarity and detects gaming attempts ✅
6. **Mastery Loop + Progressive Hints** — Final score calculation, hints for improvement ✅
7. **Export Feature** — Download study cards as JSON for spaced-repetition ✅
8. **UI Polish** — Clean, responsive dashboard layout ✅
9. **Error Handling & Edge Cases** — Empty transcripts, API failures, browser support ✅
10. **Deployment** — Vercel auto-deployment setup ✅

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
- Add variable: `VITE_GEMINI_API_KEY`
- Value: Your Google AI Studio API key
- Click "Save"

### Step 4: Deploy
1. Go to the "Deployments" tab
2. Click "Deployments" → "Trigger Deploy" → "Deploy Now"
3. Wait for the build to complete (1-3 minutes)

### Step 5: Enable Auto-Deploy
Vercel will automatically redeploy on every push to the `main` branch. 
- To test, make a change and push to GitHub
- Vercel will auto-deploy the updated version

### Step 6: Verify the Deploy
Once deployed, Vercel will provide a URL like `https://feynmanbox.vercel.app`
- Test the full flow: paste notes → generate milestones → record voice → evaluate coverage and clarity
- Verify mastery badge appears at score >= 90
- Test the "Download Study Cards" feature

## Zero Cost Constraints
- ✅ No paid APIs — Gemini 1.5 Flash has free tier
- ✅ No paid hosting — Vercel free tier
- ✅ No database — Browser localStorage only
- ✅ Voice input — Browser's native Web Speech API (free)

## License

MIT