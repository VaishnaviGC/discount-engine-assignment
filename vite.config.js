import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleParseRule } from './server/llmRuleParser.js'

/**
 * Serves /api/parse-rule during `npm run dev` with the same handler Vercel uses
 * in production, so local and deployed behaviour match. Reads GROQ_API_KEY from .env.
 */
function devApi(env) {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api/parse-rule', (req, res) => {
        let raw = ''
        req.on('data', (chunk) => (raw += chunk))
        req.on('end', async () => {
          let body = null
          try {
            body = JSON.parse(raw || '{}')
          } catch {
            /* handled below as empty text */
          }
          const { status, json } =
            req.method === 'POST'
              ? await handleParseRule(body, env)
              : { status: 405, json: { ok: false, error: 'Method not allowed' } }
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(json))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  return {
    plugins: [react(), devApi(env)],
    test: {
      environment: 'node',
    },
  }
})
