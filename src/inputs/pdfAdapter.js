/**
 * pdfAdapter.js
 *
 * Browser-side PDF → CartItem[]. Thin wrapper: pdf.js extracts positioned text,
 * pdfTable.js (pure, unit-tested) turns it into validated CartItems.
 * No server needed — the PDF never leaves the user's browser.
 */

import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { cartItemsFromFragments } from './pdfTable.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PAGES = 20

/** Extracts positioned text fragments from a PDF ArrayBuffer. */
export async function extractFragments(arrayBuffer, lib = pdfjsLib) {
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer), verbosity: 0 }).promise
  const fragments = []
  const pages = Math.min(doc.numPages, MAX_PAGES)
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    for (const it of content.items) {
      if (!('str' in it)) continue
      fragments.push({ str: it.str, x: it.transform[4], y: it.transform[5], width: it.width, page: p })
    }
  }
  return fragments
}

/**
 * @param {File} file
 * @returns {Promise<{ data: CartItem[], errors: string[], warnings: string[] }>}
 */
export async function parseCartPDF(file) {
  try {
    const buffer = await file.arrayBuffer()
    const fragments = await extractFragments(buffer)
    return cartItemsFromFragments(fragments)
  } catch (err) {
    const msg = /password/i.test(err?.message ?? '')
      ? 'This PDF is password-protected. Please upload an unlocked copy.'
      : 'Could not read this file as a PDF. It may be corrupted.'
    return { data: [], errors: [msg], warnings: [] }
  }
}
