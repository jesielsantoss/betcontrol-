// api/understat.js — Proxy Vercel para Understat
//
// O Understat NÃO tem API pública. Os dados ficam injetados no HTML como:
//   var teamsData = JSON.parse('...')
//   var datesData = JSON.parse('...')
// Este proxy faz o scraping server-side (sem CORS) e devolve JSON limpo.
//
// Endpoints via ?endpoint=:
//   league  → teamsData + datesData de uma liga
//             Params: league=EPL|La_liga|Bundesliga|Serie_A|Ligue_1  &season=2024
//   team    → datesData (histórico de partidas com xG) de um time
//             Params: team=Manchester+City  &season=2024
//
// Ligas disponíveis no Understat (apenas Europa):
//   EPL, La_liga, Bundesliga, Serie_A, Ligue_1, RFPL
//   ⚠️  Brasileirao NÃO está no Understat — use ESPN/FotMob para Brasil
//
// Mapeamento ESPN → Understat:
//   eng.1 → EPL        esp.1 → La_liga     ger.1 → Bundesliga
//   ita.1 → Serie_A    fra.1 → Ligue_1

const BASE = 'https://understat.com'

const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection':      'keep-alive',
  'Upgrade-Insecure-Requests': '1',
}

// Extrai uma variável JS injetada no HTML do Understat
// Padrão: var VARNAME = JSON.parse('HEX_ENCODED_JSON')
function extractVar(html, varName) {
  // Understat escapa o JSON com unicode: \x22 \x5b etc
  const regex = new RegExp(`var ${varName}\\s*=\\s*JSON\\.parse\\('([^']+)'\\)`)
  const match = html.match(regex)
  if (!match) return null
  try {
    // Decodifica a string escapada e faz parse do JSON
    const decoded = JSON.parse('"' + match[1] + '"')
    return JSON.parse(decoded)
  } catch {
    // Tenta decode alternativo
    try {
      const raw = match[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      return JSON.parse(raw)
    } catch { return null }
  }
}

// Mapeia ESPN league ID → Understat league name
const ESPN_TO_UNDERSTAT = {
  'eng.1': 'EPL',
  'esp.1': 'La_liga',
  'ger.1': 'Bundesliga',
  'ita.1': 'Serie_A',
  'fra.1': 'Ligue_1',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { endpoint, league, espnId, team, season = '2024' } = req.query
  const leagueName = league || ESPN_TO_UNDERSTAT[espnId] || null

  if (!endpoint) {
    return res.status(400).json({
      error: 'Parâmetro ?endpoint= obrigatório',
      endpoints: {
        league: '?endpoint=league&espnId=eng.1&season=2024',
        team:   '?endpoint=team&team=Manchester+City&season=2024',
        check:  '?endpoint=check (verifica ligas disponíveis)',
      }
    })
  }

  // ── Endpoint: check ────────────────────────────────────────
  if (endpoint === 'check') {
    return res.status(200).json({
      status: 'ok',
      ligas_disponiveis: Object.keys(ESPN_TO_UNDERSTAT),
      mapeamento: ESPN_TO_UNDERSTAT,
      aviso: 'Brasileirao (bra.1/bra.2) NÃO está no Understat. Use FotMob/ESPN para Brasil.',
      fonte: 'https://understat.com',
    })
  }

  // ── Endpoint: league ───────────────────────────────────────
  if (endpoint === 'league') {
    if (!leagueName) {
      return res.status(400).json({
        error: 'Parâmetro league= ou espnId= obrigatório',
        exemplo: '?endpoint=league&espnId=eng.1',
        ligas: Object.values(ESPN_TO_UNDERSTAT),
      })
    }

    const url = `${BASE}/league/${leagueName}/${season}`
    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()

      const teamsData = extractVar(html, 'teamsData')
      const datesData = extractVar(html, 'datesData')

      if (!teamsData && !datesData) {
        return res.status(502).json({
          error: 'Não foi possível extrair dados do Understat. Página pode ter mudado.',
          url,
        })
      }

      // Processa teamsData → xG médio por jogo de cada time
      const teamsXg = {}
      if (teamsData) {
        Object.entries(teamsData).forEach(([teamName, data]) => {
          const history = data.history || []
          if (!history.length) return
          const last10 = history.slice(-10)  // últimos 10 jogos
          const xgFor  = last10.reduce((s, g) => s + parseFloat(g.xG  || 0), 0) / last10.length
          const xgAga  = last10.reduce((s, g) => s + parseFloat(g.xGA || 0), 0) / last10.length
          const xgAll  = history.reduce((s, g) => s + parseFloat(g.xG  || 0), 0) / history.length
          const xgAAll = history.reduce((s, g) => s + parseFloat(g.xGA || 0), 0) / history.length
          teamsXg[teamName] = {
            xgFor:     +xgFor.toFixed(3),   // xG atacando médio (últ. 10)
            xgAgainst: +xgAga.toFixed(3),   // xG sofrido médio (últ. 10)
            xgForSeason:     +xgAll.toFixed(3),
            xgAgainstSeason: +xgAAll.toFixed(3),
            jogos: history.length,
            // Dados brutos dos últimos 5 para contexto
            ultimos5: history.slice(-5).map(g => ({
              data:    g.date,
              xg:      parseFloat(g.xG  || 0).toFixed(2),
              xga:     parseFloat(g.xGA || 0).toFixed(2),
              gols:    g.scored,
              golsSofridos: g.missed,
              home:    g.h_a === 'h',
              result:  g.result,
            }))
          }
        })
      }

      // Cache 6 horas (dados diários, não muda muito)
      res.setHeader('Cache-Control', 's-maxage=21600')

      return res.status(200).json({
        liga: leagueName,
        temporada: season,
        times: teamsXg,
        partidas: datesData || [],
        fonte: url,
        extraido_em: new Date().toISOString(),
      })

    } catch (e) {
      return res.status(500).json({ error: e.message, url: `${BASE}/league/${leagueName}/${season}` })
    }
  }

  // ── Endpoint: team ─────────────────────────────────────────
  if (endpoint === 'team') {
    if (!team) return res.status(400).json({ error: 'Parâmetro team= obrigatório', exemplo: '?endpoint=team&team=Manchester+City' })

    const teamSlug = team.replace(/ /g, '_')
    const url = `${BASE}/team/${teamSlug}/${season}`

    try {
      const response = await fetch(url, { headers: BROWSER_HEADERS })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const html = await response.text()

      const datesData = extractVar(html, 'datesData')

      if (!datesData) {
        return res.status(502).json({ error: 'Não foi possível extrair datesData do time', url })
      }

      const matches = (datesData || []).slice(-15).map(m => ({
        data:   m.datetime,
        casa:   m.h,
        fora:   m.a,
        xg:     parseFloat(m.xG || 0).toFixed(2),
        xga:    parseFloat(m.xGA || 0).toFixed(2),
        gols:   m.scored,
        golsSofridos: m.missed,
        resultado: m.result,
        isHome: m.h_a === 'h',
      }))

      const xgMedia    = matches.reduce((s, m) => s + parseFloat(m.xg), 0)  / (matches.length || 1)
      const xgaMedia   = matches.reduce((s, m) => s + parseFloat(m.xga), 0) / (matches.length || 1)

      res.setHeader('Cache-Control', 's-maxage=21600')

      return res.status(200).json({
        time: team,
        temporada: season,
        xgMediaUltimos15: +xgMedia.toFixed(3),
        xgaMediaUltimos15: +xgaMedia.toFixed(3),
        partidas: matches,
        fonte: url,
      })

    } catch (e) {
      return res.status(500).json({ error: e.message, url })
    }
  }

  return res.status(400).json({ error: `Endpoint "${endpoint}" não reconhecido` })
}
