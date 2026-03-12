export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const apiKey = 'b06ee90caee84a1a9e36b42a50d32511'
  const { endpoint, ...params } = req.query
  if (!endpoint) return res.status(400).json({ error: 'Parametro endpoint obrigatorio' })

  const qs = new URLSearchParams({ ...params, apiKey }).toString()
  const url = `https://api.odds-api.io/v3/${endpoint}?${qs}`

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    })
    const text = await response.text()
    try {
      const data = JSON.parse(text)
      return res.status(response.status).json(data)
    } catch {
      return res.status(500).json({ error: 'Resposta invalida da API', raw: text.slice(0, 300) })
    }
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}