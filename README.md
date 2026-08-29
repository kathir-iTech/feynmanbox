<div align="center">

# FeynmanBox

### *It doesn't test what you remember. It tests if you can explain it.*

[![Typing SVG](https://readme-typing-svg.demolab.com/?font=Fira+Code&size=22&duration=3000&pause=800&center=true&vCenter=true&width=600&lines=Catches+keyword-dumping.;Scores+real+understanding.;Built+with+Gemini+%2B+zero+backend.)](https://git.io/typing-svg)

[![License](https://img.shields.io/badge/License-All%20Rights%20Reserved-red)](LICENSE)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-feynmanbox.vercel.app-blue?logo=vercel)](https://feynmanbox.vercel.app)
[![Built With](https://img.shields.io/badge/Built%20With-React%20%7C%20TypeScript%20%7C%20Vite%20%7C%20Gemini-61DAFB)](https://react.dev)
[![Status](https://img.shields.io/badge/Status-Active-brightgreen)](https://feynmanbox.vercel.app)

</div>

---

Most study tools ask *"did you read this?"* FeynmanBox asks a harder question:
**"can you actually explain it?"** Reciting keywords feels like understanding.
It usually isn't. FeynmanBox runs an adversarial oral examination on your own
voice — and it is built to catch you when you're bluffing.

---

## The Problem

Students rehearse terminology and mistake fluency for comprehension — the
classic *illusion of competence*. A transcript full of correct-sounding words
can carry zero actual understanding, and no flashcard app is equipped to tell
the difference. FeynmanBox exists to make that gap visible, auditable, and
hard to game.

---

## How It Works

You supply material. The system extracts what you must be able to explain,
listens to you explain it out loud, and scores the explanation against the
source — not against a memorized answer key.

```
┌─────────┐   ┌────────────┐   ┌─────────┐   ┌────────────┐   ┌──────────────┐   ┌────────┐   ┌────────────┐
│ Upload  │ → │ Milestones │ → │ Record  │ → │ Transcribe │ → │  Evaluate    │ → │ Results│ → │  Follow-up │
│ notes / │   │ 5–7 key    │   │ voice   │   │ audio →    │   │ 4-dimension  │   │ score +│   │ remediation│
│ PDF/DOCX│   │ concepts   │   │ explain │   │ text       │   │ traceable    │   │ feedback│   │ + transfer │
└─────────┘   └────────────┘   └─────────┘   └────────────┘   └──────────────┘   └────────┘   └────────────┘
```

Every step after upload runs in your browser. The only network call is a
single server-held proxy to Gemini — there is no database, no accounts, and no
backend of our own.

---

## What Makes This Different

- **Anti-gaming / bluff detection.** A keyword dump — terms strung together
  with no causal structure — is explicitly flagged. The system looks for
  *because*, *therefore*, and *this means*, not just the presence of vocabulary.
- **4-dimension, traceable scoring.** Each concept is scored on
  **Coverage · Factual Accuracy · Reasoning Quality · Clarity**, and the
  coverage total is the literal sum of per-concept sub-scores. The number is
  inspectable, not a black box.
- **Source-grounded factual checking.** Claims are checked against your own
  uploaded material. Confidently wrong answers are capped and flagged as
  factually incorrect — fluency does not buy you points.
- **Single-call architecture.** Coverage, clarity, gaming detection, and
  follow-up generation are collapsed into one structured model call where
  possible, minimizing latency and quota on the free tier.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite |
| Styling | Tailwind CSS |
| AI | Google `gemini-flash-lite-latest` (via serverless proxy) |
| Audio / Parsing | Web Audio API · `MediaRecorder` · `pdfjs-dist` · `mammoth` (Web Worker) |
| Storage | Browser `localStorage` (no backend) |
| Hosting | Vercel (static + one serverless function) |

---

## Live Demo

**The fastest way to understand FeynmanBox is to use it:**
**[feynmanbox.vercel.app](https://feynmanbox.vercel.app)**

For an instant, network-free walkthrough, append `?demo=true` to the URL — the
app runs entirely on offline fixtures, no API key or microphone required.

> Best experienced in Chrome or Edge (microphone + live caption support).

---

## Validated Results

This isn't a claim about what the model *should* do — it's what the adversarial
test harness **actually measured** against seven labeled explanations (BST
reference material, `npm run test:evaluation`):

| Input | Coverage | Clarity | Final | Gaming? |
|---|---|---|---|---|
| Genuine, well-explained | 88 | 82 | **86** | no |
| Keyword dump | 12 | 9 | **7** | **yes** |
| Confident but wrong | 10 | 45 | **24** | no* |
| Memorized verbatim | 75 | 58 | **68** | no |
| Fluent nonsense | 8 | 76 | **35** | no |

\* Confident-wrong is caught by factual-accuracy capping, not the gaming flag —
proving the score reflects *correctness*, not delivery. Genuine explanations
consistently land in the **70–90+** range; gaming attempts score **under 20**.
**7/7 harness cases pass.**

---

## License & Usage

This repository is public for **transparency and demonstration purposes only**.
All rights reserved — see [LICENSE](LICENSE) for details. This code may not be
copied, modified, redistributed, or used to create derivative works without
explicit written permission.

For the security posture, see [SECURITY.md](SECURITY.md). For architecture,
test harness data, and known limitations, see
[docs/TECHNICAL_NOTES.md](docs/TECHNICAL_NOTES.md).
