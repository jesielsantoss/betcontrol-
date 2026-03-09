export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'ODDS_API_KEY nao configurada no Vercel' })

  const { endpoint, ...params } = req.query
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })

  // remover parametro search (nao existe na API) - filtramos no frontend
  delete params.search

  const qs = new URLSearchParams({ ...params, apiKey }).toString()
  const url = `https://api.odds-api.io/v3/${endpoint}?${qs}`

  try {
    const response = await fetch(url)
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      res.status(response.status).json(data)
    } catch {
      res.status(500).json({ error: 'Resposta invalida da API', raw: text.slice(0, 300) })
    }
  } catch(e) {
    res.status(500).json({ error: e.message })
  }
}
