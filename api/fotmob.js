const BASE = 'https://www.fotmob.com'

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
  'Referer':         'https://www.fotmob.com/',
  'Origin':          'https://www.fotmob.com',
  'sec-fetch-dest':  'empty',
  'sec-fetch-mode':  'cors',
  'sec-fetch-site':  'same-origin',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { endpoint, ...params } = req.query

  if (!endpoint) {
    return res.status(400).json({ error: 'Parâmetro ?endpoint= obrigatório', exemplos: ['matches','details','league','search'] })
  }

  const ROUTES = {
    matches: '/api/matches',
    details: '/api/matchDetails',
    league:  '/api/league',
    search:  '/api/searchSuggest',
    leagues: '/api/allLeagues',
  }

  const route = ROUTES[endpoint]
  if (!route) {
    return res.status(400).json({ error: `Endpoint "${endpoint}" inválido`, validos: Object.keys(ROUTES) })
  }

  const qs  = new URLSearchParams(params).toString()
  const url = `${BASE}${route}${qs ? '?' + qs : ''}`

  try {
    const response = await fetch(url, { headers: BROWSER_HEADERS })
    const text     = await response.text()

    if (text.trim().startsWith('<')) {
      return res.status(502).json({
        error: 'FotMob retornou HTML (possível bloqueio ou rota inválida)',
        status: response.status,
        url,
      })
    }

    let data
    try { data = JSON.parse(text) }
    catch { return res.status(502).json({ error: 'JSON inválido da FotMob', raw: text.slice(0, 300) }) }

    const isLive = params.date === new Date().toISOString().slice(0, 10)
    res.setHeader('Cache-Control', isLive ? 's-maxage=120' : 's-maxage=600')

    return res.status(200).json(data)

  } catch (e) {
    return res.status(500).json({ error: e.message, url })
  }
}