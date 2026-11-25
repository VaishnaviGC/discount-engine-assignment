/**
 * Vercel serverless function: POST /api/parse-rule  { text, context: { brands, platforms } }
 * Exists only so the LLM API key stays on the server. All logic is in server/llmRuleParser.js.
 */
import { handleParseRule } from '../server/llmRuleParser.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return res.status(400).json({ ok: false, error: 'Request body must be JSON' })
    }
  }
  const { status, json } = await handleParseRule(body, process.env)
  return res.status(status).json(json)
}
