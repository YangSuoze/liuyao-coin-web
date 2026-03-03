import type { RefObject } from 'react'
import type { GestureState } from '../vision/useHandGestureToss'

interface CameraPanelProps {
  enabled: boolean
  onToggle: (next: boolean) => void
  videoRef: RefObject<HTMLVideoElement | null>
  cameraError?: string
  gestureState: GestureState
}

export function CameraPanel({
  enabled,
  onToggle,
  videoRef,
  cameraError,
  gestureState,
}: CameraPanelProps) {
  const statusText = enabled
    ? gestureState.statusText
    : 'Camera is off. Use manual toss.'
  const gestureError = enabled ? gestureState.error : undefined

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
          ref={videoRef}
          className="camera-preview"
          autoPlay
          playsInline
          muted
        />
      </div>

      <p className="muted">{statusText}</p>
      {cameraError ? <p className="error-text">{cameraError}</p> : null}
      {gestureError ? <p className="error-text">{gestureError}</p> : null}
      <p className="hint-text">手势流程: 张开手掌 -&gt; 握拳，触发一次 Toss</p>
    </section>
  )
}
