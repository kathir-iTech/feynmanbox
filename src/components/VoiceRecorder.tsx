import { useVoiceRecorder } from "../hooks/useVoiceRecorder"

export const VoiceRecorder: React.FC<{
  onTranscriptReady: (transcript: string) => void
}> = ({ onTranscriptReady }) => {
  const {
    state,
    isSupported,
    startRecording,
    resetTranscript,
  } = useVoiceRecorder()

  return (
    <div className="p-6 bg-white rounded-lg shadow-sm mb-6 max-w-xl mx-auto">
      {!isSupported && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded mb-4">
          <p className="font-medium">Web Speech API not supported</p>
          <p className="text-sm">This feature requires Chrome or Edge browser. Safari and Firefox do not support the Web Speech API.</p>
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
          <p className="text-slate-500 mb-2">Speak clearly into your microphone</p>
          <div className="bg-slate-100 rounded p-3 max-h-[100px] overflow-y-auto">
            <p className="text-sm text-slate-400">{state.interimTranscript || "..."}</p>
          </div>
        </div>
      )}

      {!state.isRecording && state.finalTranscript.length > 0 && (
        <div>
          <h3 className="text-semibold text-slate-800 mb-3">Transcript</h3>
          <textarea
            readOnly
            value={state.finalTranscript}
            className="w-full border border-slate-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors min-h-[120px] mb-3"
          />

          <div className="flex gap-3">
            <button
              onClick={() => onTranscriptReady(state.finalTranscript)}
              className="flex-1 bg-indigo-600 text-white py-2 rounded-md font-medium transition-colors hover:bg-indigo-500 active:bg-indigo-700"
            >
              Use This Transcript
            </button>
            <button
              onClick={resetTranscript}
              className="px-4 py-2 text-sm text-indigo-600 hover:underline"
            >
              Re-record
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
