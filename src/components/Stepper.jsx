/**
 * Stepper.jsx — the 3-step progress header. Steps are clickable (not a locked
 * wizard), so going back to add a rule from the checkout is one click.
 */

export default function Stepper({ steps, current, onSelect }) {
  const currentIndex = steps.findIndex((s) => s.key === current)
  return (
    <nav aria-label="Steps" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '1.4rem' }}>
      {steps.map((s, i) => {
        const active = s.key === current
        const done = s.done && !active
        const reachable = s.enabled
        const circleBg = active ? '#C5A267' : done ? '#2E6B4E' : '#fff'
        const circleFg = active ? '#0E3B35' : done ? '#fff' : '#A39B8B'
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', minWidth: 0, flex: i < steps.length - 1 ? '1 1 0' : '0 1 auto' }}>
            <button
              type="button"
              onClick={() => reachable && onSelect(s.key)}
              disabled={!reachable}
              aria-current={active ? 'step' : undefined}
              title={reachable ? undefined : s.lockedHint}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', padding: 0, minWidth: 0,
                cursor: reachable ? 'pointer' : 'not-allowed', textAlign: 'left', opacity: reachable ? 1 : 0.55,
              }}
            >
              <span
                style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0,
                  background: circleBg, color: circleFg, fontWeight: 800, fontSize: 14,
                  border: active || done ? 'none' : '2px solid #D8CDBB',
                  boxShadow: active ? '0 0 0 4px rgba(197,162,103,0.30)' : 'none',
                }}
              >
                {done ? '✓' : i + 1}
              </span>
              <span>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: active ? '#0E3B35' : '#4E4A3F' }}>{s.label}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: '#8A8273', marginTop: 1 }}>{s.sub}</span>
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                style={{
                  flex: 1, minWidth: 10, height: 3, borderRadius: 2, margin: '16px 10px 0',
                  background: i < currentIndex ? '#2E6B4E' : '#E7DECF',
                }}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
