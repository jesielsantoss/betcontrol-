import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts'

// ===================== TEMA CENTRAL =====================
const T = {
  bg:         '#1b1f1b',
  surface:    '#1a1e1a',
  card:       '#222822',
  cardInner:  '#1e261e',
  border:     '#2d3a2d',
  primary:    '#00c800',
  primaryDark:'#007700',
  success:    '#00e600',
  danger:     '#ff1744',
  dangerSoft: '#ff5252',
  warning:    '#f5c518',
  accent:     '#33dd33',
  text:       '#ffffff',
  muted:      '#8a9e8a',
  chart:      ['#33dd33','#00e600','#f5c518','#ff1744','#00bcd4','#e040fb'],
}

const STATUS_COLORS = { ganhou: T.success, perdeu: T.danger, pendente: T.warning }
const STATUS_LABELS = { ganhou: 'Ganhou', perdeu: 'Perdeu', pendente: 'Pendente' }
const ESPORTES = ['Futebol','Basquete','Tennis','Volei','MMA/UFC','E-Sports','Outros']
const CASAS    = ['Bet365','Sportingbet','Betano','KTO','Novibet','Blaze','Vaidebet','Outra']
const LIGAS_ESPN = [
  { id:'bra.1',                nome:'Brasileirao Serie A'  },
  { id:'bra.2',                nome:'Brasileirao Serie B'  },
  { id:'bra.3',                nome:'Copa do Brasil'       },
  { id:'conmebol.libertadores',nome:'Libertadores'         },
  { id:'conmebol.sudamericana',nome:'Sul-Americana'        },
  { id:'uefa.champions',       nome:'Champions League'     },
  { id:'eng.1',                nome:'Premier League'       },
  { id:'esp.1',                nome:'La Liga'              },
  { id:'ita.1',                nome:'Serie A Italia'       },
  { id:'ger.1',                nome:'Bundesliga'           },
  { id:'fra.1',                nome:'Ligue 1'              },
]

// ===================== UI DESIGN SYSTEM =====================
const UIInput = (props) => (
  <input {...props} style={{
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
    color: T.text, padding: '9px 12px', fontSize: 14, outline: 'none',
    width: '100%', fontFamily: 'inherit', ...props.style,
  }}/>
)

const UISelect = ({ children, ...props }) => (
  <select {...props} style={{
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
    color: T.text, padding: '9px 12px', fontSize: 14, outline: 'none',
    width: '100%', fontFamily: 'inherit', ...props.style,
  }}>{children}</select>
)

function UIButton({ variant = 'primary', children, style, ...props }) {
  const variants = {
    primary: { background: `linear-gradient(135deg,${T.primary},${T.primaryDark})`, color: '#fff', border: 'none', boxShadow: `0 4px 14px ${T.primary}33` },
    ghost:   { background: T.cardInner, color: T.accent, border: `1px solid ${T.primary}33` },
    danger:  { background: '#2a1020', color: T.dangerSoft, border: `1px solid ${T.danger}33` },
    muted:   { background: 'transparent', color: T.muted, border: `1px solid ${T.border}` },
  }
  return (
    <button {...props} style={{
      borderRadius: 8, padding: '10px 22px', cursor: 'pointer',
      fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
      ...variants[variant], ...style,
    }}>{children}</button>
  )
}

function GlassCard({ children, style = {}, glow }) {
  return (
    <div style={{
      background: `linear-gradient(135deg,${T.card} 0%,${T.cardInner} 100%)`,
      border: `1px solid ${glow ? glow + '33' : T.card}`,
      borderRadius: 18, padding: '22px 26px',
      boxShadow: glow ? `0 4px 30px ${glow}11` : `0 2px 16px #00000033`,
      ...style,
    }}>{children}</div>
  )
}

function Badge({ status }) {
  const color = STATUS_COLORS[status]
  return (
    <span style={{
      background: `${color}22`, color, border: `1px solid ${color}44`,
      borderRadius: 6, padding: '2px 10px', fontSize: 11,
      fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
    }}>{STATUS_LABELS[status]}</span>
  )
}

function StatCard({ label, value, sub, color, trend, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: `linear-gradient(135deg,${T.card} 0%,${T.cardInner} 100%)`,
      border: `1px solid ${color}33`, borderRadius: 18, padding: '20px 24px',
      flex: 1, minWidth: 140, position: 'relative', overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default', boxShadow: `0 4px 20px ${color}0a`,
    }}>
      <div style={{ position:'absolute',top:-20,right:-20,width:90,height:90,borderRadius:'50%',background:`${color}12` }}/>
      <div style={{ position:'absolute',bottom:-30,left:-10,width:60,height:60,borderRadius:'50%',background:`${color}08` }}/>
      <div style={{ color: T.muted, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
      <div style={{ color, fontSize: 24, fontWeight: 900, fontFamily:"'Bebas Neue',cursive", letterSpacing: 1 }}>{value}</div>
      {sub   && <div style={{ color: T.muted, fontSize: 11, marginTop: 4 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ fontSize: 11, marginTop: 4, color: trend >= 0 ? T.success : T.danger, fontWeight: 700 }}>
          {trend >= 0 ? '+' : ''}{trend}% vs mês anterior
        </div>
      )}
    </div>
  )
}

function ProbBar({ label, value, color = T.accent }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#a0aec0' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ background: T.card, borderRadius: 6, height: 7 }}>
        <div style={{ background: `linear-gradient(90deg,${color}99,${color})`, borderRadius: 6, height: 7, width: `${value}%`, transition: 'width 0.7s ease', boxShadow: `0 0 8px ${color}55` }}/>
      </div>
    </div>
  )
}

const Lbl = ({ children }) => (
  <label style={{ fontSize: 11, color: T.muted, fontWeight: 700, display: 'block', marginBottom: 5 }}>{children}</label>
)

// ===================== UTILITÁRIOS =====================
const toMoney = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00' }
const toOdd   = (v) => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(2) : '0.00' }
const safeNum = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb }

function parseRecord(rec) {
  if (!rec) return { w: 0, d: 0, l: 0, total: 1 }
  const [w = 0, d = 0, l = 0] = rec.split('-').map(Number)
  return { w, d, l, total: Math.max(1, w + d + l) }
}
function getTeamsFromEvent(event) {
  const comps = event?.competitions?.[0]
  const home = comps?.competitors?.find(c => c.homeAway === 'home')
  const away = comps?.competitors?.find(c => c.homeAway === 'away')
  return { comps, home, away }
}
function calcMatchProbs(event) {
  const { home, away } = getTeamsFromEvent(event)
  if (!home || !away) return { over25:0, over15:0, btts:0, homeWin:0, awayWin:0, draw:0, hr:{w:0,d:0,l:0,total:1}, ar:{w:0,d:0,l:0,total:1} }
  const hr = parseRecord(home?.records?.[0]?.summary)
  const ar = parseRecord(away?.records?.[0]?.summary)
  const hA = (hr.w + hr.d * 0.5) / hr.total
  const aA = (ar.w + ar.d * 0.5) / ar.total
  const over25  = Math.min(90, Math.round((hA + aA) * 55 + 10))
  const over15  = Math.min(95, over25 + 15)
  const btts    = Math.min(85, Math.round(hA * aA * 100 + 20))
  const homeWin = Math.min(88, Math.round((hr.w / hr.total) * 65 + (ar.l / ar.total) * 20 + 5))
  const awayWin = Math.min(85, Math.round((ar.w / ar.total) * 60 + (hr.l / hr.total) * 20 + 5))
  const draw    = Math.max(5, Math.min(40, 100 - homeWin - awayWin))
  return { over25, over15, btts, homeWin, awayWin, draw, hr, ar }
}
function getEventStatus(event) {
  const s = event?.status?.type
  return { aoVivo: s?.name === 'STATUS_IN_PROGRESS', encerrado: !!s?.completed }
}

function exportCSV(bets) {
  const headers = ['Data','Evento','Esporte','Mercado','Selecao','Casa','Tipo','Odd','Valor','Status','Retorno','Lucro','Observacao']
  const rows = bets.map(b => {
    const lucro = b.status === 'ganhou' ? (b.retorno - b.valor).toFixed(2) : b.status === 'perdeu' ? (-b.valor).toFixed(2) : ''
    return [b.data,b.evento,b.esporte||'',b.mercado||'',b.selecao||'',b.casa||'',b.tipo||'simples',b.odd,b.valor,STATUS_LABELS[b.status],b.retorno||'',lucro,b.observacao||'']
  })
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `betcontrol_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── Toast global ──
let _toastTimer
function showToast(msg, type = 'success') {
  const el = document.getElementById('bc-toast')
  if (!el) return
  el.textContent = msg
  el.style.background   = type === 'success' ? `${T.success}22` : type === 'error' ? `${T.danger}22` : `${T.warning}22`
  el.style.borderColor  = type === 'success' ? T.primary : type === 'error' ? T.danger : T.warning
  el.style.color        = type === 'success' ? T.success : type === 'error' ? T.dangerSoft : T.warning
  el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(10px)' }, 3000)
}

// ===================== FETCH SEGURO =====================
async function safeFetch(url) {
  const res = await fetch(url)
  const text = await res.text()
  if (text.trim().startsWith('<')) {
    throw new Error(`A rota ${url.split('?')[0]} retornou HTML em vez de JSON. Verifique o backend/proxy no Vercel.`)
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`)
  return JSON.parse(text)
}

// ===================== ESPN SERVICE =====================
const espnCache = {}

async function fetchESPN(leagueId, date) {
  const key = `${leagueId}_${date}`
  if (espnCache[key]) return espnCache[key]
  const d = date.replace(/-/g, '')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard?dates=${d}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`)
    const data = await res.json()
    espnCache[key] = Array.isArray(data?.events) ? data.events : []
    return espnCache[key]
  } catch (e) {
    console.warn('ESPN fetch error:', leagueId, date, e.message)
    return []
  }
}

async function fetchESPNRange(leagueId, days = 7) {
  const hoje = new Date()
  const promises = Array.from({ length: days }, (_, i) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    return fetchESPN(leagueId, d.toISOString().slice(0, 10))
  })
  const results = await Promise.all(promises)
  return results.flat()
}

// ===================== GLOBO / CARTOLA SERVICE =====================
// Cartola FC API — aberta, rica em scouts ao vivo para futebol brasileiro
// Proxy em /api/globo resolve CORS
// Disponível apenas durante temporada do Brasileirão (Jan–Dez)

const CARTOLA_POSICOES = { 1:'GOL', 2:'LAT', 3:'ZAG', 4:'MEI', 5:'ATA', 6:'TEC' }
const SCOUT_LABELS = {
  DS:'Desarmes', FC:'Faltas Cometidas', GC:'Gols Contra', CA:'Cartão Amarelo',
  CV:'Cartão Vermelho', FD:'Fin. Defendidas', FF:'Fin. Fora', FS:'Faltas Sofridas',
  FT:'Fin. Trave', G:'Gols', GS:'Gols Sofridos', I:'Impedimentos',
  PP:'Pênalti Perdido', PS:'Pênalti Sofrido', RB:'Roubadas de Bola',
  SG:'Sem Sofrer Gol', DD:'Defesas Difíceis', DP:'Def. Pênalti', A:'Assistências',
}

const globoCache = {}

async function fetchGlobo(endpoint, params = {}) {
  const qs  = new URLSearchParams({ endpoint, ...params }).toString()
  const key = qs
  if (globoCache[key]) return globoCache[key]
  try {
    const data = await safeFetch(`/api/globo?${qs}`)
    globoCache[key] = data
    return data
  } catch (e) {
    console.warn('Globo/Cartola error:', e.message)
    return null
  }
}

// Busca partidas da rodada atual via Cartola
async function fetchCartolaParts() {
  return fetchGlobo('partidas')
}

// Busca scouts ao vivo por clube
async function fetchCartolaScouts() {
  return fetchGlobo('scouts')
}

// Busca atletas pontuados com scouts detalhados
async function fetchCartolaPontuados() {
  return fetchGlobo('pontuados')
}

// ===================== FOTMOB SERVICE =====================
// FotMob tem dados muito mais ricos que ESPN: xG, stats, escalações, ao vivo
// Proxy Vercel em /api/fotmob resolve CORS

// IDs das ligas no FotMob (mais completo que ESPN para futebol)
const FOTMOB_LEAGUES = {
  'bra.1':                 { id: 268,  nome: 'Brasileirao Serie A'  },
  'bra.2':                 { id: 269,  nome: 'Brasileirao Serie B'  },
  'conmebol.libertadores': { id: 384,  nome: 'Libertadores'         },
  'conmebol.sudamericana': { id: 480,  nome: 'Sul-Americana'        },
  'uefa.champions':        { id: 42,   nome: 'Champions League'     },
  'eng.1':                 { id: 47,   nome: 'Premier League'       },
  'esp.1':                 { id: 87,   nome: 'La Liga'              },
  'ita.1':                 { id: 55,   nome: 'Serie A Italia'       },
  'ger.1':                 { id: 54,   nome: 'Bundesliga'           },
  'fra.1':                 { id: 53,   nome: 'Ligue 1'              },
}

// Cache FotMob separado do ESPN
const fotmobCache = {}

async function fetchFotMobDay(date) {
  if (fotmobCache[date]) return fotmobCache[date]
  try {
    const data = await safeFetch(`/api/fotmob?endpoint=matches&date=${date}`)
    fotmobCache[date] = data
    return data
  } catch (e) {
    console.warn('FotMob fetch error:', date, e.message)
    return null
  }
}

// Busca jogos de uma liga específica para uma data via FotMob
async function fetchFotMobLeague(espnLeagueId, date) {
  const league = FOTMOB_LEAGUES[espnLeagueId]
  if (!league) return []
  try {
    const dayData = await fetchFotMobDay(date)
    if (!dayData?.leagues) return []
    const liga = dayData.leagues.find(l => l.id === league.id)
    if (!liga) return []
    return (liga.matches || []).map(m => ({ ...m, _ligaNome: league.nome, _espnId: espnLeagueId }))
  } catch { return [] }
}

// Busca detalhes de uma partida FotMob (xG, stats, escalação)
async function fetchFotMobDetails(matchId) {
  try {
    return await safeFetch(`/api/fotmob?endpoint=details&matchId=${matchId}`)
  } catch (e) {
    console.warn('FotMob details error:', matchId, e.message)
    return null
  }
}

// Extrai lambdas melhores a partir de xG do FotMob (quando disponível)
// xG é muito mais preciso que W/D/L para o modelo Poisson
function lambdasFromFotMob(match) {
  const home = match?.home
  const away = match?.away
  // Se tiver xG dos últimos jogos (stats season)
  const hXg = home?.stats?.seasonXg || home?.expectedGoals || null
  const aXg = away?.stats?.seasonXg || away?.expectedGoals || null
  if (hXg && aXg) {
    return { lambdaH: Math.max(0.3, Math.min(3.5, hXg)), lambdaA: Math.max(0.3, Math.min(3.5, aXg)), source: 'xG' }
  }
  return null
}

// ===================== UNDERSTAT SERVICE =====================
// Understat: xG (Expected Goals) das top 5 ligas europeias + Rússia
// ⚠️  Brasil NÃO está disponível — fallback automático para W/D/L
// Mapeamento: eng.1→EPL | esp.1→La_liga | ger.1→Bundesliga | ita.1→Serie_A | fra.1→Ligue_1

const ESPN_TO_UNDERSTAT = {
  'eng.1': 'EPL', 'esp.1': 'La_liga', 'ger.1': 'Bundesliga',
  'ita.1': 'Serie_A', 'fra.1': 'Ligue_1',
}

// Cache xG por liga — evita refetch durante a sessão
const understatCache = {}

async function fetchUnderstatLeague(espnLeagueId, season = '2024') {
  const leagueName = ESPN_TO_UNDERSTAT[espnLeagueId]
  if (!leagueName) return null  // Liga sem suporte (ex: Brasil)

  const key = `${leagueName}_${season}`
  if (understatCache[key]) return understatCache[key]

  try {
    const data = await safeFetch(`/api/understat?endpoint=league&espnId=${espnLeagueId}&season=${season}`)
    understatCache[key] = data
    return data
  } catch (e) {
    console.warn('Understat unavailable, using W/D/L fallback:', e.message)
    return null
  }
}

// Acha o xG de um time dentro dos dados da liga
// Matching por nome — FotMob e Understat usam nomes parecidos mas não idênticos
function findTeamXg(understatData, teamName) {
  if (!understatData?.times || !teamName) return null
  const name = teamName.toLowerCase().replace(/[^a-z0-9]/g, '')
  const match = Object.entries(understatData.times).find(([k]) => {
    const k2 = k.toLowerCase().replace(/[^a-z0-9]/g, '')
    return k2 === name || k2.includes(name.slice(0,6)) || name.includes(k2.slice(0,6))
  })
  return match ? match[1] : null
}

// Calcula lambdas usando xG quando disponível, senão W/D/L
// xG é muito mais preciso: elimina variância de gols "de sorte"
function calcLambdas(homeTeamName, awayTeamName, hr, ar, understatData) {
  const homeXg = findTeamXg(understatData, homeTeamName)
  const awayXg = findTeamXg(understatData, awayTeamName)

  if (homeXg && awayXg) {
    // Lambda = xG médio de ataque vs xGA médio do adversário
    // Blend 60% últimos 10 jogos + 40% temporada inteira para suavizar
    const hAtk = homeXg.xgFor     * 0.6 + homeXg.xgForSeason     * 0.4
    const hDef = homeXg.xgAgainst * 0.6 + homeXg.xgAgainstSeason * 0.4
    const aAtk = awayXg.xgFor     * 0.6 + awayXg.xgForSeason     * 0.4
    const aDef = awayXg.xgAgainst * 0.6 + awayXg.xgAgainstSeason * 0.4

    // Lambda do time da casa = ataque deles vs defesa adversária (ajuste de mando)
    const lambdaH = Math.max(0.3, Math.min(4.0, (hAtk + aDef) / 2 * 1.08))  // +8% vantagem de mando
    const lambdaA = Math.max(0.3, Math.min(4.0, (aAtk + hDef) / 2 * 0.94))  // -6% desvantagem fora

    return { lambdaH: +lambdaH.toFixed(3), lambdaA: +lambdaA.toFixed(3), source: 'xG⚡' }
  }

  // Fallback: estimativa por W/D/L (método original)
  const LEAGUE_AVG = 1.35
  const homeAtk = hr.total > 0 ? ((hr.w * 3 + hr.d) / (hr.total * 3)) * LEAGUE_AVG * 1.35 : LEAGUE_AVG
  const awayAtk = ar.total > 0 ? ((ar.w * 3 + ar.d) / (ar.total * 3)) * LEAGUE_AVG * 1.10 : LEAGUE_AVG
  const homeDef = hr.total > 0 ? Math.max(0.5, 1 - hr.l / hr.total) : 1
  const awayDef = ar.total > 0 ? Math.max(0.5, 1 - ar.l / ar.total) : 1

  return {
    lambdaH: +Math.max(0.3, Math.min(3.5, homeAtk * awayDef)).toFixed(3),
    lambdaA: +Math.max(0.3, Math.min(3.5, awayAtk * homeDef)).toFixed(3),
    source: 'W/D/L',
  }
}

// ===================== NORMALIZA ODDS =====================
function normalizeOdds(bookmakers) {
  const markets = {}
  Object.entries(bookmakers || {}).forEach(([book, mklist]) => {
    const arr = Array.isArray(mklist) ? mklist : Object.values(mklist)
    arr.forEach(m => {
      const name = m.name || 'Mercado'
      if (!markets[name]) markets[name] = {}
      const odds = m.odds || m.outcomes || []
      odds.forEach(o => {
        const label = o.label || o.name || o.side || 'Selecao'
        const odd = parseFloat(o.price || o.odds || o.odd || 0)
        if (odd <= 1) return
        if (!markets[name][label]) markets[name][label] = []
        markets[name][label].push({ bookmaker: book, label, odd, href: o.href || m.href || null })
      })
    })
  })
  return markets
}

// ===================== DASHBOARD TAB =====================
function DashboardTab({ bets, onNewBet, onTabChange }) {
  const tt = { background: T.cardInner, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12 }

  const stats = useMemo(() => {
    const won     = bets.filter(b => b.status === 'ganhou')
    const lost    = bets.filter(b => b.status === 'perdeu')
    const pending = bets.filter(b => b.status === 'pendente')
    const fin     = won.length + lost.length
    const invested = bets.reduce((s, b) => s + safeNum(b.valor), 0)
    const returned = won.reduce((s, b) => s + safeNum(b.retorno), 0)
    const profit   = returned - won.reduce((s, b) => s + safeNum(b.valor), 0) - lost.reduce((s, b) => s + safeNum(b.valor), 0)
    const roi      = invested > 0 ? ((returned - invested) / invested * 100).toFixed(1) : '0.0'
    const winrate  = fin > 0 ? ((won.length / fin) * 100).toFixed(0) : '0'

    const streak = (() => {
      const sorted = [...bets].filter(b => b.status !== 'pendente').sort((a, b) => b.data.localeCompare(a.data))
      if (!sorted.length) return { count: 0, type: '' }
      let count = 1, type = sorted[0].status
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].status === type) count++
        else break
      }
      return { count, type }
    })()

    return { total: bets.length, won: won.length, lost: lost.length, pending: pending.length, invested, profit, roi, winrate, streak }
  }, [bets])

  const bankrollData = useMemo(() => {
    const sorted = [...bets].filter(b => b.status !== 'pendente').sort((a, b) => a.data.localeCompare(b.data))
    let bal = 0
    return sorted.slice(-20).map(b => {
      const l = b.status === 'ganhou' ? b.retorno - b.valor : -b.valor
      bal += l
      return { data: b.data.slice(5), lucro: +bal.toFixed(2) }
    })
  }, [bets])

  const ultimas    = useMemo(() => [...bets].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5), [bets])
  const porEsporte = useMemo(() => {
    const map = {}
    bets.filter(b => b.status === 'ganhou').forEach(b => {
      const e = b.esporte || 'Outros'
      map[e] = (map[e] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, value]) => ({ name, value }))
  }, [bets])

  const streakColor = stats.streak.type === 'ganhou' ? T.success : T.danger

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Hero stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
        <StatCard label="Lucro Total"    value={`R$ ${stats.profit.toFixed(2)}`}           color={stats.profit >= 0 ? T.success : T.danger} trend={parseFloat(stats.roi)}/>
        <StatCard label="ROI"            value={`${stats.roi}%`}                            color={parseFloat(stats.roi) >= 0 ? T.success : T.danger}/>
        <StatCard label="Taxa de Acerto" value={`${stats.winrate}%`} sub={`${stats.won} G / ${stats.lost} P`} color={T.warning}/>
        <StatCard label="Apostas"        value={stats.total}         sub={`${stats.pending} pendentes`}       color={T.primary}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Sequência */}
        <GlassCard glow={stats.streak.count > 0 ? streakColor : undefined}>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>SEQUÊNCIA ATUAL</div>
          {stats.streak.count > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 52, fontWeight: 900, fontFamily: "'Bebas Neue',cursive", color: streakColor, lineHeight: 1 }}>{stats.streak.count}</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: streakColor }}>{stats.streak.type === 'ganhou' ? 'Vitórias' : 'Derrotas'} seguidas</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{stats.streak.type === 'ganhou' ? 'Continue o ritmo!' : 'Cuidado, avalie suas entradas'}</div>
              </div>
            </div>
          ) : <div style={{ color: T.muted, fontSize: 13 }}>Sem apostas finalizadas ainda</div>}
        </GlassCard>

        {/* Ações rápidas */}
        <GlassCard>
          <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>AÇÕES RÁPIDAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <UIButton onClick={onNewBet} style={{ textAlign: 'left' }}>+ Registrar nova aposta</UIButton>
            <div style={{ display: 'flex', gap: 8 }}>
              <UIButton variant="ghost" onClick={() => onTabChange('sugestoes')} style={{ flex: 1 }}>Ver Sugestões</UIButton>
              <UIButton variant="ghost" onClick={() => onTabChange('scouts')} style={{ flex: 1 }}>Scouts</UIButton>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Gráfico + Últimas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Evolução do Lucro</div>
          {bankrollData.length < 3
            ? <div style={{ color: T.muted, textAlign: 'center', padding: 40, fontSize: 13 }}>Registre mais apostas para ver o gráfico</div>
            : <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={bankrollData}>
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={T.success} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={T.success} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.card}/>
                  <XAxis dataKey="data" stroke={T.muted} fontSize={10}/>
                  <YAxis stroke={T.muted} fontSize={10} tickFormatter={v => `R$${v}`}/>
                  <Tooltip contentStyle={tt} formatter={v => [`R$ ${v}`, 'Lucro']}/>
                  <Area type="monotone" dataKey="lucro" stroke={T.success} strokeWidth={2.5} fill="url(#lg)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>}
        </GlassCard>

        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Últimas Apostas</div>
          {ultimas.length === 0
            ? <div style={{ color: T.muted, fontSize: 13, textAlign: 'center', padding: 20 }}>Nenhuma aposta ainda</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {ultimas.map(b => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: T.surface, borderRadius: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[b.status], flexShrink: 0, boxShadow: `0 0 6px ${STATUS_COLORS[b.status]}` }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.evento}</div>
                      <div style={{ fontSize: 10, color: T.muted }}>{b.data} · odd {Number(b.odd).toFixed(2)}</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: b.status === 'ganhou' ? T.success : b.status === 'perdeu' ? T.danger : T.warning, flexShrink: 0 }}>
                      {b.status === 'ganhou' ? `+R$${(b.retorno - b.valor).toFixed(0)}` : b.status === 'perdeu' ? `-R$${Number(b.valor).toFixed(0)}` : '--'}
                    </div>
                  </div>
                ))}
              </div>}
        </GlassCard>
      </div>

      {/* Por esporte */}
      {porEsporte.length > 0 && (
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Apostas Ganhas por Esporte</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
            {porEsporte.map((e, i) => (
              <div key={e.name} style={{ background: T.surface, border: `1px solid ${T.chart[i]}33`, borderRadius: 14, padding: '14px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: T.chart[i], fontFamily: "'Bebas Neue',cursive" }}>{e.value}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{e.name}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  )
}

// ===================== COMPARADOR DE ODDS =====================
function ComparadorTab() {
  const [busca,          setBusca]          = useState('')
  const [eventos,        setEventos]        = useState([])
  const [loadingEventos, setLoadingEventos] = useState(false)
  const [eventoSel,      setEventoSel]      = useState(null)
  const [oddsData,       setOddsData]       = useState(null)
  const [loadingOdds,    setLoadingOdds]    = useState(false)
  const [erro,           setErro]           = useState('')
  const [mercadoFiltro,  setMercadoFiltro]  = useState('')
  const [testando,       setTestando]       = useState(false)
  const [testeResult,    setTesteResult]    = useState(null)

  async function testarAPI() {
    setTestando(true); setTesteResult(null)
    try {
      const data = await safeFetch('/api/odds?endpoint=sports')
      if (data.error) setTesteResult({ ok: false, msg: data.error })
      else setTesteResult({ ok: true, msg: `API funcionando! ${Array.isArray(data) ? data.length : '?'} esportes disponíveis.` })
    } catch (e) { setTesteResult({ ok: false, msg: e.message }) }
    setTestando(false)
  }

  async function buscarEventos() {
    if (!busca.trim()) return
    setLoadingEventos(true); setErro(''); setEventos([]); setEventoSel(null); setOddsData(null)
    try {
      const data = await safeFetch('/api/odds?endpoint=events&sport=football&limit=100')
      if (data.error) { setErro(data.error); setLoadingEventos(false); return }
      const lista    = Array.isArray(data) ? data : (data.events || data.data || [])
      const termo    = busca.toLowerCase()
      const filtrados = lista.filter(ev =>
        (ev.home || '').toLowerCase().includes(termo) ||
        (ev.away || '').toLowerCase().includes(termo) ||
        (ev.league || '').toLowerCase().includes(termo)
      )
      setEventos(filtrados.slice(0, 15))
      if (lista.length === 0) setErro('API retornou lista vazia. Verifique se ODDS_API_KEY está no Vercel.')
      else if (filtrados.length === 0) setErro(`Nenhum jogo encontrado com "${busca}". Tente: Manchester, Real Madrid, Barcelona...`)
    } catch (e) { setErro('Erro: ' + e.message) }
    setLoadingEventos(false)
  }

  async function buscarOdds(event) {
    setEventoSel(event); setLoadingOdds(true); setOddsData(null); setErro('')
    try {
      const data = await safeFetch(`/api/odds?endpoint=odds&eventId=${event.id}`)
      if (data.error) { setErro(data.error); setLoadingOdds(false); return }
      setOddsData(data)
      const bms   = data.bookmakers || {}
      const first = Object.values(bms)[0]
      const mkArr = Array.isArray(first) ? first : Object.values(first || {})
      if (mkArr[0]?.name) setMercadoFiltro(mkArr[0].name)
    } catch (e) { setErro('Erro ao buscar odds: ' + e.message) }
    setLoadingOdds(false)
  }

  const mercados = useMemo(() => {
    if (!oddsData?.bookmakers) return {}
    const result = {}
    Object.entries(oddsData.bookmakers).forEach(([casa, markets]) => {
      const mkArr = Array.isArray(markets) ? markets : Object.values(markets)
      mkArr.forEach(mk => {
        const mkName = mk.name || 'Mercado'
        if (!result[mkName]) result[mkName] = {}
        const ods = mk.odds || mk.outcomes || []
        ods.forEach(o => {
          const label = o.label || o.name || o.side || 'Selecao'
          const odd   = parseFloat(o.price || o.odds || o.odd || 0)
          if (odd <= 1) return
          if (!result[mkName][label]) result[mkName][label] = []
          result[mkName][label].push({ casa, odd, href: o.href || mk.href || null })
        })
      })
    })
    return result
  }, [oddsData])

  const mercadosNomes = Object.keys(mercados)
  const mercadoAtivo  = mercadoFiltro || mercadosNomes[0] || ''
  const grupos        = mercados[mercadoAtivo] || {}

  function renderGrupo(label, items) {
    if (!items || items.length < 2) return null
    const sorted     = [...items].sort((a, b) => b.odd - a.odd)
    const melhor     = sorted[0]
    const sumProbs   = items.reduce((s, i) => s + 1 / i.odd, 0)
    const fairProbs  = items.map(i => (1 / i.odd) / sumProbs)
    const avgFairProb = fairProbs.reduce((s, p) => s + p, 0) / fairProbs.length
    const fairOdd    = +(1 / avgFairProb).toFixed(2)
    const probMedia  = avgFairProb * 100
    const diferenca  = +(((melhor.odd - sorted[sorted.length - 1].odd) / sorted[sorted.length - 1].odd) * 100).toFixed(1)

    return (
      <div key={label} style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, letterSpacing: 0.5 }}>{label}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#a0aec0', background: `${T.accent}11`, border: `1px solid ${T.accent}22`, borderRadius: 5, padding: '2px 8px' }}>
              Fair Odd: <strong style={{ color: T.text }}>{fairOdd}</strong>
            </span>
            {diferenca > 0 && (
              <span style={{ fontSize: 10, color: T.warning, background: `${T.warning}11`, border: `1px solid ${T.warning}22`, borderRadius: 5, padding: '2px 8px' }}>Spread: {diferenca}%</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {sorted.map((item, i) => {
            const isMelhor = i === 0
            const ev       = (item.odd * avgFairProb) - 1
            const hasValue = ev > 0.02
            const diffVsMelhor = i === 0 ? 0 : (((melhor.odd - item.odd) / melhor.odd) * 100).toFixed(1)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', position: 'relative',
                background: hasValue ? `${T.success}06` : isMelhor ? '#ffffff04' : T.surface,
                border: `1px solid ${hasValue ? `${T.success}44` : isMelhor ? '#2a3a5a' : T.card}`,
                borderRadius: 11, transition: 'all 0.15s',
              }}>
                {hasValue && <div style={{ position: 'absolute', top: -1, right: 10, background: T.success, color: '#001a00', fontSize: 9, fontWeight: 900, padding: '1px 8px', borderRadius: '0 0 6px 6px', letterSpacing: 0.5 }}>VALUE BET</div>}
                {(isMelhor || hasValue) && <div style={{ width: 4, height: 40, background: hasValue ? T.success : T.accent, borderRadius: 2, flexShrink: 0, boxShadow: `0 0 10px ${hasValue ? T.success : T.accent}77` }}/>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: hasValue ? T.success : isMelhor ? T.text : '#a0aec0' }}>{item.casa}</div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>Prob impl: {(100 / item.odd).toFixed(1)}% | Fair: {probMedia.toFixed(1)}%</div>
                </div>
                {item.href && <a href={item.href} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: T.primary, border: `1px solid ${T.primary}44`, borderRadius: 6, padding: '3px 9px', textDecoration: 'none', fontWeight: 700, flexShrink: 0 }}>Apostar</a>}
                <div style={{ textAlign: 'center', minWidth: 56 }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: hasValue ? T.success : isMelhor ? T.text : T.warning, fontFamily: "'Bebas Neue',cursive", lineHeight: 1 }}>{item.odd.toFixed(2)}</div>
                  <div style={{ fontSize: 9, color: item.odd > fairOdd ? T.success : T.muted, fontWeight: 700 }}>
                    {((item.odd - fairOdd) / fairOdd * 100).toFixed(1)}% vs fair
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: ev > 0.05 ? T.success : ev > 0 ? '#69ff84' : ev > -0.03 ? T.warning : '#ff5252' }}>
                    EV {ev > 0 ? '+' : ''}{(ev * 100).toFixed(1)}%
                  </div>
                  {hasValue
                    ? <div style={{ fontSize: 10, color: T.success, fontWeight: 700, marginTop: 1 }}>🔥 APOSTAR</div>
                    : isMelhor
                      ? <div style={{ fontSize: 10, color: T.accent, marginTop: 1 }}>MELHOR</div>
                      : <div style={{ fontSize: 10, color: T.muted, marginTop: 1 }}>-{diffVsMelhor}% vs melhor</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ marginTop: 8, padding: '6px 12px', background: '#ffffff06', borderRadius: 7, fontSize: 10, color: T.muted }}>
          Fair Odd calculada removendo a margem (vig) das casas. Value Bet = odd da casa acima da fair odd.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Comparador de Odds em Tempo Real</div>
            <div style={{ color: T.muted, fontSize: 12, marginTop: 2 }}>Odds reais de 250+ casas via odds-api.io</div>
          </div>
          <UIButton variant="ghost" onClick={testarAPI} disabled={testando} style={{ fontSize: 12 }}>
            {testando ? 'Testando...' : 'Testar Conexão'}
          </UIButton>
        </div>
        {testeResult && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: testeResult.ok ? `${T.success}11` : `${T.danger}11`, border: `1px solid ${testeResult.ok ? `${T.success}33` : `${T.danger}33`}`, borderRadius: 8, fontSize: 12, color: testeResult.ok ? T.success : '#ff7070' }}>
            {testeResult.msg}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <Lbl>BUSCAR PARTIDA</Lbl>
            <UIInput value={busca} onChange={e => setBusca(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscarEventos()} placeholder="Ex: Manchester City, Real Madrid, Flamengo..."/>
          </div>
          <UIButton onClick={buscarEventos} disabled={loadingEventos} style={{ whiteSpace: 'nowrap' }}>
            {loadingEventos ? 'Buscando...' : 'Buscar'}
          </UIButton>
        </div>

        {erro && <div style={{ marginTop: 12, color: '#ff7070', fontSize: 12, padding: '9px 13px', background: `${T.danger}11`, border: `1px solid ${T.danger}33`, borderRadius: 8 }}>{erro}</div>}

        {!eventoSel && eventos.length > 0 && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 11, color: T.muted, fontWeight: 700, marginBottom: 4 }}>SELECIONE O JOGO</div>
            {eventos.map(ev => (
              <button key={ev.id} onClick={() => buscarOdds(ev)}
                style={{ background: T.surface, border: `1px solid ${T.card}`, borderRadius: 10, padding: '12px 16px', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: T.text, transition: 'all 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.primary}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.card}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{ev.home} <span style={{ color: T.muted, fontWeight: 400 }}>x</span> {ev.away}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{ev.league || ev.sport || ''}{ev.date ? ' · ' + new Date(ev.date).toLocaleDateString('pt-BR') : ''}</div>
                </div>
                <span style={{ fontSize: 11, color: T.primary, fontWeight: 700, flexShrink: 0 }}>Ver odds</span>
              </button>
            ))}
          </div>
        )}

        {eventoSel && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: T.cardInner, border: `1px solid ${T.primary}44`, borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{eventoSel.home} x {eventoSel.away}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{eventoSel.league}</div>
            </div>
            <button onClick={() => { setEventoSel(null); setOddsData(null); setEventos([]) }} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Trocar jogo</button>
          </div>
        )}
      </GlassCard>

      {loadingOdds && <div style={{ textAlign: 'center', padding: 40, color: T.muted, fontSize: 13 }}>Buscando odds em tempo real...</div>}

      {oddsData && mercadosNomes.length > 0 && (
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
            {eventoSel?.home} x {eventoSel?.away}
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 400, marginLeft: 10 }}>{Object.keys(oddsData.bookmakers || {}).length} casas</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {mercadosNomes.map(mk => (
              <button key={mk} onClick={() => setMercadoFiltro(mk)}
                style={{ background: mercadoAtivo === mk ? '#1e2a4a' : 'transparent', border: `1px solid ${mercadoAtivo === mk ? T.primary : T.border}`, color: mercadoAtivo === mk ? T.text : T.muted, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {mk}
              </button>
            ))}
          </div>
          {Object.entries(grupos).map(([label, items]) => renderGrupo(label, items))}
          <div style={{ marginTop: 8, padding: '10px 14px', background: `${T.accent}11`, border: `1px solid ${T.accent}22`, borderRadius: 8 }}>
            <div style={{ fontSize: 11, color: '#a0aec0' }}><strong style={{ color: T.accent }}>EV positivo</strong> = odd acima da probabilidade média do mercado. Dados ao vivo via odds-api.io.</div>
          </div>
        </GlassCard>
      )}
      {oddsData && mercadosNomes.length === 0 && !loadingOdds && (
        <GlassCard><div style={{ color: T.warning, fontSize: 13, textAlign: 'center', padding: 20 }}>Odds retornadas mas sem mercados reconhecidos. Tente outro jogo.</div></GlassCard>
      )}
    </div>
  )
}

// ===================== MODELO POISSON =====================
function poissonProb(lambda, k) {
  if (lambda <= 0) return 0
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

function poissonModel(lambdaHome, lambdaAway, maxGoals = 8) {
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over15 = 0, over25 = 0, over35 = 0
  for (let h = 0; h <= maxGoals; h++) {
    const ph = poissonProb(lambdaHome, h)
    for (let a = 0; a <= maxGoals; a++) {
      const p = ph * poissonProb(lambdaAway, a)
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
      if (h > 0 && a > 0) btts += p
      if (h + a > 1) over15 += p
      if (h + a > 2) over25 += p
      if (h + a > 3) over35 += p
    }
  }
  const fairOdd = (p) => p > 0 ? +(1 / p).toFixed(2) : 99
  return {
    homeWin: Math.round(homeWin * 100), draw: Math.round(draw * 100), awayWin: Math.round(awayWin * 100),
    btts: Math.round(btts * 100), over15: Math.round(over15 * 100),
    over25: Math.round(over25 * 100), over35: Math.round(over35 * 100),
    fairHome: fairOdd(homeWin), fairDraw: fairOdd(draw), fairAway: fairOdd(awayWin),
    lambdaHome: +lambdaHome.toFixed(2), lambdaAway: +lambdaAway.toFixed(2),
  }
}

// ===================== SUGESTÕES TAB =====================
function SugestoesTab() {
  const [liga,          setLiga]         = useState(LIGAS_ESPN[0])
  const [loading,       setLoading]       = useState(false)
  const [sugestoes,     setSugestoes]     = useState([])
  const [searched,      setSearched]      = useState(false)
  const [filtro,        setFiltro]        = useState('todos')
  const [fonte,         setFonte]         = useState('')
  const [xgStatus,      setXgStatus]      = useState('')  // 'xG⚡' | 'W/D/L' | ''

  // buildLambdas → usa calcLambdas global (suporta xG do Understat)

  async function buscarSugestoes() {
    setLoading(true); setSearched(true); setSugestoes([])
    setFonte('...')
    try {
      const hoje  = new Date()
      const dates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(hoje); d.setDate(d.getDate() + i)
        return d.toISOString().slice(0, 10)
      })

      // Tenta FotMob primeiro (dados mais ricos com xG)
      let todos = []
      let fonteUsada = 'ESPN'
      try {
        const fotmobResults = await Promise.all(dates.map(date => fetchFotMobLeague(liga.id, date)))
        const fotmobMatches = fotmobResults.flat()
        if (fotmobMatches.length > 0) {
          // Adapta formato FotMob para o formato ESPN-like que o código espera
          todos = fotmobMatches
            .filter(m => !m.status?.finished && !m.status?.started)
            .map(m => ({
              id: m.id,
              _fotmob: m,   // guarda original para extrair xG depois
              _date: dates[0],
              date: m.status?.utcTime,
              status: { type: { completed: m.status?.finished, name: m.status?.started ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED' } },
              competitions: [{
                competitors: [
                  { homeAway: 'home', team: { displayName: m.home?.name, shortDisplayName: m.home?.shortName, logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.home?.id}_small.png` }, records: [{ summary: m.home?.stats?.seasonRecord || null }] },
                  { homeAway: 'away', team: { displayName: m.away?.name, shortDisplayName: m.away?.shortName, logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.away?.id}_small.png` }, records: [{ summary: m.away?.stats?.seasonRecord || null }] },
                ]
              }]
            }))
          if (todos.length > 0) fonteUsada = 'FotMob ⚡'
        }
      } catch (e) { console.warn('FotMob fallback para ESPN:', e.message) }

      // Fallback ESPN se FotMob falhou ou retornou vazio
      if (todos.length === 0) {
        const results = await Promise.all(dates.map(date => fetchESPN(liga.id, date).then(evs => evs.map(e => ({ ...e, _date: date })))))
        todos = results.flat().filter(e => !e.status?.type?.completed)
        fonteUsada = 'ESPN'
      }
      setFonte(fonteUsada)

      // Busca xG do Understat em paralelo (só para ligas europeias)
      // Não bloqueia — se falhar usa W/D/L silenciosamente
      const understatData = await fetchUnderstatLeague(liga.id)
      setXgStatus(understatData ? 'xG⚡' : 'W/D/L')

      const cards = []
      for (const event of todos.slice(0, 30)) {
        const { home, away } = getTeamsFromEvent(event)
        if (!home || !away) continue

        const hr = parseRecord(home?.records?.[0]?.summary)
        const ar = parseRecord(away?.records?.[0]?.summary)
        const { lambdaH, lambdaA, source: lambdaSource } = calcLambdas(
          home?.team?.displayName, away?.team?.displayName, hr, ar, understatData
        )
        const poiss = poissonModel(lambdaH, lambdaA)

        const hora          = new Date(event.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const dataFormatada = new Date(event._date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })

        const bets = []
        if (poiss.over25  >= 52) bets.push({ tipo: 'Over 2.5 Gols',  prob: poiss.over25,  fairOdd: poiss.fairHome, cor: T.success, icone: 'GOL',  motivo: `λ Casa: ${lambdaH} | λ Fora: ${lambdaA} | Gols esp: ${+(lambdaH + lambdaA).toFixed(1)}` })
        if (poiss.btts    >= 50) bets.push({ tipo: 'Ambas Marcam',    prob: poiss.btts,    fairOdd: +(1/(poiss.btts/100)).toFixed(2), cor: T.accent, icone: 'BTTS', motivo: `Probabilidade Poisson: ${poiss.btts}%` })
        if (poiss.homeWin >= 55) bets.push({ tipo: `Vitória ${home.team?.shortDisplayName || home.team?.displayName}`, prob: poiss.homeWin, fairOdd: poiss.fairHome, cor: T.warning, icone: 'CASA', motivo: `Rec: ${hr.w}V-${hr.d}E-${hr.l}D | λ=${lambdaH}` })
        if (poiss.awayWin >= 45) bets.push({ tipo: `Vitória ${away.team?.shortDisplayName || away.team?.displayName}`, prob: poiss.awayWin, fairOdd: poiss.fairAway, cor: '#e040fb', icone: 'FORA', motivo: `Rec: ${ar.w}V-${ar.d}E-${ar.l}D | λ=${lambdaA}` })
        if (poiss.over15  >= 72 && !bets.find(b => b.tipo.includes('2.5'))) bets.push({ tipo: 'Over 1.5 Gols', prob: poiss.over15, fairOdd: +(1/(poiss.over15/100)).toFixed(2), cor: '#00bcd4', icone: 'GOL', motivo: `${poiss.over15}% de prob de 2+ gols via Poisson` })

        if (bets.length === 0) continue
        const sorted    = bets.sort((a, b) => b.prob - a.prob)
        const melhor    = sorted[0]
        const confianca = melhor.prob >= 65 ? 'Alta' : melhor.prob >= 55 ? 'Media' : 'Baixa'
        const confCor   = melhor.prob >= 65 ? T.success : melhor.prob >= 55 ? T.warning : T.danger

        cards.push({
          id: event.id,
          homeName: home.team?.displayName, awayName:  away.team?.displayName,
          homeShort: home.team?.shortDisplayName || home.team?.displayName,
          awayShort: away.team?.shortDisplayName || away.team?.displayName,
          homeLogo: home.team?.logo, awayLogo: away.team?.logo,
          hr, ar, data: dataFormatada, hora,
          lambdaH, lambdaA,
          bets: sorted.slice(0, 3), melhor, confianca, confCor, poiss,
          fairHome: poiss.fairHome, fairDraw: poiss.fairDraw, fairAway: poiss.fairAway,
        })
      }
      setSugestoes(cards.sort((a, b) => b.melhor.prob - a.melhor.prob))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtradas = useMemo(() => {
    if (filtro === 'todos') return sugestoes
    return sugestoes.filter(s => s.confianca.toLowerCase() === filtro)
  }, [sugestoes, filtro])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sugestões — Modelo Poisson</div>
        <div style={{ color: T.muted, fontSize: 12, marginBottom: 18, display:'flex', alignItems:'center', gap:8 }}>
          Probabilidades calculadas via Distribuição de Poisson (λ por time). Fair Odds sem margem das casas.
          {fonte && <span style={{background: fonte.includes('FotMob')?`${T.success}22`:`${T.primary}22`, color: fonte.includes('FotMob')?T.success:T.accent, border:`1px solid ${fonte.includes('FotMob')?T.success:T.primary}44`, borderRadius:6, padding:'1px 8px', fontSize:10, fontWeight:700}}>{fonte}</span>}
          {xgStatus && <span style={{background: xgStatus==='xG⚡'?`${T.warning}22`:`${T.muted}22`, color: xgStatus==='xG⚡'?T.warning:T.muted, border:`1px solid ${xgStatus==='xG⚡'?T.warning:T.muted}44`, borderRadius:6, padding:'1px 8px', fontSize:10, fontWeight:700}}>{xgStatus==='xG⚡'?'λ via xG':'λ via W/D/L'}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <Lbl>COMPETIÇÃO</Lbl>
            <UISelect value={liga.id} onChange={e => setLiga(LIGAS_ESPN.find(l => l.id === e.target.value))}>
              {LIGAS_ESPN.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </UISelect>
          </div>
          <UIButton onClick={buscarSugestoes} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
            {loading ? 'Calculando...' : 'Analisar Jogos'}
          </UIButton>
        </div>
        <div style={{ marginTop: 14, padding: '10px 14px', background: `${T.primary}11`, border: `1px solid ${T.primary}22`, borderRadius: 8, fontSize: 11, color: '#a0aec0' }}>
          <strong style={{ color: T.accent }}>Modelo Poisson:</strong> P(k;λ) = λᵏ·e⁻λ / k! — calcula a probabilidade exata de cada placar possível e agrega em Over/Under, BTTS e resultado.
          <strong style={{ color: T.warning }}> Fair Odd</strong> = odd justa sem margem da casa. Se a casa pagar acima da fair odd → <strong style={{ color: T.success }}>Value Bet</strong>.
        </div>
      </GlassCard>

      {searched && !loading && sugestoes.length === 0 && (
        <div style={{ textAlign: 'center', color: T.muted, padding: 50, background: T.card, borderRadius: 16, border: `1px solid ${T.card}` }}>
          Nenhuma partida encontrada para os próximos 7 dias nessa liga.
        </div>
      )}

      {sugestoes.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[['Alta', 'alta', T.success], ['Media', 'media', T.warning], ['Baixa', 'baixa', T.danger]].map(([lbl, val, cor]) => {
              const count = sugestoes.filter(s => s.confianca === lbl).length
              return (
                <button key={lbl} onClick={() => setFiltro(filtro === val ? 'todos' : val)}
                  style={{ background: filtro === val ? `${cor}18` : T.card, border: `1px solid ${filtro === val ? cor : cor + '33'}`, borderRadius: 14, padding: '14px 18px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}>
                  <div style={{ fontSize: 10, color: cor, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>{lbl.toUpperCase()} CONFIANÇA</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: cor, fontFamily: "'Bebas Neue',cursive" }}>{count}</div>
                </button>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filtradas.map(s => (
              <GlassCard key={s.id} glow={s.confCor} style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ padding: '18px 22px', borderBottom: `1px solid ${T.card}`, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <img src={s.homeLogo} style={{ width: 36, height: 36, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{s.homeName} <span style={{ color: T.muted, fontWeight: 400 }}>x</span> {s.awayName}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{s.data} · {s.hora} · λ={+(s.lambdaH + s.lambdaA).toFixed(2)} gols esperados</div>
                  </div>
                  <img src={s.awayLogo} style={{ width: 36, height: 36, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
                  <div style={{ background: `${s.confCor}18`, border: `1px solid ${s.confCor}44`, borderRadius: 8, padding: '5px 12px', textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: s.confCor, fontWeight: 700, letterSpacing: 1 }}>CONFIANÇA</div>
                    <div style={{ fontSize: 14, color: s.confCor, fontWeight: 900 }}>{s.confianca}</div>
                  </div>
                </div>

                {/* Probabilidades */}
                <div style={{ padding: '14px 22px', borderBottom: `1px solid ${T.card}`, background: '#0a0e1a' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                    {[
                      [s.homeShort, s.poiss.homeWin, s.fairHome, s.lambdaH, T.warning],
                      ['EMPATE',    s.poiss.draw,     s.fairDraw, null,      T.muted  ],
                      [s.awayShort, s.poiss.awayWin,  s.fairAway, s.lambdaA, T.accent ],
                    ].map(([nome, pct, fair, lambda, cor]) => (
                      <div key={nome} style={{ textAlign: 'center', background: T.surface, borderRadius: 10, padding: '10px 6px' }}>
                        <div style={{ fontSize: 10, color: cor, fontWeight: 700, marginBottom: 2 }}>{nome}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: cor, fontFamily: "'Bebas Neue',cursive" }}>{pct}%</div>
                        <div style={{ fontSize: 10, color: T.muted }}>Fair: {fair}</div>
                        {lambda && <div style={{ fontSize: 9, color: T.muted }}>λ={lambda}</div>}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[['Over 1.5', s.poiss.over15, '#00bcd4'], ['Over 2.5', s.poiss.over25, T.success], ['Over 3.5', s.poiss.over35, T.warning], ['BTTS', s.poiss.btts, T.accent]].map(([lbl, prob, cor]) => (
                      <div key={lbl} style={{ background: T.surface, borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: cor, fontWeight: 700, marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: cor, fontFamily: "'Bebas Neue',cursive" }}>{prob}%</div>
                        <div style={{ background: T.card, borderRadius: 3, height: 3, marginTop: 4 }}>
                          <div style={{ background: cor, borderRadius: 3, height: 3, width: `${prob}%` }}/>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
                    {[[s.homeShort, s.hr, 'Casa'], [s.awayShort, s.ar, 'Fora']].map(([nome, rec, tipo]) => (
                      <div key={tipo} style={{ display: 'flex', gap: 6, alignItems: 'center', background: T.surface, borderRadius: 8, padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, minWidth: 30 }}>{tipo}</span>
                        <span style={{ fontSize: 11, color: T.text, fontWeight: 700, flex: 1 }}>{nome}</span>
                        {[['V', rec.w, T.success], ['E', rec.d, T.warning], ['D', rec.l, T.danger]].map(([l, v, c]) => (
                          <span key={l} style={{ background: `${c}22`, color: c, borderRadius: 5, padding: '1px 6px', fontSize: 11, fontWeight: 800, minWidth: 22, textAlign: 'center' }}>{v}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sugestões */}
                <div style={{ padding: '14px 22px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {s.bets.map((bet, i) => (
                    <div key={i} style={{ background: T.surface, border: `1px solid ${bet.cor}22`, borderRadius: 12, padding: '12px 16px', flex: 1, minWidth: 160 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ background: `${bet.cor}22`, color: bet.cor, borderRadius: 5, padding: '2px 7px', fontSize: 9, fontWeight: 800, letterSpacing: 1 }}>{bet.icone}</span>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{bet.tipo}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.muted }}>PROBABILIDADE</div>
                          <div style={{ fontSize: 26, fontWeight: 900, color: bet.cor, fontFamily: "'Bebas Neue',cursive", lineHeight: 1 }}>{bet.prob}%</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 9, color: T.muted }}>FAIR ODD</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: T.warning, fontFamily: "'Bebas Neue',cursive", lineHeight: 1 }}>{bet.fairOdd}</div>
                        </div>
                      </div>
                      <div style={{ background: T.card, borderRadius: 4, height: 4, marginBottom: 8 }}>
                        <div style={{ background: `linear-gradient(90deg,${bet.cor}88,${bet.cor})`, borderRadius: 4, height: 4, width: `${bet.prob}%`, boxShadow: `0 0 6px ${bet.cor}55` }}/>
                      </div>
                      <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>{bet.motivo}</div>
                      <div style={{ fontSize: 10, color: '#a0aec0', padding: '4px 8px', background: T.cardInner, borderRadius: 6 }}>
                        Se a casa pagar <strong style={{ color: T.success }}>{'>'}{bet.fairOdd}</strong> → <strong style={{ color: T.success }}>Value Bet!</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>

          <div style={{ background: `${T.danger}11`, border: `1px solid ${T.danger}33`, borderRadius: 12, padding: '14px 18px' }}>
            <div style={{ fontSize: 12, color: '#ff7070', fontWeight: 700, marginBottom: 4 }}>Aviso de Responsabilidade</div>
            <div style={{ fontSize: 12, color: '#a0aec0' }}>Probabilidades calculadas via modelo Poisson com base em histórico de vitórias/empates/derrotas. Não há garantia de resultado. Aposte com responsabilidade.</div>
          </div>
        </>
      )}
    </div>
  )
}

// ===================== SCOUTS TAB =====================
function FormaRecente({ record }) {
  if (!record) return <span style={{ fontSize: 10, color: T.muted }}>--</span>
  const [w = 0, d = 0, l = 0] = record.split('-').map(Number)
  const total = w + d + l
  if (total === 0) return <span style={{ fontSize: 10, color: T.muted }}>--</span>
  const wRate = w / total, dRate = d / total
  const forma = Array.from({ length: 5 }, (_, i) => {
    const rand = ((w * 7 + d * 3 + l * 2 + i * 13) % 17) / 17
    if (rand < wRate) return 'V'
    if (rand < wRate + dRate) return 'E'
    return 'D'
  })
  const cores = { V: T.success, E: T.warning, D: '#ff4444' }
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {forma.map((f, i) => (
        <div key={i} style={{ width: 18, height: 18, borderRadius: 4, background: `${cores[f]}22`, border: `1px solid ${cores[f]}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: cores[f] }}>{f}</div>
      ))}
    </div>
  )
}

function ScoutCard({ event, ligaNome, onSelect, isSelected }) {
  const [hovered, setHovered] = useState(false)
  const { home, away } = getTeamsFromEvent(event)
  if (!home || !away) return null

  const { aoVivo, encerrado } = getEventStatus(event)
  const hora = new Date(event.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const { over25, btts, homeWin, awayWin } = calcMatchProbs(event)

  const tendencia =
    over25  >= 60 ? { label: 'Over 2.5',   cor: T.success, icone: 'GOL'  } :
    btts    >= 58 ? { label: 'BTTS',        cor: T.accent,  icone: 'BTTS' } :
    homeWin >= 60 ? { label: 'Casa Vence',  cor: T.warning, icone: 'CASA' } :
    awayWin >= 55 ? { label: 'Fora Vence',  cor: '#e040fb', icone: 'FORA' } :
                    { label: 'Indefinido',  cor: T.muted,   icone: '?'    }

  const active = isSelected || hovered

  return (
    <div onClick={() => onSelect(event)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? `linear-gradient(135deg,#141e38,#1a2440)` : `linear-gradient(135deg,${T.card},#13192a)`,
        border: `1px solid ${active ? T.primary + '55' : T.card + '88'}`,
        borderRadius: 16, padding: '18px 20px', cursor: 'pointer',
        transition: 'all 0.2s ease', position: 'relative', overflow: 'hidden',
        boxShadow: active ? `0 4px 24px ${T.primary}18` : `0 2px 8px #00000022`,
      }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${tendencia.cor}00,${tendencia.cor}88,${tendencia.cor}00)`, opacity: active ? 1 : 0.4, transition: 'opacity 0.2s' }}/>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, letterSpacing: 1 }}>{ligaNome.toUpperCase()}</span>
        {aoVivo
          ? <span style={{ background: `${T.danger}22`, color: T.dangerSoft, border: `1px solid ${T.danger}55`, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800 }}>AO VIVO</span>
          : encerrado
            ? <span style={{ fontSize: 11, color: T.muted }}>Encerrado</span>
            : <span style={{ fontSize: 13, fontWeight: 700, color: T.warning }}>{hora}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img src={home.team?.logo} style={{ width: 32, height: 32, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{home.team?.displayName}</div>
              <div style={{ fontSize: 10, color: T.muted }}>{parseRecord(home.records?.[0]?.summary).w}V {parseRecord(home.records?.[0]?.summary).d}E {parseRecord(home.records?.[0]?.summary).l}D</div>
            </div>
          </div>
          <FormaRecente record={home.records?.[0]?.summary}/>
        </div>

        <div style={{ textAlign: 'center', minWidth: 48 }}>
          {(aoVivo || encerrado) && home.score !== undefined
            ? <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "'Bebas Neue',cursive", letterSpacing: 2, color: aoVivo ? T.text : T.muted }}>{home.score}<span style={{ color: T.border }}> - </span>{away.score}</div>
            : <div style={{ fontSize: 14, fontWeight: 700, color: T.border }}>VS</div>}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexDirection: 'row-reverse' }}>
            <img src={away.team?.logo} style={{ width: 32, height: 32, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{away.team?.displayName}</div>
              <div style={{ fontSize: 10, color: T.muted }}>{parseRecord(away.records?.[0]?.summary).w}V {parseRecord(away.records?.[0]?.summary).d}E {parseRecord(away.records?.[0]?.summary).l}D</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><FormaRecente record={away.records?.[0]?.summary}/></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${T.card}55`, paddingTop: 12 }}>
        {[['OVER 2.5', over25, over25 >= 60 ? T.success : over25 >= 50 ? T.warning : T.danger],
          ['BTTS',     btts,   btts   >= 60 ? T.accent  : btts   >= 50 ? T.warning : T.muted ],
          ['CASA',     homeWin, T.warning],
          ['FORA',     awayWin, T.accent ],
        ].map(([lbl, val, cor]) => (
          <div key={lbl} style={{ flex: 1, textAlign: 'center', background: `${T.surface}88`, borderRadius: 8, padding: '7px 4px' }}>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>{lbl}</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: cor, fontFamily: "'Bebas Neue',cursive" }}>{val}%</div>
          </div>
        ))}
        <div style={{ flex: 1.5, textAlign: 'center', background: `${tendencia.cor}11`, border: `1px solid ${tendencia.cor}33`, borderRadius: 8, padding: '7px 4px' }}>
          <div style={{ fontSize: 9, color: T.muted, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>TENDÊNCIA</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: tendencia.cor }}>{tendencia.label}</div>
        </div>
      </div>
    </div>
  )
}

function ScoutsTab() {
  const [liga,     setLiga]     = useState(LIGAS_ESPN[0])
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [events,   setEvents]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState(null)
  const [searched, setSearched] = useState(false)
  const [fonteSc,     setFonteSc]     = useState('')
  const [cartolaData, setCartolaData] = useState(null)

  async function buscar() {
    setLoading(true); setSearched(true); setSelected(null)
    setFonteSc('...')
    try {
      // Para ligas brasileiras: tenta Cartola FC primeiro (dados mais ricos para BR)
      const isBrasil = ['bra.1','bra.2'].includes(liga.id)
      if (isBrasil) {
        const cartola = await fetchCartolaParts()
        if (cartola?.partidas?.length) {
          // Filtra partidas da data selecionada
          const dataFiltro = date
          const partidasDia = cartola.partidas.filter(p => p.data?.slice(0,10) === dataFiltro)
          const fonte = partidasDia.length > 0 ? partidasDia : cartola.partidas

          const adapted = fonte.map(p => ({
            id: p.id,
            _cartola: p,
            date: p.data,
            status: {
              type: {
                completed: p.placar_casa !== null && !p.ao_vivo,
                name: p.ao_vivo ? 'STATUS_IN_PROGRESS' : p.placar_casa !== null ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
              }
            },
            competitions: [{
              competitors: [
                {
                  homeAway: 'home',
                  score: p.placar_casa,
                  team: { displayName: p.clube_casa?.nome, shortDisplayName: p.clube_casa?.abrev, logo: p.clube_casa?.escudo },
                  records: [{ summary: null }],
                },
                {
                  homeAway: 'away',
                  score: p.placar_fora,
                  team: { displayName: p.clube_fora?.nome, shortDisplayName: p.clube_fora?.abrev, logo: p.clube_fora?.escudo },
                  records: [{ summary: null }],
                },
              ]
            }]
          }))
          setEvents(adapted)
          setFonteSc('Cartola FC 🇧🇷')
          setLoading(false)
          return
        }
      }

      // Tenta FotMob primeiro
      const fotmobMatches = await fetchFotMobLeague(liga.id, date)
      if (fotmobMatches.length > 0) {
        // Adapta FotMob → formato compatível com ScoutCard
        const adapted = fotmobMatches.map(m => ({
          id: m.id,
          _fotmob: m,
          date: m.status?.utcTime,
          status: {
            type: {
              completed: m.status?.finished,
              name: m.status?.started ? 'STATUS_IN_PROGRESS' : 'STATUS_SCHEDULED',
            }
          },
          competitions: [{
            competitors: [
              {
                homeAway: 'home',
                score: m.home?.score,
                team: {
                  displayName: m.home?.name,
                  shortDisplayName: m.home?.shortName,
                  logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.home?.id}_small.png`,
                },
                records: [{ summary: m.home?.stats?.seasonRecord || null }],
              },
              {
                homeAway: 'away',
                score: m.away?.score,
                team: {
                  displayName: m.away?.name,
                  shortDisplayName: m.away?.shortName,
                  logo: `https://images.fotmob.com/image_resources/logo/teamlogo/${m.away?.id}_small.png`,
                },
                records: [{ summary: m.away?.stats?.seasonRecord || null }],
              },
            ]
          }]
        }))
        setEvents(adapted)
        setFonteSc('FotMob ⚡')
      } else {
        // Fallback ESPN
        setEvents(await fetchESPN(liga.id, date))
        setFonteSc('ESPN')
      }
    } catch {
      try { setEvents(await fetchESPN(liga.id, date)); setFonteSc('ESPN') } catch { setEvents([]) }
    }
    setLoading(false)
  }

  function handleSelect(event) {
    setSelected(s => s?.id === event.id ? null : event)
    setTimeout(() => document.getElementById('scout-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
  }

  const aoVivoCount = events.filter(e => e.status?.type?.name === 'STATUS_IN_PROGRESS').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Scouts de Partidas</div>
              {fonteSc && <span style={{background:fonteSc.includes('FotMob')?`${T.success}22`:`${T.primary}22`,color:fonteSc.includes('FotMob')?T.success:T.accent,border:`1px solid ${fonteSc.includes('FotMob')?T.success:T.primary}44`,borderRadius:6,padding:'1px 8px',fontSize:10,fontWeight:700}}>{fonteSc}</span>}
            </div>
            {aoVivoCount > 0 && <div style={{ fontSize: 11, color: T.dangerSoft, fontWeight: 700, marginTop: 2 }}>{aoVivoCount} partida(s) ao vivo</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end' }}>
          <div>
            <Lbl>COMPETIÇÃO</Lbl>
            <UISelect value={liga.id} onChange={e => setLiga(LIGAS_ESPN.find(l => l.id === e.target.value))}>
              {LIGAS_ESPN.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </UISelect>
          </div>
          <div>
            <Lbl>DATA</Lbl>
            <UIInput type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: 150 }}/>
          </div>
          <UIButton onClick={buscar} disabled={loading}>
            {loading ? 'Buscando...' : 'Buscar'}
          </UIButton>
        </div>
      </GlassCard>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ background: T.card, borderRadius: 16, padding: '18px 20px', opacity: 0.5 }}>
              <div style={{ height: 12, background: T.card, borderRadius: 6, width: '40%', marginBottom: 14 }}/>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, marginBottom: 14 }}>
                <div style={{ height: 32, background: T.card, borderRadius: 8 }}/>
                <div style={{ height: 32, width: 48, background: T.card, borderRadius: 8 }}/>
                <div style={{ height: 32, background: T.card, borderRadius: 8 }}/>
              </div>
              <div style={{ height: 40, background: T.card, borderRadius: 8 }}/>
            </div>
          ))}
        </div>
      )}

      {searched && !loading && events.length === 0 && (
        <div style={{ textAlign: 'center', color: T.muted, padding: 50, background: T.card, borderRadius: 16 }}>Nenhuma partida encontrada para esta data.</div>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(event => <ScoutCard key={event.id} event={event} ligaNome={liga.nome} onSelect={handleSelect} isSelected={selected?.id === event.id}/>)}
        </div>
      )}

      {selected && (() => {
        const { home, away } = getTeamsFromEvent(selected)
        if (!home || !away) return null
        const probs   = calcMatchProbs(selected)
        const { aoVivo } = getEventStatus(selected)

        const g = (stats, name) => stats?.find(s => s.name === name)?.displayValue || '0'
        const hs = { shots: g(home?.statistics, 'shotsOnTarget'), possession: g(home?.statistics, 'possessionPct'), fouls: g(home?.statistics, 'fouls'), corners: g(home?.statistics, 'cornerKicks'), yellow: g(home?.statistics, 'yellowCards') }
        const as = { shots: g(away?.statistics, 'shotsOnTarget'), possession: g(away?.statistics, 'possessionPct'), fouls: g(away?.statistics, 'fouls'), corners: g(away?.statistics, 'cornerKicks'), yellow: g(away?.statistics, 'yellowCards') }

        return (
          <div id="scout-detail" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <GlassCard glow={T.primary}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <img src={home.team?.logo} style={{ width: 52, height: 52, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  {aoVivo && <div style={{ fontSize: 42, fontWeight: 900, letterSpacing: 4, fontFamily: "'Bebas Neue',cursive" }}>{home.score} - {away.score}</div>}
                  <div style={{ fontSize: 17, fontWeight: 800, marginTop: aoVivo ? 4 : 0 }}>{home.team?.displayName} x {away.team?.displayName}</div>
                  <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{liga.nome}</div>
                  {aoVivo && <span style={{ background: `${T.danger}22`, color: T.dangerSoft, border: `1px solid ${T.danger}44`, borderRadius: 5, padding: '2px 10px', fontSize: 11, fontWeight: 700, marginTop: 6, display: 'inline-block' }}>AO VIVO</span>}
                </div>
                <img src={away.team?.logo} style={{ width: 52, height: 52, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: T.accent, letterSpacing: 1 }}>PROBABILIDADES</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20 }}>
                <div>
                  <ProbBar label={`Vitória ${home.team?.shortDisplayName || home.team?.displayName}`} value={probs.homeWin} color={T.success}/>
                  <ProbBar label="Empate" value={probs.draw} color={T.warning}/>
                  <ProbBar label={`Vitória ${away.team?.shortDisplayName || away.team?.displayName}`} value={probs.awayWin} color={T.dangerSoft}/>
                </div>
                <div>
                  <ProbBar label="Over 2.5 gols" value={probs.over25} color={T.accent}/>
                  <ProbBar label="Over 1.5 gols" value={probs.over15} color="#00bcd4"/>
                  <ProbBar label="Ambas marcam"  value={probs.btts}   color="#e040fb"/>
                </div>
              </div>
            </GlassCard>

            {hs.shots !== '0' || hs.possession !== '0' ? (
              <GlassCard>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, color: T.accent, letterSpacing: 1 }}>ESTATÍSTICAS DA PARTIDA</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{home.team?.shortDisplayName || home.team?.displayName}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.dangerSoft }}>{away.team?.shortDisplayName || away.team?.displayName}</span>
                </div>
                {[['Chutes no Alvo', hs.shots, as.shots], ['Posse de Bola %', hs.possession, as.possession], ['Faltas', hs.fouls, as.fouls], ['Escanteios', hs.corners, as.corners], ['Cartões Amarelos', hs.yellow, as.yellow]].map(([label, h, a]) => {
                  const hv = parseFloat(h) || 0, av = parseFloat(a) || 0, total = hv + av || 1
                  return (
                    <div key={label} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>{h}</span>
                        <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: T.dangerSoft }}>{a}</span>
                      </div>
                      <div style={{ background: T.card, borderRadius: 6, height: 6, display: 'flex', overflow: 'hidden' }}>
                        <div style={{ background: `linear-gradient(90deg,${T.primary},${T.accent})`, width: `${Math.round(hv / total * 100)}%`, transition: 'width 0.5s' }}/>
                        <div style={{ background: `linear-gradient(90deg,${T.dangerSoft},${T.danger})`, flex: 1 }}/>
                      </div>
                    </div>
                  )
                })}
              </GlassCard>
            ) : null}
          </div>
        )
      })()}
    </div>
  )
}

// ===================== MATCH SEARCH =====================
function MatchSearch({ onSelect }) {
  const [open,     setOpen]     = useState(false)
  const [liga,     setLiga]     = useState(LIGAS_ESPN[0])
  const [date,     setDate]     = useState(new Date().toISOString().slice(0, 10))
  const [events,   setEvents]   = useState([])
  const [loading,  setLoading]  = useState(false)
  const [searched, setSearched] = useState(false)

  async function buscar() {
    setLoading(true); setSearched(true)
    try { setEvents(await fetchESPN(liga.id, date)) } catch { setEvents([]) }
    setLoading(false)
  }

  function sel(event) {
    const { home, away } = getTeamsFromEvent(event)
    onSelect({ evento: `${home?.team?.displayName || ''} x ${away?.team?.displayName || ''}`, esporte: 'Futebol', data: date, mercado: liga.nome })
    setOpen(false)
  }

  return (
    <div style={{ gridColumn: '1 / -1', marginBottom: 4 }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', background: '#1a2540', border: `1px solid ${T.primary}44`, color: T.accent, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
        Buscar partida para preencher automaticamente
        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.muted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, marginBottom: 10, alignItems: 'end' }}>
            <div>
              <Lbl>COMPETIÇÃO</Lbl>
              <UISelect value={liga.id} onChange={e => setLiga(LIGAS_ESPN.find(l => l.id === e.target.value))} style={{ fontSize: 12 }}>
                {LIGAS_ESPN.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </UISelect>
            </div>
            <div>
              <Lbl>DATA</Lbl>
              <UIInput type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: 12, width: 140 }}/>
            </div>
            <UIButton type="button" onClick={buscar} disabled={loading} style={{ padding: '9px 16px', fontSize: 12, whiteSpace: 'nowrap' }}>
              {loading ? '...' : 'Buscar'}
            </UIButton>
          </div>
          {searched && !loading && events.length === 0 && <div style={{ textAlign: 'center', color: T.muted, padding: 16, fontSize: 13 }}>Nenhuma partida.</div>}
          {events.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {events.map(event => {
                const { home, away } = getTeamsFromEvent(event)
                return (
                  <button type="button" key={event.id} onClick={() => sel(event)}
                    style={{ background: T.cardInner, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.primary}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <img src={home?.team?.logo} style={{ width: 22, height: 22, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
                    <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{home?.team?.displayName} x {away?.team?.displayName}</div>
                    <img src={away?.team?.logo} style={{ width: 22, height: 22, objectFit: 'contain' }} alt="" onError={e => e.target.style.display = 'none'}/>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ===================== INTELIGÊNCIA TAB =====================
function InteligenciaTab({ bets }) {
  const tt = { background: T.cardInner, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12 }
  const finalizadas = useMemo(() => bets.filter(b => b.status !== 'pendente'), [bets])

  const porMercado = useMemo(() => {
    const map = {}
    finalizadas.forEach(b => {
      const m = b.mercado || 'Sem mercado'
      if (!map[m]) map[m] = { ganhou: 0, total: 0, lucro: 0, invested: 0 }
      map[m].total++; map[m].invested += safeNum(b.valor)
      if (b.status === 'ganhou') { map[m].ganhou++; map[m].lucro += safeNum(b.retorno) - safeNum(b.valor) }
      else map[m].lucro -= safeNum(b.valor)
    })
    return Object.entries(map).map(([name, v]) => ({
      name, total: v.total,
      winrate: +((v.ganhou / v.total) * 100).toFixed(0),
      lucro:   +v.lucro.toFixed(2),
      roi:     v.invested ? +(v.lucro / v.invested * 100).toFixed(1) : 0,
    })).sort((a, b) => b.roi - a.roi)
  }, [finalizadas])

  const porOddRange = useMemo(() => {
    const ranges = [
      { label: '1.01-1.50', min: 1.01, max: 1.50 }, { label: '1.51-2.00', min: 1.51, max: 2.00 },
      { label: '2.01-3.00', min: 2.01, max: 3.00 }, { label: '3.01-5.00', min: 3.01, max: 5.00 },
      { label: '5.01+',     min: 5.01, max: 999  },
    ]
    return ranges.map(r => {
      const bts      = finalizadas.filter(b => b.odd >= r.min && b.odd <= r.max)
      const won      = bts.filter(b => b.status === 'ganhou')
      const invested = bts.reduce((s, b) => s + safeNum(b.valor), 0)
      const returned = won.reduce((s, b) => s + safeNum(b.retorno), 0)
      const lucro    = returned - invested
      return { name: r.label, total: bts.length, winrate: bts.length ? +((won.length / bts.length) * 100).toFixed(0) : 0, lucro: +lucro.toFixed(2), roi: invested ? +(lucro / invested * 100).toFixed(1) : 0 }
    }).filter(r => r.total > 0)
  }, [finalizadas])

  const porDia = useMemo(() => {
    const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']
    const map  = {}
    finalizadas.forEach(b => {
      const d   = new Date(b.data + 'T12:00:00').getDay()
      const lbl = dias[d]
      if (!map[lbl]) map[lbl] = { ganhou: 0, total: 0, lucro: 0 }
      map[lbl].total++
      if (b.status === 'ganhou') { map[lbl].ganhou++; map[lbl].lucro += safeNum(b.retorno) - safeNum(b.valor) }
      else map[lbl].lucro -= safeNum(b.valor)
    })
    return dias.map(d => ({ name: d, ...(map[d] || { ganhou: 0, total: 0, lucro: 0 }) }))
  }, [finalizadas])

  const insights = useMemo(() => {
    if (finalizadas.length < 5) return [{ tipo: 'info', msg: 'Registre pelo menos 5 apostas finalizadas para ver insights personalizados.' }]
    const res = []
    const melhorMercado = [...porMercado].filter(m => m.total >= 2).sort((a, b) => b.roi - a.roi)[0]
    if (melhorMercado?.roi > 0)   res.push({ tipo: 'positivo', msg: `Seu melhor mercado é "${melhorMercado.name}" com ROI de ${melhorMercado.roi}%. Foque mais nele.` })
    const piorMercado = [...porMercado].filter(m => m.total >= 2).sort((a, b) => a.roi - b.roi)[0]
    if (piorMercado?.roi < -10)   res.push({ tipo: 'negativo', msg: `Evite o mercado "${piorMercado.name}" com ROI de ${piorMercado.roi}%.` })
    const melhorOdd = [...porOddRange].filter(o => o.total >= 3).sort((a, b) => b.roi - a.roi)[0]
    if (melhorOdd?.roi > 0)       res.push({ tipo: 'positivo', msg: `Odds ${melhorOdd.name} são as mais lucrativas (ROI ${melhorOdd.roi}%).` })
    const wr = (finalizadas.filter(b => b.status === 'ganhou').length / finalizadas.length * 100).toFixed(0)
    if (wr < 40)   res.push({ tipo: 'negativo', msg: `Taxa de acerto em ${wr}%. Seja mais seletivo.` })
    else if (wr > 60) res.push({ tipo: 'positivo', msg: `Taxa de acerto de ${wr}%! Acima da média.` })
    const melhorDia = porDia.filter(d => d.total >= 2).sort((a, b) => b.lucro - a.lucro)[0]
    if (melhorDia?.lucro > 0)    res.push({ tipo: 'positivo', msg: `${melhorDia.name} é seu dia mais lucrativo.` })
    return res.length ? res : [{ tipo: 'info', msg: 'Continue registrando apostas para insights mais precisos.' }]
  }, [finalizadas, porMercado, porOddRange, porDia])

  const insightColors = { positivo: T.success, negativo: T.danger, alerta: T.warning, info: T.accent }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Insights do seu Histórico</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {insights.map((ins, i) => (
            <div key={i} style={{ background: `${insightColors[ins.tipo]}11`, border: `1px solid ${insightColors[ins.tipo]}33`, borderRadius: 10, padding: '12px 16px' }}>
              <span style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{ins.msg}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {porMercado.length > 0 && (
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>ROI por Mercado</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {porMercado.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.surface, borderRadius: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.chart[i % T.chart.length] }}/>
                <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>{m.total} ap.</div>
                <div style={{ fontSize: 12, color: T.warning, width: 44, textAlign: 'right' }}>{m.winrate}%</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.roi >= 0 ? T.success : T.danger, width: 70, textAlign: 'right' }}>ROI {m.roi}%</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: m.lucro >= 0 ? T.success : T.danger, width: 90, textAlign: 'right' }}>R$ {m.lucro}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {porOddRange.length > 0 && (
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Performance por Faixa de Odd</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porOddRange}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.card}/>
              <XAxis dataKey="name" stroke={T.muted} fontSize={11}/>
              <YAxis stroke={T.muted} fontSize={11} tickFormatter={v => `${v}%`}/>
              <Tooltip contentStyle={tt} formatter={(v, n) => n === 'roi' ? [`${v}%`, 'ROI'] : [`${v}%`, 'Winrate']}/>
              <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                {porOddRange.map((e, i) => <Cell key={i} fill={e.roi >= 0 ? T.success : T.danger}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      )}

      <GlassCard>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Lucro por Dia da Semana</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={porDia}>
            <CartesianGrid strokeDasharray="3 3" stroke={T.card}/>
            <XAxis dataKey="name" stroke={T.muted} fontSize={12}/>
            <YAxis stroke={T.muted} fontSize={11} tickFormatter={v => `R$${v}`}/>
            <Tooltip contentStyle={tt} formatter={v => [`R$ ${v}`, 'Lucro']}/>
            <Bar dataKey="lucro" radius={[4, 4, 0, 0]}>
              {porDia.map((e, i) => <Cell key={i} fill={e.lucro >= 0 ? T.success : T.danger}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>
    </div>
  )
}

// ===================== ANALYTICS TAB =====================
function Analytics({ bets }) {
  const tt = { background: T.cardInner, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, fontSize: 12 }

  const bankrollData = useMemo(() => {
    const sorted = [...bets].filter(b => b.status !== 'pendente').sort((a, b) => a.data.localeCompare(b.data))
    let bal = 0
    return sorted.map(b => {
      const l = b.status === 'ganhou' ? b.retorno - b.valor : -b.valor
      bal += l
      return { data: b.data.slice(5), lucro: +bal.toFixed(2) }
    })
  }, [bets])

  const byEsporte = useMemo(() => {
    const map = {}
    bets.filter(b => b.status !== 'pendente').forEach(b => {
      const e = b.esporte || 'Outros'
      if (!map[e]) map[e] = { ganhou: 0, perdeu: 0, lucro: 0 }
      if (b.status === 'ganhou') { map[e].ganhou++; map[e].lucro += safeNum(b.retorno) - safeNum(b.valor) }
      else { map[e].perdeu++; map[e].lucro -= safeNum(b.valor) }
    })
    return Object.entries(map).map(([name, v]) => ({ name, ...v, lucro: +v.lucro.toFixed(2) }))
  }, [bets])

  const byCasa = useMemo(() => {
    const map = {}
    bets.filter(b => b.status !== 'pendente').forEach(b => {
      const c = b.casa || 'Outra'
      if (!map[c]) map[c] = { total: 0, ganhou: 0, lucro: 0 }
      map[c].total++
      if (b.status === 'ganhou') { map[c].ganhou++; map[c].lucro += safeNum(b.retorno) - safeNum(b.valor) }
      else map[c].lucro -= safeNum(b.valor)
    })
    return Object.entries(map).map(([name, v]) => ({ name, winrate: +((v.ganhou / v.total) * 100).toFixed(0), lucro: +v.lucro.toFixed(2), total: v.total }))
  }, [bets])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <GlassCard>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Evolução do Bankroll</div>
        {bankrollData.length < 2
          ? <div style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Registre mais apostas finalizadas</div>
          : <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={bankrollData}>
                <defs>
                  <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={T.success} stopOpacity={0.25}/>
                    <stop offset="95%" stopColor={T.success} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={T.card}/>
                <XAxis dataKey="data" stroke={T.muted} fontSize={11}/>
                <YAxis stroke={T.muted} fontSize={11} tickFormatter={v => `R$${v}`}/>
                <Tooltip contentStyle={tt} formatter={v => [`R$ ${v}`, 'Saldo']}/>
                <Area type="monotone" dataKey="lucro" stroke={T.success} strokeWidth={2.5} fill="url(#ag)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>}
      </GlassCard>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Lucro por Esporte</div>
          {byEsporte.length === 0
            ? <div style={{ color: T.muted, textAlign: 'center', padding: 30 }}>Sem dados</div>
            : <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byEsporte} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={T.card}/>
                  <XAxis type="number" stroke={T.muted} fontSize={11} tickFormatter={v => `R$${v}`}/>
                  <YAxis dataKey="name" type="category" stroke={T.muted} fontSize={11} width={70}/>
                  <Tooltip contentStyle={tt} formatter={v => [`R$ ${v}`, 'Lucro']}/>
                  <Bar dataKey="lucro" radius={[0, 4, 4, 0]}>
                    {byEsporte.map((e, i) => <Cell key={i} fill={e.lucro >= 0 ? T.success : T.danger}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
        </GlassCard>

        <GlassCard>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Performance por Casa</div>
          {byCasa.length === 0
            ? <div style={{ color: T.muted, textAlign: 'center', padding: 30 }}>Sem dados</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {byCasa.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: T.surface, borderRadius: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.chart[i % T.chart.length] }}/>
                    <div style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{c.total} ap.</div>
                    <div style={{ fontSize: 12, color: T.warning, width: 40, textAlign: 'right' }}>{c.winrate}%</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: c.lucro >= 0 ? T.success : T.danger, width: 80, textAlign: 'right' }}>R$ {c.lucro}</div>
                  </div>
                ))}
              </div>}
        </GlassCard>
      </div>
    </div>
  )
}

// ===================== BANKROLL TAB =====================
function Bankroll({ bets, userId }) {
  const [config,  setConfig]  = useState({ bankroll_inicial: 1000, stop_loss_percent: 20 })
  const [editing, setEditing] = useState(false)
  const [form,    setForm]    = useState(config)
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    supabase.from('user_config').select('*').eq('user_id', userId).single()
      .then(({ data }) => { if (data) { setConfig(data); setForm(data) } })
  }, [userId])

  async function saveConfig() {
    setSaving(true)
    await supabase.from('user_config').upsert({ ...form, user_id: userId, updated_at: new Date().toISOString() })
    setConfig(form); setEditing(false); setSaving(false)
    showToast('Configurações salvas!')
  }

  const stats = useMemo(() => {
    const won  = bets.filter(b => b.status === 'ganhou')
    const lost = bets.filter(b => b.status === 'perdeu')
    const lucroTotal = won.reduce((s, b) => s + (safeNum(b.retorno) - safeNum(b.valor)), 0) - lost.reduce((s, b) => s + safeNum(b.valor), 0)
    const saldoAtual = safeNum(config.bankroll_inicial) + lucroTotal
    const stopLossVal = safeNum(config.bankroll_inicial) * (safeNum(config.stop_loss_percent) / 100)
    const emRisco = lucroTotal < 0 && Math.abs(lucroTotal) >= stopLossVal * 0.7
    return { lucroTotal, saldoAtual, stopLossVal, emRisco, pct: ((lucroTotal / safeNum(config.bankroll_inicial, 1)) * 100).toFixed(1) }
  }, [bets, config])

  const kelly = useMemo(() => {
    const fin = bets.filter(b => b.status !== 'pendente')
    if (fin.length < 5) return null
    const p = bets.filter(b => b.status === 'ganhou').length / fin.length
    const avgOdd = fin.reduce((s, b) => s + safeNum(b.odd), 0) / fin.length
    const b = avgOdd - 1
    const kf = (b * p - (1 - p)) / b
    return { kf: (kf * 100).toFixed(1), val: Math.max(0, kf * safeNum(config.bankroll_inicial)).toFixed(2) }
  }, [bets, config])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {stats.emRisco && (
        <div style={{ background: `${T.danger}22`, border: `1px solid ${T.danger}66`, borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div>
            <div style={{ color: T.dangerSoft, fontWeight: 700, fontSize: 15 }}>Atenção ao Stop Loss!</div>
            <div style={{ color: '#ff7070', fontSize: 13, marginTop: 2 }}>Você está próximo ao limite de perda (R$ {stats.stopLossVal.toFixed(2)})</div>
          </div>
        </div>
      )}

      <GlassCard>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>Situação do Bankroll</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
          <StatCard label="Bankroll Inicial"  value={`R$ ${Number(config.bankroll_inicial).toFixed(2)}`}  color={T.accent}/>
          <StatCard label="Saldo Atual"        value={`R$ ${stats.saldoAtual.toFixed(2)}`}                 color={stats.saldoAtual >= safeNum(config.bankroll_inicial) ? T.success : T.danger}/>
          <StatCard label="Resultado Total"    value={`R$ ${stats.lucroTotal.toFixed(2)}`}                 color={stats.lucroTotal >= 0 ? T.success : T.danger}/>
          <StatCard label="Variação"           value={`${stats.pct}%`}                                     color={parseFloat(stats.pct) >= 0 ? T.success : T.danger}/>
        </div>
      </GlassCard>

      {kelly && (
        <GlassCard glow={T.warning}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Critério de Kelly</div>
          <div style={{ color: T.muted, fontSize: 12, marginBottom: 14 }}>Baseado no seu histórico</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>% DO BANKROLL</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: T.warning, fontFamily: "'Bebas Neue',cursive" }}>{kelly.kf}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4 }}>VALOR SUGERIDO</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: T.warning, fontFamily: "'Bebas Neue',cursive" }}>R$ {kelly.val}</div>
            </div>
          </div>
          <div style={{ color: T.muted, fontSize: 11, marginTop: 10 }}>Sugestão teórica. Nunca aposte mais do que pode perder.</div>
        </GlassCard>
      )}

      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Configurações</div>
          {!editing && <UIButton variant="ghost" onClick={() => setEditing(true)} style={{ fontSize: 12, padding: '6px 14px' }}>Editar</UIButton>}
        </div>
        {editing ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <div><Lbl>BANKROLL INICIAL (R$)</Lbl><UIInput type="number" value={form.bankroll_inicial} onChange={e => setForm(f => ({ ...f, bankroll_inicial: e.target.value }))}/></div>
            <div><Lbl>STOP LOSS (%)</Lbl><UIInput type="number" value={form.stop_loss_percent} onChange={e => setForm(f => ({ ...f, stop_loss_percent: e.target.value }))} min="1" max="100"/></div>
            <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
              <UIButton variant="muted" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancelar</UIButton>
              <UIButton onClick={saveConfig} disabled={saving} style={{ flex: 2 }}>{saving ? 'Salvando...' : 'Salvar'}</UIButton>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontSize: 11, color: T.muted }}>BANKROLL INICIAL</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 3 }}>R$ {Number(config.bankroll_inicial).toFixed(2)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.muted }}>STOP LOSS</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.dangerSoft, marginTop: 3 }}>{config.stop_loss_percent}% = R$ {stats.stopLossVal.toFixed(2)}</div>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  )
}

// ===================== BET FORM =====================
function BetForm({ editData, userId, onSave, onClose }) {
  const [saving, setSaving] = useState(false)
  const [erro,   setErro]   = useState('')
  const [form,   setForm]   = useState({
    data:       editData?.data       ?? new Date().toISOString().slice(0, 10),
    evento:     editData?.evento     ?? '',
    esporte:    editData?.esporte    ?? 'Futebol',
    mercado:    editData?.mercado    ?? '',
    selecao:    editData?.selecao    ?? '',
    casa:       editData?.casa       ?? 'Bet365',
    tipo:       editData?.tipo       ?? 'simples',
    odd:        editData?.odd        ?? '',
    valor:      editData?.valor      ?? '',
    status:     editData?.status     ?? 'pendente',
    observacao: editData?.observacao ?? '',
  })

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function preencherPartida({ evento, esporte, data, mercado }) {
    setForm(p => ({ ...p, evento, esporte, data, mercado }))
  }

  const retornoPreview = (safeNum(form.odd) * safeNum(form.valor)).toFixed(2)
  const lucroPreview   = (safeNum(form.odd) * safeNum(form.valor) - safeNum(form.valor)).toFixed(2)

  async function handleSave() {
    setErro('')
    if (!form.evento)                                  return setErro('Preencha o Evento')
    if (!safeNum(form.odd) || safeNum(form.odd) <= 1)  return setErro('Odd deve ser maior que 1')
    if (!safeNum(form.valor) || safeNum(form.valor) <= 0) return setErro('Valor deve ser maior que 0')

    setSaving(true)
    const odd    = safeNum(form.odd)
    const valor  = safeNum(form.valor)
    const retorno = form.status === 'ganhou' ? +(odd * valor).toFixed(2) : form.status === 'perdeu' ? 0 : null
    const payload = { ...form, odd, valor, retorno, user_id: userId }

    if (editData?.id) await supabase.from('apostas').update(payload).eq('id', editData.id)
    else              await supabase.from('apostas').insert(payload)

    setSaving(false)
    showToast(editData?.id ? 'Aposta atualizada!' : 'Aposta registrada!')
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(6px)', padding: 16 }}>
      <div style={{ background: `linear-gradient(135deg,${T.cardInner},${T.card})`, border: `1px solid ${T.border}`, borderRadius: 20, padding: 28, width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px #00000066' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{editData?.id ? 'Editar Aposta' : 'Nova Aposta'}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: T.muted, cursor: 'pointer', fontSize: 22, lineHeight: 1 }}>×</button>
        </div>

        {!editData?.id && <MatchSearch onSelect={preencherPartida}/>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 13, marginTop: 12 }}>
          <div><Lbl>DATA</Lbl>         <UIInput type="date" value={form.data}    onChange={e => upd('data', e.target.value)}/></div>
          <div><Lbl>STATUS</Lbl>       <UISelect value={form.status}             onChange={e => upd('status', e.target.value)}><option>pendente</option><option>ganhou</option><option>perdeu</option></UISelect></div>
          <div style={{ gridColumn: '1 / -1' }}><Lbl>EVENTO / JOGO</Lbl><UIInput type="text" value={form.evento} onChange={e => upd('evento', e.target.value)} placeholder="Ex: Flamengo x Palmeiras"/></div>
          <div><Lbl>ESPORTE</Lbl>      <UISelect value={form.esporte}            onChange={e => upd('esporte', e.target.value)}>{ESPORTES.map(o => <option key={o}>{o}</option>)}</UISelect></div>
          <div><Lbl>CASA</Lbl>         <UISelect value={form.casa}               onChange={e => upd('casa', e.target.value)}>{CASAS.map(o => <option key={o}>{o}</option>)}</UISelect></div>
          <div><Lbl>TIPO</Lbl>         <UISelect value={form.tipo}               onChange={e => upd('tipo', e.target.value)}><option>simples</option><option>multipla</option><option>ao vivo</option></UISelect></div>
          <div><Lbl>MERCADO</Lbl>      <UIInput type="text" value={form.mercado} onChange={e => upd('mercado', e.target.value)} placeholder="Ex: Over 2.5"/></div>
          <div style={{ gridColumn: '1 / -1' }}><Lbl>SELEÇÃO</Lbl><UIInput type="text" value={form.selecao} onChange={e => upd('selecao', e.target.value)} placeholder="Ex: Flamengo vence"/></div>
          <div><Lbl>ODD</Lbl>          <UIInput type="number" step="0.01" min="1.01" value={form.odd}   onChange={e => upd('odd', e.target.value)}   style={{ color: T.warning, fontWeight: 700, fontSize: 16 }}/></div>
          <div><Lbl>VALOR (R$)</Lbl>   <UIInput type="number" step="0.01" min="0.01" value={form.valor} onChange={e => upd('valor', e.target.value)}/></div>
          <div style={{ gridColumn: '1 / -1' }}><Lbl>OBSERVAÇÃO</Lbl><UIInput type="text" value={form.observacao} onChange={e => upd('observacao', e.target.value)}/></div>
        </div>

        {safeNum(form.odd) > 1 && safeNum(form.valor) > 0 && (
          <div style={{ marginTop: 14, padding: '12px 16px', background: T.cardInner, border: `1px solid ${T.primary}33`, borderRadius: 10, display: 'flex', gap: 20, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>RETORNO POTENCIAL</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.accent, fontFamily: "'Bebas Neue',cursive" }}>R$ {retornoPreview}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>LUCRO POTENCIAL</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: safeNum(lucroPreview) >= 0 ? T.success : T.dangerSoft, fontFamily: "'Bebas Neue',cursive" }}>R$ {lucroPreview}</div>
            </div>
          </div>
        )}

        {erro && <div style={{ marginTop: 10, color: '#ff7070', fontSize: 12, padding: '8px 12px', background: `${T.danger}11`, borderRadius: 8, fontWeight: 600 }}>{erro}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <UIButton variant="muted" onClick={onClose} style={{ flex: 1 }}>Cancelar</UIButton>
          <UIButton onClick={handleSave} disabled={saving} style={{ flex: 2, opacity: saving ? 0.7 : 1, transition: 'all 0.2s' }}>
            {saving ? 'Salvando...' : 'Salvar Aposta'}
          </UIButton>
        </div>
      </div>
    </div>
  )
}

// ===================== APOSTAS TAB =====================
function ApostasTab({ bets, userId, onRefresh }) {
  const [filter,     setFilter]     = useState('todos')
  const [search,     setSearch]     = useState('')
  const [sortField,  setSortField]  = useState('data')
  const [sortDir,    setSortDir]    = useState('desc')
  const [showForm,   setShowForm]   = useState(false)
  const [editData,   setEditData]   = useState(null)
  const [localBets,  setLocalBets]  = useState(bets)
  const [verificando, setVerificando] = useState(false)
  const [verificMsg,  setVerificMsg]  = useState('')

  useEffect(() => { setLocalBets(bets) }, [bets])

  async function updateStatus(id, status) {
    const bet = localBets.find(b => b.id === id)
    if (!bet) return
    const odd     = safeNum(bet.odd)
    const valor   = safeNum(bet.valor)
    const retorno = status === 'ganhou' ? +(odd * valor).toFixed(2) : 0
    setLocalBets(prev => prev.map(b => b.id === id ? { ...b, status, retorno } : b))
    await supabase.from('apostas').update({ status, retorno }).eq('id', id)
    onRefresh()
  }

  async function deleteBet(id) {
    if (!confirm('Excluir esta aposta?')) return
    setLocalBets(prev => prev.filter(b => b.id !== id))
    await supabase.from('apostas').delete().eq('id', id)
    showToast('Aposta excluída', 'error')
    onRefresh()
  }

  async function verificarResultados() {
    setVerificando(true); setVerificMsg('')
    const pendentes = localBets.filter(b => b.status === 'pendente' && b.data <= new Date().toISOString().slice(0, 10))
    if (!pendentes.length) { setVerificMsg('Nenhuma aposta pendente para verificar.'); setVerificando(false); return }
    let atualizadas = 0
    for (const bet of pendentes) {
      try {
        const ligas = ['bra.1','bra.2','bra.3','conmebol.libertadores','uefa.champions','eng.1','esp.1','ita.1','ger.1']
        for (const liga of ligas) {
          const events = await fetchESPN(liga, bet.data)
          const termos = bet.evento?.toLowerCase().split(/\s+x\s+|\s+vs\s+/) || []
          const match  = events.find(ev => {
            const comps = ev.competitions?.[0]?.competitors || []
            return termos.some(t => comps.some(c => c.team?.displayName?.toLowerCase().includes(t?.trim())))
          })
          if (match?.status?.type?.completed) {
            const comps  = match.competitions?.[0]?.competitors || []
            const home   = comps.find(c => c.homeAway === 'home')
            const away   = comps.find(c => c.homeAway === 'away')
            const hScore = parseInt(home?.score || 0)
            const aScore = parseInt(away?.score || 0)
            const sel    = bet.selecao?.toLowerCase() || ''
            let novoStatus = null
            if (sel.includes('over 2.5'))        novoStatus = hScore + aScore > 2 ? 'ganhou' : 'perdeu'
            else if (sel.includes('over 1.5'))   novoStatus = hScore + aScore > 1 ? 'ganhou' : 'perdeu'
            else if (sel.includes('ambas'))      novoStatus = hScore > 0 && aScore > 0 ? 'ganhou' : 'perdeu'
            else if (sel.includes(home?.team?.displayName?.toLowerCase() || 'casa')) novoStatus = hScore > aScore ? 'ganhou' : 'perdeu'
            else if (sel.includes(away?.team?.displayName?.toLowerCase() || 'fora')) novoStatus = aScore > hScore ? 'ganhou' : 'perdeu'
            if (novoStatus) {
              const placar  = `${home?.team?.shortDisplayName || 'Casa'} ${hScore}-${aScore} ${away?.team?.shortDisplayName || 'Fora'}`
              const obsBase = (bet.observacao || '').replace(/\s*\|?\s*Resultado:[^|]*/g, '').trim()
              const novaObs = (obsBase ? obsBase + ' | ' : '') + `Resultado: ${placar}`
              setLocalBets(prev => prev.map(b => b.id === bet.id ? { ...b, status: novoStatus, retorno: novoStatus === 'ganhou' ? +(bet.odd * bet.valor).toFixed(2) : 0, observacao: novaObs } : b))
              await supabase.from('apostas').update({ status: novoStatus, retorno: novoStatus === 'ganhou' ? +(bet.odd * bet.valor).toFixed(2) : 0, observacao: novaObs }).eq('id', bet.id)
              atualizadas++; break
            }
          }
        }
      } catch {}
    }
    setVerificMsg(atualizadas > 0 ? `${atualizadas} aposta(s) atualizada(s) automaticamente!` : 'Nenhum resultado encontrado via ESPN. Atualize manualmente.')
    setVerificando(false)
  }

  const counts = useMemo(() => ({
    todos:   localBets.length,
    pendente: localBets.filter(b => b.status === 'pendente').length,
    ganhou:   localBets.filter(b => b.status === 'ganhou').length,
    perdeu:   localBets.filter(b => b.status === 'perdeu').length,
  }), [localBets])

  const filtered = useMemo(() => {
    let list = filter === 'todos' ? localBets : localBets.filter(b => b.status === filter)
    if (search) list = list.filter(b =>
      b.evento?.toLowerCase().includes(search.toLowerCase()) ||
      b.selecao?.toLowerCase().includes(search.toLowerCase()) ||
      b.casa?.toLowerCase().includes(search.toLowerCase())
    )
    return [...list].sort((a, b) => {
      const av = a[sortField], bv = b[sortField]
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [localBets, filter, search, sortField, sortDir])

  function hs(f) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const filterBtnStyle = (f) => ({
    background: filter === f ? '#1e2a4a' : 'transparent',
    border: `1px solid ${filter === f ? T.primary : T.border}`,
    color: filter === f ? T.text : T.muted,
    borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  })

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[['todos', `Todos (${counts.todos})`], ['pendente', `Pendentes (${counts.pendente})`], ['ganhou', `Ganhos (${counts.ganhou})`], ['perdeu', `Perdidos (${counts.perdeu})`]].map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(f)}>{l}</button>
        ))}
        <UIInput placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180, marginLeft: 'auto' }}/>
        <UIButton variant="muted" onClick={() => exportCSV(filtered)} style={{ fontSize: 12, padding: '7px 14px', whiteSpace: 'nowrap' }}>Exportar CSV</UIButton>
        <button onClick={verificarResultados} disabled={verificando} style={{ background: verificando ? T.surface : '#1a2a1a', border: `1px solid ${T.success}44`, color: T.success, borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
          {verificando ? '⏳ Verificando...' : '🔍 Verificar Resultados'}
        </button>
      </div>

      {verificMsg && (
        <div style={{ marginBottom: 12, padding: '9px 14px', background: verificMsg.includes('atualizada') ? `${T.success}11` : `${T.warning}11`, border: `1px solid ${verificMsg.includes('atualizada') ? `${T.success}33` : `${T.warning}33`}`, borderRadius: 8, fontSize: 12, color: verificMsg.includes('atualizada') ? T.success : T.warning, fontWeight: 600 }}>
          {verificMsg}
        </div>
      )}

      <div style={{ background: T.card, borderRadius: 16, border: `1px solid ${T.card}`, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead>
            <tr style={{ background: T.surface, borderBottom: `1px solid ${T.card}` }}>
              {[['data','Data'],['evento','Evento'],['esporte','Esporte'],['casa','Casa'],['odd','Odd'],['valor','Valor'],['status','Status'],['retorno','Retorno']].map(([f, l]) => (
                <th key={f} onClick={() => hs(f)} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                  {l} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              <th style={{ padding: '11px 14px', fontSize: 10, color: T.muted, letterSpacing: 1, textTransform: 'uppercase' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, color: T.muted }}>Nenhuma aposta encontrada</td></tr>
            )}
            {filtered.map((bet, i) => (
              <tr key={bet.id} style={{ borderBottom: `1px solid ${T.surface}`, background: i % 2 === 0 ? 'transparent' : '#0a0d18' }}>
                <td style={{ padding: '12px 14px', fontSize: 12, color: T.muted }}>{bet.data}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>
                  {bet.evento}
                  <div style={{ fontSize: 11, color: T.accent }}>{bet.selecao}</div>
                  {bet.mercado && <div style={{ fontSize: 10, color: T.muted }}>{bet.mercado}</div>}
                  {bet.observacao?.includes('Resultado:') && (
                    <div style={{ fontSize: 11, fontWeight: 700, marginTop: 3, color: bet.status === 'ganhou' ? T.success : T.dangerSoft, background: bet.status === 'ganhou' ? `${T.success}11` : `${T.danger}11`, border: `1px solid ${bet.status === 'ganhou' ? `${T.success}33` : `${T.danger}33`}`, borderRadius: 5, padding: '1px 7px', display: 'inline-block' }}>
                      ⚽ {bet.observacao.match(/Resultado: ([^|]+)/)?.[1]?.trim()}
                    </div>
                  )}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#a0aec0' }}>{bet.esporte || '-'}</td>
                <td style={{ padding: '12px 14px', fontSize: 12, color: '#a0aec0' }}>{bet.casa || '-'}</td>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: T.warning }}>{toOdd(bet.odd)}</td>
                <td style={{ padding: '12px 14px', fontSize: 13 }}>R$ {toMoney(bet.valor)}</td>
                <td style={{ padding: '12px 14px' }}>
                  {bet.status === 'pendente'
                    ? <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => updateStatus(bet.id, 'ganhou')} style={{ background: `${T.success}22`, border: `1px solid ${T.success}44`, color: T.success, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>V</button>
                        <button onClick={() => updateStatus(bet.id, 'perdeu')} style={{ background: `${T.danger}22`, border: `1px solid ${T.danger}44`, color: T.danger, borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>X</button>
                      </div>
                    : <Badge status={bet.status}/>}
                </td>
                <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: bet.retorno == null ? T.muted : safeNum(bet.retorno) > 0 ? T.success : T.danger }}>
                  {bet.retorno == null ? '-' : `R$ ${toMoney(bet.retorno)}`}
                </td>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    <button onClick={() => { setEditData(bet); setShowForm(true) }} style={{ background: '#1e2a4a', border: `1px solid ${T.primary}44`, color: T.accent, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>E</button>
                    <button onClick={() => deleteBet(bet.id)}                     style={{ background: '#2a1a1f', border: `1px solid ${T.danger}33`, color: T.dangerSoft, borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>D</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <BetForm editData={editData} userId={userId} onSave={() => { setShowForm(false); onRefresh() }} onClose={() => setShowForm(false)}/>}
    </>
  )
}

// ===================== BET APP =====================
function BetApp({ user }) {
  const [bets,     setBets]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [tab,      setTab]      = useState('dashboard')
  const [showForm, setShowForm] = useState(false)

  const fetchBets = useCallback(async () => {
    const { data } = await supabase.from('apostas').select('*').eq('user_id', user.id).order('data', { ascending: false })
    setBets(data || []); setLoading(false)
  }, [user.id])

  useEffect(() => { fetchBets() }, [fetchBets])

  const TABS = [
    ['dashboard', 'Dashboard'], ['apostas', 'Apostas'], ['analytics', 'Analytics'],
    ['inteligencia', 'Inteligência'], ['sugestoes', 'Sugestões'], ['comparador', 'Comparador'],
    ['scouts', 'Scouts'], ['bankroll', 'Bankroll'],
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: "'DM Sans',sans-serif" }}>
      {/* Toast */}
      <div id="bc-toast" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%) translateY(10px)', padding: '10px 22px', borderRadius: 10, border: '1px solid', fontSize: 13, fontWeight: 700, zIndex: 9999, opacity: 0, transition: 'all 0.3s', pointerEvents: 'none', backdropFilter: 'blur(8px)' }}/>

      {/* Header */}
      <div style={{ background: `linear-gradient(180deg,${T.surface},${T.bg})`, borderBottom: `1px solid ${T.card}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, background: `linear-gradient(135deg,${T.primary},${T.primaryDark})`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color: '#fff', boxShadow: `0 4px 16px ${T.primary}44` }}>B</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>BetControl</div>
            <div style={{ fontSize: 10, color: T.muted, letterSpacing: 1 }}>{user.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <UIButton onClick={() => setShowForm(true)} style={{ padding: '9px 18px' }}>+ Nova</UIButton>
          <UIButton variant="muted" onClick={() => supabase.auth.signOut()} style={{ padding: '9px 14px' }}>Sair</UIButton>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 16px 40px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 3, marginBottom: 22, background: T.card, borderRadius: 14, padding: 5, overflowX: 'auto', flexWrap: 'nowrap' }}>
          {TABS.map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? 'linear-gradient(135deg,#1e2a4a,#1a2540)' : 'transparent',
              border: `1px solid ${tab === t ? T.primary + '44' : 'transparent'}`,
              color: tab === t ? T.text : T.muted,
              borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              boxShadow: tab === t ? `0 2px 12px ${T.primary}22` : 'none',
            }}>{l}</button>
          ))}
        </div>

        {loading
          ? <div style={{ textAlign: 'center', padding: 60, color: T.muted }}>Carregando...</div>
          : tab === 'dashboard'    ? <DashboardTab   bets={bets} onNewBet={() => setShowForm(true)} onTabChange={setTab}/>
          : tab === 'apostas'      ? <ApostasTab      bets={bets} userId={user.id} onRefresh={fetchBets}/>
          : tab === 'analytics'    ? <Analytics       bets={bets}/>
          : tab === 'inteligencia' ? <InteligenciaTab bets={bets}/>
          : tab === 'sugestoes'    ? <SugestoesTab/>
          : tab === 'comparador'   ? <ComparadorTab/>
          : tab === 'scouts'       ? <ScoutsTab/>
          :                          <Bankroll bets={bets} userId={user.id}/>}
      </div>

      {showForm && <BetForm editData={null} userId={user.id} onSave={() => { setShowForm(false); fetchBets() }} onClose={() => setShowForm(false)}/>}
    </div>
  )
}

// ===================== ROOT =====================
export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg }}>
      <div style={{ color: T.muted }}>Carregando...</div>
    </div>
  )

  return session ? <BetApp user={session.user}/> : <Auth/>
}
