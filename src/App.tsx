import "./index.css"
import { DocumentUpload } from "./components/DocumentUpload"
import { VoiceRecorder } from "./components/VoiceRecorder"
import { ExportFeature } from "./components/ExportFeature"
import type { Milestone, CoverageDetail, SubjectDomain, AcousticMetrics } from "./types"
import { useState, useEffect, useRef } from "react"
import { generateMilestones } from "./lib/milestoneService"
import { evaluateCombined, type CombinedEvaluationResult } from "./lib/combinedEvaluationService"
import { generateFollowUpQuestion } from "./lib/followUpService"

interface HistoryEntry {
  id: string
  date: string
  milestones: Milestone[]
  coverageScore: number
  clarityScore: number
  finalScore: number
  transcript: string
  isGaming: boolean
  fingerprint: string
  details: CoverageDetail[]
  confidence?: "high" | "moderate" | "low"
  subjectDomain?: SubjectDomain
  acousticMetrics?: AcousticMetrics
  nextReviewDate?: string
}

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

function computeFingerprint(milestones: Milestone[]): string {
  const joined = milestones.map((m) => m.text).join("|")
  return simpleHash(joined)
}

function Sparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null
  const width = 120
  const height = 32
  const padding = 4
  const max = 100
  const min = 0
  const range = max - min || 1
  const stepX = (width - padding * 2) / (scores.length - 1)
  const points = scores
    .map((score, idx) => {
      const x = padding + idx * stepX
      const y = height - padding - ((score - min) / range) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <polyline fill="none" stroke="#C9962C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" points={points} />
      {scores.map((score, idx) => {
        const x = padding + idx * stepX
        const y = height - padding - ((score - min) / range) * (height - padding * 2)
        return <circle key={idx} cx={x} cy={y} r="2.5" fill="#C9962C" />
      })}
    </svg>
  )
}

function HeaderBar({ onNewSession, onHistory, hasHistory }: { onNewSession: () => void; onHistory: () => void; hasHistory: boolean }) {
  return (
    <div className="absolute top-0 right-0 flex items-center gap-2">
      <button
        onClick={onNewSession}
        aria-label="New Session"
        title="New Session"
        className="w-10 h-10 rounded-panel border border-ink-border bg-ink-light flex items-center justify-center text-parchment-muted hover:text-parchment hover:border-brass transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <button
        onClick={onHistory}
        aria-label="History"
        title="History"
        className="w-10 h-10 rounded-panel border border-ink-border bg-ink-light flex items-center justify-center text-parchment-muted hover:text-parchment hover:border-brass transition-colors relative"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
        {hasHistory && <span className="absolute -top-1 -right-1 w-2 h-2 bg-brass rounded-full" />}
      </button>
    </div>
  )
}

function HistoryPanel({
  entries,
  onClose,
  onClear,
  onExport,
  onImport,
}: {
  entries: HistoryEntry[]
  onClose: () => void
  onClear: () => void
  onExport?: () => void
  onImport?: (file: File) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    // Focus the close button when opened
    closeButtonRef.current?.focus()
    // Prevent background scroll
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="relative panel p-6 w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-brass rounded-sm" />
            <h2 id="history-title" className="font-serif text-lg font-semibold text-parchment">Session History</h2>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close history"
            className="text-parchment-muted hover:text-parchment transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="label-tag mb-4">Stored locally in your browser</p>

        {entries.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <p className="font-mono text-xs text-parchment-muted">No sessions yet.</p>
            <p className="font-mono text-xs text-parchment-muted mt-1">Complete an evaluation to see history here.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {(() => {
                // Group by fingerprint
                const groups = new Map<string, HistoryEntry[]>()
                for (const entry of entries) {
                  const fp = entry.fingerprint || computeFingerprint(entry.milestones)
                  if (!groups.has(fp)) groups.set(fp, [])
                  groups.get(fp)!.push(entry)
                }
                const groupEntries = Array.from(groups.entries())
                return groupEntries.map(([fp, group]) => {
                  const sorted = [...group].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                  const scores = sorted.map((e) => e.finalScore)
                  const showSparkline = sorted.length >= 2
                  return (
                    <div key={fp} className="space-y-2">
                      {showSparkline && (
                        <div className="p-3 rounded-panel border border-brass/20 bg-brass/5">
                          <p className="font-mono text-[10px] text-brass mb-2">
                            Attempt {sorted.map((_, i) => i + 1).join(" → ")}: {scores.join(" → ")}
                          </p>
                          <Sparkline scores={scores} />
                        </div>
                      )}
                      {sorted
                        .slice()
                        .reverse()
                        .map((entry) => {
                          const isDue = entry.nextReviewDate ? new Date(entry.nextReviewDate).getTime() <= Date.now() : false
                          const nextReviewLabel = entry.nextReviewDate
                            ? `Next review: ${new Date(entry.nextReviewDate).toLocaleDateString()}${isDue ? " • Due for review" : ""}`
                            : null
                          return (
                            <div key={entry.id} className="p-4 rounded-panel border border-ink-border bg-ink">
                              <div className="flex items-center justify-between mb-2">
                                <span className="font-mono text-xs text-brass">{new Date(entry.date).toLocaleString()}</span>
                                <span
                                  className={`font-mono text-xs font-bold ${entry.finalScore >= 80 ? "text-verified" : entry.isGaming ? "text-flagged" : "text-parchment-muted"}`}
                                >
                                  {entry.finalScore}/100
                                </span>
                              </div>
                              {isDue && (
                                <div className="mb-2 px-2 py-1 rounded bg-brass/20 border border-brass/30 text-brass font-mono text-[10px]">Due for review</div>
                              )}
                              {nextReviewLabel && <p className="font-mono text-[10px] text-parchment-muted mb-2">{nextReviewLabel}</p>}
                              {(entry.subjectDomain || entry.confidence) && (
                                <div className="flex gap-2 mb-2">
                                  {entry.subjectDomain && (
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-ink-border bg-ink-light text-parchment-muted">
                                      {entry.subjectDomain === "narrative" ? "Narrative" : "Technical"}
                                    </span>
                                  )}
                                  {entry.confidence && (
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-ink-border text-parchment-muted">
                                      Confidence: {entry.confidence}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="mb-2">
                                <h3 className="label-tag text-[10px] mb-1">Milestones</h3>
                                <ul className="space-y-1">
                                  {entry.milestones.map((m) => (
                                    <li key={m.id} className="font-mono text-xs text-parchment-muted truncate">• {m.text}</li>
                                  ))}
                                </ul>
                              </div>
                              {entry.details && entry.details.length > 0 && (
                                <div className="mb-2">
                                  <h4 className="label-tag text-[10px] mb-1">Coverage Details</h4>
                                  <ul className="space-y-1">
                                    {entry.details.slice(0, 3).map((d: any, i) => (
                                      <li key={i} className="font-mono text-[10px] text-parchment-muted truncate">
                                        {d.covered ? "✓" : "—"} {d.concept.slice(0, 50)}
                                        {d.concept.length > 50 ? "…" : ""}{" "}
                                        {typeof d.sub_score === "number" ? (
                                          <span className="text-brass">
                                            {d.sub_score}/{d.max_score ?? 20}
                                          </span>
                                        ) : null}
                                        {d.is_factually_correct === false ? <span className="text-flagged"> • factually wrong</span> : null}
                                      </li>
                                    ))}
                                    {entry.details.length > 3 && (
                                      <li className="font-mono text-[10px] text-parchment-muted">+{entry.details.length - 3} more</li>
                                    )}
                                  </ul>
                                </div>
                              )}
                              {entry.acousticMetrics && (
                                <p className="font-mono text-[10px] text-parchment-muted mb-2">
                                  Speech: {entry.acousticMetrics.wordsPerMinute} WPM, {entry.acousticMetrics.pauseCount} pauses
                                </p>
                              )}
                              <div className="flex gap-4 font-mono text-xs text-parchment-muted">
                                <span>Coverage {entry.coverageScore}%</span>
                                <span>
                                  Clarity {entry.isGaming ? 0 : entry.clarityScore}%{entry.isGaming ? " (flagged)" : ""}
                                </span>
                                <span className="text-parchment">Final {entry.finalScore}%</span>
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  )
                })
              })()}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex gap-2">
                <button onClick={onExport} className="btn-ghost flex-1 text-xs">
                  Export History
                </button>
                <label className="btn-ghost flex-1 text-xs text-center cursor-pointer">
                  Import History
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file && onImport) onImport(file)
                      e.currentTarget.value = ""
                    }}
                  />
                </label>
              </div>
              <button onClick={onClear} className="btn-ghost w-full text-xs">
                Clear History
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [transcript, setTranscript] = useState<string>("")
  const [combinedResult, setCombinedResult] = useState<CombinedEvaluationResult | null>(null)
  const [isEvaluating, setIsEvaluating] = useState(false)
  const [evaluationError, setEvaluationError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [hasSaved, setHasSaved] = useState(false)
  const [subjectDomain, setSubjectDomain] = useState<SubjectDomain | null>(null)
  const [acousticMetrics, setAcousticMetrics] = useState<AcousticMetrics | null>(null)
  const [evalCooldown, setEvalCooldown] = useState(false)

  // Block 1: Document upload + background processing
  const [hasDocument, setHasDocument] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [documentStatus, setDocumentStatus] = useState<"idle" | "extracting" | "generating" | "ready" | "error">("idle")
  const [documentError, setDocumentError] = useState<string | null>(null)
  // Block 6: Back navigation — preserve data when going back
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)
  // Generation / evaluation tokens to guard against stale async results
  const milestoneGenIdRef = useRef(0)
  const evalGenIdRef = useRef(0)
  const evalInFlightRef = useRef(false)
  // Phase 3: Follow-up Socratic probe
  const [followUpQuestion, setFollowUpQuestion] = useState<string | null>(null)
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [followUpAnswer, setFollowUpAnswer] = useState("")
  const [followUpSkipped, setFollowUpSkipped] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const followUpGenIdRef = useRef(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem("feynmanbox_history")
      if (raw) {
        const parsed = JSON.parse(raw) as HistoryEntry[]
        if (Array.isArray(parsed)) {
          // Migrate legacy details without sub_score/max_score/is_factually_correct
          const migrated = parsed.map((entry) => {
            if (entry.details && Array.isArray(entry.details)) {
              entry.details = entry.details.map((d: any) => {
                if (typeof d.sub_score !== "number") {
                  const max = 20
                  const covered = Boolean(d.covered)
                  return {
                    concept: d.concept,
                    covered,
                    feedback: d.feedback,
                    sub_score: covered ? max : 0,
                    max_score: max,
                    is_factually_correct: true,
                  } as CoverageDetail
                }
                return d
              })
            }
            return entry
          })
          setHistoryEntries(migrated)
        }
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
    const genId = ++milestoneGenIdRef.current
    setDocumentStatus("generating")
    try {
      const result = await generateMilestones(text)
      if (genId !== milestoneGenIdRef.current) return
      if (result.success) {
        if (!result.milestones || result.milestones.length === 0) {
          setDocumentStatus("error")
          setDocumentError("We couldn't extract any key concepts from those notes. Please try a different document or add more detail.")
          setMilestones([])
          setSubjectDomain(result.subjectDomain ?? null)
          return
        }
        setMilestones(result.milestones)
        setSubjectDomain(result.subjectDomain ?? null)
        setDocumentStatus("ready")
        setDocumentError(null)
      } else {
        setDocumentStatus("error")
        setDocumentError(result.error || "We couldn't prepare your milestones. Please try again.")
        setSubjectDomain(result.subjectDomain ?? null)
      }
    } catch (err: unknown) {
      if (genId !== milestoneGenIdRef.current) return
      const msg = err instanceof Error ? err.message : "We couldn't complete the request. Please try again."
      setDocumentStatus("error")
      setDocumentError(msg)
    }
  }

  const handleFileSelected = async (file: File) => {
    // Immediate transition — don't block UI
    setHasDocument(true)
    setFileName(file.name)
    setDocumentStatus("extracting")
    setDocumentError(null)
    setMilestones([])
    const genId = milestoneGenIdRef.current + 1
    milestoneGenIdRef.current = genId
    // Background extraction - lazy load heavy libs
    try {
      const { extractTextFromFile } = await import("./lib/fileExtractor")
      const fileGenId = milestoneGenIdRef.current
      const text = await extractTextFromFile(file)
      if (fileGenId !== milestoneGenIdRef.current) return
      return processNotesToMilestones(text)
    } catch (err: unknown) {
      if (genId !== milestoneGenIdRef.current) return
      const msg = err instanceof Error ? err.message : "We couldn't read that file. Please try another file or paste your notes."
      setDocumentStatus("error")
      setDocumentError(msg)
    }
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

  const runCombinedEvaluation = async (currentTranscript: string, currentMilestones: Milestone[]) => {
    if (!currentTranscript.trim() || currentMilestones.length === 0) return
    if (evalInFlightRef.current) return
    if (evalCooldown) return
    evalInFlightRef.current = true
    const evalId = ++evalGenIdRef.current
    setIsEvaluating(true)
    setEvaluationError(null)
    setCombinedResult(null)
    try {
      const result = await evaluateCombined(currentMilestones, currentTranscript, {
        subjectDomain: subjectDomain ?? undefined,
        acousticMetrics: acousticMetrics ?? undefined,
      })
      if (evalId !== evalGenIdRef.current) return
      setCombinedResult(result)
      setEvaluationError(null)
      // Client-side cooldown (Phase 6.1)
      setEvalCooldown(true)
      setTimeout(() => setEvalCooldown(false), 4000)
    } catch (err: unknown) {
      if (evalId !== evalGenIdRef.current) return
      const msg = err instanceof Error ? err.message : "We couldn't complete the analysis. Please try again."
      setEvaluationError(msg)
      setCombinedResult(null)
    } finally {
      if (evalId === evalGenIdRef.current) {
        setIsEvaluating(false)
      }
      evalInFlightRef.current = false
    }
  }

  // FIX 3: Auto-run combined evaluation when transcript + milestones ready (single click flow)
  useEffect(() => {
    if (
      hasDocument &&
      transcript &&
      !isEditingTranscript &&
      milestones.length > 0 &&
      documentStatus === "ready" &&
      !combinedResult &&
      !isEvaluating &&
      !evaluationError
    ) {
      runCombinedEvaluation(transcript, milestones)
    }
  }, [hasDocument, transcript, milestones, isEditingTranscript, documentStatus, combinedResult, isEvaluating, evaluationError])

  // Save to history when combined result present and not yet saved
  useEffect(() => {
    if (combinedResult && !hasSaved && milestones.length > 0) {
      const finalScore = Math.round(combinedResult.coverage_score * 0.6 + (combinedResult.is_gaming_attempt ? 0 : combinedResult.clarity_score) * 0.4)
      const fingerprint = computeFingerprint(milestones)
      // Spaced repetition (Phase 7.2): base interval on score, extend on repeated success
      const priorSameFp = historyEntries.filter((e) => e.fingerprint === fingerprint)
      const priorSuccessCount = priorSameFp.filter((e) => e.finalScore >= 80).length
      let baseDays = 1
      if (finalScore >= 80) baseDays = 7
      else if (finalScore >= 50) baseDays = 2
      // Each prior success on same fingerprint extends interval (Ebbinghaus-inspired)
      const intervalDays = baseDays * Math.pow(1.5, priorSuccessCount)
      const nextReview = new Date()
      nextReview.setDate(nextReview.getDate() + Math.round(intervalDays))
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        milestones,
        coverageScore: combinedResult.coverage_score,
        clarityScore: combinedResult.is_gaming_attempt ? 0 : combinedResult.clarity_score,
        finalScore,
        transcript: transcript,
        isGaming: combinedResult.is_gaming_attempt,
        fingerprint,
        details: combinedResult.details,
        confidence: combinedResult.confidence,
        subjectDomain: combinedResult.subject_domain ?? subjectDomain ?? undefined,
        acousticMetrics: combinedResult.acousticMetrics ?? acousticMetrics ?? undefined,
        nextReviewDate: nextReview.toISOString(),
      }
      const next = [...historyEntries, entry]
      setHistoryEntries(next)
      persistHistory(next)
      setHasSaved(true)
    }
  }, [combinedResult, milestones, transcript, hasSaved, historyEntries, subjectDomain, acousticMetrics])

  // Phase 3.2: Socratic follow-up question — auto-fetch when results ready
  useEffect(() => {
    if (!combinedResult || !transcript || milestones.length === 0) return
    const missed = combinedResult.details.find((d) => !d.covered)
    if (!missed) {
      setFollowUpQuestion(null)
      setFollowUpLoading(false)
      return
    }
    const genId = ++followUpGenIdRef.current
    setFollowUpLoading(true)
    setFollowUpQuestion(null)
    setFollowUpError(null)
    setFollowUpSkipped(false)
    setFollowUpAnswer("")
    generateFollowUpQuestion(missed.concept, transcript)
      .then((q) => {
        if (genId !== followUpGenIdRef.current) return
        setFollowUpQuestion(q)
        setFollowUpLoading(false)
      })
      .catch(() => {
        if (genId !== followUpGenIdRef.current) return
        setFollowUpError(null)
        setFollowUpLoading(false)
        // Fail silently — follow-up is optional
      })
  }, [combinedResult, transcript, milestones])

  const handleReset = () => {
    milestoneGenIdRef.current += 1
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setMilestones([])
    setTranscript("")
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setHasSaved(false)
    setHistoryOpen(false)
    setHasDocument(false)
    setFileName(null)
    setDocumentStatus("idle")
    setDocumentError(null)
    setIsEditingTranscript(false)
    setFollowUpQuestion(null)
    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    setSubjectDomain(null)
    setAcousticMetrics(null)
    setEvalCooldown(false)
  }

  const handleBackToUpload = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setHasDocument(false)
    setIsEditingTranscript(false)
    setTranscript("")
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setFollowUpQuestion(null)
    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
  }

  const handleBackToTranscript = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setIsEditingTranscript(true)
    setFollowUpQuestion(null)
    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
  }

  const handleTranscriptReady = (newTranscript: string, metrics?: AcousticMetrics) => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setTranscript(newTranscript)
    if (metrics) setAcousticMetrics(metrics)
    setIsEditingTranscript(false)
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setHasSaved(false)
    setFollowUpQuestion(null)
    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
  }

  const handleRetryEvaluation = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setEvaluationError(null)
    setCombinedResult(null)
    setFollowUpQuestion(null)
    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    if (transcript && milestones.length > 0) {
      // delay to allow state to settle before re-evaluating
      setTimeout(() => runCombinedEvaluation(transcript, milestones), 0)
    }
  }

  const handleClearHistory = () => {
    setHistoryEntries([])
    persistHistory([])
  }

  const handleExportHistory = () => {
    const data = JSON.stringify(historyEntries, null, 2)
    const blob = new Blob([data], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `feynmanbox-history-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportHistory = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error("Invalid history file")
      // De-duplicate by id
      const existingIds = new Set(historyEntries.map((e) => e.id))
      const toAdd = parsed.filter((e: any) => e && typeof e.id === "string" && !existingIds.has(e.id))
      if (toAdd.length === 0) {
        alert("No new entries to import — all entries already exist.")
        return
      }
      // Basic validation and migration for old details
      const migrated = toAdd.map((e: any) => {
        if (e.details && Array.isArray(e.details)) {
          e.details = e.details.map((d: any) => {
            if (typeof d.sub_score !== "number") {
              const max = 20
              const covered = Boolean(d.covered)
              return {
                concept: d.concept,
                covered,
                feedback: d.feedback,
                sub_score: covered ? max : 0,
                max_score: max,
                is_factually_correct: true,
              }
            }
            return d
          })
        }
        return e as HistoryEntry
      })
      const next = [...historyEntries, ...migrated]
      setHistoryEntries(next)
      persistHistory(next)
      alert(`Imported ${migrated.length} entries.`)
    } catch (err) {
      alert(`Failed to import history: ${err instanceof Error ? err.message : "Invalid file"}`)
    }
  }

  const finalScore = combinedResult ? Math.round(combinedResult.coverage_score * 0.6 + (combinedResult.is_gaming_attempt ? 0 : combinedResult.clarity_score) * 0.4) : 0
  const isMastered = combinedResult !== null && finalScore >= 80 && !combinedResult.is_gaming_attempt
  const hasHistory = historyEntries.length > 0

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center relative">
          <HeaderBar onNewSession={handleReset} onHistory={() => setHistoryOpen(true)} hasHistory={hasHistory} />
          <h1 className="font-serif text-4xl sm:text-5xl font-bold text-parchment tracking-tight">FeynmanBox</h1>
          <div className="mt-3 mx-auto w-16 h-0.5 bg-brass" />
          <p className="mt-3 font-serif text-sm text-parchment-muted italic leading-relaxed max-w-xl mx-auto">
            It doesn't test what you remember. It tests if you can explain it.
          </p>
          <p className="mt-1 label-tag text-[10px]">Oral examination — bluff detection</p>
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
            <>
              <p className="font-mono text-xs text-parchment-muted text-center leading-relaxed max-w-xl mx-auto -mt-2">
                Catches the illusion of competence — when reciting keywords feels like understanding, but isn&apos;t.
              </p>
              <DocumentUpload onFileSelected={handleFileSelected} onPasteText={handlePasteText} error={documentError} status={documentStatus} />
            </>
          )}

          {hasDocument && (!transcript || isEditingTranscript) && (
            <VoiceRecorder onTranscriptReady={handleTranscriptReady} initialTranscript={isEditingTranscript ? transcript : undefined} onBack={handleBackToUpload} />
          )}

          {hasDocument && transcript && !isEditingTranscript && milestones.length === 0 && documentStatus !== "ready" && documentStatus !== "error" && (
            <div className="panel p-6 text-center">
              <div className="w-2 h-2 bg-brass rounded-full animate-pulse mx-auto mb-3" />
              <p className="label-tag">Analyzing your notes...</p>
              <p className="font-mono text-xs text-parchment-muted mt-2">Preparing your key concepts — this will be ready shortly.</p>
              <div className="mt-4 h-0.5 bg-ink-border rounded-sm overflow-hidden">
                <div className="h-full bg-brass animate-progress-bar" />
              </div>
            </div>
          )}

          {/* FIX 3: Single combined evaluation — auto runs after Confirm & Evaluate, one loading state */}
          {hasDocument && transcript && !isEditingTranscript && milestones.length > 0 && isEvaluating && (
            <div className="panel p-6 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-0.5">
                <div className="h-full bg-brass animate-progress-bar" />
              </div>
              <div className="w-2 h-2 bg-brass rounded-full animate-pulse mx-auto mb-3" />
              <p className="label-tag">Analyzing your explanation...</p>
              <p className="font-mono text-xs text-parchment-muted mt-2">Checking coverage and clarity in one step.</p>
              <div className="mt-4 h-0.5 bg-ink-border rounded-sm overflow-hidden">
                <div className="h-full bg-brass animate-progress-bar" />
              </div>
            </div>
          )}

          {hasDocument && transcript && !isEditingTranscript && milestones.length > 0 && evaluationError && !isEvaluating && (
            <div className="panel p-6">
              <div className="p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
                {evaluationError}
                {evaluationError.includes("Too many requests") && <span className="block mt-2 text-[10px] opacity-80">Rate limit: 20 requests per 10 minutes. Please wait a minute before retrying.</span>}
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRetryEvaluation}
                  disabled={evalCooldown}
                  className={`btn-primary flex-1 ${evalCooldown ? "opacity-40 cursor-not-allowed" : ""}`}
                >
                  {evalCooldown ? "Please wait..." : "Try Again"}
                </button>
                <button onClick={handleBackToTranscript} className="btn-ghost">
                  Edit Transcript
                </button>
              </div>
              {evalCooldown && <p className="font-mono text-[10px] text-parchment-muted mt-2">Cooling down — please wait a moment before re-evaluating.</p>}
            </div>
          )}

          {hasDocument && transcript && !isEditingTranscript && milestones.length > 0 && combinedResult && !isEvaluating && (
            <div className="panel p-6 animate-fade-in relative overflow-hidden">
              <button
                onClick={handleBackToTranscript}
                className="flex items-center gap-1.5 font-mono text-xs text-parchment-muted hover:text-parchment transition-colors mb-4 tracking-wider"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
                Back to transcript
              </button>

              <div className="flex items-center gap-3 mb-2">
                <div className={`w-2 h-2 rounded-sm ${isMastered ? "bg-verified" : combinedResult.is_gaming_attempt ? "bg-flagged" : "bg-brass"}`} />
                <h2 className="font-serif text-xl font-semibold text-parchment">
                  {combinedResult.is_gaming_attempt ? "Review Needed" : isMastered ? "Mastery Achieved" : "Assessment Complete"}
                </h2>
              </div>
              <h3 className="label-tag mb-2">Combined Evaluation</h3>
              {/* Subject-aware label */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] px-2 py-1 rounded border border-brass/30 bg-brass/10 text-brass">
                  Evaluating as: {combinedResult.subject_domain === "narrative" ? "Narrative content" : "Technical content"}
                </span>
                <span className="font-mono text-[10px] text-parchment-muted">
                  {combinedResult.subject_domain === "narrative" ? "• thematic coherence" : "• causal logic"}
                </span>
                <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${combinedResult.confidence === "high" ? "bg-verified/20 text-verified" : combinedResult.confidence === "low" ? "bg-flagged/20 text-flagged" : "bg-ink-border text-parchment-muted"}`}>
                  Confidence: {combinedResult.confidence}
                </span>
              </div>

              {/* Overall score */}
              <div className="flex items-baseline gap-3 mb-1">
                <span className="label-tag">Final Score</span>
                <span className="score-display">{finalScore}</span>
                <span className="label-tag">/100</span>
              </div>
              <p className="font-mono text-[10px] text-parchment-muted mb-2">
                Coverage {combinedResult.coverage_score}/100 + Clarity {combinedResult.is_gaming_attempt ? 0 : combinedResult.clarity_score}/100 → Final {finalScore} (60% coverage, 40% clarity)
              </p>
              <div className="h-1 bg-ink-border rounded-sm overflow-hidden mb-3">
                <div
                  className={`h-full transition-all duration-1000 ease-out ${isMastered ? "bg-verified" : combinedResult.is_gaming_attempt ? "bg-flagged" : "bg-brass"}`}
                  style={{ width: `${finalScore}%` }}
                />
              </div>
              {/* Coverage breakdown traceability */}
              <p className="font-mono text-[10px] text-parchment-muted mb-4">
                Coverage {combinedResult.coverage_score}/100 = sum of {combinedResult.details.map((d) => `${d.sub_score}/${d.max_score}`).join(" + ")} — inspectable per-concept below
              </p>

              {/* Low confidence informational note */}
              {combinedResult.confidence === "low" && (
                <div className="p-3 rounded-panel border border-brass/30 bg-brass/5 mb-4">
                  <p className="font-mono text-xs text-brass leading-relaxed">
                    Evaluation confidence: Low — this explanation was brief or ambiguous; consider re-recording with more detail for a more reliable assessment.
                  </p>
                </div>
              )}

              {/* FIX 4: Brief overall summary */}
              <div className="p-4 rounded-panel border border-brass/20 bg-brass/5 mb-6">
                <h3 className="label-tag text-[10px] mb-1">Summary</h3>
                <p className="font-serif text-sm text-parchment leading-relaxed">{combinedResult.summary}</p>
              </div>

              {/* Flagged warning inline */}
              {combinedResult.is_gaming_attempt && (
                <div className="p-4 rounded-panel border border-flagged/60 bg-flagged/10 mb-6 animate-shake">
                  <p className="font-mono text-sm font-bold text-flagged tracking-wide">Explanation flagged for review</p>
                  <p className="font-mono text-xs text-flagged mt-2 leading-relaxed">{combinedResult.reasoning}</p>
                  <p className="font-mono text-xs text-parchment-muted mt-3">Clarity was set to 0. Focus on connecting ideas with words like “because,” “therefore,” and “this means” to show how concepts relate.</p>
                </div>
              )}

              {/* Per-concept granular sub-scores — what you understood well */}
              {combinedResult.details.filter((d) => d.covered).length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-verified rounded-sm" />
                    <h3 className="label-tag text-[10px]">What you understood well</h3>
                    <span className="font-mono text-[10px] text-verified">{combinedResult.details.filter((d) => d.covered).length} • covered</span>
                  </div>
                  <div className="space-y-3">
                    {combinedResult.details
                      .filter((d) => d.covered)
                      .map((detail, idx) => (
                        <div key={`covered-${idx}`} className="p-3 rounded-panel border border-verified/30 bg-verified/5">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 w-4 h-4 rounded-sm bg-verified border border-verified flex items-center justify-center flex-shrink-0">
                              <svg className="w-2.5 h-2.5 text-ink" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M2 6l3 3 5-5" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-serif text-sm text-parchment leading-snug flex-1">{detail.concept}</p>
                                <span className="font-mono text-xs font-bold text-verified flex-shrink-0">{detail.sub_score}/{detail.max_score}</span>
                              </div>
                              <p className="font-mono text-xs text-verified mt-1.5 leading-relaxed">{detail.feedback}</p>
                              {!detail.is_factually_correct && <p className="font-mono text-[10px] text-flagged mt-1">⚠ Flagged as factually incorrect — see feedback above</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* What you missed — with sub-scores */}
              {combinedResult.details.filter((d) => !d.covered).length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-flagged rounded-sm" />
                    <h3 className="label-tag text-[10px]">What you missed or need to revisit</h3>
                    <span className="font-mono text-[10px] text-flagged">{combinedResult.details.filter((d) => !d.covered).length} • to review</span>
                  </div>
                  <div className="space-y-3">
                    {combinedResult.details
                      .filter((d) => !d.covered)
                      .map((detail, idx) => (
                        <div key={`missed-${idx}`} className="p-3 rounded-panel border border-flagged/20 bg-flagged/5">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 w-4 h-4 rounded-sm border-2 border-parchment-muted/30 flex items-center justify-center flex-shrink-0">
                              <span className="font-mono text-[8px] text-parchment-muted">—</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-serif text-sm text-parchment leading-snug flex-1">{detail.concept}</p>
                                <span className={`font-mono text-xs font-bold flex-shrink-0 ${!detail.is_factually_correct ? "text-flagged" : "text-parchment-muted"}`}>{detail.sub_score}/{detail.max_score}</span>
                              </div>
                              <p className="font-mono text-xs text-parchment-muted mt-1.5 leading-relaxed">{detail.feedback}</p>
                              {!detail.is_factually_correct && <p className="font-mono text-[10px] text-flagged mt-1">Factually incorrect — {detail.feedback}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Full per-concept breakdown table for traceability */}
              <div className="mb-6 p-3 rounded-panel border border-ink-border bg-ink">
                <h3 className="label-tag text-[10px] mb-2">Per-Concept Breakdown (traceable)</h3>
                <div className="space-y-1.5">
                  {combinedResult.details.map((d, i) => (
                    <div key={`breakdown-${i}`} className="flex items-center justify-between gap-2 font-mono text-xs">
                      <span className="text-parchment-muted truncate flex-1">Concept {i + 1} — {d.concept.slice(0, 40)}{d.concept.length > 40 ? "…" : ""}</span>
                      <span className={`flex-shrink-0 font-bold ${d.sub_score >= d.max_score * 0.7 ? "text-verified" : d.sub_score === 0 ? "text-flagged" : "text-brass"}`}>{d.sub_score}/{d.max_score}</span>
                      <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${d.is_factually_correct ? "bg-verified/50" : "bg-flagged"}`} title={d.is_factually_correct ? "factually correct" : "factually incorrect"} />
                    </div>
                  ))}
                  <div className="pt-2 mt-2 border-t border-ink-border flex items-center justify-between font-mono text-xs font-bold">
                    <span className="text-parchment">Total Coverage</span>
                    <span className="text-parchment">{combinedResult.coverage_score}/100</span>
                  </div>
                </div>
              </div>

              {/* Clarity feedback when not flagged — subject-aware */}
              {!combinedResult.is_gaming_attempt && combinedResult.reasoning && (
                <div className="p-4 rounded-panel border border-ink-border bg-ink mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-brass rounded-sm" />
                    <h3 className="label-tag text-[10px]">Clarity & Coherence {combinedResult.subject_domain === "narrative" ? "(thematic)" : "(causal)"}</h3>
                    <span className="font-mono text-xs text-parchment ml-auto">{combinedResult.clarity_score}/100</span>
                  </div>
                  <div className="h-1 bg-ink-border rounded-sm overflow-hidden mb-3">
                    <div className="h-full bg-brass transition-all duration-1000 ease-out" style={{ width: `${combinedResult.clarity_score}%` }} />
                  </div>
                  <p className="font-mono text-xs text-parchment-muted leading-relaxed">{combinedResult.reasoning}</p>
                </div>
              )}

              {/* Speech Analysis — acoustic/prosody supplementary signals (Phase 5) */}
              {combinedResult.acousticMetrics && (
                <div className="p-4 rounded-panel border border-ink-border bg-ink mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-brass rounded-sm" />
                    <h3 className="label-tag text-[10px]">Speech Analysis</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                    <div>
                      <span className="text-parchment-muted">Pace:</span> <span className="text-parchment">{combinedResult.acousticMetrics.wordsPerMinute} WPM</span>
                      <span className="text-parchment-muted ml-1">
                        {combinedResult.acousticMetrics.wordsPerMinute > 180 ? "• unusually fast" : combinedResult.acousticMetrics.wordsPerMinute < 100 ? "• slow" : "• natural"}
                      </span>
                    </div>
                    <div>
                      <span className="text-parchment-muted">Pauses:</span> <span className="text-parchment">{combinedResult.acousticMetrics.pauseCount} pauses</span>
                      <span className="text-parchment-muted ml-1">• {(combinedResult.acousticMetrics.totalPauseDuration / 1000).toFixed(1)}s total</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-parchment-muted">Pitch variance:</span> <span className="text-parchment">{combinedResult.acousticMetrics.pitchVarianceScore.toFixed(1)}/100</span>
                      <span className="text-parchment-muted ml-1">{combinedResult.acousticMetrics.pitchVarianceScore < 20 ? "• flat, may indicate reading" : combinedResult.acousticMetrics.pitchVarianceScore > 60 ? "• expressive" : "• moderate"}</span>
                    </div>
                    <div className="col-span-2 font-mono text-[10px] text-parchment-muted leading-relaxed">
                      {combinedResult.acousticMetrics.wordsPerMinute > 180 && combinedResult.acousticMetrics.pauseCount < 2 ? "Very fast speech with minimal pauses on a complex topic may indicate memorized recitation rather than genuine understanding." : combinedResult.acousticMetrics.pauseCount >= 2 && combinedResult.acousticMetrics.wordsPerMinute >= 120 && combinedResult.acousticMetrics.wordsPerMinute <= 160 ? "Natural pacing with brief pauses for thought is consistent with genuine explanation." : "Acoustic signals are supplementary — text analysis remains primary."}
                    </div>
                  </div>
                </div>
              )}

              {!isMastered && !combinedResult.is_gaming_attempt && (
                <p className="font-mono text-xs text-parchment-muted leading-relaxed">
                  Keep refining your explanation. Try to link each milestone with clear cause-and-effect language so your reasoning is easy to follow.
                </p>
              )}
              {isMastered && (
                <p className="font-mono text-xs text-verified leading-relaxed">Your explanation demonstrates strong coverage and clear reasoning.</p>
              )}

              <details className="mt-5">
                <summary className="font-mono text-xs text-parchment-muted cursor-pointer hover:text-parchment transition-colors tracking-wider">
                  View transcript
                </summary>
                <p className="mt-2 font-mono text-xs text-parchment-muted whitespace-pre-wrap leading-relaxed">{transcript}</p>
              </details>

              <details className="mt-4">
                <summary className="font-mono text-xs text-parchment-muted cursor-pointer hover:text-parchment transition-colors tracking-wider">
                  How this works
                </summary>
                <p className="mt-2 font-mono text-xs text-parchment-muted leading-relaxed">
                  One structured AI call evaluates concept coverage, explanation clarity, and detects keyword-gaming simultaneously — reducing latency and API usage compared to running these as separate sequential calls.
                </p>
              </details>
            </div>
          )}

          {/* Phase 3.2: Socratic follow-up question */}
          {hasDocument && transcript && !isEditingTranscript && milestones.length > 0 && combinedResult && !isEvaluating && !evaluationError && (
            <>
              {followUpLoading && (
                <div className="panel p-6 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-brass rounded-full animate-pulse" />
                    <h3 className="label-tag text-[10px]">Examiner&apos;s Follow-Up</h3>
                  </div>
                  <p className="font-mono text-xs text-parchment-muted">Preparing a follow-up question…</p>
                </div>
              )}
              {followUpQuestion && !followUpSkipped && !followUpLoading && (
                <div className="panel p-6 animate-fade-in border-brass/30">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 bg-brass rounded-sm" />
                    <h3 className="font-serif text-lg font-semibold text-parchment">Examiner&apos;s Follow-Up</h3>
                  </div>
                  <p className="label-tag text-[10px] mb-3">Socratic probe — reflection only, not re-graded</p>
                  <p className="font-serif text-base text-parchment leading-relaxed border-l-2 border-brass pl-4 py-1 mb-4">{followUpQuestion}</p>
                  <label htmlFor="followup-answer" className="label-tag text-[10px] mb-2 block">
                    Your response (optional)
                  </label>
                  <textarea
                    id="followup-answer"
                    value={followUpAnswer}
                    onChange={(e) => setFollowUpAnswer(e.target.value)}
                    placeholder="Type a brief reflection…"
                    rows={3}
                    className="w-full bg-ink border border-ink-border rounded-panel p-3 font-mono text-sm text-parchment placeholder:text-parchment-muted focus:outline-none focus:border-brass transition-colors min-h-[80px]"
                  />
                  <div className="flex gap-3 mt-3">
                    <button onClick={() => setFollowUpSkipped(true)} className="btn-ghost text-xs flex-1">
                      Skip
                    </button>
                    <button onClick={() => setFollowUpSkipped(true)} className="btn-primary text-xs flex-1" disabled={!followUpAnswer.trim()}>
                      Save reflection
                    </button>
                  </div>
                </div>
              )}
              {followUpQuestion && followUpSkipped && followUpAnswer.trim() && (
                <div className="panel p-6 animate-fade-in">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 bg-verified rounded-sm" />
                    <h3 className="font-serif text-lg font-semibold text-parchment">Reflection Saved</h3>
                  </div>
                  <p className="font-serif text-sm text-parchment leading-relaxed border-l-2 border-verified pl-4 py-1 mb-3">{followUpQuestion}</p>
                  <p className="font-mono text-xs text-parchment-muted mb-2">Your response:</p>
                  <p className="font-mono text-sm text-parchment bg-ink border border-ink-border rounded-panel p-3 whitespace-pre-wrap">{followUpAnswer}</p>
                  <p className="font-mono text-xs text-verified mt-3">Not re-graded — for your reflection only.</p>
                  <button onClick={() => setFollowUpSkipped(false)} className="font-mono text-xs text-brass hover:text-brass-light mt-3">
                    Edit response
                  </button>
                </div>
              )}
              {followUpError && !followUpLoading && !followUpQuestion && !followUpSkipped && (
                <div className="panel p-4">
                  <p className="font-mono text-xs text-parchment-muted">Follow-up question unavailable.</p>
                </div>
              )}
              {followUpSkipped && !followUpAnswer.trim() && (
                <div className="panel p-4">
                  <p className="font-mono text-xs text-parchment-muted">Follow-up skipped.</p>
                  <button onClick={() => setFollowUpSkipped(false)} className="font-mono text-xs text-brass hover:text-brass-light mt-2">
                    Show question again
                  </button>
                </div>
              )}
            </>
          )}

          {isMastered && milestones.length > 0 && combinedResult && (
            <ExportFeature
              milestones={milestones}
              transcript={transcript}
              details={combinedResult.details}
              onReset={handleReset}
            />
          )}

          {/* Footer: how-it-works note also visible when no results yet, subtle */}
          {!combinedResult && !isEvaluating && hasDocument && documentStatus === "ready" && (
            <details className="panel p-4">
              <summary className="font-mono text-xs text-parchment-muted cursor-pointer hover:text-parchment transition-colors tracking-wider">
                How this works
              </summary>
              <p className="mt-2 font-mono text-xs text-parchment-muted leading-relaxed">
                One structured AI call evaluates concept coverage, explanation clarity, and detects keyword-gaming simultaneously — reducing latency and API usage compared to running these as separate sequential calls. Document parsing, audio capture, and waveform visualization all run in the browser.
              </p>
            </details>
          )}

          {historyOpen && (
            <HistoryPanel
              entries={historyEntries}
              onClose={() => setHistoryOpen(false)}
              onClear={handleClearHistory}
              onExport={handleExportHistory}
              onImport={handleImportHistory}
            />
          )}
        </main>
      </div>
    </div>
  )
}
