export type SubjectDomain = "technical" | "narrative"

export type MilestoneImportance = "core" | "supporting"

export interface Milestone {
  id: number
  text: string
  covered: boolean
  importance?: MilestoneImportance
  sourceReference?: string
}

export interface MilestoneState {
  success: boolean
  milestones: Milestone[]
  error: string | null
  loading: boolean
  subjectDomain?: SubjectDomain
  /** True when the content-quality guard rejected the material but the user may override */
  canOverride?: boolean
  /** Specific reason the guard rejected the material */
  reason?: string
}

export interface CoverageDetail {
  concept: string
  covered: boolean
  feedback: string
  sub_score: number
  max_score: number
  is_factually_correct: boolean
  /** Per-concept reasoning-quality feedback (explaining WHY, causal/logical connection) */
  reasoning_feedback?: string
  /** Source excerpt this concept/feedback relates to */
  source_reference?: string
  /** Whether this concept's factual claim could be verified against the provided source material */
  verifiable_from_source?: boolean
}

export interface CoverageResult {
  details: CoverageDetail[]
  coverage_score: number
  milestones_covered?: boolean[]
}

export interface ClarityResult {
  clarity_score: number
  is_gaming_attempt: boolean
  reasoning: string
}

export interface AcousticMetrics {
  wordsPerMinute: number
  pauseCount: number
  totalPauseDuration: number
  pitchVarianceScore: number
  recordingDurationMs?: number
}