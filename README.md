# Opptra Discount Engine

A customer-facing cart pricing engine. It picks the best offer per item, stacks what can stack, applies cart-level offers, and explains every price in plain language.

[![CI](https://github.com/VaishnaviGC/discount-engine-assignment/actions/workflows/ci.yml/badge.svg)](https://github.com/VaishnaviGC/discount-engine-assignment/actions/workflows/ci.yml)

**🔗 Live demo:** https://discount-engine-assignment-eosin.vercel.app &nbsp;·&nbsp; Sample files to try: [`sample-data/`](sample-data/)

> **Main finding: the brief's selection rule can make the customer pay more.**
> "Biggest discount per item" and "always give the customer the biggest saving" conflict near a cart threshold. A bigger item discount can push the cart *below* the threshold and lose the cart offer.
> With `cart-edge.pdf`, per-item max gives a cart of **Rs.3,993**: no cart offer, so the customer pays **Rs.3,993**. Taking the smaller Rs.150 brand offer on the cushion gives a cart of Rs.4,038, the 10% cart offer applies, and the customer pays **Rs.3,634 (Rs.359 less)**.
> The engine still follows the brief exactly. A separate optimiser ([`src/lib/optimizer.js`](src/lib/optimizer.js)) detects these cases, explains them, and offers a one-click **Apply best combination**. [Details ↓](#proposal-optimise-the-cart-not-each-item)

## Run locally (3 steps)

```bash
npm install
cp .env.example .env        # add a free Groq API key (console.groq.com/keys) — only needed for the plain-English rule box
npm run dev                 # → http://localhost:5173
```

`npm test` runs 52 tests. They cover the brief's expected-results table, edge cases, real PDF parsing, LLM-failure handling and the optimiser. CI runs them, plus the production build, on every push.

## What's built

| | |
|---|---|
| **Foundation** | Base engine verified against the brief's expected table: Rs.1,104 / 629 / 509 / 2,499 / 382 / 809. |
| **Task 1: Cart-level offer** | `RULE-04` gives a separate *"Cart offer: 10% off (cart total ≥ Rs.4,000) — Rs.593 saved"* line and a final total of **Rs.5,339**. The row is hidden below the threshold. |
| **Task 2: Plain-English rules** | LLM → structured rule → **validated** → confirmation card with a **live impact preview** → Confirm / Discard. Ambiguous input asks a specific follow-up question. |
| **Task 3: PDF cart upload** | Drop an order PDF. Items are extracted in the browser, the cart is replaced and prices are recalculated. Bad rows are skipped and each is explained. |

**Try it:** click **Try sample data** on the first screen (loads the brief's rules + cart and opens checkout). The app is a 3-step flow (Upload → Review rules → Checkout); steps stay clickable and each has its own URL. The sample PDF buttons on step 1 load `cart.pdf`, `cart-malformed.pdf` (partial import with warnings), `cart-small.pdf` (below the cart-offer threshold) and `cart-edge.pdf` (the brief's rule isn't the cheapest).

### Extras (beyond the brief)
- **Best-combination optimiser.** See the finding above. It searches every legitimate offer choice per item (dynamic programming over reachable cart subtotals, bounded) and only speaks up when it beats the brief's result.
- **Customer checkout view.** A toggle next to the ops table shows what the shopper actually sees, following the stakeholder's own words: *one final price, one offer label, no surprises*. No rule IDs, one short label per item ("15% off · Amazon India offer"), and a price-details box with MRP, item offers, cart offer and total.
- **"Almost there" nudge.** When the cart is below a cart-offer threshold the customer sees *"Add Rs.618 more to unlock 10% off your whole cart"*. This is our answer to "what happens just below the threshold": the offer row is hidden, and the customer is told how close they are.
- **Impact preview before confirming a rule.** The confirmation step dry-runs the unchanged engine with the new rule and shows exactly which items change and the new cart total. You see *"Cushion Cover Rs.1,104 → Rs.883"* before you commit, not just *"scope: Brand"*.
- **Reasoning that explains the choice.** *"Amazon India offer: 15% off — saves Rs.195, better than Natura Casa offer: Rs.150 off"*. Stacked offers say *"extra 10% off"*. Statuses match the brief (Max discount / Stacked / Discount applied / No offer).
- **Live results.** Pricing is derived from state, not stored, so adding or removing a rule or loading a cart re-prices instantly. Results can't go stale.
- Rules show their source (`CSV` / `AI`) and can be removed with ✕.

## Architecture: inputs adapt to the engine

```
src/engine/discountEngine.js   pure calculator. Knows nothing about CSV / PDF / LLM.
src/inputs/
  schema.js                    validateRule() / validateCartItem(): the ONE gate every input passes through
  csvAdapter.js                CSV  → validated rules / cart items
  pdfTable.js + pdfAdapter.js  PDF  → validated cart items (pure table logic + thin pdf.js wrapper)
  nlRuleAdapter.js             text → LLM → validated rule (+ grounding & name checks)
  index.js                     registry: file extension → adapter
src/lib/pricing.js             runs item + cart pricing; computes the rule impact preview
src/lib/optimizer.js           searches for a cheaper offer combination (calls the engine, never modifies it)
server/llmRuleParser.js        LLM call (server-side, shared by Vercel and the Vite dev server)
api/parse-rule.js              Vercel function: keeps the API key off the browser
```

**Adding a third input mode** (Excel, an order API, …) means writing one adapter that returns `{ data, errors, warnings }` through `validateCartItem` and registering it in `src/inputs/index.js`. The calculator and results UI are untouched.

**Engine changes were limited to what Task 1 needs plus correctness fixes.** I added `applyCartRules()` as a separate step after item pricing, a `scope: 'cart'` / `minCartValue` field, a Rs.0 floor, and clearer reasoning text. `applyDiscounts` keeps its signature and selection logic.

## Decisions & trade-offs

**Issues found in the base code**
1. `csvParser` rejected `scope: cart` and required `applies_to`, so **RULE-04 could not be loaded at all**. Fixed in the shared schema. Old rules CSVs without `min_cart_value` still work.
2. **Prices could go negative.** A Rs.150 flat offer on a Rs.100 item gave −Rs.50. Discounts are now capped at the price. This matters more now that anyone can type a rule.
3. Results were stored state behind a button, so they would go stale after a PDF upload or a new rule. They are now derived, which is why "re-runs automatically" just works.
4. Reasoning said "Platform offer: 15% off" without naming the platform or why it won.
5. Small note: the rubric refers to "Task 1 parses a rule / Task 2 replaces the cart", but those are Tasks 2 and 3 in the brief. I assumed the brief's numbering.

**LLM (Task 2)**
- **Provider: Groq (free tier, `openai/gpt-oss-120b`, JSON mode, temperature 0).** Swap the model with `GROQ_MODEL`. The provider sits behind one function.
- **Why a serverless function, even though "a backend is optional":** a key shipped in client JS is public. The function is about 20 lines and holds no logic of its own.
- **The LLM is treated as an untrusted input, like a CSV file.** Its rule goes through the same `validateRule()` (percentage ≤ 100, positive value, valid scope, …). Bad output becomes a readable error, never a crash.
- **Grounding check.** Every number in the parsed rule must appear in the user's text ("5,000", "5k" and "1.5 lakh" are understood). If the model invents "10% off above Rs.5,000" for *"give a discount for big orders"*, we still block it and ask for the numbers. Trade-off: "half off" or "ten percent" are also rejected, and the user is asked to type digits. I chose predictable over clever for prices customers pay.
- **Names are matched to the cart.** "natura kasa" becomes Natura Casa. "Flipkart" sent as a *brand* is corrected to *platform* with a visible note. A rule that matches nothing in the cart is allowed, with a warning. A rule **identical to an active one is blocked**, because two identical stackable rules would silently double the discount.
- **On the confirmation step:** I kept it, and I agree with it. LLM output changes real customer prices, so a human should see it first. A field list alone is weak for that, so the card shows the **price impact**, which is what a merchandiser actually needs to judge.

**Cart offer (Task 1)**
- "More than Rs.5,000" is parsed as threshold 5000 with **≥**, to match the engine's single comparison (brief: "cart total ≥ Rs.4,000"). Being Rs.1 off in the customer's favour is better than two operator types. The confirmation card shows "≥ Rs.5,000" explicitly, so the user sees the interpretation.
- With multiple cart rules, the best qualifying non-stackable one wins and stackable ones apply on top. This is the same logic as item rules.

**PDF (Task 3)**
- **Parsed in the browser with pdf.js**: no upload, no server. It is loaded lazily, so the main bundle stays small.
- Columns are found from the **header's x-positions**, so multi-word values ("Amazon India") stay intact. It also handles PDFs that emit each row as one space-separated string.
- **Malformed rows are skipped and explained** ("Row 2 "Bed Sheet Set" skipped — base price must be a positive amount, got "TBD""). The valid rows still load. Rationale: a customer shouldn't lose a 20-item cart over one bad line, and every skip is visible.
- **A PDF with zero valid rows never wipes the current cart.** The same applies to corrupt, password-protected, scanned or non-table PDFs, which each get a specific message.
- Assumption I'd question: a fixed 4-column layout. Real order PDFs vary, so the next step is an LLM fallback when no header is found. I left it out on purpose, because silently guessing prices from free text needs the same confirmation step as rules.

**Rounding:** each discount step rounds to whole rupees, matching the brief (Rs.194.85 → Rs.195).

### Proposal: optimise the cart, not each item

The brief asks for two things that usually agree but sometimes don't:
- *"Always apply the rule that gives the customer the biggest saving."*
- *"Apply the one that gives the largest discount amount in rupees"* (per item).

Per-item max lowers the cart subtotal, which is then checked against the cart-offer threshold. When the subtotal lands just under the threshold, a smaller item discount can leave the customer better off:

| `cart-edge.pdf` | Cushion offer | Cart subtotal | Cart offer | Customer pays |
|---|---|---|---|---|
| Brief's rule (per-item max) | 15% off → Rs.1,104 | Rs.3,993 | ✗ (Rs.7 short) | **Rs.3,993** |
| Best combination | Rs.150 off → Rs.1,149 | Rs.4,038 | −Rs.404 | **Rs.3,634** |

**What I did:** I kept the brief's rule as the default, because the expected results depend on it and changing pricing silently would be wrong. I built the optimiser as a separate module that only *calls* the engine, so the engine is unchanged. When it finds a cheaper combination it explains it in plain words and lets the operator apply it. I didn't apply it automatically.

**What I'd recommend:** make "lowest final total" the production rule, because it's what the brief's first sentence promises customers. Show the trade-off in the reasoning text ("picked so your cart unlocks the cart offer") so there are no surprises. Before switching, check with the business: brand-funded and platform-funded offers may have different costs to Opptra, and the optimiser can shift spend from one funder to another.

## Tests

```bash
npm test
```
- Engine: the brief's full expected table, reasoning strings, threshold at / Rs.1 below, empty cart, competing cart rules, the negative-price floor.
- Inputs: real `sample-data/*.pdf` files through pdf.js, malformed rows, scanned / no-table PDFs, CSV duplicates.
- Optimiser: finds the Rs.359 case, stays silent on the brief cart, a 40-item cart in under 1s.
- LLM: all four examples from the brief, hallucinated values, invalid / garbage JSON, network failure, missing key, rate limit, over-long input.

Sample PDFs are generated by `npm run sample-pdfs`.
