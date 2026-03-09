export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const path = req.query.path
  if (!path) return res.status(400).json({ error: 'Missing path' })

  const url = `https://v3.football.api-sports.io${path}`
  const response = await fetch(url, {
    headers: { 'x-apisports-key': process.env.FOOTBALL_API_KEY }
  })
  const data = await response.json()
  res.status(200).json(data)
}
