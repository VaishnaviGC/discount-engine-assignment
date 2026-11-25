/**
 * FileUploader.jsx
 *
 * Click-or-drop upload area. Hands the raw File to onFile — it does not know or
 * care about the file format; adapters in src/inputs/ do the parsing.
 */

import { useRef, useState } from 'react'

export default function FileUploader({ label, description, accept, onFile, hasData, fileName, busy }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handle(file) {
    if (file && !busy) onFile(file)
  }

  const border = dragging ? '#C5A267' : hasData ? '#2E6B4E' : '#DDD3C3'

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Upload ${label}`}
      style={{
        border: `2px dashed ${border}`,
        borderRadius: 6,
        padding: '1rem 1.2rem',
        background: dragging ? '#F8F1E4' : hasData ? '#EEF4EF' : '#FBF8F3',
        cursor: busy ? 'progress' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handle(e.dataTransfer.files?.[0])
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => {
          handle(e.target.files?.[0])
          e.target.value = '' // allow re-uploading the same file
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontSize: 20 }}>{busy ? '⏳' : hasData ? '✅' : '📄'}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#0E3B35' }}>{label}</div>
          <div style={{ fontSize: 11, color: '#8A8273', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {busy ? 'Reading file…' : hasData ? fileName : description}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: hasData ? '#2E6B4E' : '#8C6A2F',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {hasData ? 'Change' : 'Upload'}
          </span>
        </div>
      </div>
    </div>
  )
}
