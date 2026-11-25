import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { applyDiscounts, applyCartRules, processCart, calculateDiscountAmount } from '../src/engine/discountEngine.js'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csvAdapter.js'
import { priceCart, previewRuleImpact } from '../src/lib/pricing.js'

const rules = parseRulesCSV(readFileSync('sample-data/rules.csv', 'utf8'))
const cart = parseCartCSV(readFileSync('sample-data/cart.csv', 'utf8'))

describe('sample data loads cleanly', () => {
  it('parses all 4 rules including the cart rule', () => {
    expect(rules.errors).toEqual([])
    expect(rules.data.map((r) => r.ruleId)).toEqual(['RULE-01', 'RULE-02', 'RULE-03', 'RULE-04'])
    expect(rules.data[3]).toMatchObject({ scope: 'cart', appliesTo: '', minCartValue: 4000, value: 10 })
  })
  it('parses all 6 cart items', () => {
    expect(cart.errors).toEqual([])
    expect(cart.data).toHaveLength(6)
  })
})

describe('expected results table from the brief', () => {
  const { items, summary } = priceCart(cart.data, rules.data)
  const byId = Object.fromEntries(items.map((r) => [r.itemId, r]))

  it.each([
    ['ITEM-01', 1104, ['RULE-01'], 'max'],
    ['ITEM-02', 629, ['RULE-02', 'RULE-03'], 'stacked'],
    ['ITEM-03', 509, ['RULE-01'], 'applied'],
    ['ITEM-04', 2499, [], 'none'],
    ['ITEM-05', 382, ['RULE-01'], 'applied'],
    ['ITEM-06', 809, ['RULE-03'], 'applied'],
  ])('%s → Rs.%i', (id, price, applied, status) => {
    expect(byId[id].finalPrice).toBe(price)
    expect(byId[id].appliedRules).toEqual(applied)
    expect(byId[id].status).toBe(status)
  })

  it('cart: Rs.5,932 → −Rs.593 → Rs.5,339', () => {
    expect(summary.subtotal).toBe(5932)
    expect(summary.cartDiscount).toBe(593)
    expect(summary.total).toBe(5339)
    expect(summary.cartOffers).toHaveLength(1)
    expect(summary.cartOffers[0].label).toBe('Cart offer: 10% off (cart total ≥ Rs.4,000) — Rs.593 saved')
    expect(summary.nudge).toBeNull()
  })

  it('customer-facing reasoning is explicit', () => {
    expect(byId['ITEM-01'].reasoning).toBe(
      'Amazon India offer: 15% off — saves Rs.195, better than Natura Casa offer: Rs.150 off'
    )
    expect(byId['ITEM-02'].reasoning).toBe('Natura Casa offer: Rs.150 off + Flipkart offer: extra 10% off')
    expect(byId['ITEM-04'].reasoning).toBe('No offers available')
    expect(byId['ITEM-06'].reasoning).toBe('Flipkart offer: 10% off')
  })
})

describe('cart threshold edge cases', () => {
  const cartRule = { ruleId: 'C', scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 }
  const at = (total) => applyCartRules([{ finalPrice: total, totalDiscount: 0 }], [cartRule])

  it('exactly at threshold → applies (≥)', () => {
    expect(at(4000).cartDiscount).toBe(400)
  })
  it('Rs.1 below threshold → no cart row, nudge says add Rs.1', () => {
    const s = at(3999)
    expect(s.cartOffers).toEqual([])
    expect(s.total).toBe(3999)
    expect(s.nudge).toMatchObject({ shortBy: 1, label: 'Add Rs.1 more to unlock 10% off your whole cart' })
  })
  it('empty cart → no offer, no nudge', () => {
    const s = applyCartRules([], [cartRule])
    expect(s.total).toBe(0)
    expect(s.cartOffers).toEqual([])
    expect(s.nudge).toBeNull()
  })
  it('picks the bigger of two non-stackable cart rules', () => {
    const flat = { ...cartRule, ruleId: 'F', type: 'flat', value: 700 }
    const s = applyCartRules([{ finalPrice: 5000, totalDiscount: 0 }], [cartRule, flat])
    expect(s.cartOffers.map((o) => o.ruleId)).toEqual(['F'])
    expect(s.total).toBe(4300)
  })
  it('nudges toward a bigger tier even when a smaller one already applies', () => {
    const big = { ...cartRule, ruleId: 'BIG', value: 20, minCartValue: 6000 }
    const s = applyCartRules([{ finalPrice: 5932, totalDiscount: 0 }], [cartRule, big])
    expect(s.cartOffers.map((o) => o.ruleId)).toEqual(['C'])
    expect(s.nudge).toMatchObject({ ruleId: 'BIG', shortBy: 68 })
  })
})

describe('item edge cases', () => {
  const item = { itemId: 'X', product: 'Mug', brand: 'B', platform: 'P', basePrice: 100 }
  it('flat discount bigger than price makes the item free, never negative', () => {
    const r = applyDiscounts(item, [{ ruleId: 'R', scope: 'brand', appliesTo: 'B', type: 'flat', value: 150, stackable: false }])
    expect(r.finalPrice).toBe(0)
    expect(r.totalDiscount).toBe(100)
  })
  it('stackable rule with no non-stackable winner applies alone', () => {
    const r = applyDiscounts(item, [{ ruleId: 'S', scope: 'platform', appliesTo: 'P', type: 'percentage', value: 10, stackable: true }])
    expect(r.finalPrice).toBe(90)
    expect(r.status).toBe('applied')
    expect(r.reasoning).toBe('P offer: 10% off')
  })
  it('cart-scope rules never touch individual items', () => {
    const r = processCart([item], [{ ruleId: 'C', scope: 'cart', appliesTo: '', type: 'percentage', value: 50, stackable: false, minCartValue: 0 }])
    expect(r[0].finalPrice).toBe(100)
  })
  it('calculateDiscountAmount never exceeds the price', () => {
    expect(calculateDiscountAmount(50, { type: 'flat', value: 999 })).toBe(50)
  })
})

describe('rule impact preview', () => {
  it('shows which items a new stackable Natura Casa rule changes', () => {
    const candidate = { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }
    const p = previewRuleImpact(cart.data, rules.data, candidate)
    expect(p.changedItems.map((c) => c.itemId)).toEqual(['ITEM-01', 'ITEM-02'])
    expect(p.changedItems[0]).toMatchObject({ beforePrice: 1104, afterPrice: 883 })
    expect(p.before).toBe(5339)
    expect(p.after).toBeLessThan(5339)
  })
})
