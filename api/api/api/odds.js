export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = process.env.ODDS_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'ODDS_API_KEY nao configurada. Va em Vercel > Settings > Environment Variables e adicione ODDS_API_KEY.' })
  }

  const { endpoint, ...params } = req.query
  if (!endpoint) return res.status(400).json({ error: 'Parametro endpoint obrigatorio' })

  const allowed = ['events', 'odds', 'sports', 'value-bets']
  if (!allowed.includes(endpoint)) return res.status(400).json({ error: 'Endpoint invalido' })

  const qs = new URLSearchParams({ ...params, apiKey }).toString()
  const url = `https://api.odds-api.io/v3/${endpoint}?${qs}`

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'BetControl/1.0' }
    })
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { return res.status(500).json({ error: 'Resposta invalida', raw: text.slice(0,200) }) }
    return res.status(response.status).json(data)
  } catch(e) {
    return res.status(500).json({ error: 'Erro de conexao: ' + e.message })
  }
}
