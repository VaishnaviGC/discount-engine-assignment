/**
 * Input registry.
 *
 * Every cart input mode is an adapter: (File) => Promise<{ data: CartItem[], errors, warnings }>.
 * To add a new mode (Excel, JSON, an order API...) write one adapter that
 * returns validated CartItems (use validateCartItem from schema.js) and
 * register it here. Nothing in the engine or the results UI changes.
 */

import { parseCartCSV, parseRulesCSV } from './csvAdapter.js'

const readText = (file) => file.text()

export const cartAdapters = {
  csv: {
    label: 'CSV',
    parse: async (file) => ({ warnings: [], ...parseCartCSV(await readText(file)) }),
  },
  pdf: {
    label: 'PDF',
    // Loaded on demand so pdf.js (~1MB) is only downloaded when someone uploads a PDF.
    parse: async (file) => (await import('./pdfAdapter.js')).parseCartPDF(file),
  },
}

export const ruleAdapters = {
  csv: {
    label: 'CSV',
    parse: async (file) => ({ warnings: [], ...parseRulesCSV(await readText(file)) }),
  },
}

export function extensionOf(fileName) {
  const m = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/)
  return m ? m[1] : ''
}

/** Picks the adapter for a file, or returns an error result for unsupported types. */
export async function parseWith(adapters, file) {
  const ext = extensionOf(file.name)
  const adapter = adapters[ext]
  if (!adapter) {
    const supported = Object.keys(adapters).map((k) => `.${k}`).join(', ')
    return { data: [], errors: [`"${file.name}" is not a supported file. Please upload ${supported}.`], warnings: [] }
  }
  return adapter.parse(file)
}

export const acceptFor = (adapters) => Object.keys(adapters).map((k) => `.${k}`).join(',')
