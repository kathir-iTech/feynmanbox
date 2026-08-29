/**
 * Shared dark-red rate-limit (HTTP 429) alert.
 * Rendered nested within the active component viewport so the surrounding
 * workspace (extracted buffers, milestone indices, transcript text, or the
 * captured audio blob) stays intact in component state for a "Retry Request".
 */
export function RateLimitAlert({
  onRetry,
  retrying = false,
}: {
  onRetry: () => void
  retrying?: boolean
}) {
  return (
    <div className="p-3 rounded-panel border border-flagged/50 bg-flagged/10">
      <div className="flex items-start gap-2">
        <div className="w-2 h-2 rounded-sm bg-flagged flex-shrink-0 mt-1.5" />
        <p className="font-mono text-xs leading-relaxed text-flagged">
          System Request Threshold Exceeded — This occurs when multiple client iterations run simultaneously on the same local network footprint. Please pause for 60 seconds before re-submitting current state.
        </p>
      </div>
      <button
        onClick={onRetry}
        disabled={retrying}
        className={`btn-primary w-full mt-3 ${retrying ? "opacity-40 cursor-not-allowed" : ""}`}
      >
        {retrying ? "Please wait..." : "Retry Request"}
      </button>
    </div>
  )
}
