/**
 * csvAdapter.js
 *
 * CSV text → DiscountRule[] / CartItem[]. Uses papaparse for the CSV grammar,
 * then hands every row to the shared validators in schema.js.
 *
 * rules.csv columns: rule_id, scope, applies_to, type, value, stackable, [min_cart_value]
 * cart.csv  columns: item_id, product, brand, platform, base_price
 */

import Papa from 'papaparse'
import { validateRule, validateCartItem } from './schema.js'

function parseRows(csvText) {
  return Papa.parse(String(csvText ?? '').trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })
}

/**
 * Parses rules.csv text. Valid rows are kept, invalid rows are reported.
 * @returns {{ data: DiscountRule[], errors: string[] }}
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseRows(csvText)
  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => `CSV error: ${e.message}`) }
  }

  const data = []
  const errors = []
  const seen = new Set()

  rows.forEach((row, i) => {
    const rowNum = i + 2 // account for header row
    const { rule, errors: rowErrors } = validateRule({
      ruleId: row.rule_id,
      scope: row.scope,
      appliesTo: row.applies_to,
      type: row.type,
      value: row.value,
      stackable: row.stackable === undefined || row.stackable === '' ? undefined : row.stackable,
      minCartValue: row.min_cart_value,
    })
    if (!rule) {
      errors.push(`Row ${rowNum}${row.rule_id ? ` (${row.rule_id})` : ''}: ${rowErrors.join('; ')}`)
      return
    }
    if (seen.has(rule.ruleId)) {
      errors.push(`Row ${rowNum}: duplicate rule id ${rule.ruleId} — skipped`)
      return
    }
    seen.add(rule.ruleId)
    data.push(rule)
  })

  return { data, errors }
}

/**
 * Parses cart.csv text. Valid rows are kept, invalid rows are reported.
 * @returns {{ data: CartItem[], errors: string[] }}
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = parseRows(csvText)
  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => `CSV error: ${e.message}`) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const { item, errors: rowErrors } = validateCartItem({
      itemId: row.item_id,
      product: row.product,
      brand: row.brand,
      platform: row.platform,
      basePrice: row.base_price,
    })
    if (!item) {
      errors.push(`Row ${rowNum}${row.item_id ? ` (${row.item_id})` : ''}: ${rowErrors.join('; ')}`)
      return
    }
    data.push(item)
  })

  return { data, errors }
}
