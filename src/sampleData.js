/**
 * sampleData.js
 *
 * Bundles the files in sample-data/ so a reviewer can try the app in one click.
 * They are handed to the SAME adapters as user uploads (as File objects), so
 * "Try sample data" exercises the real CSV / PDF pipeline, not a shortcut.
 */

import rulesCsv from '../sample-data/rules.csv?raw'
import cartCsv from '../sample-data/cart.csv?raw'
import cartPdf from '../sample-data/cart.pdf?url'
import cartMalformedPdf from '../sample-data/cart-malformed.pdf?url'
import cartSmallPdf from '../sample-data/cart-small.pdf?url'
import cartEdgePdf from '../sample-data/cart-edge.pdf?url'

export const sampleRulesFile = () => new File([rulesCsv], 'rules.csv', { type: 'text/csv' })
export const sampleCartFile = () => new File([cartCsv], 'cart.csv', { type: 'text/csv' })

export const SAMPLE_PDFS = [
  { name: 'cart.pdf', url: cartPdf, hint: "The brief's 6-item order" },
  { name: 'cart-malformed.pdf', url: cartMalformedPdf, hint: 'Broken rows: skipped & explained' },
  { name: 'cart-small.pdf', url: cartSmallPdf, hint: 'Below the cart-offer threshold' },
  { name: 'cart-edge.pdf', url: cartEdgePdf, hint: "The brief's rule isn't cheapest" },
]

export async function samplePdfFile({ name, url }) {
  const res = await fetch(url)
  return new File([await res.blob()], name, { type: 'application/pdf' })
}
