/**
 * BestDealBanner.jsx — explains when a cheaper offer combination exists
 * (see src/lib/optimizer.js) and lets the operator switch to it or back.
 */

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`

const box = { background: '#F8F1E4', border: '1px solid #E2CFA6', borderLeft: '3px solid #0E3B35', color: '#2D2A1F', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '1rem' }
const primary = { background: '#0E3B35', color: '#fff', border: 'none', borderRadius: 4, padding: '0.45rem 1rem', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const link = { border: 'none', background: 'transparent', color: '#0E3B35', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0 }

export default function BestDealBanner({ better, briefTotal, applied, onApply, onRevert }) {
  if (!better) return null

  if (applied) {
    return (
      <div style={box}>
        <b style={{ fontSize: 13.5 }}>✅ Best combination applied: the customer saves {rs(better.saving)} more than with the biggest discount on each item.</b>{' '}
        <button style={link} onClick={onRevert}>Back to the brief's rule</button>
      </div>
    )
  }

  return (
    <div style={box}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>
        💡 Better deal found: the customer could pay {rs(better.summary.total)} instead of {rs(briefTotal)} ({rs(better.saving)} less)
      </div>
      {better.changes.map((c) => (
        <div key={c.itemId} style={{ fontSize: 12.5, marginTop: 4 }}>
          {c.product}: use <b>{c.to}</b> instead of <b>{c.from}</b> (+{rs(c.priceDelta)} on this item)
        </div>
      ))}
      <div style={{ fontSize: 12.5, marginTop: 4 }}>
        → the cart total becomes {rs(better.summary.subtotal)}, which unlocks the cart offer (−{rs(better.summary.cartDiscount)}).
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        <button style={primary} onClick={onApply}>Apply best combination</button>
        <span style={{ fontSize: 11.5, color: '#6B5A3A', flex: 1, minWidth: 240 }}>
          Prices below follow the brief's rule (biggest discount per item). Taking the biggest discount on each item doesn't always give the lowest total, so this is offered as an option.
        </span>
      </div>
    </div>
  )
}
