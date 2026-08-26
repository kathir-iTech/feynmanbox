export type SubjectDomain = "technical" | "narrative"

export interface Milestone {
  id: number
  text: string
  covered: boolean
}

export interface MilestoneState {
  success: boolean
  milestones: Milestone[]
  error: string | null
  loading: boolean
  subjectDomain?: SubjectDomain
}

export interface CoverageDetail {
  concept: string
  covered: boolean
  feedback: string
  sub_score: number
  max_score: number
  is_factually_correct: boolean
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