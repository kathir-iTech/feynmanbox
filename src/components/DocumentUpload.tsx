import { useState, useRef } from "react"

interface DocumentUploadProps {
  onFileSelected: (file: File) => void
  onPasteText: (text: string) => void
  error?: string | null
  status?: "idle" | "extracting" | "generating" | "ready" | "error"
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({ onFileSelected, onPasteText, error, status }) => {
  const [dragOver, setDragOver] = useState(false)
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const acceptTypes = ".pdf,.docx,.txt"

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
  const [fileError, setFileError] = useState<string | null>(null)

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 10MB.`)
      return
    }
    setFileError(null)
    const valid = file.name.toLowerCase().match(/\.(pdf|docx|txt)$/)
    if (!valid) {
      onFileSelected(file) // will trigger unsupported error in extractor
      return
    }
    onFileSelected(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const onPasteSubmit = () => {
    if (!pasteText.trim()) return
    onPasteText(pasteText)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      inputRef.current?.click()
    }
  }

  return (
    <div className="panel p-6 relative overflow-hidden">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-2 h-2 bg-brass rounded-sm" />
        <h2 className="font-serif text-xl font-semibold text-parchment">Context Anchor</h2>
      </div>
      <h3 className="label-tag mb-4">Lecture Notes Input</h3>

      {/* Upload zone - accessible drop zone (div role=button to avoid invalid nested interactive) */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload document — PDF, DOCX or TXT, maximum 10MB. Click to browse or drag and drop."
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={handleKeyDown}
        className={`w-full rounded-panel border-2 border-dashed p-8 text-center cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-brass focus:ring-offset-2 focus:ring-offset-ink ${
          dragOver ? "border-brass bg-brass/5" : "border-ink-border bg-ink hover:border-brass/50 hover:bg-ink-light"
        }`}
      >
        <span className="flex flex-col items-center gap-3">
          <span className="w-10 h-10 rounded-panel border border-ink-border bg-ink-light flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-parchment-muted" aria-hidden="true">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 12 15 15" />
            </svg>
          </span>
          <span>
            <span className="font-mono text-sm text-parchment block">Drop your notes here</span>
            <span className="font-mono text-xs text-parchment-muted mt-1 block">or click to browse — PDF, DOCX, TXT</span>
          </span>
          <span className="font-mono text-[10px] text-parchment-muted block">Maximum file size: 10MB</span>
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={acceptTypes}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => handleFiles(e.target.files)}
        onClick={(e) => e.stopPropagation()}
      />

      {(fileError || error) && (
        <div role="alert" className="mt-4 p-3 rounded-panel border border-flagged/40 bg-flagged/10 text-flagged font-mono text-xs">
          {fileError || error}
        </div>
      )}

      {status && status !== "idle" && status !== "error" && !error && (
        <div className="mt-3 flex items-center gap-2">
          <div className="w-2 h-2 bg-brass rounded-full animate-pulse" />
          <p className="font-mono text-xs text-parchment-muted">
            {status === "extracting" ? "Processing your notes..." : status === "generating" ? "Generating key concepts..." : status === "ready" ? "Notes ready" : ""}
          </p>
        </div>
      )}

      <div className="mt-4 text-center">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowPaste(!showPaste)
          }}
          className="font-mono text-xs text-parchment-muted hover:text-brass transition-colors tracking-wider"
        >
          {showPaste ? "Hide paste option" : "Or paste notes instead →"}
        </button>
      </div>

      {showPaste && (
        <div className="mt-4 animate-fade-in">
          <label htmlFor="paste-notes" className="sr-only">Paste your lecture notes</label>
          <textarea
            id="paste-notes"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your lecture notes, article excerpt, or study material here..."
            rows={4}
            className="w-full bg-ink border border-ink-border rounded-panel p-3 font-mono text-sm text-parchment placeholder:text-parchment-muted focus:outline-none focus:border-brass transition-colors min-h-[120px]"
          />
          <button
            onClick={onPasteSubmit}
            disabled={!pasteText.trim()}
            className={`btn-primary w-full sm:w-auto mt-3 ${!pasteText.trim() ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            Use Pasted Notes
          </button>
        </div>
      )}
    </div>
  )
}
