import { useState, useEffect, useRef } from "react"
import type { Milestone } from "../types"

export interface MasteryState {
  finalScore: number
  masteryVerified: boolean
  hint: string | null
  showHint: boolean
  coverageScore: number
  clarityScore: number
  isGaming: boolean
  coverageCovered: boolean[]
  reasoning: string
}

export const useMasteryLoop = (
  milestones: Milestone[],
  onMastery?: (isMastered: boolean) => void,
  onReset?: () => void
) => {
  const [state, setState] = useState<MasteryState>({
    finalScore: 0,
    masteryVerified: false,
    hint: null,
    showHint: false,
    coverageScore: 0,
    clarityScore: 0,
    isGaming: false,
    coverageCovered: milestones.map(() => false),
    reasoning: "",
  })

  const reset = () => {
    setState({
      finalScore: 0,
      masteryVerified: false,
      hint: null,
      showHint: false,
      coverageScore: 0,
      clarityScore: 0,
      isGaming: false,
      coverageCovered: milestones.map(() => false),
      reasoning: "",
    })
    onReset?.()
  }

  const showHintAction = () => {
    setState((prev) => ({ ...prev, showHint: true }))
  }

  return { state, setState, reset, showHintAction, onMastery }
}

function AnimatedScore({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0)
  const frameRef = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 1000
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayed(Math.round(eased * value))
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate)
      }
    }
    frameRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value])

  return <span className="score-display">{displayed}</span>
}

export const MasteryLoop: React.FC<{
  milestones: Milestone[]
  transcript: string
  onMastery?: (isMastered: boolean) => void
  onReset?: () => void
}> = ({ milestones, transcript, onMastery: _onMastery, onReset }) => {
  const { state, reset, showHintAction } = useMasteryLoop(milestones, _onMastery, onReset)
  const hasScore = state.finalScore > 0

  let content: React.ReactNode

  if (state.masteryVerified) {
    content = (
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-2 h-2 bg-verified rounded-sm" />
          <h2 className="font-serif text-xl font-semibold text-verified">
            Mastery Verified
          </h2>
        </div>
        <div className="flex items-baseline gap-3 mb-3">
          <AnimatedScore value={state.finalScore} />
          <span className="label-tag">/100</span>
        </div>
        <p className="font-mono text-xs text-parchment-muted leading-relaxed">
          Your explanation demonstrates substantive coverage and coherent
          logical structure. The examination is complete.
        </p>
      </div>
    )
  } else if (state.isGaming) {
    content = (
      <div className="p-4 rounded-panel border border-flagged/60 bg-flagged/10 animate-shake animate-pulse-red">
        <p className="font-mono text-sm font-bold text-flagged tracking-wide">
          [ANALYSIS FLAGGED]
        </p>
        <p className="font-mono text-xs text-flagged/70 mt-2">{state.reasoning}</p>
        <button onClick={reset} className="mt-3 text-brass text-xs font-mono hover:text-brass-light transition-colors">
          [RETRY]
        </button>
      </div>
    )
  } else if (state.showHint) {
    content = (
      <div className="p-4 rounded-panel border border-brass/30 bg-brass/5 animate-fade-in">
        <p className="label-tag text-[10px] mb-2">Coaching Directive</p>
        <p className="font-serif text-sm text-parchment leading-relaxed">{state.hint}</p>
        <button onClick={reset} className="mt-3 text-brass text-xs font-mono hover:text-brass-light transition-colors">
          [RETRY]
        </button>
      </div>
    )
  } else if (hasScore) {
    const barColor = state.finalScore >= 90 ? "bg-verified" : "bg-brass"
    content = (
      <div className="animate-fade-in">
        <div className="flex items-baseline gap-3 mb-2">
          <span className="label-tag">Final Score</span>
          <AnimatedScore value={state.finalScore} />
          <span className="label-tag">/100</span>
        </div>
        <div className="h-1 bg-ink-border rounded-sm overflow-hidden mb-1">
          <div
            className={`${barColor} h-full transition-all duration-1000 ease-out`}
            style={{ width: `${state.finalScore}%` }}
          />
        </div>
        <p className="font-mono text-[10px] text-parchment-muted">
          Coverage {state.coverageScore}% x 0.6 + Clarity {state.clarityScore} x 0.4
        </p>
        {state.finalScore < 90 && (
          <button onClick={showHintAction} className="btn-primary w-full mt-5">
            Request Coaching
          </button>
        )}
      </div>
    )
  } else {
    content = (
      <p className="font-mono text-xs text-parchment-muted">
        Complete coverage and clarity evaluations to generate final score.
      </p>
    )
  }

  return (
    <div className="panel p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-2 h-2 bg-brass rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">
          Assessment Result
        </h2>
      </div>

      {content}

      {transcript && (
        <details className="mt-5">
          <summary className="font-mono text-[10px] text-parchment-muted cursor-pointer hover:text-parchment transition-colors tracking-wider">
            View transcript
          </summary>
          <p className="mt-2 font-mono text-xs text-parchment/60 whitespace-pre-wrap leading-relaxed">
            {transcript}
          </p>
        </details>
      )}
    </div>
  )
}
