interface InterpretationPanelProps {
  canGenerate: boolean
  loading: boolean
  error?: string
  interpretation: string
  onGenerate: () => void
}

export function InterpretationPanel({
  canGenerate,
  loading,
  error,
  interpretation,
  onGenerate,
}: InterpretationPanelProps) {
  return (
    <section className="panel">
      <div className="interpretation-header">
        <h2>AI 解读</h2>
        <button
          type="button"
          className="action-btn"
          disabled={!canGenerate || loading}
          onClick={onGenerate}
        >
          {loading ? '生成中...' : '生成解读'}
        </button>
      </div>

      {!canGenerate ? (
        <p className="muted">完成六次 Toss 后可生成解读</p>
      ) : null}

      {error ? <p className="error-text">{error}</p> : null}
      {interpretation ? <pre className="interpretation-output">{interpretation}</pre> : null}
    </section>
  )
}
