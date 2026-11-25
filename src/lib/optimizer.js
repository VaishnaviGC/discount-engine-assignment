/**
 * optimizer.js — "is there a cheaper combination for the customer?"
 *
 * The brief's rule is greedy: each item takes its biggest discount. That is
 * almost always best for the customer, except near a cart-offer threshold, where
 * a bigger item discount can push the cart total BELOW the threshold and lose
 * the cart offer:
 *
 *   Cushion Cover 15% off → cart Rs.3,993 → no cart offer → pays Rs.3,993
 *   Cushion Cover Rs.150 off → cart Rs.4,038 → 10% off   → pays Rs.3,634
 *
 * This module does not change the engine. It only calls applyDiscounts() with
 * different subsets of the active rules (one per possible non-stackable winner)
 * and applyCartRules() on the resulting subtotal, then searches all item
 * combinations for the lowest final total.
 *
 * Search: dynamic programming over achievable subtotals. Each item has only a
 * handful of distinct prices, so the number of states stays small; a hard cap
 * keeps it safe for unusually large carts (then we simply report nothing).
 */

import { applyDiscounts, applyCartRules, ruleMatchesItem } from '../engine/discountEngine.js'

const MAX_STATES = 50000

/** Every legitimate way to price one item: each matching non-stackable rule as the winner, or none. Stackables always apply. */
export function itemOptions(item, rules) {
  const matching = rules.filter((r) => ruleMatchesItem(item, r))
  const stackable = matching.filter((r) => r.stackable)
  const nonStackable = matching.filter((r) => !r.stackable)
  const subsets = [...nonStackable.map((w) => [w, ...stackable]), stackable]
  const byPrice = new Map()
  for (const subset of subsets) {
    const result = applyDiscounts(item, subset)
    // For the same price keep the first (= a real winner before "no winner").
    if (!byPrice.has(result.finalPrice)) byPrice.set(result.finalPrice, result)
  }
  return [...byPrice.values()]
}

const totalFor = (subtotal, rules) => applyCartRules([{ finalPrice: subtotal, totalDiscount: 0 }], rules).total

/**
 * @param greedyItems  DiscountResult[] produced by the engine as specified
 * @returns null when the brief's pricing is already the cheapest, otherwise
 *          { items, summary, saving, changes: [{ itemId, product, from, to, priceDelta }] }
 */
export function findBetterCombination(cartItems, rules, greedyItems) {
  if (cartItems.length === 0 || !rules.some((r) => r.scope === 'cart')) return null

  // states: subtotal → array of chosen option indexes (one per item so far)
  let states = new Map([[0, []]])
  const options = cartItems.map((item) => itemOptions(item, rules))

  for (const opts of options) {
    const next = new Map()
    for (const [subtotal, picks] of states) {
      opts.forEach((opt, k) => {
        const s = subtotal + opt.finalPrice
        if (!next.has(s)) next.set(s, [...picks, k])
      })
    }
    if (next.size > MAX_STATES) return null
    states = next
  }

  const greedySubtotal = greedyItems.reduce((s, r) => s + r.finalPrice, 0)
  const greedyTotal = totalFor(greedySubtotal, rules)

  let best = null
  for (const [subtotal, picks] of states) {
    const total = totalFor(subtotal, rules)
    if (total < greedyTotal && (!best || total < best.total)) best = { subtotal, total, picks }
  }
  if (!best) return null

  const items = best.picks.map((k, i) => {
    const chosen = options[i][k]
    const greedy = greedyItems[i]
    if (chosen.finalPrice === greedy.finalPrice) return greedy
    return {
      ...chosen,
      status: 'optimised',
      reasoning: `${chosen.reasoning} — picked so your cart unlocks the cart offer`,
    }
  })

  const changes = items
    .map((it, i) => ({ it, greedy: greedyItems[i] }))
    .filter(({ it, greedy }) => it.finalPrice !== greedy.finalPrice)
    .map(({ it, greedy }) => ({
      itemId: it.itemId,
      product: it.product,
      from: greedy.reasoning.split(' — ')[0],
      to: it.reasoning.split(' — ')[0],
      priceDelta: it.finalPrice - greedy.finalPrice,
    }))

  const summary = applyCartRules(items, rules)
  return { items, summary, saving: greedyTotal - summary.total, changes }
}
