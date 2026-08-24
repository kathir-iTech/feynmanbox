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

1. **Project Setup** — Vite + React + TS + Tailwind CSS (in progress)
2. **Context Anchor + Milestone Generator** — Paste notes, get 3 milestones via Gemini
3. **Voice Recording + Transcription** — Web Speech API for voice input
4. **Coverage Score** — Gemini checks which milestones are covered in the transcript
5. **Clarity Score + Anti-Gaming** — Gemini rates clarity and detects gaming attempts
6. **Mastery Loop + Progressive Hints** — Final score calculation, hints for improvement
7. **Export Feature** — Download study cards as JSON for spaced-repetition
8. **UI Polish** — Clean, responsive dashboard layout
9. **Error Handling & Edge Cases** — Empty transcripts, API failures, browser support
10. **Deployment** — Vercel auto-deployment setup

## Deployment

Connect this GitHub repo to Vercel for auto-deployment. See Vercel docs for specifics.

## License

MIT