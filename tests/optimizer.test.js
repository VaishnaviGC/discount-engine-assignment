import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseRulesCSV, parseCartCSV } from '../src/inputs/csvAdapter.js'
import { priceCart } from '../src/lib/pricing.js'
import { findBetterCombination, itemOptions } from '../src/lib/optimizer.js'
import { offerLabel } from '../src/components/CheckoutView.jsx'

const rules = parseRulesCSV(readFileSync('sample-data/rules.csv', 'utf8')).data
const sampleCart = parseCartCSV(readFileSync('sample-data/cart.csv', 'utf8')).data
const item = (itemId, product, brand, platform, basePrice) => ({ itemId, product, brand, platform, basePrice })

const edgeCart = [
  item('ITEM-01', 'Cushion Cover', 'Natura Casa', 'Amazon India', 1299),
  item('ITEM-02', 'Ceramic Vase', 'LivSpace Pro', 'Noon', 2499),
  item('ITEM-03', 'Table Lamp', 'LivSpace Pro', 'Noon', 390),
]

describe('best-combination optimiser', () => {
  it('lists every legitimate way to price an item', () => {
    const prices = itemOptions(sampleCart[0], rules).map((o) => o.finalPrice)
    expect(prices.sort()).toEqual([1104, 1149, 1299])
  })

  it('finds nothing better for the brief sample cart (greedy is already optimal)', () => {
    const brief = priceCart(sampleCart, rules)
    expect(findBetterCombination(sampleCart, rules, brief.items)).toBeNull()
  })

  it('beats per-item max when it pushes the cart just below the threshold', () => {
    const brief = priceCart(edgeCart, rules)
    expect(brief.summary.subtotal).toBe(3993)
    expect(brief.summary.total).toBe(3993)

    const better = findBetterCombination(edgeCart, rules, brief.items)
    expect(better.summary.subtotal).toBe(4038)
    expect(better.summary.total).toBe(3634)
    expect(better.saving).toBe(359)
    expect(better.changes).toEqual([
      { itemId: 'ITEM-01', product: 'Cushion Cover', from: 'Amazon India offer: 15% off', to: 'Natura Casa offer: Rs.150 off', priceDelta: 45 },
    ])
    expect(better.items[0].status).toBe('optimised')
  })

  it('does nothing without cart rules', () => {
    const itemRulesOnly = rules.filter((r) => r.scope !== 'cart')
    expect(findBetterCombination(edgeCart, itemRulesOnly, priceCart(edgeCart, itemRulesOnly).items)).toBeNull()
  })

  it('stays fast on a 40-item cart', () => {
    const big = Array.from({ length: 40 }, (_, i) => item(`I${i}`, 'P', 'Natura Casa', i % 2 ? 'Amazon India' : 'Flipkart', 300 + i * 37))
    const t = performance.now()
    findBetterCombination(big, rules, priceCart(big, rules).items)
    expect(performance.now() - t).toBeLessThan(1000)
  })
})

describe('customer offer label', () => {
  const byId = Object.fromEntries(rules.map((r) => [r.ruleId, r]))
  it('is one short label per item', () => {
    const { items } = priceCart(sampleCart, rules)
    expect(items.map((i) => offerLabel(i, byId))).toEqual([
      '15% off · Amazon India offer',
      'Rs.150 off + extra 10% off',
      '15% off · Amazon India offer',
      null,
      '15% off · Amazon India offer',
      '10% off · Flipkart offer',
    ])
  })
})
