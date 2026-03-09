export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { endpoint, ...params } = req.query
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })

  const qs = new URLSearchParams({ ...params, apiKey: process.env.ODDS_API_KEY }).toString()
  const url = `https://api.odds-api.io/v3/${endpoint}?${qs}`

  try {
    const response = await fetch(url)
    const data = await response.json()
    res.status(200).json(data)
  } catch(e) {
    res.status(500).json({ error: 'Fetch failed', detail: e.message })
  }
}
