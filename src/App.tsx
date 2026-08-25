import "./index.css"
import { DocumentUpload } from "./components/DocumentUpload"
import { VoiceRecorder } from "./components/VoiceRecorder"
import { CoverageDisplay } from "./components/CoverageDisplay"
import { ClarityDisplay } from "./components/ClarityDisplay"
import { ExportFeature } from "./components/ExportFeature"
import type { Milestone } from "./types"
import { useState, useEffect } from "react"
import { extractTextFromFile } from "./lib/fileExtractor"
import { generateMilestones } from "./lib/milestoneService"

interface HistoryEntry {
  id: string
  date: string
  milestones: Milestone[]
  coverageScore: number
  clarityScore: number
  finalScore: number
  transcript: string
  isGaming: boolean
}

function HeaderBar({ onNewSession, onHistory, hasHistory }: { onNewSession: () => void; onHistory: () => void; hasHistory: boolean }) {
  return (
    <div className="absolute top-0 right-0 flex items-center gap-2">
      <button
        onClick={onNewSession}
        aria-label="New Session"
        title="New Session"
        className="w-8 h-8 rounded-panel border border-ink-border bg-ink-light flex items-center justify-center text-parchment-muted hover:text-parchment hover:border-brass transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        onClick={onHistory}
        aria-label="History"
        title="History"
        className="w-8 h-8 rounded-panel border border-ink-border bg-ink-light flex items-center justify-center text-parchment-muted hover:text-parchment hover:border-brass transition-colors relative"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        {hasHistory && <span className="absolute -top-1 -right-1 w-2 h-2 bg-brass rounded-full" />}
      </button>
    </div>
  )
}

function HistoryPanel({ entries, onClose, onClear }: { entries: HistoryEntry[]; onClose: () => void; onClear: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative panel p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-brass rounded-sm" />
            <h2 className="font-serif text-lg font-semibold text-parchment">Session History</h2>
          </div>
          <button onClick={onClose} className="text-parchment-muted hover:text-parchment transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="label-tag mb-4">Stored locally in your browser</p>

        {entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <p className="font-mono text-xs text-parchment-muted">No sessions yet.</p>
            <p className="font-mono text-xs text-parchment-muted/60 mt-1">Complete an evaluation to see history here.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {entries.slice().reverse().map((entry) => (
                <div key={entry.id} className="p-4 rounded-panel border border-ink-border bg-ink">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-brass">
                      {new Date(entry.date).toLocaleString()}
                    </span>
                    <span className={`font-mono text-xs font-bold ${entry.finalScore >= 80 ? "text-verified" : entry.isGaming ? "text-flagged" : "text-parchment-muted"}`}>
                      {entry.finalScore}/100
                    </span>
                  </div>
                  <div className="mb-2">
                    <p className="label-tag text-[10px] mb-1">Milestones</p>
                    <ul className="space-y-1">
                      {entry.milestones.map((m) => (
                        <li key={m.id} className="font-mono text-xs text-parchment/70 truncate">• {m.text}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex gap-4 font-mono text-xs text-parchment-muted">
                    <span>Coverage {entry.coverageScore}%</span>
                    <span>Clarity {entry.isGaming ? 0 : entry.clarityScore}%{entry.isGaming ? " (flagged)" : ""}</span>
                    <span className="text-parchment">Final {entry.finalScore}%</span>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={onClear} className="mt-4 btn-ghost w-full text-xs">
              Clear History
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [transcript, setTranscript] = useState<string>("")
  const [showClarity, setShowClarity] = useState(false)
  const [coverageData, setCoverageData] = useState<{ covered: boolean[]; score: number; details?: import("./types").CoverageDetail[] } | null>(null)
  const [clarityData, setClarityData] = useState<{ score: number; isGaming: boolean; reasoning: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [hasSaved, setHasSaved] = useState(false)

  // Block 1: Document upload + background processing
  const [hasDocument, setHasDocument] = useState(false)
  const [notesText, setNotesText] = useState<string>("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [documentStatus, setDocumentStatus] = useState<"idle" | "extracting" | "generating" | "ready" | "error">("idle")
  const [documentError, setDocumentError] = useState<string | null>(null)
  // suppress unused var until Block 4 needs it visibly
  void notesText

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || ""

  useEffect(() => {
    try {
      const raw = localStorage.getItem("feynmanbox_history")
      if (raw) {
        const parsed = JSON.parse(raw) as HistoryEntry[]
        if (Array.isArray(parsed)) setHistoryEntries(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  const persistHistory = (entries: HistoryEntry[]) => {
    try {
      localStorage.setItem("feynmanbox_history", JSON.stringify(entries))
    } catch {
      // ignore
    }
  }

  const processNotesToMilestones = async (text: string) => {
    if (!text.trim()) {
      setDocumentStatus("error")
      setDocumentError("No readable text found. Please try another file or paste your notes.")
      return
    }
    setNotesText(text)
    if (!apiKey) {
      setDocumentStatus("error")
      setDocumentError("Preparation is temporarily unavailable. Please try again later.")
      return
    }
    setDocumentStatus("generating")
    try {
      const result = await generateMilestones(text, apiKey)
      if (result.success) {
        setMilestones(result.milestones)
        setDocumentStatus("ready")
        setDocumentError(null)
      } else {
        setDocumentStatus("error")
        setDocumentError(result.error || "We couldn't prepare your milestones. Please try again.")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "We couldn't complete the request. Please try again."
      setDocumentStatus("error")
      setDocumentError(msg)
    }
  }

  const handleFileSelected = (file: File) => {
    // Immediate transition — don't block UI
    setHasDocument(true)
    setFileName(file.name)
    setDocumentStatus("extracting")
    setDocumentError(null)
    setMilestones([])
    // Background extraction
    extractTextFromFile(file)
      .then((text) => {
        return processNotesToMilestones(text)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "We couldn't read that file. Please try another file or paste your notes."
        setDocumentStatus("error")
        setDocumentError(msg)
      })
  }

  const handlePasteText = (text: string) => {
    setHasDocument(true)
    setFileName("Pasted notes")
    setDocumentStatus("extracting")
    setDocumentError(null)
    setMilestones([])
    // microtask to allow UI transition before heavy processing
    setTimeout(() => {
      processNotesToMilestones(text)
    }, 50)
  }

  const handleCoverageComplete = (result?: { covered: boolean[]; score: number; details: import("./types").CoverageDetail[] }) => {
    if (result) {
      setCoverageData({ covered: result.covered, score: result.score, details: result.details })
    }
    setShowClarity(true)
  }

  const handleClarityComplete = (result?: { score: number; isGaming: boolean; reasoning: string }) => {
    if (result) {
      setClarityData({ score: result.score, isGaming: result.isGaming, reasoning: result.reasoning })
    } else {
      // fallback: hide clarity panel without result
      setShowClarity(false)
      return
    }
    setShowClarity(false)
    // keep clarity panel hidden after evaluation; mastery result will show inline
  }

  // Save to history when both evaluations are present and not yet saved
  useEffect(() => {
    if (coverageData && clarityData && !hasSaved && milestones.length > 0) {
      const finalScore = Math.round(coverageData.score * 0.6 + (clarityData.isGaming ? 0 : clarityData.score) * 0.4)
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        milestones,
        coverageScore: coverageData.score,
        clarityScore: clarityData.isGaming ? 0 : clarityData.score,
        finalScore,
        transcript: transcript.slice(0, 500),
        isGaming: clarityData.isGaming,
      }
      const next = [...historyEntries, entry]
      setHistoryEntries(next)
      persistHistory(next)
      setHasSaved(true)
    }
  }, [coverageData, clarityData, milestones, transcript, hasSaved, historyEntries])

  const handleReset = () => {
    setMilestones([])
    setTranscript("")
    setShowClarity(false)
    setCoverageData(null)
    setClarityData(null)
    setHasSaved(false)
    setHistoryOpen(false)
    setHasDocument(false)
    setNotesText("")
    setFileName(null)
    setDocumentStatus("idle")
    setDocumentError(null)
  }

  const handleClearHistory = () => {
    setHistoryEntries([])
    persistHistory([])
  }

  const finalScore =
    coverageData && clarityData ? Math.round(coverageData.score * 0.6 + (clarityData.isGaming ? 0 : clarityData.score) * 0.4) : 0
  const isMastered = coverageData !== null && clarityData !== null && finalScore >= 80 && !clarityData.isGaming
  const hasHistory = historyEntries.length > 0

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center relative">
          <HeaderBar onNewSession={handleReset} onHistory={() => setHistoryOpen(true)} hasHistory={hasHistory} />
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-parchment tracking-tight">
            FeynmanBox
          </h1>
          <div className="mt-3 mx-auto w-16 h-0.5 bg-brass" />
          <p className="mt-3 label-tag">Oral Examination System</p>
        </header>

        <main className="space-y-6">
          {/* Unobtrusive document processing status — visible once file received */}
          {hasDocument && documentStatus !== "idle" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-panel border border-ink-border bg-ink-light animate-fade-in">
              {documentStatus === "ready" ? (
                <div className="w-2 h-2 bg-verified rounded-sm" />
              ) : documentStatus === "error" ? (
                <div className="w-2 h-2 bg-flagged rounded-sm" />
              ) : (
                <div className="w-2 h-2 bg-brass rounded-full animate-pulse" />
              )}
              <span className="font-mono text-xs text-parchment-muted truncate">
                {documentStatus === "extracting"
                  ? `Processing ${fileName ? `"${fileName}"` : "your notes"}...`
                  : documentStatus === "generating"
                    ? "Generating key concepts..."
                    : documentStatus === "ready"
                      ? `Notes ready${fileName ? ` — ${fileName}` : ""}`
                      : documentError || "Error processing notes"}
              </span>
              {documentStatus === "error" && (
                <button onClick={handleReset} className="ml-auto font-mono text-xs text-brass hover:text-brass-light flex-shrink-0">
                  Try again
                </button>
              )}
            </div>
          )}

          {!hasDocument && (
            <DocumentUpload onFileSelected={handleFileSelected} onPasteText={handlePasteText} error={documentError} status={documentStatus} />
          )}

          {hasDocument && !transcript && (
            <VoiceRecorder onTranscriptReady={setTranscript} />
          )}

          {hasDocument && transcript && milestones.length === 0 && documentStatus !== "ready" && documentStatus !== "error" && (
            <div className="panel p-6 text-center">
              <div className="w-2 h-2 bg-brass rounded-full animate-pulse mx-auto mb-3" />
              <p className="label-tag">Analyzing your notes...</p>
              <p className="font-mono text-xs text-parchment-muted mt-2">Preparing your key concepts — this will be ready shortly.</p>
              <div className="mt-4 h-0.5 bg-ink-border rounded-sm overflow-hidden">
                <div className="h-full bg-brass animate-progress-bar" />
              </div>
            </div>
          )}

          {hasDocument && transcript && milestones.length > 0 && !showClarity && !clarityData && (
            <CoverageDisplay
              milestones={milestones}
              transcript={transcript}
              onEvaluated={handleCoverageComplete}
              onBack={() => {
                setTranscript("")
                setCoverageData(null)
              }}
            />
          )}

          {showClarity && hasDocument && transcript && milestones.length > 0 && (
            <ClarityDisplay
              transcript={transcript}
              onNext={handleClarityComplete}
              onBack={() => setShowClarity(false)}
            />
          )}

          {coverageData && clarityData && (
            <div className="panel p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-2 h-2 rounded-sm ${isMastered ? "bg-verified" : clarityData.isGaming ? "bg-flagged" : "bg-brass"}`} />
                <h2 className="font-serif text-xl font-semibold text-parchment">
                  {clarityData.isGaming ? "Review Needed" : isMastered ? "Mastery Achieved" : "Assessment Complete"}
                </h2>
              </div>

              {clarityData.isGaming ? (
                <div className="p-4 rounded-panel border border-flagged/60 bg-flagged/10">
                  <p className="font-mono text-sm font-bold text-flagged tracking-wide">Explanation flagged for review</p>
                  <p className="font-mono text-xs text-flagged/80 mt-2 leading-relaxed">{clarityData.reasoning}</p>
                  <p className="font-mono text-xs text-parchment-muted mt-3">Clarity was set to 0. Focus on connecting ideas with words like “because,” “therefore,” and “this means” to show how concepts relate.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="label-tag">Final Score</span>
                    <span className="score-display">{finalScore}</span>
                    <span className="label-tag">/100</span>
                  </div>
                  <div className="h-1 bg-ink-border rounded-sm overflow-hidden mb-2">
                    <div
                      className={`h-full transition-all duration-1000 ease-out ${isMastered ? "bg-verified" : "bg-brass"}`}
                      style={{ width: `${finalScore}%` }}
                    />
                  </div>
                  <p className="font-mono text-xs text-parchment-muted mb-4">
                    Coverage {coverageData.score}% × 0.6 + Clarity {clarityData.isGaming ? 0 : clarityData.score}% × 0.4
                  </p>
                  {!isMastered && (
                    <p className="font-mono text-xs text-parchment-muted leading-relaxed">
                      Keep refining your explanation. Try to link each milestone with clear cause-and-effect language so your reasoning is easy to follow.
                    </p>
                  )}
                  {isMastered && (
                    <p className="font-mono text-xs text-verified leading-relaxed">
                      Your explanation demonstrates strong coverage and clear reasoning.
                    </p>
                  )}
                </>
              )}

              <details className="mt-5">
                <summary className="font-mono text-xs text-parchment-muted cursor-pointer hover:text-parchment transition-colors tracking-wider">
                  View transcript
                </summary>
                <p className="mt-2 font-mono text-xs text-parchment/60 whitespace-pre-wrap leading-relaxed">{transcript}</p>
              </details>
            </div>
          )}

          {isMastered && milestones.length > 0 && (
            <ExportFeature
              milestones={milestones}
              transcript={transcript}
              onReset={handleReset}
            />
          )}

          {historyOpen && (
            <HistoryPanel entries={historyEntries} onClose={() => setHistoryOpen(false)} onClear={handleClearHistory} />
          )}
        </main>
      </div>
    </div>
  )
}
