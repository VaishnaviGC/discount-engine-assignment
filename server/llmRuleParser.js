/**
 * llmRuleParser.js  (server-side only)
 *
 * Sends a plain-English rule description to an LLM and returns its raw JSON
 * answer. It does NOT trust or validate the answer — that happens in the
 * browser in src/inputs/nlRuleAdapter.js via the shared schema, so the same
 * validation applies no matter which model or provider produced the JSON.
 *
 * Provider: Groq (OpenAI-compatible, free tier). Swap via env vars:
 *   GROQ_API_KEY   required
 *   GROQ_MODEL     optional, default below
 */

const DEFAULT_MODEL = 'openai/gpt-oss-120b'
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
export const MAX_INPUT_CHARS = 500

export function buildSystemPrompt({ brands = [], platforms = [] } = {}) {
  return `You convert a shop manager's plain-English discount description into ONE structured discount rule for an Indian e-commerce cart pricing engine.

Respond with JSON only, in exactly one of these two shapes:

{"status":"ok","rule":{"scope":"brand"|"platform"|"cart","appliesTo":string|null,"type":"percentage"|"flat","value":number,"stackable":boolean,"minCartValue":number|null}}

{"status":"ambiguous","missing":[string],"question":string}

Field meanings:
- scope "brand": discount on products of one brand. appliesTo = brand name.
- scope "platform": discount on items sold on one marketplace (e.g. Amazon India, Flipkart, Noon). appliesTo = platform name.
- scope "cart": discount on the whole cart total. appliesTo = null. minCartValue = the cart total needed (0 if no condition).
- type "percentage": value is the percent (20 for 20%). type "flat": value is rupees (100 for Rs.100).
- stackable: true ONLY if the text says it stacks / combines / applies on top of / in addition to other offers. Otherwise false.
- minCartValue: only for cart scope, otherwise null. "more than Rs.5,000", "above 5000", "over 5k", "at least 5000" all mean 5000.

Known brands in the current cart: ${brands.length ? brands.join(', ') : '(none)'}
Known platforms in the current cart: ${platforms.length ? platforms.join(', ') : '(none)'}
If a name matches a known brand or platform (even with different casing or a typo), use the known spelling and the matching scope.

STRICT RULES:
- NEVER invent a number. If the discount amount is not stated, return "ambiguous" with "value" in missing.
- If the text describes a cart/order-size condition ("big orders", "large carts") without a number, return "ambiguous" with "minCartValue" in missing.
- If it is unclear who the discount applies to, return "ambiguous" with "appliesTo" in missing.
- If the text is not a discount rule at all, return "ambiguous" with missing ["rule"].
- "question" must be one short, friendly sentence telling the user exactly what to add, with an example.

Examples:
"20% off for Natura Casa brand, stackable with other offers" -> {"status":"ok","rule":{"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null}}
"Rs.100 flat discount on all Flipkart items" -> {"status":"ok","rule":{"scope":"platform","appliesTo":"Flipkart","type":"flat","value":100,"stackable":false,"minCartValue":null}}
"10% off if cart value is more than Rs.5,000" -> {"status":"ok","rule":{"scope":"cart","appliesTo":null,"type":"percentage","value":10,"stackable":false,"minCartValue":5000}}
"Give a discount for big orders" -> {"status":"ambiguous","missing":["value","minCartValue"],"question":"How much discount, and from what cart total? For example: '10% off if cart total is above Rs.5,000'."}`
}

/**
 * @returns {Promise<object>} the model's JSON (unvalidated)
 * @throws  Error with .status (HTTP code to return) and a user-safe message
 */
export async function parseRuleWithLLM({ text, context, apiKey, model, fetchImpl = fetch, timeoutMs = 15000 }) {
  if (!apiKey) {
    throw Object.assign(new Error('The AI rule parser is not configured on this deployment (missing GROQ_API_KEY).'), { status: 503 })
  }
  const input = String(text ?? '').trim()
  if (!input) throw Object.assign(new Error('Please describe a discount rule.'), { status: 400 })
  if (input.length > MAX_INPUT_CHARS) {
    throw Object.assign(new Error(`Please keep the description under ${MAX_INPUT_CHARS} characters.`), { status: 400 })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetchImpl(ENDPOINT, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        temperature: 0,
        max_tokens: 1500,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildSystemPrompt(context) },
          { role: 'user', content: input },
        ],
      }),
    })
  } catch (err) {
    const timedOut = err?.name === 'AbortError'
    throw Object.assign(
      new Error(timedOut ? 'The AI parser took too long to respond. Please try again.' : 'Could not reach the AI parser. Please try again.'),
      { status: 502 }
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const status = res.status === 429 ? 429 : 502
    const msg =
      res.status === 429
        ? 'The AI parser is rate-limited right now. Please wait a few seconds and try again.'
        : `The AI parser returned an error (HTTP ${res.status}). Please try again.`
    throw Object.assign(new Error(msg), { status })
  }

  const body = await res.json().catch(() => null)
  const content = body?.choices?.[0]?.message?.content
  try {
    return JSON.parse(content)
  } catch {
    throw Object.assign(new Error('The AI parser returned something that was not valid JSON. Please rephrase and try again.'), { status: 502 })
  }
}

/** Shared HTTP handler used by both the Vercel function and the Vite dev server. */
export async function handleParseRule(body, env) {
  try {
    const result = await parseRuleWithLLM({
      text: body?.text,
      context: {
        brands: Array.isArray(body?.context?.brands) ? body.context.brands.slice(0, 50).map(String) : [],
        platforms: Array.isArray(body?.context?.platforms) ? body.context.platforms.slice(0, 50).map(String) : [],
      },
      apiKey: env.GROQ_API_KEY,
      model: env.GROQ_MODEL,
    })
    return { status: 200, json: { ok: true, result } }
  } catch (err) {
    return { status: err.status || 500, json: { ok: false, error: err.message || 'Unexpected error' } }
  }
}
