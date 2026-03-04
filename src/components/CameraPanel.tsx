import type { CSSProperties, RefObject } from 'react'
import type { GestureState } from '../vision/useHandGestureToss'

interface CameraPanelProps {
  enabled: boolean
  onToggle: (next: boolean) => void
  previewRef: RefObject<HTMLVideoElement | null>
  cameraError?: string
  gestureState: GestureState
}

export function CameraPanel({
  enabled,
  onToggle,
  previewRef,
  cameraError,
  gestureState,
}: CameraPanelProps) {
  const statusText = enabled
    ? gestureState.statusText
    : 'Camera is off. Use manual toss.'
  const gestureError = enabled ? gestureState.error : undefined

  const livePower = enabled ? Math.round(gestureState.gestureControl.power * 100) : 0
  const liveSpeed = enabled ? Math.round(gestureState.gestureControl.speed * 100) : 0

  const powerStyle = { width: `${livePower}%` } as CSSProperties
  const speedStyle = { width: `${liveSpeed}%` } as CSSProperties

  return (
    <section className="panel camera-panel">
      <div className="camera-header">
        <h2>手势控制</h2>
        <button
          type="button"
          className="toggle-btn"
          onClick={() => onToggle(!enabled)}
        >
          {enabled ? '关闭摄像头' : '开启摄像头'}
        </button>
      </div>

      <div className="camera-preview-wrap">
        <video
          ref={previewRef}
          className="camera-preview"
          autoPlay
          playsInline
          muted
        />
      </div>

      <div className="gesture-meter-grid" aria-live="polite">
        <div className="gesture-meter-card">
          <div className="meter-head">
            <span>Power / Height</span>
            <span>{enabled ? `${livePower}%` : '--'}</span>
          </div>
          <div className="meter-track">
            <span className="meter-fill power-fill" style={powerStyle}></span>
          </div>
        </div>

        <div className="gesture-meter-card">
          <div className="meter-head">
            <span>Spin / Speed</span>
            <span>{enabled ? `${liveSpeed}%` : '--'}</span>
          </div>
          <div className="meter-track">
            <span className="meter-fill speed-fill" style={speedStyle}></span>
          </div>
        </div>
      </div>

      <p className="muted">{statusText}</p>
      {cameraError ? <p className="error-text">{cameraError}</p> : null}
      {gestureError ? <p className="error-text">{gestureError}</p> : null}
      <p className="hint-text">手势流程: 张开手掌 -&gt;（上下移动调参）-&gt; 握拳触发 Toss</p>
    </section>
  )
}
