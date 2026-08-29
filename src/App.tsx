import "./index.css"
import { DocumentUpload } from "./components/DocumentUpload"
import { VoiceRecorder } from "./components/VoiceRecorder"
import { ExportFeature } from "./components/ExportFeature"
import { RateLimitAlert } from "./components/RateLimitAlert"
import type { Milestone, CoverageDetail, SubjectDomain, AcousticMetrics } from "./types"
import { useState, useEffect, useRef } from "react"
import { generateMilestones } from "./lib/milestoneService"
import { evaluateCombined, type CombinedEvaluationResult } from "./lib/combinedEvaluationService"
import { generateFollowUpPair, checkFollowUpAnswer, type FollowUpPair, type FollowUpCheck } from "./lib/followUpService"
import { isDemoMode } from "./lib/security"

interface HistoryEntry {
  id: string
  date: string
  milestones: Milestone[]
  coverageScore: number
  clarityScore: number
  finalScore: number
  factualAccuracyScore?: number
  reasoningQualityScore?: number
  transcript: string
  originalTranscript?: string
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

/** Auto-resize a textarea to fit its content height (no internal scroll). */
function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
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

function DimBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3 mb-2 last:mb-0">
      <span className="font-mono text-[10px] text-parchment-muted w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-ink-border rounded-sm overflow-hidden">
        <div className={`h-full transition-all duration-1000 ease-out ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="font-mono text-xs font-bold text-parchment w-10 text-right flex-shrink-0">{Math.round(score)}</span>
    </div>
  )
}

function HeaderBar({ onNewSession, onHistory, hasHistory }: { onNewSession: () => void; onHistory: () => void; hasHistory: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
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
                                <h3 className="label-tag text-[10px] mb-1">Key Concepts</h3>
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
  // Multi-file upload (Bug 2): explicit user action to proceed
  const [uploadedDocs, setUploadedDocs] = useState<Array<{ id: string; fileName: string; text: string; status: "extracting" | "ready" | "error"; error?: string }>>([])
  // Block 6: Back navigation — preserve data when going back
  const [isEditingTranscript, setIsEditingTranscript] = useState(false)
  // Generation / evaluation tokens to guard against stale async results
  const milestoneGenIdRef = useRef(0)
  const evalGenIdRef = useRef(0)
  const evalInFlightRef = useRef(false)
  // Phase 3: Follow-up Socratic probe
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [followUpAnswer, setFollowUpAnswer] = useState("")
  const [followUpSkipped, setFollowUpSkipped] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const followUpGenIdRef = useRef(0)

  // Phase 8.1: immutable original transcript vs editable transcript
  const [originalTranscript, setOriginalTranscript] = useState<string>("")
  const [transcriptCommitted, setTranscriptCommitted] = useState(false)
  const [transcriptSignificantlyEdited, setTranscriptSignificantlyEdited] = useState(false)

  // Phase 11.2: review/edit milestones before recording
  const [milestonesConfirmed, setMilestonesConfirmed] = useState(false)

  // Phase 10.3 / 10.4: transfer question + answer check
  const [followUpPair, setFollowUpPair] = useState<FollowUpPair | null>(null)
  const [followUpCheck, setFollowUpCheck] = useState<FollowUpCheck | null>(null)
  const [followUpChecking, setFollowUpChecking] = useState(false)

  // Phase 11.3: content-guard override in-flight
  const [overrideLoading, setOverrideLoading] = useState(false)
  const [contentGuardCanOverride, setContentGuardCanOverride] = useState(false)

  // Demo mode banner
  const demoMode = isDemoMode()

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
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        const pruned = entries.slice(-10)
        try {
          localStorage.setItem("feynmanbox_history", JSON.stringify(pruned))
          alert("Your history storage was full, so older sessions were removed to make room. Consider exporting your history to keep a backup.")
        } catch {}
      }
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
          setContentGuardCanOverride(false)
          setMilestones([])
          setSubjectDomain(result.subjectDomain ?? null)
          return
        }
        setMilestones(result.milestones)
        setSubjectDomain(result.subjectDomain ?? null)
        setDocumentStatus("ready")
        setDocumentError(null)
        setMilestonesConfirmed(false)
        setContentGuardCanOverride(false)
      } else {
        setDocumentStatus("error")
        setDocumentError(result.error || "We couldn't prepare your milestones. Please try again.")
        setContentGuardCanOverride(Boolean(result.canOverride))
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
    const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setUploadedDocs((prev) => [...prev, { id: docId, fileName: file.name, text: "", status: "extracting" }])
    setDocumentError(null)
    // Clear any prior milestone error when adding new file
    if (documentStatus === "error") {
      setDocumentStatus("idle")
      setDocumentError(null)
    }
    try {
      const { extractTextFromFile } = await import("./lib/fileExtractor")
      const text = await extractTextFromFile(file)
      setUploadedDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, text, status: "ready" as const } : d)))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "We couldn't read that file. Please try another file or paste your notes."
      setUploadedDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, status: "error" as const, error: msg } : d)))
    }
  }

  const handlePasteText = (text: string) => {
    const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const trimmed = text.trim()
    if (!trimmed) {
      setDocumentError("Pasted text is empty.")
      return
    }
    setUploadedDocs((prev) => [...prev, { id: docId, fileName: "Pasted notes", text: trimmed, status: "ready" as const }])
    setDocumentError(null)
    if (documentStatus === "error") {
      setDocumentStatus("idle")
      setDocumentError(null)
    }
  }

  const handleRemoveDoc = (id: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.id !== id))
  }

  const handleContinueToRecording = async () => {
    const readyDocs = uploadedDocs.filter((d) => d.status === "ready" && d.text.trim())
    if (readyDocs.length === 0) {
      setDocumentError("Please add at least one document with readable text before continuing.")
      return
    }
    const combined = readyDocs.map((d) => `--- ${d.fileName} ---\n${d.text.trim()}`).join("\n\n")
    setHasDocument(true)
    setFileName(readyDocs.length === 1 ? readyDocs[0].fileName : `${readyDocs.length} documents`)
    setDocumentError(null)
    setMilestones([])
    setMilestonesConfirmed(false)
    // Trigger milestone generation from combined text
    return processNotesToMilestones(combined)
  }

  // Phase 11.3: override the content-quality guard and extract milestones anyway
  const handleOverrideContentGuard = async () => {
    const readyDocs = uploadedDocs.filter((d) => d.status === "ready" && d.text.trim())
    if (readyDocs.length === 0) return
    const combined = readyDocs.map((d) => `--- ${d.fileName} ---\n${d.text.trim()}`).join("\n\n")
    const genId = ++milestoneGenIdRef.current
    setOverrideLoading(true)
    setDocumentStatus("generating")
    setDocumentError(null)
    try {
      const result = await generateMilestones(combined, { override: true })
      if (genId !== milestoneGenIdRef.current) return
      if (result.success) {
        setMilestones(result.milestones)
        setSubjectDomain(result.subjectDomain ?? null)
        setDocumentStatus("ready")
        setMilestonesConfirmed(false)
      } else {
        setDocumentStatus("error")
        setDocumentError(result.error || "We couldn't extract concepts from that material.")
      }
    } catch (err: unknown) {
      if (genId !== milestoneGenIdRef.current) return
      setDocumentStatus("error")
      setDocumentError(err instanceof Error ? err.message : "We couldn't complete the request.")
    } finally {
      if (genId === milestoneGenIdRef.current) setOverrideLoading(false)
    }
  }

  // BUG 5 FIX: "Try again" after content-guard rejection re-runs milestone generation
  // from the SAME already-extracted document text, instead of resetting to empty upload screen.
  const handleRetryContentGuard = async () => {
    const readyDocs = uploadedDocs.filter((d) => d.status === "ready" && d.text.trim())
    if (readyDocs.length === 0) return
    const combined = readyDocs.map((d) => `--- ${d.fileName} ---\n${d.text.trim()}`).join("\n\n")
    milestoneGenIdRef.current += 1
    setContentGuardCanOverride(false)
    return processNotesToMilestones(combined)
  }

  // Phase 8.1: choose which transcript to evaluate. Minor edits (typo/mishear fixes, <= threshold)
  // transparently improve accuracy, so we evaluate the EDITED version. Significant rewrites (> threshold)
  // are evaluated against the ORIGINAL spoken transcript, with a transparent flag shown to the user.
  const getEvaluationTranscript = (): string => {
    if (transcriptSignificantlyEdited) return originalTranscript
    return transcript
  }

  const runCombinedEvaluation = async (currentMilestones: Milestone[]) => {
    const currentTranscript = getEvaluationTranscript()
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
      const msg = err instanceof Error ? err.message : "We couldn't complete the evaluation. Please try again."
      setEvaluationError(msg)
      setCombinedResult(null)
    } finally {
      if (evalId === evalGenIdRef.current) {
        setIsEvaluating(false)
      }
      evalInFlightRef.current = false
    }
  }

  // FIX 3: Auto-run combined evaluation when transcript committed + milestones ready
  useEffect(() => {
    if (
      hasDocument &&
      transcript &&
      transcriptCommitted &&
      !isEditingTranscript &&
      milestones.length > 0 &&
      documentStatus === "ready" &&
      !combinedResult &&
      !isEvaluating &&
      !evaluationError
    ) {
      runCombinedEvaluation(milestones)
    }
  }, [hasDocument, transcript, transcriptCommitted, isEditingTranscript, milestones, documentStatus, combinedResult, isEvaluating, evaluationError])

  // Save to history when combined result present and not yet saved
  useEffect(() => {
    if (combinedResult && !hasSaved && milestones.length > 0) {
      const finalScore = computeFinalScore(combinedResult)
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
        factualAccuracyScore: combinedResult.factual_accuracy_score,
        reasoningQualityScore: combinedResult.is_gaming_attempt ? 0 : combinedResult.reasoning_quality_score,
        transcript: transcript,
        originalTranscript: originalTranscript,
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

  // Phase 10.3: generate remediation (gap) + transfer (application) follow-up pair
  useEffect(() => {
    if (!combinedResult || !transcript || milestones.length === 0) return
    const missed = combinedResult.details.find((d) => !d.covered)
    if (!missed) {
      setFollowUpPair(null)
      setFollowUpLoading(false)
      return
    }
    const covered = combinedResult.details.find((d) => d.covered) ?? null
    const genId = ++followUpGenIdRef.current
    setFollowUpLoading(true)
    setFollowUpPair(null)
    setFollowUpError(null)
    setFollowUpSkipped(false)
    setFollowUpAnswer("")
    setFollowUpCheck(null)
    generateFollowUpPair(missed.concept, covered ? covered.concept : null, getEvaluationTranscript())
      .then((pair) => {
        if (genId !== followUpGenIdRef.current) return
        setFollowUpPair(pair)
        setFollowUpLoading(false)
      })
      .catch((err: unknown) => {
        if (genId !== followUpGenIdRef.current) return
        const msg = err instanceof Error ? err.message : ""
        if (msg.includes("Too many requests")) {
          setFollowUpError(msg)
        } else {
          setFollowUpError("Follow-up unavailable — you can still review your results above.")
        }
        setFollowUpLoading(false)
      })
  }, [combinedResult, transcript, milestones, transcriptSignificantlyEdited])

  // Phase 10.4: lightweight "Check my answer" micro-check against the missed concept
  const handleCheckFollowUpAnswer = async () => {
    if (!followUpPair || !followUpAnswer.trim()) return
    const missed = combinedResult?.details.find((d) => !d.covered)
    if (!missed) return
    const genId = followUpGenIdRef.current
    setFollowUpChecking(true)
    setFollowUpCheck(null)
    try {
      const result = await checkFollowUpAnswer(missed.concept, followUpAnswer)
      if (genId !== followUpGenIdRef.current) return
      setFollowUpCheck(result)
    } catch (err: unknown) {
      if (genId !== followUpGenIdRef.current) return
      const msg = err instanceof Error ? err.message : ""
      if (msg.includes("Too many requests")) {
        setFollowUpCheck({ covered: false, feedback: msg })
      } else {
        setFollowUpCheck({ covered: false, feedback: "Could not verify the answer right now." })
      }
    } finally {
      if (genId === followUpGenIdRef.current) setFollowUpChecking(false)
    }
  }

  const handleRetryFollowUp = () => {
    if (!combinedResult || !transcript) return
    const missed = combinedResult.details.find((d) => !d.covered)
    if (!missed) return
    const covered = combinedResult.details.find((d) => d.covered) ?? null
    const genId = ++followUpGenIdRef.current
    setFollowUpLoading(true)
    setFollowUpError(null)
    setFollowUpPair(null)
    generateFollowUpPair(missed.concept, covered ? covered.concept : null, getEvaluationTranscript())
      .then((pair) => {
        if (genId !== followUpGenIdRef.current) return
        setFollowUpPair(pair)
        setFollowUpLoading(false)
      })
      .catch((err: unknown) => {
        if (genId !== followUpGenIdRef.current) return
        const msg = err instanceof Error ? err.message : ""
        if (msg.includes("Too many requests")) {
          setFollowUpError(msg)
        } else {
          setFollowUpError("Follow-up unavailable — you can still review your results above.")
        }
        setFollowUpLoading(false)
      })
  }

  const handleReset = () => {
    milestoneGenIdRef.current += 1
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setMilestones([])
    setTranscript("")
    setOriginalTranscript("")
    setTranscriptCommitted(false)
    setTranscriptSignificantlyEdited(false)

    setMilestonesConfirmed(false)
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

    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    setFollowUpPair(null)
    setFollowUpCheck(null)
    setOverrideLoading(false)
    setSubjectDomain(null)
    setAcousticMetrics(null)
    setEvalCooldown(false)
    setUploadedDocs([])
  }

  const handleBackToUpload = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setHasDocument(false)
    setIsEditingTranscript(false)
    setTranscript("")
    setOriginalTranscript("")
    setTranscriptCommitted(false)
    setTranscriptSignificantlyEdited(false)

    setMilestonesConfirmed(false)
    setDocumentStatus("idle")
    setDocumentError(null)
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)

    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    setFollowUpPair(null)
    setFollowUpCheck(null)
  }

  const handleBackToTranscript = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setIsEditingTranscript(true)
    setTranscriptCommitted(false)
    setTranscriptSignificantlyEdited(false)

    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    setFollowUpPair(null)
    setFollowUpCheck(null)
  }

  const handleTranscriptReady = (newTranscript: string, metrics?: AcousticMetrics) => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    // Phase 8.1: store the ORIGINAL (spoken) transcript immutably; the editable copy starts identical.
    setOriginalTranscript(newTranscript)
    setTranscript(newTranscript)
    // BUG 4 FIX: Commit transcript immediately — no intermediate review screen.
    // This triggers the auto-evaluation useEffect, so clicking "Confirm & Evaluate" goes
    // straight to "Analyzing your explanation..." with zero extra clicks.
    setTranscriptCommitted(true)
    setTranscriptSignificantlyEdited(false)

    if (metrics) setAcousticMetrics(metrics)
    setIsEditingTranscript(false)
    setCombinedResult(null)
    setIsEvaluating(false)
    setEvaluationError(null)
    setHasSaved(false)

    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    setFollowUpPair(null)
    setFollowUpCheck(null)
  }

  const handleRetryEvaluation = () => {
    evalGenIdRef.current += 1
    followUpGenIdRef.current += 1
    evalInFlightRef.current = false
    setEvaluationError(null)
    setCombinedResult(null)

    setFollowUpLoading(false)
    setFollowUpAnswer("")
    setFollowUpSkipped(false)
    setFollowUpError(null)
    if (transcript && milestones.length > 0) {
      // delay to allow state to settle before re-evaluating
      setTimeout(() => runCombinedEvaluation(milestones), 0)
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

  // Phase 9.3: validate a single imported history entry's structure/types before merging.
  const isValidHistoryEntry = (e: any): boolean => {
    if (!e || typeof e !== "object") return false
    if (typeof e.id !== "string") return false
    if (typeof e.date !== "string") return false
    if (typeof e.finalScore !== "number" || Number.isNaN(e.finalScore)) return false
    if (typeof e.coverageScore !== "number") return false
    if (typeof e.clarityScore !== "number") return false
    if (typeof e.isGaming !== "boolean") return false
    if (!Array.isArray(e.milestones)) return false
    if (typeof e.fingerprint !== "string") return false
    return true
  }

  const handleImportHistory = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error("Invalid history file — expected an array")
      const existingIds = new Set(historyEntries.map((e) => e.id))
      let imported = 0
      let skipped = 0
      const migrated: HistoryEntry[] = []
      for (const e of parsed) {
        if (!isValidHistoryEntry(e)) {
          skipped += 1
          continue
        }
        if (existingIds.has(e.id)) {
          skipped += 1
          continue
        }
        // Migrate legacy details lacking sub_score (per-concept max defaults to 20)
        let details = Array.isArray(e.details) ? e.details : []
        details = details.map((d: any) => {
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
          return d as CoverageDetail
        })
        migrated.push({
          ...(e as HistoryEntry),
          details,
          factualAccuracyScore: typeof e.factualAccuracyScore === "number" ? e.factualAccuracyScore : undefined,
          reasoningQualityScore: typeof e.reasoningQualityScore === "number" ? e.reasoningQualityScore : undefined,
          originalTranscript: typeof e.originalTranscript === "string" ? e.originalTranscript : undefined,
        })
        imported += 1
      }
      if (imported === 0) {
        alert(`No new entries imported. Skipped ${skipped} invalid or duplicate entries.`)
        return
      }
      const next = [...historyEntries, ...migrated]
      setHistoryEntries(next)
      persistHistory(next)
      alert(`Imported ${imported} entr${imported === 1 ? "y" : "ies"}, skipped ${skipped} invalid or duplicate.`)
    } catch (err) {
      alert(`Failed to import history: ${err instanceof Error ? err.message : "Invalid file"}`)
    }
  }

  const computeFinalScore = (r: CombinedEvaluationResult): number => {
    const effClarity = r.is_gaming_attempt ? 0 : r.clarity_score
    const effReasoning = r.is_gaming_attempt ? 0 : r.reasoning_quality_score
    return Math.round(r.coverage_score * 0.4 + r.factual_accuracy_score * 0.2 + effReasoning * 0.2 + effClarity * 0.2)
  }

  const finalScore = combinedResult ? computeFinalScore(combinedResult) : 0
  const isMastered = combinedResult !== null && finalScore >= 80 && !combinedResult.is_gaming_attempt
  const hasHistory = historyEntries.length > 0

  return (
    <div className="min-h-screen bg-ink">
      <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          {/* Flexible container — replaces absolute/spacer balancing so the title clears the top-right toolbar on 320–414px viewports */}
          <div className="flex flex-row justify-between items-center w-full gap-3">
            <div className="flex-1 min-w-0 text-left sm:text-center">
              <h1 className="font-serif font-bold text-parchment tracking-tight leading-none truncate text-xl sm:text-2xl md:text-3xl">FeynmanBox</h1>
            </div>
            <HeaderBar onNewSession={handleReset} onHistory={() => setHistoryOpen(true)} hasHistory={hasHistory} />
          </div>
          <div className="mt-3 mx-auto w-16 h-0.5 bg-brass" />
          <p className="mt-3 font-serif text-sm text-parchment-muted italic leading-relaxed max-w-xl mx-auto">
            It doesn't test what you remember. It tests if you can explain it.
          </p>
          <p className="mt-1 label-tag text-[10px]">Oral examination — bluff detection</p>
          {demoMode && (
            <div className="mt-3 inline-flex items-center gap-2 px-2 py-1 rounded-panel border border-brass/40 bg-brass/10">
              <span className="w-2 h-2 bg-brass rounded-full animate-pulse" />
              <span className="font-mono text-[10px] text-brass">Demo mode — offline fixtures, no network</span>
            </div>
          )}
        </header>

        <main className="space-y-6">
          {/* Unobtrusive document processing status — visible once file received */}
          {hasDocument && documentStatus !== "idle" && documentStatus !== "error" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-panel border border-ink-border bg-ink-light animate-fade-in">
              {documentStatus === "ready" ? (
                <div className="w-2 h-2 bg-verified rounded-sm" />
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
            </div>
          )}
          {/* Milestone generation error — recoverable, keeps underlying upload UI visible (never blank) */}
          {hasDocument && documentStatus === "error" && (
            <div className="space-y-4 animate-fade-in">
              {documentError?.includes("Too many requests") ? (
                <RateLimitAlert onRetry={handleRetryContentGuard} />
              ) : (
                <div className="panel p-4 border-flagged/40 bg-flagged/10">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-sm bg-flagged flex-shrink-0 mt-1.5" />
                    <p className="font-mono text-xs leading-relaxed text-flagged flex-1">{documentError}</p>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={handleRetryContentGuard} className="btn-primary flex-1 text-xs">
                      Try again
                    </button>
                    <button onClick={handleBackToUpload} className="btn-ghost flex-1 text-xs">
                      Back to notes
                    </button>
                  </div>
                  {contentGuardCanOverride && (
                    <button
                      onClick={handleOverrideContentGuard}
                      disabled={overrideLoading}
                      className="mt-3 w-full font-mono text-xs text-ink bg-brass hover:bg-brass-light rounded-panel px-3 py-2 disabled:opacity-50"
                    >
                      {overrideLoading ? "Working..." : "Continue anyway"}
                    </button>
                  )}
                </div>
              )}
              {/* Underlying UI remains visible and interactive */}
              {uploadedDocs.length > 0 && (
                <div className="panel p-4 space-y-3">
                  <h3 className="label-tag mb-3">Processed Documents ({uploadedDocs.length}) — you can edit or add more</h3>
                  <div className="space-y-2">
                    {uploadedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-panel border border-ink-border bg-ink">
                        {doc.status === "ready" ? (
                          <div className="w-2 h-2 bg-verified rounded-sm flex-shrink-0" />
                        ) : doc.status === "error" ? (
                          <div className="w-2 h-2 bg-flagged rounded-sm flex-shrink-0" />
                        ) : (
                          <div className="w-2 h-2 bg-brass rounded-full animate-pulse flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs text-parchment flex-1 truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="font-mono text-[10px] text-parchment-muted flex-shrink-0">
                          {doc.status === "ready" ? "ready" : doc.status === "error" ? "error" : "extracting..."}
                        </span>
                        <button
                          onClick={() => handleRemoveDoc(doc.id)}
                          aria-label={`Remove ${doc.fileName}`}
                          className="text-parchment-muted hover:text-flagged transition-colors flex-shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {uploadedDocs.some((d) => d.status === "error" && d.error) && (
                    <div className="space-y-1">
                      {uploadedDocs
                        .filter((d) => d.status === "error" && d.error)
                        .map((d) => (
                          <p key={d.id} className="font-mono text-[10px] text-flagged">
                            {d.fileName}: {d.error}
                          </p>
                        ))}
                    </div>
                  )}
                  <p className="font-mono text-[10px] text-parchment-muted">
                    {uploadedDocs.filter((d) => d.status === "ready").length} ready
                    {uploadedDocs.filter((d) => d.status === "extracting").length > 0
                      ? `, ${uploadedDocs.filter((d) => d.status === "extracting").length} extracting`
                      : ""}
                    {uploadedDocs.filter((d) => d.status === "error").length > 0
                      ? `, ${uploadedDocs.filter((d) => d.status === "error").length} failed`
                      : ""}
                  </p>
                </div>
              )}
              <DocumentUpload onFileSelected={handleFileSelected} onPasteText={handlePasteText} error={null} status="idle" />
              {uploadedDocs.filter((d) => d.status === "ready").length > 0 && (
                <button onClick={handleContinueToRecording} className="btn-ghost w-full text-xs">
                  Continue to Recording — {uploadedDocs.filter((d) => d.status === "ready").length} document{uploadedDocs.filter((d) => d.status === "ready").length > 1 ? "s" : ""} ready
                </button>
              )}
            </div>
          )}

          {!hasDocument && (
            <>
              <p className="font-mono text-xs text-parchment-muted text-center leading-relaxed max-w-xl mx-auto -mt-2">
                Catches the illusion of competence — when reciting keywords feels like understanding, but isn&apos;t.
              </p>
              {uploadedDocs.length > 0 && (
                <div className="panel p-4 space-y-3">
                  <h3 className="label-tag mb-3">Processed Documents ({uploadedDocs.length})</h3>
                  <div className="space-y-2">
                    {uploadedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-panel border border-ink-border bg-ink">
                        {doc.status === "ready" ? (
                          <div className="w-2 h-2 bg-verified rounded-sm flex-shrink-0" />
                        ) : doc.status === "error" ? (
                          <div className="w-2 h-2 bg-flagged rounded-sm flex-shrink-0" />
                        ) : (
                          <div className="w-2 h-2 bg-brass rounded-full animate-pulse flex-shrink-0" />
                        )}
                        <span className="font-mono text-xs text-parchment flex-1 truncate" title={doc.fileName}>
                          {doc.fileName}
                        </span>
                        <span className="font-mono text-[10px] text-parchment-muted flex-shrink-0">
                          {doc.status === "ready" ? "ready" : doc.status === "error" ? "error" : "extracting..."}
                        </span>
                        <button
                          onClick={() => handleRemoveDoc(doc.id)}
                          aria-label={`Remove ${doc.fileName}`}
                          className="text-parchment-muted hover:text-flagged transition-colors flex-shrink-0"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                  {uploadedDocs.some((d) => d.status === "error" && d.error) && (
                    <div className="space-y-1">
                      {uploadedDocs
                        .filter((d) => d.status === "error" && d.error)
                        .map((d) => (
                          <p key={d.id} className="font-mono text-[10px] text-flagged">
                            {d.fileName}: {d.error}
                          </p>
                        ))}
                    </div>
                  )}
                  <p className="font-mono text-[10px] text-parchment-muted">
                    {uploadedDocs.filter((d) => d.status === "ready").length} ready
                    {uploadedDocs.filter((d) => d.status === "extracting").length > 0
                      ? `, ${uploadedDocs.filter((d) => d.status === "extracting").length} extracting`
                      : ""}
                    {uploadedDocs.filter((d) => d.status === "error").length > 0
                      ? `, ${uploadedDocs.filter((d) => d.status === "error").length} failed`
                      : ""}
                  </p>
                </div>
              )}
              <DocumentUpload onFileSelected={handleFileSelected} onPasteText={handlePasteText} error={documentError} status="idle" />
              {uploadedDocs.filter((d) => d.status === "ready").length > 0 && (
                <button onClick={handleContinueToRecording} className="btn-primary w-full">
                  Continue to Recording — {uploadedDocs.filter((d) => d.status === "ready").length} document
                  {uploadedDocs.filter((d) => d.status === "ready").length > 1 ? "s" : ""} ready
                </button>
              )}
              {uploadedDocs.length > 0 && uploadedDocs.filter((d) => d.status === "ready").length === 0 && uploadedDocs.every((d) => d.status !== "extracting") && (
                <p className="font-mono text-xs text-parchment-muted text-center">Add a document with readable text to continue.</p>
              )}
              {documentStatus === "error" && documentError && (
                <div className="p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">{documentError}</div>
              )}
            </>
          )}

          {/* Phase 11.2: review/edit milestones before recording */}
          {hasDocument && !milestonesConfirmed && milestones.length > 0 && documentStatus === "ready" && !documentError && (
            <div className="panel p-6 animate-fade-in">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-2 h-2 bg-brass rounded-sm" />
                <h2 className="font-serif text-xl font-semibold text-parchment">Review Key Concepts</h2>
              </div>
              <h3 className="label-tag mb-1">Before you record — what you&apos;ll be tested on</h3>
              <p className="font-mono text-xs text-parchment-muted mb-4">You can edit the wording or remove any concept you don&apos;t think is fair game. Core concepts weigh more than supporting ones.</p>
              <div className="space-y-3">
                {milestones.map((m, idx) => (
                  <div key={m.id} className="p-3 rounded-panel border border-ink-border bg-ink flex items-start gap-3">
                    <span className="font-mono text-xs text-brass mt-1 flex-shrink-0">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <textarea
                        value={m.text}
                        onChange={(e) => {
                          const next = milestones.map((x) => (x.id === m.id ? { ...x, text: e.target.value } : x))
                          setMilestones(next)
                        }}
                        onInput={(e) => autoResize(e.target as HTMLTextAreaElement)}
                        ref={(el) => autoResize(el)}
                        className="w-full bg-ink-light border border-ink-border rounded-panel p-2 font-mono text-xs text-parchment focus:outline-none focus:border-brass transition-colors resize-none overflow-hidden"
                        aria-label={`Edit concept ${idx + 1}`}
                      />
                      <span className={`mt-1 inline-block font-mono text-[9px] px-1.5 py-0.5 rounded border ${m.importance === "supporting" ? "border-ink-border text-parchment-muted" : "border-brass/40 text-brass"}`}>
                        {m.importance === "supporting" ? "Supporting concept" : "Core concept"}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        if (milestones.length <= 1) return
                        setMilestones(milestones.filter((x) => x.id !== m.id))
                      }}
                      disabled={milestones.length <= 1}
                      aria-label={`Remove concept ${idx + 1}`}
                      title={milestones.length <= 1 ? "At least one concept is required" : "Remove concept"}
                      className="text-parchment-muted hover:text-flagged transition-colors flex-shrink-0 disabled:opacity-30 disabled:hover:text-parchment-muted"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setMilestonesConfirmed(true)}
                className="btn-primary w-full mt-5"
                disabled={milestones.length === 0}
              >
                Start Recording — {milestones.length} concept{milestones.length === 1 ? "" : "s"}
              </button>
            </div>
          )}

          {/* Recording stage — idle then active within same component */}
          {hasDocument && milestonesConfirmed && !transcript && !isEditingTranscript && (
            <VoiceRecorder onTranscriptReady={handleTranscriptReady} onBack={handleBackToUpload} />
          )}

          {/* BUG 4 FIX: Removed redundant App-level transcript review screen. */}

          {/* Analyzing notes indicator (during generation) */}
          {hasDocument && documentStatus !== "ready" && documentStatus !== "error" && milestones.length === 0 && (
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
            <div className="panel p-6 space-y-4">
              {evaluationError.includes("Too many requests") ? (
                <RateLimitAlert onRetry={handleRetryEvaluation} retrying={evalCooldown} />
              ) : (
                <>
                  <div className="p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs leading-relaxed">
                    {evaluationError}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleRetryEvaluation}
                      disabled={evalCooldown}
                      className={`btn-primary flex-1 ${evalCooldown ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      {evalCooldown ? "Please wait..." : "Try again"}
                    </button>
                    <button onClick={handleBackToTranscript} className="btn-ghost">
                      Edit Transcript
                    </button>
                  </div>
                  {evalCooldown && <p className="font-mono text-[10px] text-parchment-muted">Cooling down — please wait a moment before re-evaluating.</p>}
                </>
              )}
              {/* Underlying UI remains visible and interactive */}
              <div className="pt-4 border-t border-ink-border">
                <h3 className="label-tag text-[10px] mb-2">Your explanation (still saved — you can edit or retry)</h3>
                <p className="font-mono text-xs text-parchment-muted bg-ink border border-ink-border rounded-panel p-3 whitespace-pre-wrap max-h-[120px] overflow-y-auto leading-relaxed">
                  {transcript.slice(0, 800)}
                  {transcript.length > 800 ? "…" : ""}
                </p>
                <div className="mt-3">
                  <h4 className="label-tag text-[10px] mb-1">Key Concepts ({milestones.length})</h4>
                  <ul className="space-y-1">
                    {milestones.slice(0, 3).map((m) => (
                      <li key={m.id} className="font-mono text-[10px] text-parchment-muted truncate">
                        • {m.text.slice(0, 80)}
                        {m.text.length > 80 ? "…" : ""}
                      </li>
                    ))}
                    {milestones.length > 3 && <li className="font-mono text-[10px] text-parchment-muted">+{milestones.length - 3} more</li>}
                  </ul>
                </div>
              </div>
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
                  {combinedResult.is_gaming_attempt ? "Review Needed" : isMastered ? "Mastery Achieved" : "Evaluation Complete"}
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
                Final {finalScore}/100 combines four dimensions (40% coverage · 20% factual · 20% reasoning · 20% clarity). See breakdown below.
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

              {/* Phase 10.1: four distinct evaluation dimensions (not one blended number) */}
              <div className="mb-6 p-4 rounded-panel border border-ink-border bg-ink">
                <h3 className="label-tag text-[10px] mb-3">Evaluation Dimensions</h3>
                <DimBar label="Concept Coverage" score={combinedResult.coverage_score} color="bg-brass" />
                <DimBar label="Factual Accuracy" score={combinedResult.factual_accuracy_score} color="bg-verified" />
                <DimBar label="Reasoning Quality" score={combinedResult.reasoning_quality_score} color="bg-brass" />
                <DimBar label="Communication Clarity" score={combinedResult.is_gaming_attempt ? 0 : combinedResult.clarity_score} color="bg-verified" />
                <p className="font-mono text-[10px] text-parchment-muted mt-3">
                  Coverage = which concepts you addressed. Factual Accuracy = whether what you said was correct (checked against your source material). Reasoning Quality = whether you explained WHY, not just WHAT. Clarity = how clearly you expressed it.
                </p>
              </div>

              {/* Low confidence informational note */}
              {combinedResult.confidence === "low" && (
                <div className="p-3 rounded-panel border border-brass/30 bg-brass/5 mb-4">
                  <p className="font-mono text-xs text-brass leading-relaxed">
                    Evaluation confidence: Low — this explanation was brief or ambiguous; consider re-recording with more detail for a more reliable evaluation.
                  </p>
                </div>
              )}

              {/* FIX 4: Brief overall summary */}
              <div className="p-4 rounded-panel border border-brass/20 bg-brass/5 mb-6">
                <h3 className="label-tag text-[10px] mb-1">Summary</h3>
                <p className="font-serif text-sm text-parchment leading-relaxed">{combinedResult.summary}</p>
              </div>

              {/* Flagged pattern note — descriptive, not accusatory (10.5) */}
              {combinedResult.is_gaming_attempt && (
                <div className="p-4 rounded-panel border border-flagged/60 bg-flagged/10 mb-6">
                  <p className="font-mono text-sm font-bold text-flagged tracking-wide">Explanation pattern noted</p>
                  <p className="font-mono text-xs text-flagged mt-2 leading-relaxed">{combinedResult.reasoning}</p>
                  <p className="font-mono text-xs text-parchment-muted mt-3">
                    This explanation reads as a list of terms without connecting them — try explaining how these ideas relate to each other using words like “because,” “therefore,” and “this means.” Clarity was set to 0 for this pattern only; your coverage and factual scores still count.
                  </p>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                              {detail.reasoning_feedback && (
                                <p className="font-mono text-[10px] text-parchment-muted mt-1.5 leading-relaxed">Reasoning: {detail.reasoning_feedback}</p>
                              )}
                              {detail.source_reference && detail.source_reference.trim() && (
                                <details className="mt-2">
                                  <summary className="font-mono text-[10px] text-brass cursor-pointer hover:text-brass-light">Source</summary>
                                  <p className="font-mono text-[10px] text-parchment-muted mt-1 leading-relaxed italic border-l-2 border-brass/30 pl-2">{detail.source_reference}</p>
                                </details>
                              )}
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                              {detail.reasoning_feedback && (
                                <p className="font-mono text-[10px] text-parchment-muted mt-1.5 leading-relaxed">Reasoning: {detail.reasoning_feedback}</p>
                              )}
                              {detail.source_reference && detail.source_reference.trim() && (
                                <details className="mt-2">
                                  <summary className="font-mono text-[10px] text-brass cursor-pointer hover:text-brass-light">Source</summary>
                                  <p className="font-mono text-[10px] text-parchment-muted mt-1 leading-relaxed italic border-l-2 border-brass/30 pl-2">{detail.source_reference}</p>
                                </details>
                              )}
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
                  {combinedResult.details.map((d, i) => {
                    const imp = milestones[i]?.importance ?? "core"
                    return (
                    <div key={`breakdown-${i}`} className="flex items-center justify-between gap-2 font-mono text-xs">
                      <span className="text-parchment-muted truncate flex-1">
                        <span className={`mr-1 px-1 rounded border ${imp === "supporting" ? "border-ink-border text-parchment-muted" : "border-brass/40 text-brass"}`}>{imp === "supporting" ? "sup" : "core"}</span>
                        Concept {i + 1} — {d.concept.slice(0, 40)}{d.concept.length > 40 ? "…" : ""}
                      </span>
                      <span className={`flex-shrink-0 font-bold ${d.sub_score >= d.max_score * 0.7 ? "text-verified" : d.sub_score === 0 ? "text-flagged" : "text-brass"}`}>{d.sub_score}/{d.max_score}</span>
                      <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${d.is_factually_correct ? "bg-verified/50" : "bg-flagged"}`} title={d.is_factually_correct ? "factually correct" : "factually incorrect"} />
                    </div>
                    )
                   })}
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

              {/* Speech Analysis — acoustic/prosody supplementary signals (Phase 5, reframed Phase 10.6) */}
              {combinedResult.acousticMetrics && (
                <div className="p-4 rounded-panel border border-ink-border bg-ink mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-brass rounded-sm" />
                    <h3 className="label-tag text-[10px]">Speech Analysis (supplementary)</h3>
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
                      {combinedResult.acousticMetrics.wordsPerMinute > 180 && combinedResult.acousticMetrics.pauseCount < 2 ? "Very fast speech with minimal pauses may suggest rehearsed recitation, but this is only a weak hint — it never lowers your coverage or factual scores." : combinedResult.acousticMetrics.pauseCount >= 2 && combinedResult.acousticMetrics.wordsPerMinute >= 120 && combinedResult.acousticMetrics.wordsPerMinute <= 160 ? "Natural pacing with brief pauses for thought is consistent with genuine explanation." : "Acoustic signals are supplementary — text analysis remains primary."}
                      <p className="mt-1">These are supplementary observations about delivery style, not a measure of understanding. Pace and pauses vary naturally by person, language background, and speaking style.</p>
                    </div>
                  </div>
                </div>
              )}

              {!isMastered && !combinedResult.is_gaming_attempt && (
                <p className="font-mono text-xs text-parchment-muted leading-relaxed">
                  Keep refining your explanation. Try to link each concept with clear cause-and-effect language so your reasoning is easy to follow.
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

          {/* Phase 10.3 / 10.4: remediation + transfer follow-up pair */}
          {hasDocument && transcript && !isEditingTranscript && milestones.length > 0 && combinedResult && !isEvaluating && !evaluationError && (
            <>
              {followUpLoading && (
                <div className="panel p-6 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-brass rounded-full animate-pulse" />
                    <h3 className="label-tag text-[10px]">Examiner&apos;s Follow-Up</h3>
                  </div>
                  <p className="font-mono text-xs text-parchment-muted">Preparing follow-up questions…</p>
                </div>
              )}
              {followUpPair && !followUpSkipped && !followUpLoading && (
                <div className="panel p-6 animate-fade-in border-brass/30 space-y-5">
                  {/* Remediation (gap-filling) */}
                  <div>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-2 h-2 bg-flagged rounded-sm" />
                      <h3 className="font-serif text-lg font-semibold text-parchment">Strengthen a Gap</h3>
                    </div>
                    <p className="label-tag text-[10px] mb-3">Remediation — reflection only, not re-graded</p>
                    <p className="font-serif text-base text-parchment leading-relaxed border-l-2 border-flagged pl-4 py-1 mb-4">{followUpPair.remediation}</p>
                    <label htmlFor="followup-answer" className="label-tag text-[10px] mb-2 block">
                      Your answer (optional)
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
                      <button onClick={handleCheckFollowUpAnswer} disabled={!followUpAnswer.trim() || followUpChecking} className={`btn-ghost text-xs flex-1 ${!followUpAnswer.trim() || followUpChecking ? "opacity-40 cursor-not-allowed" : ""}`}>
                        {followUpChecking ? "Checking…" : "Check my answer"}
                      </button>
                      <button onClick={() => setFollowUpSkipped(true)} className="btn-primary text-xs flex-1" disabled={!followUpAnswer.trim()}>
                        Save reflection
                      </button>
                    </div>
                    {/* Phase 10.4: supplementary micro-check result (does NOT change original score) */}
                    {followUpCheck && (
                      <div className={`mt-3 p-3 rounded-panel border ${followUpCheck.feedback?.includes("Too many requests") ? "border-brass/40 bg-brass/5" : followUpCheck.covered ? "border-verified/40 bg-verified/5" : "border-flagged/40 bg-flagged/5"}`}>
                        <p className={`font-mono text-xs font-bold ${followUpCheck.feedback?.includes("Too many requests") ? "text-brass" : followUpCheck.covered ? "text-verified" : "text-flagged"}`}>
                          {followUpCheck.feedback?.includes("Too many requests") ? "Rate limited — try again shortly" : followUpCheck.covered ? "✓ Now correctly explained" : "Still missing: see below"}
                        </p>
                        {followUpCheck.feedback && <p className={`font-mono text-[11px] mt-1 leading-relaxed ${followUpCheck.feedback.includes("Too many requests") ? "text-brass" : "text-parchment-muted"}`}>{followUpCheck.feedback}</p>}
                        {followUpCheck.feedback?.includes("Too many requests") && (
                          <button onClick={handleCheckFollowUpAnswer} disabled={followUpChecking} className={`mt-3 btn-primary text-xs w-full ${followUpChecking ? "opacity-40 cursor-not-allowed" : ""}`}>
                            {followUpChecking ? "Checking…" : "Try again"}
                          </button>
                        )}
                        <p className="font-mono text-[10px] text-parchment-muted mt-2">This is a supplementary check only — it does not change your original overall score.</p>
                      </div>
                    )}
                  </div>
                  {/* Transfer / application question (test applying a concept to a new scenario) */}
                  {followUpPair.transfer && (
                    <div className="border-t border-ink-border pt-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-2 h-2 bg-verified rounded-sm" />
                        <h3 className="font-serif text-lg font-semibold text-parchment">Apply What You Know</h3>
                      </div>
                      <p className="label-tag text-[10px] mb-3">Transfer question — can you apply a concept you explained well to a new situation?</p>
                      <p className="font-serif text-base text-parchment leading-relaxed border-l-2 border-verified pl-4 py-1">{followUpPair.transfer}</p>
                      <p className="font-mono text-[10px] text-parchment-muted mt-2">Reflection only — not scored.</p>
                    </div>
                  )}
                </div>
              )}
              {followUpPair && followUpSkipped && followUpAnswer.trim() && (
                <div className="panel p-6 animate-fade-in">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-2 h-2 bg-verified rounded-sm" />
                    <h3 className="font-serif text-lg font-semibold text-parchment">Reflection Saved</h3>
                  </div>
                  <p className="font-serif text-sm text-parchment leading-relaxed border-l-2 border-verified pl-4 py-1 mb-3">{followUpPair.remediation}</p>
                  <p className="font-mono text-xs text-parchment-muted mb-2">Your answer:</p>
                  <p className="font-mono text-sm text-parchment bg-ink border border-ink-border rounded-panel p-3 whitespace-pre-wrap">{followUpAnswer}</p>
                  <p className="font-mono text-xs text-verified mt-3">Not re-graded — for your reflection only.</p>
                  <button onClick={() => setFollowUpSkipped(false)} className="font-mono text-xs text-brass hover:text-brass-light mt-3">
                    Edit answer
                  </button>
                </div>
              )}
              {followUpError && !followUpLoading && !followUpSkipped && (
                <div className={`panel p-4 border ${followUpError.includes("Too many requests") ? "border-brass/40 bg-brass/5" : "border-flagged/30 bg-flagged/5"}`}>
                  <p className={`font-mono text-xs leading-relaxed ${followUpError.includes("Too many requests") ? "text-brass" : "text-flagged"}`}>{followUpError}</p>
                  {followUpError.includes("Too many requests") && <p className="font-mono text-[10px] text-parchment-muted mt-2">You can still review your results above — this section will remain visible.</p>}
                  <div className="flex gap-3 mt-3">
                    {followUpError.includes("Too many requests") && (
                      <button onClick={handleRetryFollowUp} className="btn-primary text-xs flex-1">
                        Try again
                      </button>
                    )}
                    <button onClick={() => setFollowUpSkipped(true)} className="btn-ghost text-xs flex-1">
                      Skip for now
                    </button>
                  </div>
                </div>
              )}
              {followUpSkipped && !followUpAnswer.trim() && (
                <div className="panel p-4">
                  <p className="font-mono text-xs text-parchment-muted">Follow-up skipped.</p>
                  <button onClick={() => setFollowUpSkipped(false)} className="font-mono text-xs text-brass hover:text-brass-light mt-2">
                    Show questions again
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
