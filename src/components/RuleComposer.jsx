/**
 * RuleComposer.jsx
 *
 * "Describe a rule in plain English" → LLM → validated rule → confirmation card
 * (parsed fields + live impact preview on the current cart) → Confirm / Discard.
 * Only a confirmed rule reaches app state; nothing the LLM says is applied directly.
 */

import { useEffect, useState } from 'react'
import ErrorBanner from './ErrorBanner.jsx'
import { parseRuleFromText } from '../inputs/nlRuleAdapter.js'
import { previewRuleImpact } from '../lib/pricing.js'

const EXAMPLES = [
  '20% off for Natura Casa brand, stackable with other offers',
  'Rs.100 flat discount on all Flipkart items',
  '10% off if cart value is more than Rs.5,000',
  'Give a discount for big orders',
]

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#8A8273', fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#0E3B35' }}>{value}</span>
    </div>
  )
}

function ImpactPreview({ impact, hasCart }) {
  if (!hasCart) {
    return <div style={{ fontSize: 12, color: '#8A8273' }}>Load a cart to preview how this rule changes prices.</div>
  }
  const delta = impact.before - impact.after
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#0E3B35', marginBottom: 4 }}>If you confirm, on the current cart:</div>
      {impact.changedItems.length === 0 && !impact.cartOfferChanged && (
        <div style={{ fontSize: 12, color: '#7a4b00' }}>No price changes — this rule doesn't beat the offers already applied, or matches no item.</div>
      )}
      {impact.changedItems.map((c) => (
        <div key={c.itemId} style={{ fontSize: 12, color: '#0E3B35', marginTop: 2 }}>
          {c.itemId} {c.product}: <s style={{ color: '#8A8273' }}>{rs(c.beforePrice)}</s> → <b style={{ color: '#2E6B4E' }}>{rs(c.afterPrice)}</b>
        </div>
      ))}
      {impact.newCartOffer && <div style={{ fontSize: 12, color: '#0E3B35', marginTop: 2 }}>{impact.newCartOffer.label}</div>}
      <div style={{ fontSize: 12, marginTop: 6, color: '#0E3B35' }}>
        Cart total: {rs(impact.before)} → <b>{rs(impact.after)}</b>
        {delta > 0 && <span style={{ color: '#2E6B4E', fontWeight: 700 }}> (customer saves {rs(delta)} more)</span>}
      </div>
    </div>
  )
}

export default function RuleComposer({ rules, cartItems, onConfirm }) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // output of parseRuleFromText

  // A message about the old rule set (e.g. "identical to RULE-05") is stale once rules change.
  // A pending confirmation card stays: its preview is recomputed from live state below.
  useEffect(() => {
    setResult((r) => (r && r.status !== 'ok' ? null : r))
  }, [rules])

  async function handleParse(e) {
    e?.preventDefault()
    if (loading) return
    setLoading(true)
    setResult(null)
    try {
      setResult(await parseRuleFromText(text, { rules, cartItems }))
    } catch {
      setResult({ status: 'error', message: 'Something went wrong while parsing. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  function confirm() {
    onConfirm(result.rule)
    setResult(null)
    setText('')
  }

  const pending = result?.status === 'ok' ? result : null
  // The impact is recomputed from live state, so it stays correct if the cart changes meanwhile.
  const impact = pending ? previewRuleImpact(cartItems, rules, pending.rule) : null
  // Re-validate the id against live rules in case rules changed while the card was open.
  const idClash = pending && rules.some((r) => r.ruleId === pending.rule.ruleId)

  return (
    <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px dashed #DDD3C3' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#0E3B35', marginBottom: 2 }}>✨ Add a rule in plain English</div>
      <div style={{ fontSize: 11, color: '#8A8273', marginBottom: 6 }}>An AI reads your description. You review the parsed rule before it goes live.</div>

      <form onSubmit={handleParse} style={{ display: 'flex', gap: 6 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder='e.g. "15% off all Noon items"'
          aria-label="Describe a discount rule"
          style={{ flex: 1, padding: '0.5rem 0.65rem', fontSize: 13, border: '1px solid #DDD3C3', borderRadius: 4, minWidth: 0 }}
        />
        <button
          type="submit"
          disabled={loading || text.trim().length === 0}
          style={{
            background: loading || !text.trim() ? '#DDD3C3' : '#0E3B35',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            padding: '0 1rem',
            fontSize: 12,
            fontWeight: 700,
            cursor: loading || !text.trim() ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Parsing…' : 'Parse rule'}
        </button>
      </form>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setText(ex)
              setResult(null)
            }}
            style={{ fontSize: 10.5, border: '1px solid #E7DECF', background: '#F7F2EA', color: '#5E5749', borderRadius: 12, padding: '2px 8px', cursor: 'pointer' }}
          >
            {ex}
          </button>
        ))}
      </div>

      {result?.status === 'ambiguous' && (
        <ErrorBanner variant="warning" title="Need a bit more detail" errors={[result.message]} />
      )}
      {(result?.status === 'invalid' || result?.status === 'error') && (
        <ErrorBanner title="Couldn't create a rule" errors={[result.message]} />
      )}

      {pending && (
        <div style={{ marginTop: '0.7rem', border: '1px solid #0E3B35', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ background: '#0E3B35', color: '#fff', padding: '0.45rem 0.8rem', fontSize: 12, fontWeight: 700 }}>
            Confirm new rule · {pending.rule.ruleId}
          </div>
          <div style={{ padding: '0.7rem 0.8rem', background: '#fff' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', marginBottom: '0.7rem' }}>
              <Field label="Scope" value={cap(pending.rule.scope)} />
              {pending.rule.scope !== 'cart' && <Field label="Applies to" value={pending.rule.appliesTo} />}
              <Field label="Type" value={cap(pending.rule.type)} />
              <Field label="Value" value={pending.rule.type === 'percentage' ? `${pending.rule.value}%` : rs(pending.rule.value)} />
              {pending.rule.scope === 'cart' && (
                <Field label="Min cart value" value={pending.rule.minCartValue > 0 ? `≥ ${rs(pending.rule.minCartValue)}` : 'None'} />
              )}
              <Field label="Stackable" value={pending.rule.stackable ? 'Yes' : 'No'} />
            </div>
            <ErrorBanner variant="warning" title="Please check" errors={pending.warnings} />
            <div style={{ background: '#F7F2EA', borderRadius: 4, padding: '0.6rem 0.7rem', marginTop: 8 }}>
              <ImpactPreview impact={impact} hasCart={cartItems.length > 0} />
            </div>
            {idClash && <ErrorBanner errors={['Rules changed while this was open — please parse again.']} />}
            <div style={{ display: 'flex', gap: 8, marginTop: '0.7rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setResult(null)}
                style={{ background: '#fff', color: '#0E3B35', border: '1px solid #0E3B35', borderRadius: 4, padding: '0.45rem 1rem', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={idClash}
                style={{ background: idClash ? '#DDD3C3' : '#0E3B35', color: '#F6EFE3', border: idClash ? 'none' : '1px solid #C5A267', borderRadius: 4, padding: '0.45rem 1.2rem', fontSize: 12, fontWeight: 700, cursor: idClash ? 'not-allowed' : 'pointer' }}
              >
                Confirm &amp; apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
