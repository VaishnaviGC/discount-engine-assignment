/**
 * Generates the sample cart PDFs in sample-data/.  Run: npm run sample-pdfs
 *   cart.pdf            — the cart from the assignment brief (6 items)
 *   cart-malformed.pdf  — same layout with broken rows, to show partial import + warnings
 *   cart-small.pdf      — a cart just below the Rs.4,000 cart-offer threshold
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync } from 'node:fs'

const COLS = [50, 175, 290, 405] // x of Product, Brand, Platform, Base Price

async function makePdf(file, title, rows, footer) {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let y = 780
  page.drawText(title, { x: 50, y, size: 12, font: bold })
  y -= 40
  ;['Product', 'Brand', 'Platform', 'Base Price'].forEach((h, i) =>
    page.drawText(h, { x: COLS[i], y, size: 10, font: bold })
  )
  y -= 8
  page.drawLine({ start: { x: 50, y }, end: { x: 500, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) })
  y -= 18
  for (const row of rows) {
    row.forEach((cell, i) => {
      if (cell) page.drawText(cell, { x: COLS[i], y, size: 10, font })
    })
    y -= 18
  }
  if (footer) page.drawText(footer, { x: 50, y: y - 10, size: 10, font: bold })
  writeFileSync(file, await doc.save())
  console.log('wrote', file)
}

const BRIEF = [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'Rs.849'],
  ['Wall Shelf', 'LivSpace Pro', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Cutting Board', 'Nordic Basics', 'Amazon India', 'Rs.449'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
]

await makePdf('sample-data/cart.pdf', 'Order #OP-9921  |  Date: 15 Jan 2025', BRIEF, 'Total: Rs.6,594')

await makePdf('sample-data/cart-malformed.pdf', 'Order #OP-9922  |  Date: 16 Jan 2025', [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Bed Sheet Set', 'Natura Casa', 'Flipkart', 'TBD'],
  ['Wall Shelf', '', 'Amazon India', 'Rs.599'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Gift Wrap', 'Natura Casa', 'Flipkart', 'Rs.0'],
  ['Desk Organiser', 'Nordic Basics', 'Flipkart', 'Rs.899'],
])

// Per-item max discount lands at Rs.3,993 — Rs.7 short of the cart offer.
// Choosing the smaller Natura Casa offer on the cushion reaches Rs.4,038 and the customer pays Rs.359 less.
await makePdf('sample-data/cart-edge.pdf', 'Order #OP-9924  |  Date: 18 Jan 2025', [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
  ['Table Lamp', 'LivSpace Pro', 'Noon', 'Rs.390'],
])

await makePdf('sample-data/cart-small.pdf', 'Order #OP-9923  |  Date: 17 Jan 2025', [
  ['Cushion Cover', 'Natura Casa', 'Amazon India', 'Rs.1,299'],
  ['Ceramic Vase', 'LivSpace Pro', 'Noon', 'Rs.2,499'],
])
