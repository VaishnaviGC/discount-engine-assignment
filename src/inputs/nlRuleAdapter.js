/**
 * nlRuleAdapter.js
 *
 * Plain English → DiscountRule.
 *
 *   requestRuleParse()  — calls /api/parse-rule (LLM lives server-side)
 *   interpretParse()    — PURE: turns the LLM's untrusted JSON into one of
 *       { status: 'ok',        rule, warnings }      → show confirmation step
 *       { status: 'ambiguous', message, missing }    → ask the user to be specific
 *       { status: 'invalid',   message, errors }     → LLM produced a bad rule
 *
 * The LLM is treated as an untrusted input source, exactly like a CSV file:
 *   1. its rule goes through the same validateRule() as CSV rows,
 *   2. every number it returns must actually appear in the user's text
 *      (stops the model from inventing "10%" for "a discount for big orders"),
 *   3. brand / platform names are matched to what is actually in the cart.
 */

import { validateRule, nextId } from './schema.js'

/** All numbers written in the text, understanding "5,000", "5k", "1.5 lakh". */
export function extractNumbers(text) {
  const out = new Set()
  const re = /(\d[\d,]*(?:\.\d+)?)(?![\d,.]?\d)(?:\s*(k|thousand|lakh|lac)\b)?/gi
  let m
  while ((m = re.exec(String(text ?? ''))) !== null) {
    let n = parseFloat(m[1].replace(/,/g, ''))
    if (!Number.isFinite(n)) continue
    const unit = (m[2] || '').toLowerCase()
    if (unit === 'k' || unit === 'thousand') n *= 1000
    if (unit === 'lakh' || unit === 'lac') n *= 100000
    out.add(n)
  }
  return out
}

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[a.length][b.length]
}

function findKnown(name, list) {
  const n = norm(name)
  const exact = list.find((x) => norm(x) === n)
  if (exact) return { match: exact, exact: true }
  const close = list.find((x) => editDistance(norm(x), n) <= 2 || (n.length >= 4 && norm(x).includes(n)))
  return close ? { match: close, exact: false } : null
}

const uniq = (arr) => [...new Set(arr.filter(Boolean))]

/** Brands / platforms present in the current cart and rules — sent to the LLM as context. */
export function buildContext(cartItems = [], rules = []) {
  return {
    brands: uniq([...cartItems.map((i) => i.brand), ...rules.filter((r) => r.scope === 'brand').map((r) => r.appliesTo)]),
    platforms: uniq([...cartItems.map((i) => i.platform), ...rules.filter((r) => r.scope === 'platform').map((r) => r.appliesTo)]),
  }
}

const FIELD_NAMES = {
  value: 'the discount amount',
  minCartValue: 'the minimum cart value',
  appliesTo: 'which brand or platform it applies to',
  scope: 'what it applies to',
  rule: 'a discount rule',
}

/**
 * @param llmJson   whatever the LLM returned (untrusted)
 * @param ctx       { text, rules, cartItems }
 */
export function interpretParse(llmJson, { text, rules = [], cartItems = [] }) {
  if (!llmJson || typeof llmJson !== 'object') {
    return { status: 'invalid', message: 'The AI returned an empty answer. Please rephrase and try again.', errors: [] }
  }

  if (llmJson.status === 'ambiguous') {
    const missing = Array.isArray(llmJson.missing) ? llmJson.missing.map(String) : []
    const fallback = missing.length
      ? `Please add ${missing.map((m) => FIELD_NAMES[m] || m).join(' and ')}. For example: "10% off if cart total is above Rs.5,000".`
      : 'Please be more specific — say how much discount, and what it applies to.'
    const message = typeof llmJson.question === 'string' && llmJson.question.trim() ? llmJson.question.trim() : fallback
    return { status: 'ambiguous', message, missing }
  }

  if (llmJson.status !== 'ok' || !llmJson.rule || typeof llmJson.rule !== 'object') {
    return { status: 'invalid', message: 'The AI answer was not in the expected format. Please rephrase and try again.', errors: [] }
  }

  const raw = { ...llmJson.rule }
  const warnings = []

  // --- Grounding: never accept a number the user didn't write -------------------
  const numbers = extractNumbers(text)
  const missing = []
  const value = Number(raw.value)
  if (raw.value === null || raw.value === undefined || raw.value === '' || !numbers.has(value)) missing.push('value')
  const scope = norm(raw.scope)
  const min = Number(raw.minCartValue)
  if (scope === 'cart' && raw.minCartValue !== null && raw.minCartValue !== undefined && min > 0 && !numbers.has(min)) {
    missing.push('minCartValue')
  }
  if (missing.length > 0) {
    return {
      status: 'ambiguous',
      missing,
      message: `I couldn't find ${missing.map((m) => FIELD_NAMES[m]).join(' or ')} written in your text. Please state it as a number — e.g. "15% off Flipkart items" or "Rs.200 off if cart total is above Rs.3,000".`,
    }
  }
  if (scope !== 'cart') raw.minCartValue = null

  // --- Match names to what actually exists in the cart --------------------------
  const { brands, platforms } = buildContext(cartItems, rules)
  if (scope === 'brand' || scope === 'platform') {
    const own = scope === 'brand' ? brands : platforms
    const other = scope === 'brand' ? platforms : brands
    const otherScope = scope === 'brand' ? 'platform' : 'brand'
    const hit = findKnown(raw.appliesTo, own)
    const crossHit = hit ? null : findKnown(raw.appliesTo, other)
    if (hit) {
      if (!hit.exact) warnings.push(`Interpreted "${raw.appliesTo}" as ${scope} "${hit.match}".`)
      raw.appliesTo = hit.match
    } else if (crossHit) {
      warnings.push(`"${crossHit.match}" is a ${otherScope} in this cart, so this was set up as a ${otherScope} offer.`)
      raw.scope = otherScope
      raw.appliesTo = crossHit.match
    } else if (raw.appliesTo) {
      warnings.push(`No item in the current cart matches ${scope} "${raw.appliesTo}", so this rule won't change any price right now.`)
    }
  }

  raw.ruleId = nextId('RULE', rules.map((r) => r.ruleId))
  const { rule, errors } = validateRule(raw)
  if (!rule) {
    return { status: 'invalid', message: `The AI produced a rule that isn't valid: ${errors.join('; ')}. Please rephrase.`, errors }
  }

  const duplicate = rules.find(
    (r) =>
      r.scope === rule.scope &&
      norm(r.appliesTo) === norm(rule.appliesTo) &&
      r.type === rule.type &&
      r.value === rule.value &&
      r.stackable === rule.stackable &&
      (r.minCartValue ?? null) === (rule.minCartValue ?? null)
  )
  // Blocked, not warned: two identical stackable rules would silently double the discount.
  if (duplicate) {
    return {
      status: 'invalid',
      message: `This is identical to ${duplicate.ruleId}, which is already active. Remove ${duplicate.ruleId} first if you want to re-add it.`,
      errors: ['duplicate'],
    }
  }
  if (rule.type === 'percentage' && rule.value >= 50) warnings.push(`${rule.value}% is an unusually large discount — please double-check.`)
  if (rule.stackable && rule.scope !== 'cart') warnings.push('Stackable: this will apply on top of the best non-stackable offer.')

  return { status: 'ok', rule, warnings }
}

/** Calls the serverless LLM endpoint. Returns { ok, result } or { ok: false, error }. */
export async function requestRuleParse(text, context, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('/api/parse-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context }),
    })
    const json = await res.json().catch(() => null)
    if (!json) return { ok: false, error: `The rule parser is unavailable (HTTP ${res.status}).` }
    return json
  } catch {
    return { ok: false, error: 'Network error — could not reach the rule parser.' }
  }
}

/** Full pipeline used by the UI: text → LLM → validated result. */
export async function parseRuleFromText(text, { rules, cartItems }, fetchImpl) {
  const trimmed = String(text ?? '').trim()
  if (trimmed.length < 3) {
    return { status: 'ambiguous', missing: ['rule'], message: 'Please describe a discount, e.g. "15% off all Flipkart items".' }
  }
  const resp = await requestRuleParse(trimmed, buildContext(cartItems, rules), fetchImpl)
  if (!resp.ok) return { status: 'error', message: resp.error }
  return interpretParse(resp.result, { text: trimmed, rules, cartItems })
}
