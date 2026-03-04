interface InterpretationPanelProps {
  canGenerate: boolean
  loading: boolean
  error?: string
  interpretation: string
  onGenerate: () => void
  onCancel?: () => void
}

export function InterpretationPanel({
  canGenerate,
  loading,
  error,
  interpretation,
  onGenerate,
  onCancel,
}: InterpretationPanelProps) {
  return (
    <section className="panel">
      <h2>AI Interpretation</h2>
      <p className="muted">
        Streaming is enabled. Tokens will appear as the model responds.
      </p>

      <div className="interpret-actions">
        <button
          type="button"
          className="action-btn"
          disabled={!canGenerate || loading}
          onClick={onGenerate}
        >
          {loading ? 'Generating…' : 'Generate'}
        </button>
        {loading && onCancel ? (
          <button type="button" className="ghost-btn" onClick={onCancel}>
            Stop
          </button>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <pre className="interpretation-output">{interpretation || '…'}</pre>
    </section>
  )
}
