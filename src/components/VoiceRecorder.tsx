import { useVoiceRecorder } from "../hooks/useVoiceRecorder"

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
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      {!isSupported && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded mb-4">
          <p className="font-medium">Web Speech API not supported</p>
          <p className="text-sm">This feature requires Chrome or Edge browser.</p>
        </div>
      )}

      {isSupported && !state.isRecording && state.finalTranscript.length === 0 && (
        <div className="mb-4">
          <h3 className="text-semibold text-slate-800 mb-3">Voice Explanation</h3>
          <p className="text-slate-500 mb-4">
            Explain your understanding of the milestones out loud. The app will transcribe your
            explanation and evaluate your coverage and clarity.
          </p>

          <button
            onClick={startRecording}
            className="w-full bg-indigo-600 text-white py-3 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700"
          >
            Start Recording
          </button>
        </div>
      )}

      {state.isRecording && (
        <div className="mb-4">
          <h3 className="text-semibold text-slate-800 mb-3">Listening...</h3>

          <div className="flex items-center justify-center gap-1 h-12 mb-4">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="w-1 bg-indigo-500 rounded-full animate-wave"
                style={{
                  animationDelay: `${i * 0.1}s`,
                  height: "4px",
                }}
              />
            ))}
          </div>

          {state.interimTranscript && (
            <div className="bg-slate-50 rounded p-3 max-h-[80px] overflow-y-auto mb-3">
              <p className="text-sm text-slate-500 italic">{state.interimTranscript}</p>
            </div>
          )}

          <button
            onClick={stopRecording}
            className="w-full bg-red-500 text-white py-3 rounded-md font-medium transition-colors hover:bg-red-600 active:bg-red-700"
          >
            Stop Recording
          </button>
        </div>
      )}

      {!state.isRecording && state.finalTranscript.length > 0 && (
        <div>
          <h3 className="text-semibold text-slate-800 mb-3">Transcript</h3>
          <div className="w-full border border-slate-200 rounded-lg p-3 bg-slate-50 min-h-[80px] max-h-[200px] overflow-y-auto text-sm text-slate-700 mb-3">
            {state.finalTranscript}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => onTranscriptReady(state.finalTranscript)}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700"
            >
              Use This Transcript
            </button>
            <button
              onClick={resetTranscript}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Re-record
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
