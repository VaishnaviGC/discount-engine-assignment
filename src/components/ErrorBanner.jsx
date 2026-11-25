/**
 * ErrorBanner.jsx
 * Displays a list of errors (red) or warnings (amber).
 */

const VARIANTS = {
  error: { bg: '#fce8e8', border: '#e57373', accent: '#c0392b', title: '#8a1a1a', text: '#5a1010', noun: 'issue' },
  warning: { bg: '#fff8e6', border: '#f0c36d', accent: '#d68a00', title: '#7a4b00', text: '#5c3a00', noun: 'note' },
}

export default function ErrorBanner({ errors, variant = 'error', title }) {
  if (!errors || errors.length === 0) return null
  const v = VARIANTS[variant]
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      style={{
        background: v.bg,
        border: `1px solid ${v.border}`,
        borderLeft: `3px solid ${v.accent}`,
        borderRadius: 4,
        padding: '0.6rem 0.9rem',
        marginTop: '0.5rem',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 12, color: v.title, marginBottom: 4 }}>
        {title ?? `${errors.length} ${v.noun}${errors.length > 1 ? 's' : ''}`}
      </div>
      {errors.map((e, i) => (
        <div key={i} style={{ fontSize: 12, color: v.text, marginTop: 2 }}>
          {e}
        </div>
      ))}
    </div>
  )
}
