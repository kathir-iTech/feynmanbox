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
}

export interface CoverageState {
  covered: boolean[]
  coverageScore: number
  error: string | null
  loading: boolean
}

export interface TranscriptState {
  finalTranscript: string
  interimTranscript: string
  isRecording: boolean
}

export interface EvaluationResult {
  coverageScore: number
  clarityScore: number
  isGaming: boolean
  reasoning: string
  finalScore: number
  masteryVerified: boolean
  hint: string | null
}

export interface ClarityResult {
  clarity_score: number
  is_gaming_attempt: boolean
  reasoning: string
}