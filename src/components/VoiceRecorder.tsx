import { useVoiceRecorder } from "../hooks/useVoiceRecorder"

function PolygraphWaveform() {
  return (
    <div className="polygraph-grid rounded-panel border border-ink-border p-4 bg-ink">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 bg-brass rounded-full animate-pulse" />
        <span className="label-tag text-[10px]">Signal Active</span>
      </div>
      <svg
        viewBox="0 0 400 40"
        className="w-full h-[50px]"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="20" x2="400" y2="20" stroke="#2A333D" strokeWidth="1" />
        <line x1="0" y1="10" x2="400" y2="10" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
        <line x1="0" y1="30" x2="400" y2="30" stroke="#2A333D" strokeWidth="0.5" strokeDasharray="4 4" />
        <path
          className="waveform-line waveform-animate"
          d="M 0 20 Q 12.5 10 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 T 225 20 T 250 20 T 275 20 T 300 20 T 325 20 T 350 20 T 375 20 T 400 20 T 425 20 T 450 20"
        />
        <path
          className="waveform-line waveform-animate"
          style={{ animationDelay: "0.15s", opacity: 0.5, strokeWidth: 1.5 }}
          d="M 0 20 Q 12.5 14 25 20 T 50 20 T 75 20 T 100 20 T 125 20 T 150 20 T 175 20 T 200 20 T 225 20 T 250 20 T 275 20 T 300 20 T 325 20 T 350 20 T 375 20 T 400 20 T 425 20 T 450 20"
        />
      </svg>
    </div>
  )
}

export const VoiceRecorder: React.FC<{
  onTranscriptReady: (transcript: string) => void
}> = ({ onTranscriptReady }) => {
  const {
    state,
    isSupported,
    startRecording,
    stopRecording,
    resetTranscript,
  } = useVoiceRecorder()

  return (
    <div className="panel p-6">
      {!isSupported && (
        <div className="p-4 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
          [SYSTEM] Web Speech API unavailable. Use Chrome or Edge.
        </div>
      )}

      {isSupported && !state.isRecording && state.finalTranscript.length === 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-brass rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Voice Testimony
            </h2>
          </div>
          <p className="label-tag mb-3">Microphone Input</p>
          <p className="text-parchment-muted text-sm mb-5 leading-relaxed">
            Explain your understanding of the milestones aloud. The system will
            transcribe and analyze your explanation for coverage and coherence.
          </p>

          <button onClick={startRecording} className="btn-primary w-full">
            Begin Recording
          </button>
        </div>
      )}

      {state.isRecording && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-flagged rounded-full animate-pulse" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Recording
            </h2>
          </div>
          <p className="label-tag mb-4">Live Signal</p>

          <PolygraphWaveform />

          {state.interimTranscript && (
            <div className="mt-4 p-3 rounded-panel bg-ink border border-ink-border">
              <p className="font-mono text-xs text-parchment-muted italic">
                {state.interimTranscript}
              </p>
            </div>
          )}

          <button
            onClick={stopRecording}
            className="mt-4 w-full bg-flagged/20 border border-flagged/40 text-flagged rounded-panel px-6 py-2 font-semibold transition-colors hover:bg-flagged/30"
          >
            Stop Recording
          </button>
        </div>
      )}

      {!state.isRecording && state.finalTranscript.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-2 h-2 bg-verified rounded-sm" />
            <h2 className="font-serif text-xl font-semibold text-parchment">
              Transcript Captured
            </h2>
          </div>
          <p className="label-tag mb-3">Recorded Testimony</p>

          <div className="w-full rounded-panel bg-ink border border-ink-border p-4 font-mono text-sm text-parchment/80 min-h-[80px] max-h-[200px] overflow-y-auto leading-relaxed">
            {state.finalTranscript}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => onTranscriptReady(state.finalTranscript)}
              className="btn-primary flex-1"
            >
              Submit Testimony
            </button>
            <button onClick={resetTranscript} className="btn-ghost">
              Re-record
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
