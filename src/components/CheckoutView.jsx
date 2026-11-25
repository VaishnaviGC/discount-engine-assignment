/**
 * CheckoutView.jsx
 *
 * What the shopper sees at checkout: "One final price, one offer label, no surprises."
 * Same data as the ops table, rendered for a customer — no rule IDs, no jargon.
 */

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`

/** One short label per item, e.g. "15% off · Amazon India offer" or "Rs.150 off + extra 10% off". */
export function offerLabel(item, rulesById) {
  const applied = item.appliedRules.map((id) => rulesById[id]).filter(Boolean)
  if (applied.length === 0) return null
  const amount = (r) => (r.type === 'percentage' ? `${r.value}% off` : `${rs(r.value)} off`)
  if (applied.length === 1) return `${amount(applied[0])} · ${applied[0].appliesTo} offer`
  return applied.map((r, i) => (i === 0 ? amount(r) : `extra ${amount(r)}`)).join(' + ')
}

export default function CheckoutView({ items, summary, rules }) {
  const rulesById = Object.fromEntries(rules.map((r) => [r.ruleId, r]))
  const baseTotal = items.reduce((s, i) => s + i.basePrice, 0)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(260px, 1fr)', gap: '1rem', alignItems: 'start' }}>
      <div style={{ border: '1px solid #E7DECF', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
        {items.map((it, idx) => {
          const label = offerLabel(it, rulesById)
          return (
            <div key={it.itemId} style={{ display: 'flex', gap: 12, padding: '0.8rem 1rem', borderTop: idx ? '1px solid #F1EBE1' : 'none' }}>
              <div style={{ width: 52, height: 52, borderRadius: 6, background: '#F1EBE1', display: 'grid', placeItems: 'center', fontSize: 20, flexShrink: 0, color: '#0E3B35', fontWeight: 700, fontFamily: 'inherit' }}>
                {it.product.charAt(0)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0E3B35' }}>{it.product}</div>
                <div style={{ fontSize: 11.5, color: '#8A8273', marginTop: 1 }}>{it.brand} · Sold on {it.platform}</div>
                <div style={{ marginTop: 6 }}>
                  {label ? (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#2E6B4E', background: '#E4EFE7', borderRadius: 4, padding: '2px 7px' }}>🏷 {label}</span>
                  ) : (
                    <span style={{ fontSize: 11, color: '#9A9284', fontStyle: 'italic' }}>No offers on this item</span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: '#0E3B35' }}>{rs(it.finalPrice)}</div>
                {it.totalDiscount > 0 && (
                  <>
                    <div style={{ fontSize: 11.5, color: '#9A9284', textDecoration: 'line-through' }}>{rs(it.basePrice)}</div>
                    <div style={{ fontSize: 11.5, color: '#2E6B4E', fontWeight: 700 }}>You save {rs(it.totalDiscount)}</div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ border: '1px solid #E7DECF', borderRadius: 8, background: '#fff', padding: '0.9rem 1rem', fontSize: 13, color: '#0E3B35' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Price details ({items.length} item{items.length > 1 ? 's' : ''})</div>
        <Line label="Total MRP" value={rs(baseTotal)} />
        {summary.itemSavings > 0 && <Line label="Item offers" value={`−${rs(summary.itemSavings)}`} green />}
        {summary.cartOffers.map((o) => (
          <Line key={o.ruleId} label={o.label.split(' — ')[0]} value={`−${rs(o.discount)}`} green />
        ))}
        <div style={{ borderTop: '1px dashed #ccc', margin: '8px 0' }} />
        <Line label={<b>Total amount</b>} value={<b style={{ fontSize: 17 }}>{rs(summary.total)}</b>} />
        {summary.totalSavings > 0 && (
          <div style={{ marginTop: 8, background: '#E4EFE7', color: '#2E6B4E', fontWeight: 700, fontSize: 12.5, borderRadius: 4, padding: '6px 8px', textAlign: 'center' }}>
            You will save {rs(summary.totalSavings)} on this order
          </div>
        )}
        {summary.nudge && (
          <div style={{ marginTop: 8, background: '#F8F1E4', border: '1px solid #C5A267', color: '#6B4E1F', fontSize: 12.5, borderRadius: 4, padding: '6px 8px' }}>
            🛒 {summary.nudge.label}
          </div>
        )}
      </div>
    </div>
  )
}

function Line({ label, value, green }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', color: green ? '#2E6B4E' : undefined }}>
      <span>{label}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
