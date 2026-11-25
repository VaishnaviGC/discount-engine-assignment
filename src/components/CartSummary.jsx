/**
 * CartSummary.jsx
 *
 * The customer-facing checkout view: per-item final price + offer explanation,
 * then subtotal, a cart-offer line only when one is triggered, the final total,
 * and a nudge when the customer is close to unlocking a cart offer.
 */

import DataTable from './DataTable.jsx'

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`

const STATUS = {
  max: { text: 'Max discount', color: '#2E6B4E', bg: '#E4EFE7' },
  stacked: { text: 'Stacked', color: '#1F5A6B', bg: '#E3EEF1' },
  applied: { text: 'Discount applied', color: '#2E6B4E', bg: '#E4EFE7' },
  none: { text: 'No offer', color: '#6E6658', bg: '#EFE9DE' },
  optimised: { text: 'Best combo', color: '#8C6A2F', bg: '#F3E9D2' },
}

const pill = (s) => (
  <span
    style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20,
      background: s.bg, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}
  >
    {s.text}
  </span>
)

const COLUMNS = [
  { key: 'itemId', label: 'Item', render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{v}</span> },
  { key: 'product', label: 'Product', render: (v, r) => (<><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 10.5, color: '#8A8273' }}>{r.brand} · {r.platform}</div></>) },
  {
    key: 'basePrice', label: 'Base Price',
    render: (v, r) => (r.totalDiscount > 0 ? <s style={{ color: '#8A8273' }}>{rs(v)}</s> : rs(v)),
  },
  {
    key: 'finalPrice', label: 'Final Price',
    render: (v, r) => <span style={{ fontWeight: 700, color: r.totalDiscount > 0 ? '#2E6B4E' : '#0E3B35' }}>{rs(v)}</span>,
  },
  {
    key: 'totalDiscount', label: 'You Save',
    render: (v) => (v > 0 ? <span style={{ color: '#2E6B4E', fontWeight: 600 }}>{rs(v)}</span> : <span style={{ color: '#8A8273' }}>—</span>),
  },
  {
    key: 'reasoning', label: 'Offer Applied',
    render: (v, r) => (
      <span style={{ color: r.status === 'none' ? '#8A8273' : '#0E3B35', fontStyle: r.status === 'none' ? 'italic' : 'normal' }}>{v}</span>
    ),
  },
  { key: 'status', label: 'Status', render: (v) => pill(STATUS[v] ?? STATUS.none) },
]

const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '0.45rem 0.8rem', fontSize: 13, color: '#0E3B35' }

export default function CartSummary({ items, summary }) {
  return (
    <div>
      <DataTable columns={COLUMNS} rows={items} />

      <div style={{ marginTop: '0.9rem', marginLeft: 'auto', maxWidth: 460, border: '1px solid #DDD3C3', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ ...row, background: '#FAF5EA' }}>
          <span style={{ fontWeight: 600 }}>Cart total before offer</span>
          <span style={{ fontWeight: 700 }}>{rs(summary.subtotal)}</span>
        </div>

        {summary.cartOffers.map((o) => (
          <div key={o.ruleId} style={{ ...row, background: '#FAF5EA', borderTop: '1px solid #EDE2C8' }}>
            <span style={{ color: '#7a4b00' }}>
              <b>{o.label.split(' — ')[0]}</b>
              <span style={{ fontSize: 11, color: '#a07a2a' }}> · {o.ruleId}</span>
            </span>
            <span style={{ fontWeight: 700, color: '#2E6B4E', whiteSpace: 'nowrap' }}>−{rs(o.discount)}</span>
          </div>
        ))}

        <div style={{ ...row, background: '#E4EFE7', borderTop: '2px solid #0E3B35', padding: '0.6rem 0.8rem' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>Final cart total</span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>{rs(summary.total)}</span>
        </div>

        {summary.totalSavings > 0 && (
          <div style={{ ...row, justifyContent: 'center', fontSize: 12, color: '#2E6B4E', background: '#fff', fontWeight: 600 }}>
            🎉 You save {rs(summary.totalSavings)} on this order
          </div>
        )}
      </div>

      {summary.nudge && (
        <div
          role="status"
          style={{
            marginTop: '0.8rem', marginLeft: 'auto', maxWidth: 460, background: '#F8F1E4',
            border: '1px solid #C5A267', borderRadius: 6, padding: '0.55rem 0.8rem', fontSize: 13, color: '#6B4E1F',
          }}
        >
          🛒 <b>{summary.nudge.label}</b>
        </div>
      )}
    </div>
  )
}
