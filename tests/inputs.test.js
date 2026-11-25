import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { validateRule, validateCartItem, parseAmount, nextId } from '../src/inputs/schema.js'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csvAdapter.js'
import { cartItemsFromFragments } from '../src/inputs/pdfTable.js'
import { extractFragments } from '../src/inputs/pdfAdapter.js'
import { interpretParse, extractNumbers, parseRuleFromText } from '../src/inputs/nlRuleAdapter.js'
import { parseRuleWithLLM, handleParseRule } from '../server/llmRuleParser.js'

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }))

const rules = parseRulesCSV(readFileSync('sample-data/rules.csv', 'utf8')).data
const cartItems = parseCartCSV(readFileSync('sample-data/cart.csv', 'utf8')).data

// ── schema ─────────────────────────────────────────────────────────
describe('schema', () => {
  it('parses rupee amounts in common formats', () => {
    expect(parseAmount('Rs.1,299')).toBe(1299)
    expect(parseAmount('₹ 849')).toBe(849)
    expect(parseAmount('INR 2,499.00')).toBe(2499)
    expect(parseAmount('TBD')).toBeNaN()
    expect(parseAmount('12abc')).toBeNaN()
  })
  it('rejects bad rules with readable reasons', () => {
    expect(validateRule({ ruleId: 'R', scope: 'brand', type: 'percentage', value: 120 }).errors).toEqual([
      'a percentage discount cannot exceed 100%, got 120%',
      'a brand rule needs to say which brand it applies to',
    ])
    expect(validateRule({ ruleId: 'R', scope: 'shop', appliesTo: 'x', type: 'flat', value: -5 }).rule).toBeNull()
  })
  it('cart rule without threshold means "always"', () => {
    expect(validateRule({ ruleId: 'R', scope: 'cart', type: 'flat', value: 50 }).rule.minCartValue).toBe(0)
  })
  it('generates the next free id', () => {
    expect(nextId('RULE', ['RULE-01', 'RULE-02', 'RULE-04'])).toBe('RULE-03')
  })
  it('rejects cart items with zero price', () => {
    expect(validateCartItem({ itemId: 'I', product: 'p', brand: 'b', platform: 'x', basePrice: 'Rs.0' }).rule).toBeUndefined()
    expect(validateCartItem({ itemId: 'I', product: 'p', brand: 'b', platform: 'x', basePrice: 'Rs.0' }).item).toBeNull()
  })
})

// ── CSV ────────────────────────────────────────────────────────────
describe('CSV adapter', () => {
  it('keeps good rows and reports bad ones', () => {
    const { data, errors } = parseRulesCSV(
      'rule_id,scope,applies_to,type,value,stackable\nR1,brand,X,flat,100,false\nR2,brand,,flat,100,false\nR1,brand,Y,flat,5,false'
    )
    expect(data.map((r) => r.ruleId)).toEqual(['R1'])
    expect(errors).toHaveLength(2)
    expect(errors[1]).toMatch(/duplicate rule id R1/)
  })
  it('accepts old rules.csv files without min_cart_value column', () => {
    const { data, errors } = parseRulesCSV('rule_id,scope,applies_to,type,value,stackable\nR1,platform,Noon,percentage,5,true')
    expect(errors).toEqual([])
    expect(data[0]).toMatchObject({ stackable: true, minCartValue: null })
  })
})

// ── PDF ────────────────────────────────────────────────────────────
const loadPdf = async (path) => {
  const buf = readFileSync(path)
  const frags = await extractFragments(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), pdfjs)
  return cartItemsFromFragments(frags)
}

describe('PDF adapter (real PDFs)', () => {
  it('reads the cart from the brief into the same items as cart.csv', async () => {
    const { data, errors, warnings } = await loadPdf('sample-data/cart.pdf')
    expect(errors).toEqual([])
    expect(warnings).toEqual([])
    expect(data).toEqual(cartItems)
  })

  it('imports good rows of a malformed PDF and explains each skipped row', async () => {
    const { data, errors, warnings } = await loadPdf('sample-data/cart-malformed.pdf')
    expect(errors).toEqual([])
    expect(data.map((i) => i.product)).toEqual(['Cushion Cover', 'Ceramic Vase', 'Desk Organiser'])
    expect(data.map((i) => i.itemId)).toEqual(['ITEM-01', 'ITEM-02', 'ITEM-03'])
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toMatch(/"Bed Sheet Set" skipped — base price must be a positive amount, got "TBD"/)
    expect(warnings[1]).toMatch(/"Wall Shelf" skipped — missing brand/)
    expect(warnings[2]).toMatch(/"Gift Wrap" skipped/)
  })
})

describe('PDF table parsing (synthetic layouts)', () => {
  it('handles a whole row emitted as one space-separated string', () => {
    const f = (str, y) => ({ str, x: 50, y, width: str.length * 5, page: 1 })
    const { data } = cartItemsFromFragments([
      f('Product         Brand          Platform       Base Price', 700),
      f('Cushion Cover   Natura Casa    Amazon India   Rs.1,299', 680),
    ])
    expect(data).toEqual([
      { itemId: 'ITEM-01', product: 'Cushion Cover', brand: 'Natura Casa', platform: 'Amazon India', basePrice: 1299 },
    ])
  })
  it('explains a PDF without the expected table', () => {
    const { data, errors } = cartItemsFromFragments([{ str: 'Hello world', x: 0, y: 0, width: 50, page: 1 }])
    expect(data).toEqual([])
    expect(errors[0]).toMatch(/Product, Brand, Platform, Base Price/)
  })
  it('explains a PDF with no text (scanned)', () => {
    expect(cartItemsFromFragments([]).errors[0]).toMatch(/no selectable text/)
  })
})

// ── Natural language → rule ────────────────────────────────────────
describe('NL rule adapter (LLM output is untrusted)', () => {
  const ctx = (text) => ({ text, rules, cartItems })
  const ok = (rule) => ({ status: 'ok', rule })

  it('extracts written numbers including 5,000 / 5k / 1.5 lakh', () => {
    expect([...extractNumbers('10% off above Rs.5,000 or 5k or 1.5 lakh')]).toEqual([10, 5000, 150000])
    expect([...extractNumbers('Rs.100 flat on 5000rs carts')]).toEqual([100, 5000])
  })

  it('brief example 1: 20% Natura Casa stackable', () => {
    const r = interpretParse(
      ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }),
      ctx('20% off for Natura Casa brand, stackable with other offers')
    )
    expect(r.status).toBe('ok')
    expect(r.rule).toEqual({ ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null })
  })

  it('brief example 3: cart rule with threshold', () => {
    const r = interpretParse(
      ok({ scope: 'cart', appliesTo: null, type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      ctx('10% off if cart value is more than Rs.5,000')
    )
    expect(r.rule).toMatchObject({ scope: 'cart', appliesTo: '', minCartValue: 5000 })
  })

  it('brief example 4: ambiguous answer is surfaced with the question', () => {
    const r = interpretParse(
      { status: 'ambiguous', missing: ['value', 'minCartValue'], question: 'How much, and from what cart total?' },
      ctx('Give a discount for big orders')
    )
    expect(r).toEqual({ status: 'ambiguous', missing: ['value', 'minCartValue'], message: 'How much, and from what cart total?' })
  })

  it('blocks a hallucinated value the user never wrote', () => {
    const r = interpretParse(
      ok({ scope: 'cart', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }),
      ctx('Give a discount for big orders')
    )
    expect(r.status).toBe('ambiguous')
    expect(r.missing).toEqual(['value', 'minCartValue'])
  })

  it('rejects an invalid rule from the LLM instead of crashing', () => {
    expect(interpretParse(ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 150 }), ctx('150% off Natura Casa')).status).toBe('invalid')
    expect(interpretParse(ok({ scope: 'galaxy', type: 'flat', value: 5 }), ctx('5 off')).status).toBe('invalid')
    expect(interpretParse('garbage', ctx('x')).status).toBe('invalid')
    expect(interpretParse(null, ctx('x')).status).toBe('invalid')
    expect(interpretParse({ status: 'ok' }, ctx('x')).status).toBe('invalid')
  })

  it('fixes casing / typos and wrong scope using names from the cart', () => {
    const r1 = interpretParse(ok({ scope: 'brand', appliesTo: 'natura kasa', type: 'flat', value: 50 }), ctx('Rs.50 off natura kasa'))
    expect(r1.rule.appliesTo).toBe('Natura Casa')
    expect(r1.warnings[0]).toMatch(/Interpreted/)
    const r2 = interpretParse(ok({ scope: 'brand', appliesTo: 'Flipkart', type: 'flat', value: 100 }), ctx('Rs.100 off Flipkart'))
    expect(r2.rule).toMatchObject({ scope: 'platform', appliesTo: 'Flipkart' })
  })

  it('warns when the rule matches nothing in the cart', () => {
    const r = interpretParse(ok({ scope: 'brand', appliesTo: 'Ikea', type: 'flat', value: 100 }), ctx('Rs.100 off Ikea'))
    expect(r.status).toBe('ok')
    expect(r.warnings.join(' ')).toMatch(/won't change any price/)
  })

  it('blocks a rule identical to an active one (would double a stackable discount)', () => {
    const d = interpretParse(ok({ scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 150, stackable: false }), ctx('Rs.150 off Natura Casa'))
    expect(d.status).toBe('invalid')
    expect(d.message).toMatch(/identical to RULE-02/)
  })

  it('end-to-end: network failure becomes a friendly error', async () => {
    const failingFetch = () => Promise.reject(new Error('offline'))
    const r = await parseRuleFromText('10% off Flipkart', { rules, cartItems }, failingFetch)
    expect(r).toEqual({ status: 'error', message: 'Network error — could not reach the rule parser.' })
  })
})

// ── Server-side LLM call ───────────────────────────────────────────
describe('LLM server handler', () => {
  const groqReply = (content, status = 200) => () =>
    Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve({ choices: [{ message: { content } }] }) })

  it('returns 503 with a clear message when no API key is configured', async () => {
    const r = await handleParseRule({ text: 'x' }, {})
    expect(r.status).toBe(503)
    expect(r.json.error).toMatch(/GROQ_API_KEY/)
  })
  it('passes through model JSON', async () => {
    const out = await parseRuleWithLLM({ text: '10% off Noon', apiKey: 'k', fetchImpl: groqReply('{"status":"ok","rule":{}}') })
    expect(out).toEqual({ status: 'ok', rule: {} })
  })
  it('non-JSON model output → 502 with friendly message', async () => {
    await expect(parseRuleWithLLM({ text: 'x', apiKey: 'k', fetchImpl: groqReply('Sure! Here is') })).rejects.toMatchObject({ status: 502 })
  })
  it('rate limit → 429', async () => {
    await expect(parseRuleWithLLM({ text: 'x', apiKey: 'k', fetchImpl: groqReply('', 429) })).rejects.toMatchObject({ status: 429 })
  })
  it('rejects over-long input before calling the model', async () => {
    const spy = vi.fn()
    await expect(parseRuleWithLLM({ text: 'a'.repeat(501), apiKey: 'k', fetchImpl: spy })).rejects.toMatchObject({ status: 400 })
    expect(spy).not.toHaveBeenCalled()
  })
})
