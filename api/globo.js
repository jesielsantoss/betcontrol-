// api/globo.js — Proxy Vercel para Globo Esporte + Cartola FC
//
// Endpoints via ?endpoint=:
//   partidas        → jogos da rodada atual do Brasileirão (Cartola)
//   scouts          → scouts ao vivo dos jogadores (Cartola) — desarmes, finalizações, etc
//   clubes          → lista de clubes com escudos (Cartola)
//   mercado         → status do mercado Cartola (rodada aberta/fechada)
//   pontuados       → atletas pontuados na rodada (com scouts detalhados)
//   tabela          → classificação do Brasileirão Série A
//   rodadas         → todas as rodadas da temporada

const CARTOLA  = 'https://api.cartola.globo.com'
const GE_BASE  = 'https://api.ge.globo.com'

const HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'pt-BR,pt;q=0.9',
  'Referer':         'https://cartola.globo.com/',
  'Origin':          'https://cartola.globo.com',
}

// Mapa de scouts do Cartola → nome legível
const SCOUT_LABELS = {
  DS: 'Desarmes',       FC: 'Faltas Cometidas', GC: 'Gols Contra',
  CA: 'Cartão Amarelo', CV: 'Cartão Vermelho',  FD: 'Finalizações Defendidas',
  FF: 'Finalizações Fora', FS: 'Faltas Sofridas', FT: 'Finalizações na Trave',
  G:  'Gols',           GS: 'Gols Sofridos',    I:  'Impedimentos',
  PP: 'Pênalti Perdido',PS: 'Pênalti Sofrido',  RB: 'Roubadas de Bola',
  SG: 'Sem Sofrer Gol', DD: 'Defesas Difíceis',  DP: 'Defesa de Pênalti',
  A:  'Assistências',   FJ: 'Fora de Jogo',
}

async function cartola(path, params = {}) {
  const qs  = new URLSearchParams(params).toString()
  const url = `${CARTOLA}${path}${qs ? '?' + qs : ''}`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Cartola HTTP ${res.status}: ${path}`)
  const text = await res.text()
  if (text.trim().startsWith('<')) throw new Error(`Cartola retornou HTML em ${path}`)
  return JSON.parse(text)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { endpoint, rodada, clube_id } = req.query

  if (!endpoint) {
    return res.status(400).json({
      error: 'Parâmetro ?endpoint= obrigatório',
      endpoints: {
        partidas:  '?endpoint=partidas                  (jogos da rodada atual)',
        scouts:    '?endpoint=scouts                    (scouts dos jogadores ao vivo)',
        clubes:    '?endpoint=clubes                    (clubes + escudos)',
        mercado:   '?endpoint=mercado                   (status da rodada)',
        pontuados: '?endpoint=pontuados                 (atletas com scouts detalhados)',
        tabela:    '?endpoint=tabela                    (classificação Série A)',
        rodadas:   '?endpoint=rodadas                   (todas as rodadas)',
        atletas:   '?endpoint=atletas&clube_id=262      (atletas de um clube)',
      }
    })
  }

  try {
    // ── partidas ─────────────────────────────────────────────
    if (endpoint === 'partidas') {
      const data = await cartola('/partidas')
      // Normaliza para formato compatível com ScoutsTab
      const partidas = (data.partidas || []).map(p => ({
        id:          p.partida_id,
        rodada:      p.rodada_id,
        data:        p.partida_data,
        local:       p.local,
        ao_vivo:     p.ao_vivo,
        placar_casa: p.placar_oficial_mandante,
        placar_fora: p.placar_oficial_visitante,
        valida:      p.valida,
        clube_casa: {
          id:     p.clube_casa_id,
          nome:   data.clubes?.[p.clube_casa_id]?.nome,
          abrev:  data.clubes?.[p.clube_casa_id]?.abreviacao,
          escudo: data.clubes?.[p.clube_casa_id]?.escudos?.['60x60'],
        },
        clube_fora: {
          id:     p.clube_visitante_id,
          nome:   data.clubes?.[p.clube_visitante_id]?.nome,
          abrev:  data.clubes?.[p.clube_visitante_id]?.abreviacao,
          escudo: data.clubes?.[p.clube_visitante_id]?.escudos?.['60x60'],
        },
      }))
      res.setHeader('Cache-Control', 's-maxage=60')  // 1 min — pode estar ao vivo
      return res.status(200).json({ partidas, rodada: data.rodada, clubes: data.clubes })
    }

    // ── mercado ───────────────────────────────────────────────
    if (endpoint === 'mercado') {
      const data = await cartola('/mercado/status')
      res.setHeader('Cache-Control', 's-maxage=300')
      return res.status(200).json(data)
    }

    // ── clubes ────────────────────────────────────────────────
    if (endpoint === 'clubes') {
      const data = await cartola('/clubes')
      res.setHeader('Cache-Control', 's-maxage=86400')  // 24h
      return res.status(200).json(data)
    }

    // ── rodadas ───────────────────────────────────────────────
    if (endpoint === 'rodadas') {
      const data = await cartola('/rodadas')
      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.status(200).json(data)
    }

    // ── pontuados (scouts detalhados da rodada) ───────────────
    if (endpoint === 'pontuados') {
      const data = await cartola('/atletas/pontuados')
      // Processa scouts: adiciona labels legíveis
      const atletas = Object.values(data.atletas || {}).map(a => {
        const scoutsRaw = a.scout || {}
        const scouts = Object.entries(scoutsRaw).map(([k, v]) => ({
          sigla: k, label: SCOUT_LABELS[k] || k, valor: v
        })).filter(s => s.valor > 0).sort((a, b) => b.valor - a.valor)
        return {
          id:        a.atleta_id,
          nome:      a.apelido,
          foto:      a.foto,
          clube_id:  a.clube_id,
          posicao:   a.posicao_id,
          pontos:    a.pontuacao,
          pontos_media: a.media_num,
          scouts,
          entrou_em_campo: a.entrou_em_campo,
        }
      }).sort((a, b) => b.pontos - a.pontos)

      res.setHeader('Cache-Control', 's-maxage=60')
      return res.status(200).json({
        atletas,
        rodada: data.rodada,
        clubes: data.clubes,
      })
    }

    // ── scouts (resumo por clube — bom para análise pré-jogo) ─
    if (endpoint === 'scouts') {
      const data = await cartola('/atletas/pontuados')
      const clubes = data.clubes || {}

      // Agrupa scouts por clube
      const scoutesPorClube = {}
      Object.values(data.atletas || {}).forEach(a => {
        const cid = a.clube_id
        if (!scoutesPorClube[cid]) {
          scoutesPorClube[cid] = {
            clube:  clubes[cid]?.nome,
            abrev:  clubes[cid]?.abreviacao,
            escudo: clubes[cid]?.escudos?.['60x60'],
            totais: {},
            jogadores: []
          }
        }
        // Acumula scouts do clube
        Object.entries(a.scout || {}).forEach(([k, v]) => {
          scoutesPorClube[cid].totais[k] = (scoutesPorClube[cid].totais[k] || 0) + v
        })
        scoutesPorClube[cid].jogadores.push({
          nome:   a.apelido,
          scouts: a.scout || {},
          pontos: a.pontuacao,
        })
      })

      // Adiciona labels legíveis nos totais
      const resultado = Object.values(scoutesPorClube).map(c => ({
        ...c,
        totaisLegivel: Object.entries(c.totais).map(([k, v]) => ({
          sigla: k, label: SCOUT_LABELS[k] || k, valor: v
        })).sort((a, b) => b.valor - a.valor)
      }))

      res.setHeader('Cache-Control', 's-maxage=120')
      return res.status(200).json({ clubes: resultado, rodada: data.rodada })
    }

    // ── tabela ────────────────────────────────────────────────
    if (endpoint === 'tabela') {
      // GE tem endpoint de tabela do Brasileirão
      const url = `${GE_BASE}/futebol/campeonatos/2/fases/0/grupos/0/classificacao/`
      const response = await fetch(url, { headers: HEADERS })
      if (!response.ok) {
        // Fallback: tabela via Cartola
        const data = await cartola('/campeonatos')
        return res.status(200).json(data)
      }
      const data = await response.json()
      res.setHeader('Cache-Control', 's-maxage=1800')  // 30 min
      return res.status(200).json(data)
    }

    // ── atletas de um clube ───────────────────────────────────
    if (endpoint === 'atletas') {
      if (!clube_id) return res.status(400).json({ error: 'Parâmetro clube_id= obrigatório' })
      const data = await cartola('/atletas/mercado')
      const atletasDoClube = Object.values(data.atletas || {})
        .filter(a => a.clube_id == clube_id)
        .map(a => ({
          id:     a.atleta_id,
          nome:   a.apelido,
          foto:   a.foto,
          posicao: a.posicao_id,
          media:  a.media_num,
          preco:  a.preco_num,
          scouts: a.scout || {},
        }))
      res.setHeader('Cache-Control', 's-maxage=600')
      return res.status(200).json({ atletas: atletasDoClube, clube_id })
    }

    return res.status(400).json({ error: `Endpoint "${endpoint}" não reconhecido` })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
