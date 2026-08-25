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

export interface CoverageDetail {
  concept: string
  covered: boolean
  feedback: string
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