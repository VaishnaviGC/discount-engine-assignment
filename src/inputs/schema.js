/**
 * schema.js
 *
 * The single gate between "the outside world" and the discount engine.
 *
 * Every input mode (CSV, PDF, natural language, anything added later) turns its
 * raw data into loose objects and passes them through validateRule() /
 * validateCartItem(). Only objects that pass reach the engine. This is what lets
 * a new input mode be added without touching the calculator.
 */

export const SCOPES = ['brand', 'platform', 'cart']
export const TYPES = ['percentage', 'flat']

/** "Rs.1,299" / "₹ 1299" / "INR 1,299.00" / 1299 → 1299. Returns NaN if not a clean amount. */
export function parseAmount(raw) {
  if (typeof raw === 'number') return raw
  if (raw === null || raw === undefined) return NaN
  const cleaned = String(raw)
    .trim()
    .replace(/^(rs\.?|inr|₹)\s*/i, '')
    .replace(/,/g, '')
    .replace(/\/-$/, '')
    .trim()
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return NaN
  return parseFloat(cleaned)
}

/** true/false/yes/no/1/0 → boolean, anything else → null */
export function parseBool(raw) {
  if (typeof raw === 'boolean') return raw
  const s = String(raw ?? '').trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return true
  if (['false', 'no', 'n', '0'].includes(s)) return false
  return null
}

/** Next free id like RULE-05 / ITEM-07 given ids already in use. */
export function nextId(prefix, existingIds) {
  const used = new Set(existingIds)
  const make = (k) => `${prefix}-${String(k).padStart(2, '0')}`
  let n = 1
  while (used.has(make(n))) n++
  return make(n)
}

const isBlank = (v) => v === undefined || v === null || String(v).trim() === ''

/**
 * Validates a loosely-typed rule and returns a clean DiscountRule.
 * @returns {{ rule: DiscountRule|null, errors: string[] }}
 */
export function validateRule(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { rule: null, errors: ['Rule is empty or not an object'] }
  }

  const ruleId = String(raw.ruleId ?? '').trim()
  if (!ruleId) errors.push('rule id is missing')

  const scope = String(raw.scope ?? '').trim().toLowerCase()
  if (!SCOPES.includes(scope)) {
    errors.push(`scope must be one of ${SCOPES.join(' / ')}, got "${raw.scope ?? ''}"`)
  }

  const type = String(raw.type ?? '').trim().toLowerCase()
  if (!TYPES.includes(type)) {
    errors.push(`type must be "percentage" or "flat", got "${raw.type ?? ''}"`)
  }

  const value = parseAmount(raw.value)
  if (isBlank(raw.value)) {
    errors.push('value is missing')
  } else if (!Number.isFinite(value) || value <= 0) {
    errors.push(`value must be a positive number, got "${raw.value}"`)
  } else if (type === 'percentage' && value > 100) {
    errors.push(`a percentage discount cannot exceed 100%, got ${value}%`)
  }

  const appliesTo = isBlank(raw.appliesTo) ? '' : String(raw.appliesTo).trim()
  if ((scope === 'brand' || scope === 'platform') && !appliesTo) {
    errors.push(`a ${scope} rule needs to say which ${scope} it applies to`)
  }

  let stackable = false
  if (!isBlank(raw.stackable)) {
    const b = parseBool(raw.stackable)
    if (b === null) errors.push(`stackable must be true or false, got "${raw.stackable}"`)
    else stackable = b
  }

  let minCartValue = null
  if (scope === 'cart') {
    if (isBlank(raw.minCartValue)) {
      minCartValue = 0
    } else {
      minCartValue = parseAmount(raw.minCartValue)
      if (!Number.isFinite(minCartValue) || minCartValue < 0) {
        errors.push(`min cart value must be a non-negative number, got "${raw.minCartValue}"`)
      }
    }
  } else if (!isBlank(raw.minCartValue)) {
    errors.push('min cart value only makes sense for cart-scope rules')
  }

  if (errors.length > 0) return { rule: null, errors }

  return {
    rule: {
      ruleId,
      scope,
      appliesTo: scope === 'cart' ? '' : appliesTo,
      type,
      value,
      stackable,
      minCartValue,
    },
    errors: [],
  }
}

/**
 * Validates a loosely-typed cart item and returns a clean CartItem.
 * @returns {{ item: CartItem|null, errors: string[] }}
 */
export function validateCartItem(raw) {
  const errors = []
  if (!raw || typeof raw !== 'object') {
    return { item: null, errors: ['Item is empty or not an object'] }
  }
  const missing = ['itemId', 'product', 'brand', 'platform', 'basePrice'].filter((k) => isBlank(raw[k]))
  if (missing.length > 0) {
    const names = { itemId: 'item id', product: 'product', brand: 'brand', platform: 'platform', basePrice: 'base price' }
    errors.push(`missing ${missing.map((k) => names[k]).join(', ')}`)
  }

  const basePrice = parseAmount(raw.basePrice)
  if (!isBlank(raw.basePrice) && (!Number.isFinite(basePrice) || basePrice <= 0)) {
    errors.push(`base price must be a positive amount, got "${raw.basePrice}"`)
  }

  if (errors.length > 0) return { item: null, errors }

  return {
    item: {
      itemId: String(raw.itemId).trim(),
      product: String(raw.product).trim(),
      brand: String(raw.brand).trim(),
      platform: String(raw.platform).trim(),
      basePrice: Math.round(basePrice),
    },
    errors: [],
  }
}
