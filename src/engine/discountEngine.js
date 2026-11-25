/**
 * discountEngine.js
 *
 * Pure discount calculation logic. No UI, no side effects, no knowledge of
 * where rules or cart items came from (CSV, PDF, LLM...). Every input path
 * adapts to these shapes — the engine never adapts to an input path.
 *
 * Data shapes:
 *
 * DiscountRule {
 *   ruleId:       string       — e.g. "RULE-01"
 *   scope:        "brand" | "platform" | "cart"
 *   appliesTo:    string       — e.g. "Natura Casa", "Amazon India" ("" for cart rules)
 *   type:         "percentage" | "flat"
 *   value:        number       — percentage as integer (15 = 15%), flat in rupees
 *   stackable:    boolean
 *   minCartValue: number|null  — cart rules only: threshold on the sum of final item prices
 * }
 *
 * CartItem {
 *   itemId:    string       — e.g. "ITEM-01"
 *   product:   string
 *   brand:     string
 *   platform:  string
 *   basePrice: number       — in rupees
 * }
 *
 * DiscountResult {
 *   itemId, product, brand, platform, basePrice: (copied from CartItem)
 *   finalPrice:    number
 *   totalDiscount: number
 *   appliedRules:  string[]
 *   skippedRules:  string[]
 *   status:        "none" | "applied" | "max" | "stacked"
 *   reasoning:     string   — customer-readable explanation
 * }
 *
 * CartSummary {
 *   subtotal:     number            — sum of item final prices
 *   cartOffers:   CartOfferLine[]   — empty when no cart rule is triggered
 *   cartDiscount: number
 *   total:        number            — what the customer pays
 *   itemSavings:  number
 *   totalSavings: number            — item savings + cart savings
 *   nudge:        { ruleId, shortBy, label } | null — closest unmet cart offer
 * }
 */

export const NO_OFFER_TEXT = 'No offers available'

const normalise = (s) => String(s ?? '').trim().toLowerCase()
const rs = (n) => `Rs.${Math.round(n).toLocaleString('en-IN')}`

/**
 * Returns true if the rule applies to this cart item.
 * Cart-scope rules never match an individual item — they are evaluated by
 * applyCartRules() after all item-level pricing is done.
 */
export function ruleMatchesItem(item, rule) {
  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }
  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }
  return false
}

/**
 * Calculates the rupee discount a rule gives on a given price.
 * Uses the provided price, not the original base price — important for stacking.
 * Never discounts more than the price itself (a Rs.150 flat offer on a Rs.100
 * item makes it free, not Rs.-50).
 */
export function calculateDiscountAmount(price, rule) {
  if (price <= 0) return 0
  let amount = 0
  if (rule.type === 'percentage') {
    amount = Math.round((price * rule.value) / 100)
  } else if (rule.type === 'flat') {
    amount = rule.value
  }
  return Math.min(Math.max(amount, 0), price)
}

/**
 * Short customer-facing label for a rule, e.g. "Amazon India offer: 15% off".
 */
export function describeRule(rule, { extra = false } = {}) {
  const who =
    rule.scope === 'cart'
      ? 'Cart offer'
      : `${rule.appliesTo} offer`
  const what =
    rule.type === 'percentage'
      ? `${extra ? 'extra ' : ''}${rule.value}% off`
      : `${extra ? 'extra ' : ''}${rs(rule.value)} off`
  return `${who}: ${what}`
}

/**
 * Applies the active discount rules to a single cart item.
 * Returns a DiscountResult.
 *
 * Logic:
 *   1. Find all rules that match this item.
 *   2. Among non-stackable rules, pick the one giving the largest discount.
 *   3. Apply any stackable rules on top of that price.
 *   4. Build the reasoning string from what was applied.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter((r) => ruleMatchesItem(item, r))

  const base = {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
  }

  // No rules match — return base price with explanation
  if (matchingRules.length === 0) {
    return {
      ...base,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      status: 'none',
      reasoning: NO_OFFER_TEXT,
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  // Pick the non-stackable rule that gives the largest saving.
  // Sort is stable, so on a tie the rule listed first wins (deterministic).
  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )
    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  // Apply winner first, then stack on top
  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    const saving = calculateDiscountAmount(price, winner)
    price -= saving
    appliedRules.push(winner.ruleId)
    let text = describeRule(winner)
    if (skipped.length > 0) {
      const runnerUp = skipped[0]
      // Flat offers already state their rupee value; percentage ones need it spelled out.
      const runnerUpSaving =
        runnerUp.type === 'percentage' ? ` (${rs(calculateDiscountAmount(item.basePrice, runnerUp))})` : ''
      text += ` — saves ${rs(saving)}, better than ${describeRule(runnerUp)}${runnerUpSaving}`
    }
    reasoningParts.push(text)
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(describeRule(rule, { extra: Boolean(winner) || appliedRules.length > 1 }))
  }

  const finalPrice = Math.max(0, Math.round(price))

  let status = 'applied'
  if (appliedRules.length > 1) status = 'stacked'
  else if (skipped.length > 0) status = 'max'

  return {
    ...base,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    status,
    reasoning: reasoningParts.join(' + '),
  }
}

/**
 * Runs applyDiscounts across every item in the cart.
 * Returns an array of DiscountResult objects.
 */
export function processCart(cartItems, rules) {
  return cartItems.map((item) => applyDiscounts(item, rules))
}

/**
 * Sums the final prices across all results.
 */
export function cartTotal(results) {
  return results.reduce((sum, r) => sum + r.finalPrice, 0)
}

/**
 * Evaluates cart-scope rules against the item-level results.
 *
 * The condition (subtotal ≥ minCartValue) is checked against the sum of FINAL
 * item prices, i.e. after all item-level discounts. Cart rules follow the same
 * selection logic as item rules: the best qualifying non-stackable cart rule
 * wins, stackable cart rules apply on top of it.
 *
 * Also returns a "nudge" — the closest cart offer the customer has not yet
 * unlocked, if unlocking it would save them more than they save today.
 */
export function applyCartRules(itemResults, rules) {
  const subtotal = cartTotal(itemResults)
  const itemSavings = itemResults.reduce((s, r) => s + r.totalDiscount, 0)
  const cartRules = rules.filter((r) => r.scope === 'cart')
  const threshold = (r) => Number(r.minCartValue) || 0

  const qualifying = cartRules.filter((r) => subtotal > 0 && subtotal >= threshold(r))
  const nonStackable = qualifying.filter((r) => !r.stackable)
  const stackable = qualifying.filter((r) => r.stackable)

  const winner =
    [...nonStackable].sort(
      (a, b) => calculateDiscountAmount(subtotal, b) - calculateDiscountAmount(subtotal, a)
    )[0] ?? null

  let running = subtotal
  const cartOffers = []
  for (const rule of [winner, ...stackable].filter(Boolean)) {
    const discount = calculateDiscountAmount(running, rule)
    if (discount <= 0) continue
    running -= discount
    const valueText = rule.type === 'percentage' ? `${rule.value}% off` : `${rs(rule.value)} off`
    const condition = threshold(rule) > 0 ? ` (cart total ≥ ${rs(threshold(rule))})` : ''
    cartOffers.push({
      ruleId: rule.ruleId,
      discount,
      label: `Cart offer: ${valueText}${condition} — ${rs(discount)} saved`,
    })
  }

  const cartDiscount = subtotal - running

  // Nudge: cheapest-to-reach unmet cart offer that beats what the customer gets now.
  let nudge = null
  if (subtotal > 0) {
    const unmet = cartRules
      .filter((r) => subtotal < threshold(r))
      .map((r) => {
        const target = threshold(r)
        return { rule: r, shortBy: target - subtotal, wouldSave: calculateDiscountAmount(target, r) }
      })
      .filter((u) => u.wouldSave > cartDiscount)
      .sort((a, b) => a.shortBy - b.shortBy)
    if (unmet.length > 0) {
      const { rule, shortBy } = unmet[0]
      const valueText =
        rule.type === 'percentage' ? `${rule.value}% off your whole cart` : `${rs(rule.value)} off your cart`
      nudge = {
        ruleId: rule.ruleId,
        shortBy,
        label: `Add ${rs(shortBy)} more to unlock ${valueText}`,
      }
    }
  }

  return {
    subtotal,
    cartOffers,
    cartDiscount,
    total: running,
    itemSavings,
    totalSavings: itemSavings + cartDiscount,
    nudge,
  }
}
