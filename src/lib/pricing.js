/**
 * pricing.js
 *
 * Glue between app state and the engine: runs item-level + cart-level pricing,
 * and computes the "what would change" preview shown before a rule is confirmed.
 */

import { processCart, applyCartRules } from '../engine/discountEngine.js'

export function priceCart(cartItems, rules) {
  const items = processCart(cartItems, rules)
  return { items, summary: applyCartRules(items, rules) }
}

/**
 * Dry-runs the engine with and without a candidate rule.
 * @returns {{ changedItems: Array, before: number, after: number, cartOfferChanged: boolean }}
 */
export function previewRuleImpact(cartItems, rules, candidate) {
  const before = priceCart(cartItems, rules)
  const after = priceCart(cartItems, [...rules, candidate])

  const changedItems = after.items
    .map((a, i) => ({ after: a, before: before.items[i] }))
    .filter(({ before: b, after: a }) => b.finalPrice !== a.finalPrice || b.reasoning !== a.reasoning)
    .map(({ before: b, after: a }) => ({
      itemId: a.itemId,
      product: a.product,
      beforePrice: b.finalPrice,
      afterPrice: a.finalPrice,
      newReasoning: a.reasoning,
      usesNewRule: a.appliedRules.includes(candidate.ruleId),
    }))

  const offerIds = (s) => s.cartOffers.map((o) => o.ruleId).join(',')
  return {
    changedItems,
    before: before.summary.total,
    after: after.summary.total,
    cartOfferChanged: offerIds(before.summary) !== offerIds(after.summary),
    newCartOffer: after.summary.cartOffers.find((o) => o.ruleId === candidate.ruleId) ?? null,
  }
}
