/**
 * App.jsx
 *
 * Top-level component: a 3-step flow (Upload → Rules → Checkout).
 *
 * It holds the two pieces of state that matter — the active rules and the cart —
 * and derives pricing from them. Because results are derived (not stored), any
 * change to rules or cart (CSV, PDF, AI rule, delete) re-runs the engine
 * automatically and can never show stale prices.
 *
 * Steps are reflected in the URL hash (#/upload, #/rules, #/checkout) so the
 * browser back button works and a step can be linked directly.
 */

import { useEffect, useMemo, useState } from 'react'
import FileUploader from './components/FileUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import RuleComposer from './components/RuleComposer.jsx'
import CartSummary from './components/CartSummary.jsx'
import CheckoutView from './components/CheckoutView.jsx'
import Stepper from './components/Stepper.jsx'
import BestDealBanner from './components/BestDealBanner.jsx'
import { findBetterCombination } from './lib/optimizer.js'
import { cartAdapters, ruleAdapters, parseWith, acceptFor } from './inputs/index.js'
import { priceCart } from './lib/pricing.js'
import { sampleRulesFile, sampleCartFile, SAMPLE_PDFS, samplePdfFile } from './sampleData.js'

const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// ── Styles ───────────────────────────────────────────────────────

// Palette: deep emerald, warm cream, gold accents.
const EMERALD = '#0E3B35'
const EMERALD_DEEP = '#0A2E29'
const GOLD = '#C5A267'
const CREAM = '#F3EDE4'

const S = {
  page: { minHeight: '100vh', background: CREAM, color: EMERALD },
  header: {
    background: EMERALD_DEEP, padding: '0.95rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    borderBottom: `1px solid rgba(197,162,103,0.45)`,
  },
  logoTxt: { fontSize: 19, fontWeight: 800, color: '#F6EFE3', letterSpacing: '-0.02em' },
  headerSub: { fontSize: 11, fontWeight: 600, color: GOLD, textTransform: 'uppercase', letterSpacing: '0.14em' },
  main: { maxWidth: 1100, margin: '0 auto', padding: '1.8rem 1.5rem 3rem' },
  card: { background: '#FFFDF9', border: '1px solid #E7DECF', borderRadius: 12, padding: '1.2rem 1.4rem', minWidth: 0, boxShadow: '0 1px 3px rgba(14,59,53,0.06)' },
  h1: { fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' },
  lead: { fontSize: 14, color: '#6B6455', margin: '0.35rem 0 1.2rem' },
  h2: { fontWeight: 700, fontSize: 15, margin: '0 0 0.75rem', paddingBottom: 6, borderBottom: `2px solid ${GOLD}`, display: 'inline-block' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(400px, 100%), 1fr))', gap: '1rem' },
  meta: { fontSize: 11.5, color: '#8A8273', margin: '0.75rem 0 4px' },
  primary: (enabled = true) => ({
    background: enabled ? EMERALD : '#DDD3C3', color: enabled ? '#F6EFE3' : '#fff', border: `1px solid ${enabled ? GOLD : '#DDD3C3'}`, borderRadius: 6,
    padding: '0.7rem 1.6rem', fontSize: 13.5, fontWeight: 600, letterSpacing: '0.01em', cursor: enabled ? 'pointer' : 'not-allowed',
  }),
  secondary: { background: '#fff', color: EMERALD, border: `1px solid ${EMERALD}`, borderRadius: 6, padding: '0.7rem 1.3rem', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', color: '#0E3B35', textDecoration: 'underline', cursor: 'pointer', fontSize: 12.5, padding: 0 },
  footer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.4rem', gap: 12, flexWrap: 'wrap' },
  toast: { background: '#EAF1EE', border: '1px solid #C9DCD3', color: '#0E3B35', borderRadius: 6, padding: '0.5rem 0.85rem', fontSize: 12.5, marginBottom: '1rem' },
  sampleBox: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'linear-gradient(90deg, #F8F1E4, #fff)',
    border: '1px solid #E6D3AE', borderRadius: 10, padding: '0.9rem 1.2rem', marginBottom: '1rem',
  },
  chip: { fontSize: 12, border: '1px solid #DDD3C3', background: '#fff', color: EMERALD, borderRadius: 14, padding: '4px 10px', cursor: 'pointer' },
  badge: (ai) => ({
    display: 'inline-block', fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, marginLeft: 5,
    background: ai ? '#F6ECD9' : '#EFE9DE', color: ai ? '#8C6A2F' : '#5E5749', verticalAlign: 'middle',
  }),
  tabs: { display: 'inline-flex', border: `1px solid ${EMERALD}`, borderRadius: 6, overflow: 'hidden' },
  tab: (active) => ({
    border: 'none', background: active ? EMERALD : '#fff', color: active ? '#fff' : EMERALD,
    fontSize: 12, fontWeight: 700, padding: '6px 12px', cursor: 'pointer',
  }),
  statRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' },
}

const CART_COLUMNS = [
  { key: 'itemId', label: 'Item' },
  { key: 'product', label: 'Product' },
  { key: 'brand', label: 'Brand' },
  { key: 'platform', label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => rs(v) },
]

const EMPTY_NOTICE = { errors: [], warnings: [] }
const STEP_KEYS = ['upload', 'rules', 'checkout']
const readHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '')
  return STEP_KEYS.includes(h) ? h : 'upload'
}

// ── Component ────────────────────────────────────────────────────

export default function App() {
  const [rules, setRules] = useState([])
  const [ruleSource, setRuleSource] = useState({}) // ruleId → 'CSV' | 'AI'
  const [rulesNotice, setRulesNotice] = useState(EMPTY_NOTICE)
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems] = useState([])
  const [cartNotice, setCartNotice] = useState(EMPTY_NOTICE)
  const [cartFileName, setCartFileName] = useState('')

  const [busy, setBusy] = useState(null) // 'rules' | 'cart' | null
  const [lastChange, setLastChange] = useState('')
  const [view, setView] = useState('ops') // 'ops' | 'customer'
  const [useBest, setUseBest] = useState(false)

  // ── Navigation (hash-based, so Back works) ──
  const [stepKey, setStepKey] = useState(readHash)
  useEffect(() => {
    const onHash = () => setStepKey(readHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  function goTo(key) {
    if (readHash() !== key) window.location.hash = `/${key}`
    setStepKey(key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const hasCart = cartItems.length > 0
  const step = stepKey === 'checkout' && !hasCart ? 'upload' : stepKey

  // ── Pricing (derived) ──
  // `brief` is the engine exactly as specified; `better` is an optional cheaper combination.
  const { brief, better } = useMemo(() => {
    const brief = priceCart(cartItems, rules)
    return { brief, better: findBetterCombination(cartItems, rules, brief.items) }
  }, [cartItems, rules])
  const showingBest = useBest && better !== null
  const pricing = showingBest ? better : brief

  // ── Input handlers: every source goes through an adapter, then into the same state ──

  async function handleRulesFile(file) {
    setBusy('rules')
    const { data, errors, warnings = [] } = await parseWith(ruleAdapters, file)
    setBusy(null)
    if (data.length === 0) {
      setRulesNotice({ errors: [...errors, rules.length ? 'Your current rules were kept.' : ''].filter(Boolean), warnings })
      return false
    }
    setRules(data)
    setRuleSource(Object.fromEntries(data.map((r) => [r.ruleId, 'CSV'])))
    setRulesNotice({ errors, warnings })
    setRulesFileName(file.name)
    setLastChange(`Loaded ${plural(data.length, 'rule')} from ${file.name}.`)
    return true
  }

  async function handleCartFile(file) {
    setBusy('cart')
    const { data, errors, warnings = [] } = await parseWith(cartAdapters, file)
    setBusy(null)
    if (data.length === 0) {
      // Never wipe a working cart because a bad file was uploaded.
      setCartNotice({ errors: [...errors, hasCart ? 'Your current cart was kept.' : ''].filter(Boolean), warnings })
      return false
    }
    setCartItems(data)
    setCartNotice({ errors, warnings })
    setCartFileName(file.name)
    const skipped = warnings.length + errors.length
    setLastChange(
      `Cart replaced from ${file.name}: ${plural(data.length, 'item')} loaded` +
        (skipped ? `, ${plural(skipped, 'row')} skipped` : '') +
        '. Prices recalculated with the active rules.'
    )
    return true
  }

  async function loadSampleData() {
    const okRules = await handleRulesFile(sampleRulesFile())
    const okCart = await handleCartFile(sampleCartFile())
    if (okRules && okCart) {
      setLastChange('Sample rules and cart from the brief loaded.')
      goTo('checkout')
    }
  }

  async function loadSamplePdf(sample) {
    setBusy('cart')
    try {
      await handleCartFile(await samplePdfFile(sample))
    } catch {
      setBusy(null)
      setCartNotice({ errors: [`Could not load ${sample.name}.`], warnings: [] })
    }
  }

  function handleRuleConfirmed(rule) {
    setRules((prev) => [...prev, rule])
    setRuleSource((prev) => ({ ...prev, [rule.ruleId]: 'AI' }))
    setLastChange(`${rule.ruleId} added. Prices recalculated.`)
  }

  function handleRemoveRule(ruleId) {
    setRules((prev) => prev.filter((r) => r.ruleId !== ruleId))
    setLastChange(`${ruleId} removed. Prices recalculated.`)
  }

  const ruleColumns = [
    { key: 'ruleId', label: 'Rule ID', render: (v) => (<span style={{ whiteSpace: 'nowrap' }}>{v}<span style={S.badge(ruleSource[v] === 'AI')}>{ruleSource[v] ?? 'CSV'}</span></span>) },
    { key: 'scope', label: 'Scope', render: (v) => cap(v) },
    { key: 'appliesTo', label: 'Applies To', render: (v, r) => (r.scope === 'cart' ? 'Entire cart' : v) },
    { key: 'type', label: 'Type', render: (v) => cap(v) },
    { key: 'value', label: 'Value', render: (v, r) => (<span style={{ whiteSpace: 'nowrap' }}>{r.type === 'percentage' ? `${v}% off` : `${rs(v)} off`}</span>) },
    { key: 'minCartValue', label: 'Condition', render: (v, r) => (r.scope === 'cart' && v > 0 ? `Cart total ≥ ${rs(v)}` : '—') },
    { key: 'stackable', label: 'Stackable', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'remove', label: 'Action', render: (_, r) => (<button className="remove-btn" title={`Remove ${r.ruleId} from the active rules`} aria-label={`Remove ${r.ruleId}`} onClick={() => handleRemoveRule(r.ruleId)}>Remove</button>) },
  ]

  const steps = [
    { key: 'upload', label: 'Upload data', sub: hasCart ? `${plural(cartItems.length, 'item')} in cart` : 'Rules + cart (CSV or PDF)', done: hasCart, enabled: true },
    { key: 'rules', label: 'Review rules', sub: rules.length ? `${plural(rules.length, 'active rule')}` : 'Add rules in plain English', done: rules.length > 0, enabled: true },
    { key: 'checkout', label: 'Checkout', sub: hasCart ? `Total ${rs(pricing.summary.total)}` : 'Final prices & offers', done: false, enabled: hasCart, lockedHint: 'Load a cart first' },
  ]

  // ── Render ──

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div style={S.logoTxt}>O<span style={{ color: GOLD }}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </header>

      <main style={S.main}>
        <Stepper steps={steps} current={step} onSelect={goTo} />

        {/* ───────────── Step 1: Upload ───────────── */}
        {step === 'upload' && (
          <section aria-labelledby="h-upload">
            <h1 id="h-upload" style={S.h1}>Upload your rules and cart</h1>
            <p style={S.lead}>Rules come from a CSV. The cart can be a CSV or an order PDF. Everything is processed in your browser.</p>
            {lastChange && <div style={S.toast} role="status">{lastChange}</div>}

            <div style={S.sampleBox}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>No files handy?</div>
                <div style={{ fontSize: 12.5, color: '#6B6455' }}>Load the rules and cart from the assignment brief and jump straight to checkout.</div>
              </div>
              <button style={S.primary(!busy)} disabled={Boolean(busy)} onClick={loadSampleData}>Try sample data →</button>
            </div>

            <div style={S.grid2}>
              <div style={S.card}>
                <h2 style={S.h2}>Discount rules</h2>
                <FileUploader
                  label="rules.csv"
                  description="Upload your discount rules CSV"
                  accept={acceptFor(ruleAdapters)}
                  onFile={handleRulesFile}
                  hasData={rules.length > 0}
                  fileName={rulesFileName || 'Rules added in plain English'}
                  busy={busy === 'rules'}
                />
                <ErrorBanner errors={rulesNotice.errors} />
                <ErrorBanner variant="warning" errors={rulesNotice.warnings} />
                {rules.length > 0 && (
                  <div style={S.meta}>
                    ✓ {plural(rules.length, 'rule')} loaded — review them in step 2.
                  </div>
                )}
              </div>

              <div style={S.card}>
                <h2 style={S.h2}>Cart items</h2>
                <FileUploader
                  label="cart.csv or cart.pdf"
                  description="CSV, or an order PDF with Product, Brand, Platform, Base Price"
                  accept={acceptFor(cartAdapters)}
                  onFile={handleCartFile}
                  hasData={hasCart}
                  fileName={cartFileName}
                  busy={busy === 'cart'}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11.5, color: '#8A8273' }}>Sample PDFs:</span>
                  {SAMPLE_PDFS.map((p) => (
                    <button key={p.name} style={S.chip} title={p.hint} disabled={Boolean(busy)} onClick={() => loadSamplePdf(p)}>
                      📄 {p.name}
                    </button>
                  ))}
                </div>
                <ErrorBanner errors={cartNotice.errors} />
                <ErrorBanner variant="warning" title={`${plural(cartNotice.warnings.length, 'row')} skipped`} errors={cartNotice.warnings} />
                {hasCart && (
                  <>
                    <div style={S.meta}>{plural(cartItems.length, 'item')} in cart</div>
                    <DataTable columns={CART_COLUMNS} rows={cartItems} />
                  </>
                )}
              </div>
            </div>

            <div style={S.footer}>
              <span style={{ fontSize: 12.5, color: '#8A8273' }}>{hasCart ? '' : 'Load a cart to continue.'}</span>
              <button style={S.primary(hasCart)} disabled={!hasCart} onClick={() => goTo('rules')}>
                Next: Review rules →
              </button>
            </div>
          </section>
        )}

        {/* ───────────── Step 2: Rules ───────────── */}
        {step === 'rules' && (
          <section aria-labelledby="h-rules">
            <h1 id="h-rules" style={S.h1}>Review discount rules</h1>
            <p style={S.lead}>These rules are active. Add one in plain English or remove one you don't need, and the cart total on the right updates as you go.</p>
            {lastChange && <div style={S.toast}>{lastChange}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ ...S.card, flex: '999 1 480px' }}>
                <h2 style={S.h2}>Active rules</h2>
                <ErrorBanner errors={rulesNotice.errors} />
                {rules.length > 0 ? (
                  <DataTable columns={ruleColumns} rows={rules} />
                ) : (
                  <div style={{ fontSize: 13, color: '#8A8273', padding: '0.8rem 0' }}>
                    No rules yet. Add one below, or <button style={S.linkBtn} onClick={() => goTo('upload')}>upload rules.csv</button>.
                  </div>
                )}
                <RuleComposer rules={rules} cartItems={cartItems} onConfirm={handleRuleConfirmed} />
              </div>

              <aside style={{ ...S.card, flex: '1 1 260px', position: 'sticky', top: 16 }} aria-label="Cart preview">
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Your cart</div>
                {hasCart ? (
                  <>
                    <div style={S.statRow}><span>Items</span><span>{cartItems.length}</span></div>
                    <div style={S.statRow}><span>Item offers</span><span style={{ color: '#2E6B4E' }}>−{rs(brief.summary.itemSavings)}</span></div>
                    {brief.summary.cartOffers.map((o) => (
                      <div key={o.ruleId} style={S.statRow}><span>Cart offer</span><span style={{ color: '#2E6B4E' }}>−{rs(o.discount)}</span></div>
                    ))}
                    <div style={{ ...S.statRow, borderTop: '1px dashed #ccc', marginTop: 4, paddingTop: 8, fontWeight: 800, fontSize: 16 }}>
                      <span>Total</span><span>{rs(brief.summary.total)}</span>
                    </div>
                    <button style={{ ...S.primary(), width: '100%', marginTop: 12 }} onClick={() => goTo('checkout')}>
                      Calculate discounts →
                    </button>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: '#8A8273' }}>
                    No cart loaded. <button style={S.linkBtn} onClick={() => goTo('upload')}>Upload one</button> to see prices.
                  </div>
                )}
              </aside>
            </div>

            <div style={S.footer}>
              <button style={S.secondary} onClick={() => goTo('upload')}>← Back</button>
              <button style={S.primary(hasCart)} disabled={!hasCart} onClick={() => goTo('checkout')}>Calculate discounts →</button>
            </div>
          </section>
        )}

        {/* ───────────── Step 3: Checkout ───────────── */}
        {step === 'checkout' && (
          <section aria-labelledby="h-checkout">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h1 id="h-checkout" style={S.h1}>Checkout</h1>
                <p style={{ ...S.lead, marginBottom: 0 }}>
                  {plural(cartItems.length, 'item')} · {plural(rules.length, 'active rule')} ·{' '}
                  <button style={S.linkBtn} onClick={() => goTo('rules')}>edit rules</button> ·{' '}
                  <button style={S.linkBtn} onClick={() => goTo('upload')}>change cart</button>
                </p>
              </div>
              <div role="tablist" aria-label="View" style={S.tabs}>
                {[['ops', 'Pricing breakdown'], ['customer', 'Customer checkout view']].map(([key, label]) => (
                  <button key={key} role="tab" aria-selected={view === key} style={S.tab(view === key)} onClick={() => setView(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ height: '1rem' }} />
            {lastChange && <div style={S.toast}>{lastChange}</div>}
            {rules.length === 0 && <div style={S.toast}>No discount rules are active, so customers pay base prices.</div>}

            <BestDealBanner
              better={better}
              briefTotal={brief.summary.total}
              applied={showingBest}
              onApply={() => setUseBest(true)}
              onRevert={() => setUseBest(false)}
            />

            <div style={S.card}>
              {view === 'ops' ? (
                <CartSummary items={pricing.items} summary={pricing.summary} />
              ) : (
                <CheckoutView items={pricing.items} summary={pricing.summary} rules={rules} />
              )}
            </div>

            <div style={S.footer}>
              <button style={S.secondary} onClick={() => goTo('rules')}>← Back to rules</button>
              <button style={S.secondary} onClick={() => goTo('upload')}>Load a different cart</button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
