const BASE = 'https://understat.com'

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

function extractVar(html, varName) {
  const regex = new RegExp(`var ${varName}\\s*=\\s*JSON\\.parse\\('([^']+)'\\)`)
  const match = html.match(regex)
  if (!match) return null
  try {
    const decoded = JSON.parse('"' + match[1] + '"')
    return JSON.parse(decoded)
  } catch {
    try {
      const raw = match[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      return JSON.parse(raw)
    } catch { return null }
  }
}

const ESPN_TO_UNDERSTAT = {
  'eng.1': 'EPL', 'esp.1': 'La_liga', 'ger.1': 'Bundesliga',
  'ita.1': 'Serie_A', 'fra.1': 'Ligue_1',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { endpoint, league, espnId, team, season = '2024' } = req.query
  const leagueName = league || ESPN_TO_UNDERSTAT[espnId] || null

  if (!endpoint) {
    return res.status(400).json({ error: 'Parâmetro ?endpoint= obrigatório' })
  }

  if (endpoint === 'check') {
    return res.status(200).json({
      status: 'ok', mapeamento: ESPN_TO_UNDERSTAT,
      aviso: 'Brasileirao NÃO está no Understat.',
    })
  }

  if (endpoint === 'league') {
    if (!leagueName) return res.status(400).json({ error: 'Parâmetro espnId= obrigatório' })
    const url = `${BASE}/league/${leagueName}/${season}`
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const teamsData = extractVar(html, 'teamsData')
      const datesData = extractVar(html, 'datesData')
      if (!teamsData && !datesData) return res.status(502).json({ error: 'Não foi possível extrair dados', url })
      const teamsXg = {}
      if (teamsData) {
        Object.entries(teamsData).forEach(([teamName, data]) => {
          const history = data.history || []
          if (!history.length) return
          const last10 = history.slice(-10)
          teamsXg[teamName] = {
            xgFor:           +(last10.reduce((s,g) => s + parseFloat(g.xG  || 0), 0) / last10.length).toFixed(3),
            xgAgainst:       +(last10.reduce((s,g) => s + parseFloat(g.xGA || 0), 0) / last10.length).toFixed(3),
            xgForSeason:     +(history.reduce((s,g) => s + parseFloat(g.xG  || 0), 0) / history.length).toFixed(3),
            xgAgainstSeason: +(history.reduce((s,g) => s + parseFloat(g.xGA || 0), 0) / history.length).toFixed(3),
            jogos: history.length,
          }
        })
      }
      res.setHeader('Cache-Control', 's-maxage=21600')
      return res.status(200).json({ liga: leagueName, temporada: season, times: teamsXg, partidas: datesData || [] })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  if (endpoint === 'team') {
    if (!team) return res.status(400).json({ error: 'Parâmetro team= obrigatório' })
    const url = `${BASE}/team/${team.replace(/ /g, '_')}/${season}`
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()
      const datesData = extractVar(html, 'datesData')
      if (!datesData) return res.status(502).json({ error: 'Não foi possível extrair dados do time', url })
      const matches = (datesData || []).slice(-15).map(m => ({
        data: m.datetime, xg: parseFloat(m.xG||0).toFixed(2),
        xga: parseFloat(m.xGA||0).toFixed(2), gols: m.scored,
        resultado: m.result, isHome: m.h_a === 'h',
      }))
      res.setHeader('Cache-Control', 's-maxage=21600')
      return res.status(200).json({ time: team, temporada: season, partidas: matches })
    } catch (e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: `Endpoint "${endpoint}" não reconhecido` })
}