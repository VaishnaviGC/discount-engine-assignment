/**
 * pdfTable.js
 *
 * Pure (no pdf.js, no DOM) conversion of positioned PDF text into CartItems.
 *
 * Input: text fragments as pdf.js reports them — { str, x, y, width, page }.
 * Strategy:
 *   1. Group fragments into visual lines by page + y position.
 *   2. Split fragments that contain wide gaps ("Cushion Cover   Natura Casa")
 *      into separate cells — some PDF generators emit a whole row as one string.
 *   3. Find the header line (Product / Brand / Platform / Base Price) and use
 *      the x position of each header word as that column's left edge.
 *   4. Every later line is cut into the 4 columns by x position, validated via
 *      the shared schema, and either kept or reported with a reason.
 *
 * A malformed row never aborts the import: it is skipped and reported, and the
 * good rows still load. The caller decides what to do when zero rows are valid.
 */

import { validateCartItem, parseAmount } from './schema.js'

const COLUMNS = [
  { key: 'product', match: /^product\b/i },
  { key: 'brand', match: /^brand\b/i },
  { key: 'platform', match: /^platform\b/i },
  { key: 'basePrice', match: /^(base\s*)?price\b|^base$/i },
]

const Y_TOLERANCE = 3
const IGNORED_LINE = /^(sub\s*total|total|grand\s*total|order\s*#|date\b|page\s+\d)/i
const SEPARATOR_LINE = /^[\s\-–—─_=|.]+$/

/** Splits a fragment on runs of 2+ spaces, estimating each piece's x. */
function splitFragment(frag) {
  const str = frag.str
  if (!/\S\s{2,}\S/.test(str)) return [{ ...frag, str: str.trim() }]
  const charWidth = str.length > 0 && frag.width ? frag.width / str.length : 5
  const cells = []
  const re = /\S+(?: \S+)*/g
  let m
  while ((m = re.exec(str)) !== null) {
    cells.push({ ...frag, str: m[0], x: frag.x + m.index * charWidth, width: m[0].length * charWidth })
  }
  return cells
}

/** Groups fragments into lines (top-to-bottom), each line sorted left-to-right. */
export function groupLines(fragments) {
  const cells = fragments
    .filter((f) => f && typeof f.str === 'string' && f.str.trim() !== '')
    .flatMap(splitFragment)
    .sort((a, b) => (a.page ?? 0) - (b.page ?? 0) || b.y - a.y || a.x - b.x)

  const lines = []
  for (const c of cells) {
    const last = lines[lines.length - 1]
    if (last && (last.page ?? 0) === (c.page ?? 0) && Math.abs(last.y - c.y) <= Y_TOLERANCE) {
      last.cells.push(c)
    } else {
      lines.push({ page: c.page ?? 0, y: c.y, cells: [c] })
    }
  }
  lines.forEach((l) => l.cells.sort((a, b) => a.x - b.x))
  return lines
}

/** Finds the header line and returns column left-edges, or null. */
function findHeader(lines) {
  for (let i = 0; i < lines.length; i++) {
    const cols = {}
    // Header words may be one fragment each, or "Base" + "Price" separately.
    for (const cell of lines[i].cells) {
      for (const col of COLUMNS) {
        if (cols[col.key] === undefined && col.match.test(cell.str.trim())) {
          cols[col.key] = cell.x
          break
        }
      }
    }
    if (COLUMNS.every((c) => cols[c.key] !== undefined)) {
      const edges = COLUMNS.map((c) => ({ key: c.key, x: cols[c.key] })).sort((a, b) => a.x - b.x)
      return { index: i, edges }
    }
  }
  return null
}

/** Assigns each cell of a line to the column whose left edge is nearest on its left. */
function lineToRow(line, edges) {
  const row = { product: [], brand: [], platform: [], basePrice: [] }
  const slack = 4 // text can start a few px left of the header word
  for (const cell of line.cells) {
    let target = edges[0]
    for (const e of edges) {
      if (cell.x + slack >= e.x) target = e
    }
    row[target.key].push(cell.str)
  }
  const out = {}
  for (const k of Object.keys(row)) out[k] = row[k].join(' ').replace(/\s+/g, ' ').trim()

  // Right-aligned or slightly shifted prices can land in the platform column.
  if (!out.basePrice) {
    const m = out.platform.match(/\s((?:rs\.?|₹|inr)\s*[\d,]+(?:\.\d+)?)$/i)
    if (m && Number.isFinite(parseAmount(m[1]))) {
      out.basePrice = m[1]
      out.platform = out.platform.slice(0, m.index).trim()
    }
  }
  return out
}

/**
 * @param fragments  [{ str, x, y, width, page }]
 * @returns {{ data: CartItem[], errors: string[], warnings: string[] }}
 *   errors   — fatal: nothing could be imported
 *   warnings — individual rows that were skipped or lines that were ignored
 */
export function cartItemsFromFragments(fragments) {
  const lines = groupLines(fragments)
  if (lines.length === 0) {
    return {
      data: [],
      errors: ['This PDF has no selectable text. If it is a scan or photo, please export the cart as a text PDF or CSV.'],
      warnings: [],
    }
  }

  const header = findHeader(lines)
  if (!header) {
    return {
      data: [],
      errors: ['Could not find the cart table. Expected a header row with the columns: Product, Brand, Platform, Base Price.'],
      warnings: [],
    }
  }

  const data = []
  const warnings = []
  let rowNum = 0

  for (const line of lines.slice(header.index + 1)) {
    const text = line.cells.map((c) => c.str).join(' ').trim()
    if (SEPARATOR_LINE.test(text)) continue
    if (IGNORED_LINE.test(text)) continue
    // A repeated header (e.g. on page 2) is not a data row.
    if (COLUMNS.every((c) => line.cells.some((cell) => c.match.test(cell.str.trim())))) continue

    rowNum++
    const row = lineToRow(line, header.edges)
    const label = row.product ? `"${row.product}"` : `"${text.slice(0, 40)}"`

    const { item, errors } = validateCartItem({
      itemId: `ITEM-${String(data.length + 1).padStart(2, '0')}`,
      ...row,
    })
    if (!item) {
      warnings.push(`Row ${rowNum} ${label} skipped — ${errors.join('; ')}`)
      continue
    }
    data.push(item)
  }

  if (data.length === 0) {
    return {
      data: [],
      errors: [
        'Found the table header but no valid item rows.',
        ...warnings,
      ],
      warnings: [],
    }
  }

  return { data, errors: [], warnings }
}
