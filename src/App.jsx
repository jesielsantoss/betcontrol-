import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts'

const STATUS_COLORS = { ganhou: '#00e676', perdeu: '#ff1744', pendente: '#ffab00' }
const STATUS_LABELS = { ganhou: 'Ganhou', perdeu: 'Perdeu', pendente: 'Pendente' }
const ESPORTES = ['Futebol','Basquete','Tennis','Volei','MMA/UFC','E-Sports','Outros']
const CASAS = ['Bet365','Sportingbet','Betano','KTO','Novibet','Blaze','Vaidebet','Outra']
const CHART_COLORS = ['#7c8cff','#00e676','#ffab00','#ff1744','#00bcd4','#e040fb']

const inp = { background:'#0f1320',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',padding:'9px 12px',fontSize:14,outline:'none',width:'100%',fontFamily:'inherit' }

// ── Estilos de botao reutilizaveis ──
const btnPrimary = { background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 4px 14px #3d5afe33' }
const btnGhost   = { background:'#1a2040',border:'1px solid #3d5afe33',color:'#7c8cff',borderRadius:8,padding:'8px 14px',fontWeight:600,fontSize:12,cursor:'pointer' }
const btnDanger  = { background:'#2a1020',border:'1px solid #ff174433',color:'#ff5252',borderRadius:8,padding:'6px 10px',cursor:'pointer',fontSize:12,fontWeight:600 }

// ── Formatadores seguros (evitam NaN na UI) ──
function toMoney(v) { const n=Number(v); return Number.isFinite(n)?n.toFixed(2):'0.00' }
function toOdd(v)   { const n=Number(v); return Number.isFinite(n)?n.toFixed(2):'0.00' }
function safeNum(v, fb=0) { const n=Number(v); return Number.isFinite(n)?n:fb }

// ── Helpers de partida (centraliza logica ESPN) ──
function parseRecord(rec) {
  if (!rec) return {w:0,d:0,l:0,total:1}
  const [w=0,d=0,l=0] = rec.split('-').map(Number)
  return {w,d,l,total:Math.max(1,w+d+l)}
}
function getTeamsFromEvent(event) {
  const comps = event?.competitions?.[0]
  const home = comps?.competitors?.find(c=>c.homeAway==='home')
  const away = comps?.competitors?.find(c=>c.homeAway==='away')
  return {comps,home,away}
}
function calcMatchProbs(event) {
  const {home,away} = getTeamsFromEvent(event)
  if (!home||!away) return {over25:0,over15:0,btts:0,homeWin:0,awayWin:0,draw:0,hr:{w:0,d:0,l:0,total:1},ar:{w:0,d:0,l:0,total:1}}
  const hr = parseRecord(home?.records?.[0]?.summary)
  const ar = parseRecord(away?.records?.[0]?.summary)
  const hA = (hr.w+hr.d*0.5)/hr.total
  const aA = (ar.w+ar.d*0.5)/ar.total
  const over25  = Math.min(90, Math.round((hA+aA)*55+10))
  const over15  = Math.min(95, over25+15)
  const btts    = Math.min(85, Math.round(hA*aA*100+20))
  const homeWin = Math.min(88, Math.round((hr.w/hr.total)*65+(ar.l/ar.total)*20+5))
  const awayWin = Math.min(85, Math.round((ar.w/ar.total)*60+(hr.l/hr.total)*20+5))
  const draw    = Math.max(5, Math.min(40, 100-homeWin-awayWin))
  return {over25,over15,btts,homeWin,awayWin,draw,hr,ar}
}
function getEventStatus(event) {
  const s = event?.status?.type
  return {aoVivo:s?.name==='STATUS_IN_PROGRESS', encerrado:!!s?.completed}
}

// ── Toast simples ──
let _toastTimer
function showToast(msg, type='success') {
  const el = document.getElementById('bc-toast')
  if (!el) return
  el.textContent = msg
  el.style.background = type==='success'?'#00e67622':type==='error'?'#ff174422':'#ffab0022'
  el.style.borderColor = type==='success'?'#00e676':type==='error'?'#ff1744':'#ffab00'
  el.style.color = type==='success'?'#00e676':type==='error'?'#ff5252':'#ffab00'
  el.style.opacity = '1'; el.style.transform = 'translateY(0)'
  clearTimeout(_toastTimer)
  _toastTimer = setTimeout(()=>{ el.style.opacity='0'; el.style.transform='translateY(10px)' }, 3000)
}

const LIGAS_ESPN = [
  { id:'bra.1',    nome:'Brasileirao Serie A' },
  { id:'bra.2',    nome:'Brasileirao Serie B' },
  { id:'bra.3',    nome:'Copa do Brasil' },
  { id:'conmebol.libertadores', nome:'Libertadores' },
  { id:'conmebol.sudamericana', nome:'Sul-Americana' },
  { id:'uefa.champions', nome:'Champions League' },
  { id:'eng.1',    nome:'Premier League' },
  { id:'esp.1',    nome:'La Liga' },
  { id:'ita.1',    nome:'Serie A Italia' },
  { id:'ger.1',    nome:'Bundesliga' },
  { id:'fra.1',    nome:'Ligue 1' },
]

// Cache ESPN — evita requisicoes repetidas
const espnCache = {}
async function fetchESPN(leagueId, date) {
  const key = leagueId + '_' + date
  if (espnCache[key]) return espnCache[key]
  const d = date.replace(/-/g,'')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard?dates=${d}`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`)
    const data = await res.json()
    espnCache[key] = Array.isArray(data?.events) ? data.events : []
    return espnCache[key]
  } catch(e) { console.warn('ESPN fetch error:', leagueId, date, e.message); return [] }
}

// Busca paralela de varios dias (7x mais rapido que sequencial)
async function fetchESPNRange(leagueId, days = 7) {
  const hoje = new Date()
  const promises = Array.from({length: days}, (_, i) => {
    const d = new Date(hoje)
    d.setDate(d.getDate() + i)
    return fetchESPN(leagueId, d.toISOString().slice(0,10))
  })
  const results = await Promise.all(promises)
  return results.flat()
}

// Normaliza odds de qualquer bookmaker num formato unico
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

// ===================== SHARED COMPONENTS =====================
function Badge({ status }) {
  return <span style={{ background:STATUS_COLORS[status]+'22',color:STATUS_COLORS[status],border:`1px solid ${STATUS_COLORS[status]}44`,borderRadius:6,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase' }}>{STATUS_LABELS[status]}</span>
}

function StatCard({ label, value, sub, color, trend, onClick }) {
  return (
    <div onClick={onClick} style={{ background:'linear-gradient(135deg,#13182a 0%,#1a1f32 100%)',border:`1px solid ${color}33`,borderRadius:18,padding:'20px 24px',flex:1,minWidth:140,position:'relative',overflow:'hidden',cursor:onClick?'pointer':'default',transition:'transform 0.15s,box-shadow 0.15s',boxShadow:`0 4px 20px ${color}0a` }}>
      <div style={{ position:'absolute',top:-20,right:-20,width:90,height:90,borderRadius:'50%',background:color+'12' }} />
      <div style={{ position:'absolute',bottom:-30,left:-10,width:60,height:60,borderRadius:'50%',background:color+'08' }} />
      <div style={{ color:'#8892a4',fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:'uppercase',marginBottom:8 }}>{label}</div>
      <div style={{ color,fontSize:24,fontWeight:900,fontFamily:"'Bebas Neue',cursive",letterSpacing:1 }}>{value}</div>
      {sub && <div style={{ color:'#8892a4',fontSize:11,marginTop:4 }}>{sub}</div>}
      {trend !== undefined && <div style={{ fontSize:11,marginTop:4,color:trend>=0?'#00e676':'#ff1744',fontWeight:700 }}>{trend>=0?'+':''}{trend}% vs mes anterior</div>}
    </div>
  )
}

function ProbBar({ label, value, color='#7c8cff' }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
        <span style={{fontSize:12,color:'#a0aec0'}}>{label}</span>
        <span style={{fontSize:13,fontWeight:700,color}}>{value}%</span>
      </div>
      <div style={{background:'#1e2538',borderRadius:6,height:7}}>
        <div style={{background:`linear-gradient(90deg,${color}99,${color})`,borderRadius:6,height:7,width:`${value}%`,transition:'width 0.7s ease',boxShadow:`0 0 8px ${color}55`}}/>
      </div>
    </div>
  )
}

function GlassCard({ children, style={}, glow }) {
  return (
    <div style={{
      background:'linear-gradient(135deg,#111724 0%,#141928 100%)',
      border:`1px solid ${glow?glow+'33':'#1e2538'}`,
      borderRadius:18,
      padding:'22px 26px',
      boxShadow: glow ? `0 4px 30px ${glow}11` : '0 2px 16px #00000033',
      ...style
    }}>{children}</div>
  )
}

function exportCSV(bets) {
  const headers = ['Data','Evento','Esporte','Mercado','Selecao','Casa','Tipo','Odd','Valor','Status','Retorno','Lucro','Observacao']
  const rows = bets.map(b => {
    const lucro = b.status==='ganhou'?(b.retorno-b.valor).toFixed(2):b.status==='perdeu'?(-b.valor).toFixed(2):''
    return [b.data,b.evento,b.esporte||'',b.mercado||'',b.selecao||'',b.casa||'',b.tipo||'simples',b.odd,b.valor,STATUS_LABELS[b.status],b.retorno||'',lucro,b.observacao||'']
  })
  const csv = [headers,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=`betcontrol_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
}

// ===================== DASHBOARD TAB =====================
function DashboardTab({ bets, onNewBet, onTabChange }) {
  const tt = {background:'#141928',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',fontSize:12}

  const stats = useMemo(() => {
    const won = bets.filter(b=>b.status==='ganhou')
    const lost = bets.filter(b=>b.status==='perdeu')
    const fin = won.length + lost.length
    const invested = bets.reduce((s,b)=>s+safeNum(b.valor),0)
    const returned = won.reduce((s,b)=>s+safeNum(b.retorno),0)
    const profit = returned - won.reduce((s,b)=>s+safeNum(b.valor),0) - lost.reduce((s,b)=>s+safeNum(b.valor),0)
    const roi = invested>0?((returned-invested)/invested*100).toFixed(1):'0.0'
    const winrate = fin>0?((won.length/fin)*100).toFixed(0):'0'
    const streak = (() => {
      const sorted = [...bets].filter(b=>b.status!=='pendente').sort((a,b)=>b.data.localeCompare(a.data))
      if (!sorted.length) return {count:0,type:''}
      let count=1, type=sorted[0].status
      for (let i=1;i<sorted.length;i++) { if(sorted[i].status===type) count++; else break }
      return {count,type}
    })()
    return {total:bets.length,won:won.length,lost:lost.length,pending:bets.filter(b=>b.status==='pendente').length,invested,profit,roi,winrate,streak}
  },[bets])

  const bankrollData = useMemo(() => {
    const sorted = [...bets].filter(b=>b.status!=='pendente').sort((a,b)=>a.data.localeCompare(b.data))
    let bal = 0
    return sorted.slice(-20).map(b => {
      const l = b.status==='ganhou' ? b.retorno-b.valor : -b.valor
      bal += l
      return { data: b.data.slice(5), lucro: +bal.toFixed(2) }
    })
  },[bets])

  const ultimas = useMemo(() => [...bets].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,5),[bets])

  const porEsporte = useMemo(() => {
    const map = {}
    bets.filter(b=>b.status==='ganhou').forEach(b => {
      const e = b.esporte||'Outros'
      map[e] = (map[e]||0) + 1
    })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,value])=>({name,value}))
  },[bets])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:22}}>
      {/* Hero stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:14}}>
        <StatCard label="Lucro Total" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit>=0?'#00e676':'#ff1744'} trend={parseFloat(stats.roi)}/>
        <StatCard label="ROI" value={`${stats.roi}%`} color={parseFloat(stats.roi)>=0?'#00e676':'#ff1744'}/>
        <StatCard label="Taxa de Acerto" value={`${stats.winrate}%`} sub={`${stats.won} ganhas / ${stats.lost} perdidas`} color="#ffab00"/>
        <StatCard label="Apostas" value={stats.total} sub={`${stats.pending} pendentes`} color="#7c8cff"/>
      </div>

      {/* Streak + Acao rapida */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <GlassCard glow={stats.streak.type==='ganhou'?'#00e676':stats.streak.type==='perdeu'?'#ff1744':undefined}>
          <div style={{fontSize:11,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:10}}>SEQUENCIA ATUAL</div>
          {stats.streak.count>0 ? (
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <div style={{fontSize:52,fontWeight:900,fontFamily:"'Bebas Neue',cursive",color:stats.streak.type==='ganhou'?'#00e676':'#ff1744',lineHeight:1}}>{stats.streak.count}</div>
              <div>
                <div style={{fontSize:15,fontWeight:700,color:stats.streak.type==='ganhou'?'#00e676':'#ff1744'}}>{stats.streak.type==='ganhou'?'Vitorias':'Derrotas'} seguidas</div>
                <div style={{fontSize:11,color:'#8892a4',marginTop:3}}>{stats.streak.type==='ganhou'?'Continue o ritmo!':'Cuidado, avalie suas entradas'}</div>
              </div>
            </div>
          ) : <div style={{color:'#8892a4',fontSize:13}}>Sem apostas finalizadas ainda</div>}
        </GlassCard>

        <GlassCard>
          <div style={{fontSize:11,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:12}}>ACOES RAPIDAS</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <button onClick={onNewBet} style={{background:'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:10,padding:'11px 16px',fontWeight:700,fontSize:13,cursor:'pointer',textAlign:'left'}}>+ Registrar nova aposta</button>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>onTabChange('sugestoes')} style={{flex:1,background:'#1a2040',border:'1px solid #3d5afe33',color:'#7c8cff',borderRadius:10,padding:'9px 12px',fontWeight:600,fontSize:12,cursor:'pointer'}}>Ver Sugestoes</button>
              <button onClick={()=>onTabChange('scouts')} style={{flex:1,background:'#1a2040',border:'1px solid #3d5afe33',color:'#7c8cff',borderRadius:10,padding:'9px 12px',fontWeight:600,fontSize:12,cursor:'pointer'}}>Scouts</button>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Grafico + Ultimas */}
      <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr',gap:16}}>
        <GlassCard>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Evolucao do Lucro</div>
          {bankrollData.length < 3
            ? <div style={{color:'#8892a4',textAlign:'center',padding:40,fontSize:13}}>Registre mais apostas para ver o grafico</div>
            : <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={bankrollData}>
                  <defs>
                    <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00e676" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#00e676" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/>
                  <XAxis dataKey="data" stroke="#8892a4" fontSize={10}/>
                  <YAxis stroke="#8892a4" fontSize={10} tickFormatter={v=>`R$${v}`}/>
                  <Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/>
                  <Area type="monotone" dataKey="lucro" stroke="#00e676" strokeWidth={2.5} fill="url(#lg)" dot={false}/>
                </AreaChart>
              </ResponsiveContainer>}
        </GlassCard>

        <GlassCard>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>Ultimas Apostas</div>
          {ultimas.length===0
            ? <div style={{color:'#8892a4',fontSize:13,textAlign:'center',padding:20}}>Nenhuma aposta ainda</div>
            : <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {ultimas.map(b=>(
                  <div key={b.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'#0f1320',borderRadius:10}}>
                    <div style={{width:8,height:8,borderRadius:'50%',background:STATUS_COLORS[b.status],flexShrink:0,boxShadow:`0 0 6px ${STATUS_COLORS[b.status]}`}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{b.evento}</div>
                      <div style={{fontSize:10,color:'#8892a4'}}>{b.data} · odd {Number(b.odd).toFixed(2)}</div>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:b.status==='ganhou'?'#00e676':b.status==='perdeu'?'#ff1744':'#ffab00',flexShrink:0}}>
                      {b.status==='ganhou'?`+R$${(b.retorno-b.valor).toFixed(0)}`:b.status==='perdeu'?`-R$${Number(b.valor).toFixed(0)}`:'--'}
                    </div>
                  </div>
                ))}
              </div>}
        </GlassCard>
      </div>

      {/* Por esporte */}
      {porEsporte.length > 0 && (
        <GlassCard>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>Apostas Ganhas por Esporte</div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
            {porEsporte.map((e,i)=>(
              <div key={e.name} style={{background:'#0f1320',border:`1px solid ${CHART_COLORS[i]}33`,borderRadius:14,padding:'14px 20px',flex:1,minWidth:120,textAlign:'center'}}>
                <div style={{fontSize:22,fontWeight:900,color:CHART_COLORS[i],fontFamily:"'Bebas Neue',cursive"}}>{e.value}</div>
                <div style={{fontSize:11,color:'#8892a4',marginTop:3}}>{e.name}</div>
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
  const [busca, setBusca] = useState('')
  const [eventos, setEventos] = useState([])
  const [loadingEventos, setLoadingEventos] = useState(false)
  const [eventoSel, setEventoSel] = useState(null)
  const [oddsData, setOddsData] = useState(null)
  const [loadingOdds, setLoadingOdds] = useState(false)
  const [erro, setErro] = useState('')
  const [mercadoFiltro, setMercadoFiltro] = useState('')
  const [testando, setTestando] = useState(false)
  const [testeResult, setTesteResult] = useState(null)

  async function testarAPI() {
    setTestando(true); setTesteResult(null)
    try {
      const res = await fetch('/api/odds?endpoint=sports')
      const data = await res.json()
      if (data.error) setTesteResult({ ok: false, msg: data.error })
      else setTesteResult({ ok: true, msg: `API funcionando! ${Array.isArray(data) ? data.length : '?'} esportes disponíveis.` })
    } catch(e) { setTesteResult({ ok: false, msg: e.message }) }
    setTestando(false)
  }

  async function buscarEventos() {
    if (!busca.trim()) return
    setLoadingEventos(true); setErro(''); setEventos([]); setEventoSel(null); setOddsData(null)
    try {
      const res = await fetch(`/api/odds?endpoint=events&sport=football&limit=100`)
      const data = await res.json()
      if (data.error) { setErro(data.error); setLoadingEventos(false); return }
      const lista = Array.isArray(data) ? data : (data.events || data.data || [])
      const termo = busca.toLowerCase()
      const filtrados = lista.filter(ev =>
        (ev.home||'').toLowerCase().includes(termo) ||
        (ev.away||'').toLowerCase().includes(termo) ||
        (ev.league||'').toLowerCase().includes(termo)
      )
      setEventos(filtrados.slice(0, 15))
      if (lista.length === 0) setErro('API retornou lista vazia. Verifique se ODDS_API_KEY está no Vercel.')
      else if (filtrados.length === 0) setErro(`Nenhum jogo encontrado com "${busca}". Tente: Manchester, Real Madrid, Barcelona...`)
    } catch(e) { setErro('Erro: ' + e.message) }
    setLoadingEventos(false)
  }

  async function buscarOdds(event) {
    setEventoSel(event); setLoadingOdds(true); setOddsData(null); setErro('')
    try {
      const res = await fetch(`/api/odds?endpoint=odds&eventId=${event.id}`)
      const data = await res.json()
      if (data.error) { setErro(data.error); setLoadingOdds(false); return }
      setOddsData(data)
      // pegar primeiro mercado disponível
      const bms = data.bookmakers || {}
      const first = Object.values(bms)[0]
      const mkArr = Array.isArray(first) ? first : Object.values(first || {})
      if (mkArr[0]?.name) setMercadoFiltro(mkArr[0].name)
    } catch(e) { setErro('Erro ao buscar odds: ' + e.message) }
    setLoadingOdds(false)
  }

  // Processar odds agrupadas por mercado e selecao
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
          const odd = parseFloat(o.price || o.odds || o.odd || 0)
          if (odd <= 1) return
          if (!result[mkName][label]) result[mkName][label] = []
          result[mkName][label].push({ casa, odd, href: o.href || mk.href || null })
        })
      })
    })
    return result
  }, [oddsData])

  const mercadosNomes = Object.keys(mercados)
  const mercadoAtivo = mercadoFiltro || mercadosNomes[0] || ''
  const grupos = mercados[mercadoAtivo] || {}

  function renderGrupo(label, items) {
    if (!items || items.length < 2) return null
    const sorted = [...items].sort((a,b) => b.odd - a.odd)
    const melhor = sorted[0]
    // No-vig Fair Odd: remove margem das casas usando pinnacle/melhor como referencia
    // Sum of implied probs / N = avg prob com juice; fair prob = prob / sum(probs)
    const sumProbs = items.reduce((s,i) => s + 1/i.odd, 0)
    const fairProbs = items.map(i => (1/i.odd) / sumProbs) // remove vig
    const avgFairProb = fairProbs.reduce((s,p)=>s+p,0) / fairProbs.length
    const fairOdd = +(1/avgFairProb).toFixed(2)
    const probMedia = avgFairProb * 100
    const diferenca = +(((melhor.odd - sorted[sorted.length-1].odd)/sorted[sorted.length-1].odd)*100).toFixed(1)
    return (
      <div key={label} style={{marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
          <span style={{fontSize:12,fontWeight:700,color:'#7c8cff',letterSpacing:0.5}}>{label}</span>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <span style={{fontSize:10,color:'#a0aec0',background:'#7c8cff11',border:'1px solid #7c8cff22',borderRadius:5,padding:'2px 8px'}}>Fair Odd: <strong style={{color:'#fff'}}>{fairOdd}</strong></span>
            {diferenca > 0 && <span style={{fontSize:10,color:'#ffab00',background:'#ffab0011',border:'1px solid #ffab0022',borderRadius:5,padding:'2px 8px'}}>Spread: {diferenca}%</span>}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:7}}>
          {sorted.map((item,i)=>{
            const isMelhor = i===0
            // EV real: compara odd da casa vs fair odd (sem vig)
            const ev = (item.odd * avgFairProb) - 1
            const hasValue = ev > 0.02
            const diffVsMelhor = i===0?0:(((melhor.odd-item.odd)/melhor.odd)*100).toFixed(1)
            return (
              <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',
                background:hasValue?'#00e67606':isMelhor?'#ffffff04':'#0f1320',
                border:`1px solid ${hasValue?'#00e67644':isMelhor?'#2a3a5a':'#1e2538'}`,
                borderRadius:11,transition:'all 0.15s',position:'relative'}}>
                {hasValue&&<div style={{position:'absolute',top:-1,right:10,background:'#00e676',color:'#001a00',fontSize:9,fontWeight:900,padding:'1px 8px',borderRadius:'0 0 6px 6px',letterSpacing:0.5}}>VALUE BET</div>}
                {isMelhor&&!hasValue&&<div style={{width:4,height:40,background:'#7c8cff',borderRadius:2,flexShrink:0,boxShadow:'0 0 10px #7c8cff77'}}/>}
                {hasValue&&<div style={{width:4,height:40,background:'#00e676',borderRadius:2,flexShrink:0,boxShadow:'0 0 12px #00e67699'}}/>}
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:hasValue?'#00e676':isMelhor?'#e8eaf6':'#a0aec0'}}>{item.casa}</div>
                  <div style={{fontSize:10,color:'#8892a4',marginTop:1}}>
                    Prob impl: {(100/item.odd).toFixed(1)}% | Fair: {(probMedia).toFixed(1)}%
                  </div>
                </div>
                {item.href&&<a href={item.href} target="_blank" rel="noreferrer" style={{fontSize:10,color:'#3d5afe',border:'1px solid #3d5afe44',borderRadius:6,padding:'3px 9px',textDecoration:'none',fontWeight:700,flexShrink:0}}>Apostar</a>}
                <div style={{textAlign:'center',minWidth:56}}>
                  <div style={{fontSize:26,fontWeight:900,color:hasValue?'#00e676':isMelhor?'#fff':'#ffab00',fontFamily:"'Bebas Neue',cursive",lineHeight:1}}>{item.odd.toFixed(2)}</div>
                  {item.odd > fairOdd && <div style={{fontSize:9,color:'#00e676',fontWeight:700}}>+{((item.odd-fairOdd)/fairOdd*100).toFixed(1)}% vs fair</div>}
                  {item.odd <= fairOdd && <div style={{fontSize:9,color:'#8892a4'}}>{((item.odd-fairOdd)/fairOdd*100).toFixed(1)}% vs fair</div>}
                </div>
                <div style={{textAlign:'right',minWidth:90}}>
                  <div style={{fontSize:13,fontWeight:800,color:ev>0.05?'#00e676':ev>0?'#69ff84':ev>-0.03?'#ffab00':'#ff5252'}}>
                    EV {ev>0?'+':''}{(ev*100).toFixed(1)}%
                  </div>
                  {hasValue
                    ?<div style={{fontSize:10,color:'#00e676',fontWeight:700,marginTop:1}}>🔥 APOSTAR</div>
                    :isMelhor?<div style={{fontSize:10,color:'#7c8cff',marginTop:1}}>MELHOR</div>
                    :<div style={{fontSize:10,color:'#8892a4',marginTop:1}}>-{diffVsMelhor}% vs melhor</div>}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{marginTop:8,padding:'6px 12px',background:'#ffffff06',borderRadius:7,fontSize:10,color:'#8892a4'}}>
          Fair Odd calculada removendo a margem (vig) das casas. Value Bet = odd da casa acima da fair odd.
        </div>
      </div>
    )
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* Teste de API */}
      <GlassCard>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>Comparador de Odds em Tempo Real</div>
            <div style={{color:'#8892a4',fontSize:12,marginTop:2}}>Odds reais de 250+ casas via odds-api.io</div>
          </div>
          <button onClick={testarAPI} disabled={testando} style={{background:'#1a2040',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>
            {testando?'Testando...':'Testar Conexao'}
          </button>
        </div>
        {testeResult&&(
          <div style={{marginTop:10,padding:'8px 12px',background:testeResult.ok?'#00e67611':'#ff174411',border:`1px solid ${testeResult.ok?'#00e67633':'#ff174433'}`,borderRadius:8,fontSize:12,color:testeResult.ok?'#00e676':'#ff7070'}}>
            {testeResult.msg}
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>BUSCAR PARTIDA</label>
            <input
              value={busca} onChange={e=>setBusca(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&buscarEventos()}
              placeholder="Ex: Manchester City, Real Madrid, Flamengo..."
              style={inp}
            />
          </div>
          <button onClick={buscarEventos} disabled={loadingEventos} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 4px 14px #3d5afe33',whiteSpace:'nowrap'}}>
            {loadingEventos?'Buscando...':'Buscar'}
          </button>
        </div>

        {erro&&<div style={{marginTop:12,color:'#ff7070',fontSize:12,padding:'9px 13px',background:'#ff174411',border:'1px solid #ff174433',borderRadius:8}}>{erro}</div>}

        {!eventoSel&&eventos.length>0&&(
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:7}}>
            <div style={{fontSize:11,color:'#8892a4',fontWeight:700,marginBottom:4}}>SELECIONE O JOGO</div>
            {eventos.map(ev=>(
              <button key={ev.id} onClick={()=>buscarOdds(ev)}
                style={{background:'#0f1320',border:'1px solid #1e2538',borderRadius:10,padding:'12px 16px',cursor:'pointer',textAlign:'left',display:'flex',justifyContent:'space-between',alignItems:'center',color:'#e8eaf6',transition:'all 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor='#3d5afe'}
                onMouseLeave={e=>e.currentTarget.style.borderColor='#1e2538'}>
                <div>
                  <div style={{fontSize:13,fontWeight:700}}>{ev.home} <span style={{color:'#8892a4',fontWeight:400}}>x</span> {ev.away}</div>
                  <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>{ev.league||ev.sport||''}{ev.date?' · '+new Date(ev.date).toLocaleDateString('pt-BR'):''}</div>
                </div>
                <span style={{fontSize:11,color:'#3d5afe',fontWeight:700,flexShrink:0}}>Ver odds</span>
              </button>
            ))}
          </div>
        )}

        {eventoSel&&(
          <div style={{marginTop:12,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'#1a2040',border:'1px solid #3d5afe44',borderRadius:10}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#7c8cff'}}>{eventoSel.home} x {eventoSel.away}</div>
              <div style={{fontSize:11,color:'#8892a4'}}>{eventoSel.league}</div>
            </div>
            <button onClick={()=>{setEventoSel(null);setOddsData(null);setEventos([])}} style={{background:'transparent',border:'none',color:'#8892a4',cursor:'pointer',fontSize:12,fontWeight:600}}>Trocar jogo</button>
          </div>
        )}
      </GlassCard>

      {loadingOdds&&<div style={{textAlign:'center',padding:40,color:'#8892a4',fontSize:13}}>Buscando odds em tempo real...</div>}

      {oddsData&&mercadosNomes.length>0&&(
        <>
          {/* Selector de mercado */}
          <GlassCard>
            <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>
              {eventoSel?.home} x {eventoSel?.away}
              <span style={{fontSize:11,color:'#8892a4',fontWeight:400,marginLeft:10}}>{Object.keys(oddsData.bookmakers||{}).length} casas</span>
            </div>
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {mercadosNomes.map(mk=>(
                <button key={mk} onClick={()=>setMercadoFiltro(mk)}
                  style={{background:mercadoAtivo===mk?'#1e2a4a':'transparent',border:`1px solid ${mercadoAtivo===mk?'#3d5afe':'#2a3048'}`,color:mercadoAtivo===mk?'#fff':'#8892a4',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                  {mk}
                </button>
              ))}
            </div>
            {Object.entries(grupos).map(([label,items])=>renderGrupo(label,items))}
            <div style={{marginTop:8,padding:'10px 14px',background:'#7c8cff11',border:'1px solid #7c8cff22',borderRadius:8}}>
              <div style={{fontSize:11,color:'#a0aec0'}}><strong style={{color:'#7c8cff'}}>EV positivo</strong> = odd acima da probabilidade media do mercado. Dados ao vivo via odds-api.io.</div>
            </div>
          </GlassCard>
        </>
      )}

      {oddsData&&mercadosNomes.length===0&&!loadingOdds&&(
        <GlassCard><div style={{color:'#ffab00',fontSize:13,textAlign:'center',padding:20}}>Odds retornadas mas sem mercados reconhecidos. Tente outro jogo.</div></GlassCard>
      )}
    </div>
  )
}

// ===================== SUGESTOES TAB =====================
// ===================== POISSON MODEL =====================
// P(k; lambda) = (lambda^k * e^-lambda) / k!
function poissonProb(lambda, k) {
  if (lambda <= 0) return 0
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

// Calcula todas as probs de placar via Poisson e retorna metricas reais
function poissonModel(lambdaHome, lambdaAway, maxGoals = 6) {
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0, over15 = 0, over25 = 0, over35 = 0
  const matrix = [] // matrix[i][j] = prob de placar i-j

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = []
    const ph = poissonProb(lambdaHome, h)
    for (let a = 0; a <= maxGoals; a++) {
      const pa = poissonProb(lambdaAway, a)
      const p = ph * pa
      matrix[h][a] = p
      if (h > a) homeWin += p
      else if (h === a) draw += p
      else awayWin += p
      if (h > 0 && a > 0) btts += p
      if (h + a > 1) over15 += p
      if (h + a > 2) over25 += p
      if (h + a > 3) over35 += p
    }
  }

  // Fair odds (sem margem)
  const fairHome = homeWin > 0 ? +(1/homeWin).toFixed(2) : 99
  const fairDraw  = draw > 0   ? +(1/draw).toFixed(2)    : 99
  const fairAway  = awayWin > 0 ? +(1/awayWin).toFixed(2) : 99

  return {
    homeWin: Math.round(homeWin*100), draw: Math.round(draw*100), awayWin: Math.round(awayWin*100),
    btts: Math.round(btts*100), over15: Math.round(over15*100),
    over25: Math.round(over25*100), over35: Math.round(over35*100),
    fairHome, fairDraw, fairAway,
    lambdaHome: +lambdaHome.toFixed(2), lambdaAway: +lambdaAway.toFixed(2),
    matrix
  }
}

// Estima lambda (gols esperados) a partir do historico de W/D/L
// Calibrado: vitória ~ 2 gols, empate ~ 1.1, derrota ~ 0.5 (media Europeia)
function estimateLambda(rec, isHome) {
  if (!rec || rec.total <= 0) return isHome ? 1.4 : 1.1
  const gpm = (rec.w * 1.9 + rec.d * 1.1 + rec.l * 0.45) / rec.total
  return Math.max(0.3, Math.min(3.5, gpm * (isHome ? 1.1 : 0.92)))
}

function SugestoesTab() {
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [loading, setLoading] = useState(false)
  const [sugestoes, setSugestoes] = useState([])
  const [searched, setSearched] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  // ── Poisson Distribution ─────────────────────────────────────
  function factorial(n) { let r=1; for(let i=2;i<=n;i++) r*=i; return r }
  function poisson(k, lambda) { return (Math.pow(lambda,k) * Math.exp(-lambda)) / factorial(k) }

  // Calcula matrix de placares e agrega probabilidades de mercados
  function calcPoisson(lambdaH, lambdaA) {
    let homeWin=0, draw=0, awayWin=0, btts=0, over15=0, over25=0, over35=0
    const maxGoals = 8
    for (let h=0; h<=maxGoals; h++) {
      for (let a=0; a<=maxGoals; a++) {
        const p = poisson(h, lambdaH) * poisson(a, lambdaA)
        if (h > a) homeWin += p
        else if (h === a) draw += p
        else awayWin += p
        if (h > 0 && a > 0) btts += p
        if (h + a > 1) over15 += p
        if (h + a > 2) over25 += p
        if (h + a > 3) over35 += p
      }
    }
    return {
      homeWin: Math.round(homeWin*100),
      draw:    Math.round(draw*100),
      awayWin: Math.round(awayWin*100),
      btts:    Math.round(btts*100),
      over15:  Math.round(over15*100),
      over25:  Math.round(over25*100),
      over35:  Math.round(over35*100),
    }
  }

  // Calcula Fair Odd (sem margem da casa)
  function fairOdd(prob) { return prob > 0 ? +(100/prob).toFixed(2) : 99 }

  // Calcula Value = (Odd_casa * Prob_real) - 1
  function calcValue(oddCasa, probReal) { return +((oddCasa * (probReal/100)) - 1).toFixed(3) }

  const parseRecord = (rec) => {
    if (!rec) return {w:0,d:0,l:0,total:1,goalsFor:0,goalsAgainst:0}
    const parts = rec.split('-').map(Number)
    const w=parts[0]||0, d=parts[1]||0, l=parts[2]||0
    return {w,d,l,total:Math.max(1,w+d+l)}
  }

  async function buscarSugestoes() {
    setLoading(true); setSearched(true); setSugestoes([])
    try {
      // Promise.all — todos os 7 dias em paralelo
      const hoje = new Date()
      const dates = Array.from({length:7}, (_,i) => {
        const d=new Date(hoje); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10)
      })
      const results = await Promise.all(dates.map(date =>
        fetchESPN(liga.id, date).then(evs => evs.map(e=>({...e,_date:date})))
      ))
      const todos = results.flat().filter(e => !e.status?.type?.completed)

      const cards = []
      for (const event of todos.slice(0, 30)) {
        const comps = event.competitions?.[0]
        const home = comps?.competitors?.find(c=>c.homeAway==='home')
        const away = comps?.competitors?.find(c=>c.homeAway==='away')
        if (!home || !away) continue

        const hr = parseRecord(home?.records?.[0]?.summary)
        const ar = parseRecord(away?.records?.[0]?.summary)

        // ── Lambda Poisson ────────────────────────────────────
        // Media de gols da liga ~1.35 por time (referência europeia)
        const leagueAvg = 1.35
        const homeAttackStr = hr.total > 0 ? ((hr.w*3 + hr.d) / (hr.total*3)) * leagueAvg * 1.35 : leagueAvg
        const awayAttackStr = ar.total > 0 ? ((ar.w*3 + ar.d) / (ar.total*3)) * leagueAvg * 1.10 : leagueAvg
        const homeDefStr = hr.total > 0 ? Math.max(0.5, 1 - (hr.l / hr.total)) : 1
        const awayDefStr = ar.total > 0 ? Math.max(0.5, 1 - (ar.l / ar.total)) : 1

        // Lambda esperado de gols de cada time nesse jogo
        const lambdaH = +(homeAttackStr * awayDefStr).toFixed(3)
        const lambdaA = +(awayAttackStr * homeDefStr).toFixed(3)

        // Probabilidades via Poisson completo
        const poiss = calcPoisson(lambdaH, lambdaA)

        // Fair odds sem margem
        const fairHome  = fairOdd(poiss.homeWin)
        const fairDraw  = fairOdd(poiss.draw)
        const fairAway  = fairOdd(poiss.awayWin)
        const fairOver25 = fairOdd(poiss.over25)
        const fairBTTS  = fairOdd(poiss.btts)

        const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
        const dataFormatada = new Date(event._date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})

        // Gerar sugestoes onde a probabilidade é suficientemente alta
        const bets = []
        if (poiss.over25 >= 52) bets.push({
          tipo:'Over 2.5 Gols', prob:poiss.over25, fairOdd:fairOver25,
          cor:'#00e676', icone:'GOL',
          motivo:`λ Casa: ${lambdaH} | λ Fora: ${lambdaA} | Gols esp: ${+(lambdaH+lambdaA).toFixed(1)}`,
          lambda: lambdaH+lambdaA
        })
        if (poiss.btts >= 50) bets.push({
          tipo:'Ambas Marcam', prob:poiss.btts, fairOdd:fairBTTS,
          cor:'#7c8cff', icone:'BTTS',
          motivo:`Probabilidade Poisson: ${poiss.btts}% | Fair odd: ${fairBTTS}`,
          lambda: null
        })
        if (poiss.homeWin >= 55) bets.push({
          tipo:`Vitoria ${home.team?.shortDisplayName||home.team?.displayName}`,
          prob:poiss.homeWin, fairOdd:fairHome,
          cor:'#ffab00', icone:'CASA',
          motivo:`Rec: ${hr.w}V-${hr.d}E-${hr.l}D | λ=${lambdaH} gols esperados`,
          lambda: lambdaH
        })
        if (poiss.awayWin >= 45) bets.push({
          tipo:`Vitoria ${away.team?.shortDisplayName||away.team?.displayName}`,
          prob:poiss.awayWin, fairOdd:fairAway,
          cor:'#e040fb', icone:'FORA',
          motivo:`Rec: ${ar.w}V-${ar.d}E-${ar.l}D | λ=${lambdaA} gols esperados`,
          lambda: lambdaA
        })
        if (poiss.over15 >= 72 && !bets.find(b=>b.tipo.includes('2.5'))) bets.push({
          tipo:'Over 1.5 Gols', prob:poiss.over15, fairOdd:fairOdd(poiss.over15),
          cor:'#00bcd4', icone:'GOL',
          motivo:`${poiss.over15}% de prob de 2+ gols via Poisson`,
          lambda: lambdaH+lambdaA
        })

        if (bets.length === 0) continue
        const sorted = bets.sort((a,b)=>b.prob-a.prob)
        const melhor = sorted[0]
        const confianca = melhor.prob >= 65 ? 'Alta' : melhor.prob >= 55 ? 'Media' : 'Baixa'
        const confCor = melhor.prob >= 65 ? '#00e676' : melhor.prob >= 55 ? '#ffab00' : '#ff5252'

        cards.push({
          id:event.id,
          homeName:home.team?.displayName, awayName:away.team?.displayName,
          homeShort:home.team?.shortDisplayName||home.team?.displayName,
          awayShort:away.team?.shortDisplayName||away.team?.displayName,
          homeLogo:home.team?.logo, awayLogo:away.team?.logo,
          homeRecord:home?.records?.[0]?.summary, awayRecord:away?.records?.[0]?.summary,
          hr, ar, data:dataFormatada, hora,
          lambdaH, lambdaA,
          bets: sorted.slice(0,3),
          melhor, confianca, confCor,
          poiss, fairHome, fairDraw, fairAway,
        })
      }

      setSugestoes(cards.sort((a,b)=>b.melhor.prob-a.melhor.prob))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  const filtradas = useMemo(() => {
    if (filtro==='todos') return sugestoes
    return sugestoes.filter(s=>s.confianca.toLowerCase()===filtro)
  },[sugestoes,filtro])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <GlassCard>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Sugestoes — Modelo Poisson</div>
        <div style={{color:'#8892a4',fontSize:12,marginBottom:18}}>
          Probabilidades calculadas via Distribuicao de Poisson (λ por time). Fair Odds sem margem das casas.
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>COMPETICAO</label>
            <select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={inp}>
              {LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <button onClick={buscarSugestoes} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:14,whiteSpace:'nowrap',boxShadow:'0 4px 16px #3d5afe44'}}>
            {loading ? 'Calculando...' : 'Analisar Jogos'}
          </button>
        </div>

        {/* Legenda Poisson */}
        <div style={{marginTop:14,padding:'10px 14px',background:'#3d5afe11',border:'1px solid #3d5afe22',borderRadius:8,fontSize:11,color:'#a0aec0'}}>
          <strong style={{color:'#7c8cff'}}>Modelo Poisson:</strong> P(k;λ) = λᵏ·e⁻λ / k! — calcula a probabilidade exata de cada placar possível e agrega em Over/Under, BTTS e resultado.
          <strong style={{color:'#ffab00'}}> Fair Odd</strong> = odd justa sem margem da casa. Se a casa pagar acima da fair odd → <strong style={{color:'#00e676'}}>Value Bet</strong>.
        </div>
      </GlassCard>

      {searched && !loading && sugestoes.length === 0 && (
        <div style={{textAlign:'center',color:'#8892a4',padding:50,background:'#111724',borderRadius:16,border:'1px solid #1e2538'}}>
          Nenhuma partida encontrada para os proximos 7 dias nessa liga.
        </div>
      )}

      {sugestoes.length > 0 && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[['Alta','alta','#00e676'],['Media','media','#ffab00'],['Baixa','baixa','#ff5252']].map(([lbl,val,cor])=>{
              const count = sugestoes.filter(s=>s.confianca===lbl).length
              return (
                <button key={lbl} onClick={()=>setFiltro(filtro===val?'todos':val)}
                  style={{background:filtro===val?cor+'18':'#111724',border:`1px solid ${filtro===val?cor:cor+'33'}`,borderRadius:14,padding:'14px 18px',textAlign:'center',cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{fontSize:10,color:cor,fontWeight:700,letterSpacing:1,marginBottom:6}}>{lbl.toUpperCase()} CONFIANCA</div>
                  <div style={{fontSize:28,fontWeight:900,color:cor,fontFamily:"'Bebas Neue',cursive"}}>{count}</div>
                </button>
              )
            })}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {filtradas.map(s => (
              <GlassCard key={s.id} glow={s.confCor} style={{padding:'0',overflow:'hidden'}}>
                {/* Header */}
                <div style={{padding:'18px 22px',borderBottom:'1px solid #1e2538',display:'flex',alignItems:'center',gap:12}}>
                  <img src={s.homeLogo} style={{width:36,height:36,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:800}}>{s.homeName} <span style={{color:'#8892a4',fontWeight:400}}>x</span> {s.awayName}</div>
                    <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>{s.data} · {s.hora} · λ={+(s.lambdaH+s.lambdaA).toFixed(2)} gols esperados</div>
                  </div>
                  <img src={s.awayLogo} style={{width:36,height:36,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{background:s.confCor+'18',border:`1px solid ${s.confCor}44`,borderRadius:8,padding:'5px 12px',textAlign:'center',flexShrink:0}}>
                    <div style={{fontSize:9,color:s.confCor,fontWeight:700,letterSpacing:1}}>CONFIANCA</div>
                    <div style={{fontSize:14,color:s.confCor,fontWeight:900}}>{s.confianca}</div>
                  </div>
                </div>

                {/* Poisson resultado + registros */}
                <div style={{padding:'14px 22px',borderBottom:'1px solid #1e2538',background:'#0a0e1a'}}>
                  {/* Resultado 1X2 */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:8,marginBottom:14,alignItems:'center'}}>
                    <div style={{textAlign:'center',background:'#0f1320',borderRadius:10,padding:'10px 6px'}}>
                      <div style={{fontSize:10,color:'#ffab00',fontWeight:700,marginBottom:2}}>{s.homeShort}</div>
                      <div style={{fontSize:24,fontWeight:900,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{s.poiss.homeWin}%</div>
                      <div style={{fontSize:10,color:'#8892a4'}}>Fair: {s.fairHome}</div>
                      <div style={{fontSize:9,color:'#8892a4'}}>λ={s.lambdaH}</div>
                    </div>
                    <div style={{textAlign:'center',background:'#0f1320',borderRadius:10,padding:'10px 8px'}}>
                      <div style={{fontSize:10,color:'#8892a4',fontWeight:700,marginBottom:2}}>EMPATE</div>
                      <div style={{fontSize:24,fontWeight:900,color:'#8892a4',fontFamily:"'Bebas Neue',cursive"}}>{s.poiss.draw}%</div>
                      <div style={{fontSize:10,color:'#8892a4'}}>Fair: {s.fairDraw}</div>
                    </div>
                    <div style={{textAlign:'center',background:'#0f1320',borderRadius:10,padding:'10px 6px'}}>
                      <div style={{fontSize:10,color:'#7c8cff',fontWeight:700,marginBottom:2}}>{s.awayShort}</div>
                      <div style={{fontSize:24,fontWeight:900,color:'#7c8cff',fontFamily:"'Bebas Neue',cursive"}}>{s.poiss.awayWin}%</div>
                      <div style={{fontSize:10,color:'#8892a4'}}>Fair: {s.fairAway}</div>
                      <div style={{fontSize:9,color:'#8892a4'}}>λ={s.lambdaA}</div>
                    </div>
                  </div>

                  {/* Over/BTTS row */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                    {[
                      ['Over 1.5',s.poiss.over15,'#00bcd4'],
                      ['Over 2.5',s.poiss.over25,'#00e676'],
                      ['Over 3.5',s.poiss.over35,'#ffab00'],
                      ['BTTS',s.poiss.btts,'#7c8cff'],
                    ].map(([lbl,prob,cor])=>(
                      <div key={lbl} style={{background:'#0f1320',borderRadius:8,padding:'8px 6px',textAlign:'center'}}>
                        <div style={{fontSize:9,color:cor,fontWeight:700,marginBottom:2}}>{lbl}</div>
                        <div style={{fontSize:18,fontWeight:900,color:cor,fontFamily:"'Bebas Neue',cursive"}}>{prob}%</div>
                        <div style={{background:'#1e2538',borderRadius:3,height:3,marginTop:4}}>
                          <div style={{background:cor,borderRadius:3,height:3,width:`${prob}%`}}/>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Records dos times */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:12}}>
                    {[[s.homeShort,s.hr,'Casa'],[s.awayShort,s.ar,'Fora']].map(([nome,rec,tipo])=>(
                      <div key={tipo} style={{display:'flex',gap:6,alignItems:'center',background:'#0f1320',borderRadius:8,padding:'8px 10px'}}>
                        <span style={{fontSize:10,color:'#8892a4',fontWeight:700,minWidth:30}}>{tipo}</span>
                        <span style={{fontSize:11,color:'#e8eaf6',fontWeight:700,flex:1}}>{nome}</span>
                        {[['V',rec.w,'#00e676'],['E',rec.d,'#ffab00'],['D',rec.l,'#ff1744']].map(([l,v,c])=>(
                          <span key={l} style={{background:c+'22',color:c,borderRadius:5,padding:'1px 6px',fontSize:11,fontWeight:800,minWidth:22,textAlign:'center'}}>{v}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sugestoes com fair odd e value */}
                <div style={{padding:'14px 22px',display:'flex',gap:10,flexWrap:'wrap'}}>
                  {s.bets.map((bet,i)=>(
                    <div key={i} style={{background:'#0f1320',border:`1px solid ${bet.cor}22`,borderRadius:12,padding:'12px 16px',flex:1,minWidth:160}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{background:bet.cor+'22',color:bet.cor,borderRadius:5,padding:'2px 7px',fontSize:9,fontWeight:800,letterSpacing:1}}>{bet.icone}</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#e8eaf6'}}>{bet.tipo}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:6}}>
                        <div>
                          <div style={{fontSize:9,color:'#8892a4'}}>PROBABILIDADE</div>
                          <div style={{fontSize:26,fontWeight:900,color:bet.cor,fontFamily:"'Bebas Neue',cursive",lineHeight:1}}>{bet.prob}%</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:9,color:'#8892a4'}}>FAIR ODD</div>
                          <div style={{fontSize:20,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive",lineHeight:1}}>{bet.fairOdd}</div>
                        </div>
                      </div>
                      <div style={{background:'#1e2538',borderRadius:4,height:4,marginBottom:8}}>
                        <div style={{background:`linear-gradient(90deg,${bet.cor}88,${bet.cor})`,borderRadius:4,height:4,width:`${bet.prob}%`,boxShadow:`0 0 6px ${bet.cor}55`}}/>
                      </div>
                      <div style={{fontSize:10,color:'#8892a4',marginBottom:6}}>{bet.motivo}</div>
                      <div style={{fontSize:10,color:'#a0aec0',padding:'4px 8px',background:'#1a2040',borderRadius:6}}>
                        Se a casa pagar <strong style={{color:'#00e676'}}>{'>'}{bet.fairOdd}</strong> → <strong style={{color:'#00e676'}}>Value Bet!</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>

          <div style={{background:'#ff174411',border:'1px solid #ff174433',borderRadius:12,padding:'14px 18px'}}>
            <div style={{fontSize:12,color:'#ff7070',fontWeight:700,marginBottom:4}}>Aviso de Responsabilidade</div>
            <div style={{fontSize:12,color:'#a0aec0'}}>Probabilidades calculadas via modelo Poisson com base em historico de vitórias/empates/derrotas. Nao ha garantia de resultado. Aposte com responsabilidade.</div>
          </div>
        </>
      )}
    </div>
  )
}


// ===================== SCOUTS TAB =====================
function FormaRecente({ record, cor }) {
  if (!record) return <span style={{fontSize:10,color:'#8892a4'}}>--</span>
  const parts = record.split('-').map(Number)
  const w=parts[0]||0, d=parts[1]||0, l=parts[2]||0
  // gerar forma simulada baseada no record
  const total = w+d+l
  if (total===0) return <span style={{fontSize:10,color:'#8892a4'}}>--</span>
  const forma = []
  const wRate=w/total, dRate=d/total
  for (let i=0;i<5;i++) {
    const r = (w*(i+1)+d*(i+0.5)+l*i)/(total*5+i)
    const rand = ((w*7+d*3+l*2+i*13)%17)/17
    if (rand < wRate) forma.push('V')
    else if (rand < wRate+dRate) forma.push('E')
    else forma.push('D')
  }
  const cores = {V:'#00e676',E:'#ffab00',D:'#ff4444'}
  return (
    <div style={{display:'flex',gap:3}}>
      {forma.map((f,i)=>(
        <div key={i} style={{width:18,height:18,borderRadius:4,background:cores[f]+'22',border:`1px solid ${cores[f]}66`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:800,color:cores[f]}}>{f}</div>
      ))}
    </div>
  )
}

function ScoutCard({ event, ligaNome, onSelect, isSelected }) {
  const [hovered, setHovered] = useState(false)

  const { home, away } = getTeamsFromEvent(event)
  if (!home||!away) return null

  const status = event.status?.type
  const aoVivo = status?.name==='STATUS_IN_PROGRESS'
  const encerrado = status?.completed
  const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})

  const pr = (rec) => { if(!rec) return {w:0,d:0,l:0,total:1}; const p=rec.split('-').map(Number); return {w:p[0]||0,d:p[1]||0,l:p[2]||0,total:Math.max(1,(p[0]||0)+(p[1]||0)+(p[2]||0))} }
  const hr=pr(home.records?.[0]?.summary), ar=pr(away.records?.[0]?.summary)
  const hA=(hr.w+hr.d*0.5)/hr.total, aA=(ar.w+ar.d*0.5)/ar.total
  const over25=Math.min(88,Math.round((hA+aA)*55+10))
  const btts=Math.min(84,Math.round(hA*aA*100+18))
  const homeWin=Math.min(85,Math.round(hr.w/hr.total*65+ar.l/ar.total*18+5))
  const awayWin=Math.min(82,Math.round(ar.w/ar.total*60+hr.l/hr.total*18+5))

  const tendencia = over25>=60 ? {label:'Over 2.5',cor:'#00e676',icone:'GOL'} : btts>=58 ? {label:'BTTS',cor:'#7c8cff',icone:'BTTS'} : homeWin>=60 ? {label:'Casa Vence',cor:'#ffab00',icone:'CASA'} : awayWin>=55 ? {label:'Fora Vence',cor:'#e040fb',icone:'FORA'} : {label:'Indefinido',cor:'#8892a4',icone:'?'}

  const active = isSelected || hovered

  return (
    <div
      onClick={()=>onSelect(event)}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      style={{
        background: active ? 'linear-gradient(135deg,#141e38,#1a2440)' : 'linear-gradient(135deg,#111724,#13192a)',
        border: `1px solid ${active ? '#3d5afe55' : '#1e253888'}`,
        borderRadius:16,
        padding:'18px 20px',
        cursor:'pointer',
        transition:'all 0.2s ease',
        boxShadow: active ? '0 4px 24px #3d5afe18' : '0 2px 8px #00000022',
        position:'relative',
        overflow:'hidden',
      }}
    >
      {/* Barra de tendencia no topo */}
      <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${tendencia.cor}00,${tendencia.cor}88,${tendencia.cor}00)`,opacity:active?1:0.4,transition:'opacity 0.2s'}}/>

      {/* Liga + horario */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontSize:10,color:'#8892a4',fontWeight:700,letterSpacing:1}}>{ligaNome.toUpperCase()}</span>
        {aoVivo
          ? <span style={{background:'#ff174422',color:'#ff5252',border:'1px solid #ff174455',borderRadius:6,padding:'2px 8px',fontSize:10,fontWeight:800,letterSpacing:1}}>AO VIVO</span>
          : encerrado
          ? <span style={{fontSize:11,color:'#8892a4',fontWeight:600}}>Encerrado</span>
          : <span style={{fontSize:13,fontWeight:700,color:'#ffab00'}}>{hora}</span>}
      </div>

      {/* Times */}
      <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:12,alignItems:'center',marginBottom:14}}>
        {/* Casa */}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <img src={home.team?.logo} style={{width:32,height:32,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
            <div>
              <div style={{fontSize:13,fontWeight:800,lineHeight:1.2}}>{home.team?.displayName}</div>
              <div style={{fontSize:10,color:'#8892a4',marginTop:2}}>{hr.w}V {hr.d}E {hr.l}D</div>
            </div>
          </div>
          <FormaRecente record={home.records?.[0]?.summary}/>
        </div>

        {/* Placar ou VS */}
        <div style={{textAlign:'center',minWidth:48}}>
          {(aoVivo||encerrado)&&home.score!==undefined
            ? <div style={{fontSize:24,fontWeight:900,fontFamily:"'Bebas Neue',cursive",letterSpacing:2,color:aoVivo?'#fff':'#8892a4'}}>{home.score}<span style={{color:'#2a3048',fontSize:18}}> - </span>{away.score}</div>
            : <div style={{fontSize:14,fontWeight:700,color:'#2a3048'}}>VS</div>}
        </div>

        {/* Fora */}
        <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexDirection:'row-reverse'}}>
            <img src={away.team?.logo} style={{width:32,height:32,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:13,fontWeight:800,lineHeight:1.2}}>{away.team?.displayName}</div>
              <div style={{fontSize:10,color:'#8892a4',marginTop:2}}>{ar.w}V {ar.d}E {ar.l}D</div>
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}><FormaRecente record={away.records?.[0]?.summary}/></div>
        </div>
      </div>

      {/* Stats rapidas */}
      <div style={{display:'flex',gap:8,borderTop:'1px solid #1e253855',paddingTop:12}}>
        <div style={{flex:1,textAlign:'center',background:'#0f132088',borderRadius:8,padding:'7px 4px'}}>
          <div style={{fontSize:9,color:'#8892a4',fontWeight:700,letterSpacing:0.5,marginBottom:3}}>OVER 2.5</div>
          <div style={{fontSize:15,fontWeight:900,color:over25>=60?'#00e676':over25>=50?'#ffab00':'#ff5252',fontFamily:"'Bebas Neue',cursive"}}>{over25}%</div>
        </div>
        <div style={{flex:1,textAlign:'center',background:'#0f132088',borderRadius:8,padding:'7px 4px'}}>
          <div style={{fontSize:9,color:'#8892a4',fontWeight:700,letterSpacing:0.5,marginBottom:3}}>BTTS</div>
          <div style={{fontSize:15,fontWeight:900,color:btts>=60?'#7c8cff':btts>=50?'#ffab00':'#8892a4',fontFamily:"'Bebas Neue',cursive"}}>{btts}%</div>
        </div>
        <div style={{flex:1,textAlign:'center',background:'#0f132088',borderRadius:8,padding:'7px 4px'}}>
          <div style={{fontSize:9,color:'#8892a4',fontWeight:700,letterSpacing:0.5,marginBottom:3}}>CASA</div>
          <div style={{fontSize:15,fontWeight:900,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{homeWin}%</div>
        </div>
        <div style={{flex:1,textAlign:'center',background:'#0f132088',borderRadius:8,padding:'7px 4px'}}>
          <div style={{fontSize:9,color:'#8892a4',fontWeight:700,letterSpacing:0.5,marginBottom:3}}>FORA</div>
          <div style={{fontSize:15,fontWeight:900,color:'#7c8cff',fontFamily:"'Bebas Neue',cursive"}}>{awayWin}%</div>
        </div>
        {/* Tendencia */}
        <div style={{flex:1.5,textAlign:'center',background:tendencia.cor+'11',border:`1px solid ${tendencia.cor}33`,borderRadius:8,padding:'7px 4px'}}>
          <div style={{fontSize:9,color:'#8892a4',fontWeight:700,letterSpacing:0.5,marginBottom:3}}>TENDENCIA</div>
          <div style={{fontSize:11,fontWeight:800,color:tendencia.cor}}>{tendencia.label}</div>
        </div>
      </div>

      {/* Hover hint */}
      {hovered&&!isSelected&&(
        <div style={{position:'absolute',bottom:0,left:0,right:0,background:'linear-gradient(0deg,#3d5afe22,transparent)',borderRadius:'0 0 16px 16px',padding:'12px',textAlign:'center'}}>
          <span style={{fontSize:11,color:'#7c8cff',fontWeight:700}}>Ver scout completo</span>
        </div>
      )}
    </div>
  )
}

function ScoutsTab() {
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [searched, setSearched] = useState(false)

  async function buscar() {
    setLoading(true); setSearched(true); setSelected(null)
    try { const data = await fetchESPN(liga.id, date); setEvents(data) } // cache automatico
    catch(e) { setEvents([]) }
    setLoading(false)
  }

  function handleSelect(event) {
    setSelected(s => s?.id===event.id ? null : event)
    setTimeout(()=>{ document.getElementById('scout-detail')?.scrollIntoView({behavior:'smooth',block:'start'}) }, 100)
  }

  function calcProbs(event) {
    const comps = event.competitions?.[0]
    const home = comps?.competitors?.find(c=>c.homeAway==='home')
    const away = comps?.competitors?.find(c=>c.homeAway==='away')
    const pr = (rec) => { if(!rec) return {w:0,d:0,l:0,total:1}; const p=rec.split('-').map(Number); return {w:p[0]||0,d:p[1]||0,l:p[2]||0,total:Math.max(1,(p[0]||0)+(p[1]||0)+(p[2]||0))} }
    const hr=pr(home?.records?.[0]?.summary), ar=pr(away?.records?.[0]?.summary)
    const hA=(hr.w+hr.d*0.5)/hr.total, aA=(ar.w+ar.d*0.5)/ar.total
    const over25=Math.min(90,Math.round((hA+aA)*55+10))
    const btts=Math.min(85,Math.round(hA*aA*100+20))
    const homeWin=Math.min(88,Math.round(hr.w/hr.total*65+ar.l/ar.total*20+5))
    const awayWin=Math.min(85,Math.round(ar.w/ar.total*60+hr.l/hr.total*20+5))
    const draw=Math.max(5,Math.min(40,100-homeWin-awayWin))
    return {over25,over15:Math.min(95,over25+15),btts,homeWin,awayWin,draw}
  }

  function getStats(event) {
    const comps = event.competitions?.[0]
    const home = comps?.competitors?.find(c=>c.homeAway==='home')
    const away = comps?.competitors?.find(c=>c.homeAway==='away')
    const g = (stats, name) => stats?.find(s=>s.name===name)?.displayValue||'0'
    return {
      home:{shots:g(home?.statistics,'shotsOnTarget'),possession:g(home?.statistics,'possessionPct'),fouls:g(home?.statistics,'fouls'),corners:g(home?.statistics,'cornerKicks'),yellow:g(home?.statistics,'yellowCards')},
      away:{shots:g(away?.statistics,'shotsOnTarget'),possession:g(away?.statistics,'possessionPct'),fouls:g(away?.statistics,'fouls'),corners:g(away?.statistics,'cornerKicks'),yellow:g(away?.statistics,'yellowCards')}
    }
  }

  const aoVivoCount = events.filter(e=>e.status?.type?.name==='STATUS_IN_PROGRESS').length

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <GlassCard>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>Scouts de Partidas</div>
            {aoVivoCount>0&&<div style={{fontSize:11,color:'#ff5252',fontWeight:700,marginTop:2}}>{aoVivoCount} partida(s) ao vivo</div>}
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>COMPETICAO</label>
            <select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={inp}>
              {LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>DATA</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,width:150}}/>
          </div>
          <button onClick={buscar} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 20px',cursor:'pointer',fontWeight:700,fontSize:13,boxShadow:'0 4px 14px #3d5afe33'}}>
            {loading?'Buscando...':'Buscar'}
          </button>
        </div>
      </GlassCard>

      {loading&&(
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'18px 20px',opacity:0.5}}>
              <div style={{height:12,background:'#1e2538',borderRadius:6,width:'40%',marginBottom:14}}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:12,marginBottom:14}}>
                <div style={{height:32,background:'#1e2538',borderRadius:8}}/>
                <div style={{height:32,width:48,background:'#1e2538',borderRadius:8}}/>
                <div style={{height:32,background:'#1e2538',borderRadius:8}}/>
              </div>
              <div style={{height:40,background:'#1e2538',borderRadius:8}}/>
            </div>
          ))}
        </div>
      )}

      {searched&&!loading&&events.length===0&&(
        <div style={{textAlign:'center',color:'#8892a4',padding:50,background:'#111724',borderRadius:16,border:'1px solid #1e2538'}}>Nenhuma partida encontrada para esta data.</div>
      )}

      {!loading&&events.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {events.map(event=>(
            <ScoutCard key={event.id} event={event} ligaNome={liga.nome} onSelect={handleSelect} isSelected={selected?.id===event.id}/>
          ))}
        </div>
      )}

      {selected&&(()=>{
        const comps = selected.competitions?.[0]
        const home = comps?.competitors?.find(c=>c.homeAway==='home')
        const away = comps?.competitors?.find(c=>c.homeAway==='away')
        if (!home||!away) return null
        const probs=calcProbs(selected), stats=getStats(selected)
        const si = selected.status?.type
        const aoVivo = si?.name==='STATUS_IN_PROGRESS'

        return (
          <div id="scout-detail" style={{display:'flex',flexDirection:'column',gap:16}}>
            <GlassCard glow="#3d5afe">
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
                <img src={home.team?.logo} style={{width:52,height:52,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                <div style={{flex:1,textAlign:'center'}}>
                  {aoVivo&&<div style={{fontSize:42,fontWeight:900,letterSpacing:4,fontFamily:"'Bebas Neue',cursive"}}>{home.score} - {away.score}</div>}
                  <div style={{fontSize:17,fontWeight:800,marginTop:aoVivo?4:0}}>{home.team?.displayName} x {away.team?.displayName}</div>
                  <div style={{fontSize:11,color:'#8892a4',marginTop:3}}>{liga.nome}</div>
                  {aoVivo&&<span style={{background:'#ff174422',color:'#ff5252',border:'1px solid #ff174444',borderRadius:5,padding:'2px 10px',fontSize:11,fontWeight:700,marginTop:6,display:'inline-block'}}>AO VIVO</span>}
                </div>
                <img src={away.team?.logo} style={{width:52,height:52,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
              </div>

              <div style={{fontWeight:700,fontSize:13,marginBottom:12,color:'#7c8cff',letterSpacing:1}}>PROBABILIDADES</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                <div>
                  <ProbBar label={`Vitoria ${home.team?.shortDisplayName||home.team?.displayName}`} value={probs.homeWin} color="#00e676"/>
                  <ProbBar label="Empate" value={probs.draw} color="#ffab00"/>
                  <ProbBar label={`Vitoria ${away.team?.shortDisplayName||away.team?.displayName}`} value={probs.awayWin} color="#ff5252"/>
                </div>
                <div>
                  <ProbBar label="Over 2.5 gols" value={probs.over25} color="#7c8cff"/>
                  <ProbBar label="Over 1.5 gols" value={probs.over15} color="#00bcd4"/>
                  <ProbBar label="Ambas marcam" value={probs.btts} color="#e040fb"/>
                </div>
              </div>
            </GlassCard>

            {stats&&(stats.home.shots!=='0'||stats.home.possession!=='0')&&(
              <GlassCard>
                <div style={{fontWeight:700,fontSize:13,marginBottom:16,color:'#7c8cff',letterSpacing:1}}>ESTATISTICAS DA PARTIDA</div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:8}}>
                  <span style={{fontSize:11,fontWeight:700,color:'#7c8cff'}}>{home.team?.shortDisplayName||home.team?.displayName}</span>
                  <span style={{fontSize:11,fontWeight:700,color:'#ff5252'}}>{away.team?.shortDisplayName||away.team?.displayName}</span>
                </div>
                {[['Chutes no Alvo',stats.home.shots,stats.away.shots],['Posse de Bola %',stats.home.possession,stats.away.possession],['Faltas',stats.home.fouls,stats.away.fouls],['Escanteios',stats.home.corners,stats.away.corners],['Cartoes Amarelos',stats.home.yellow,stats.away.yellow]].map(([label,h,a])=>{
                  const hv=parseFloat(h)||0, av=parseFloat(a)||0, total=hv+av||1, hpct=Math.round(hv/total*100)
                  return (
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                        <span style={{fontSize:13,fontWeight:800,color:'#7c8cff'}}>{h}</span>
                        <span style={{fontSize:10,color:'#8892a4',fontWeight:600}}>{label}</span>
                        <span style={{fontSize:13,fontWeight:800,color:'#ff5252'}}>{a}</span>
                      </div>
                      <div style={{background:'#1e2538',borderRadius:6,height:6,display:'flex',overflow:'hidden'}}>
                        <div style={{background:'linear-gradient(90deg,#3d5afe,#7c8cff)',width:`${hpct}%`,transition:'width 0.5s'}}/>
                        <div style={{background:'linear-gradient(90deg,#ff5252,#ff1744)',flex:1}}/>
                      </div>
                    </div>
                  )
                })}
              </GlassCard>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ===================== MATCH SEARCH =====================
function MatchSearch({ onSelect }) {
  const [open, setOpen] = useState(false)
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  async function buscar() { setLoading(true);setSearched(true); try{const d=await fetchESPN(liga.id,date);setEvents(d)}catch(e){setEvents([])}; setLoading(false) }
  function sel(event) {
    const comps=event.competitions?.[0],home=comps?.competitors?.find(c=>c.homeAway==='home'),away=comps?.competitors?.find(c=>c.homeAway==='away')
    onSelect({evento:`${home?.team?.displayName||''} x ${away?.team?.displayName||''}`,esporte:'Futebol',data:date,mercado:liga.nome})
    setOpen(false)
  }
  return (
    <div style={{gridColumn:'1 / span 2',marginBottom:4}}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{width:'100%',background:'#1a2540',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'9px 14px',cursor:'pointer',fontWeight:700,fontSize:13,textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
        Buscar partida para preencher automaticamente <span style={{marginLeft:'auto',fontSize:11,color:'#8892a4'}}>{open?'v':'^'}</span>
      </button>
      {open&&(
        <div style={{background:'#0f1320',border:'1px solid #2a3048',borderRadius:10,padding:14,marginTop:8}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,marginBottom:10,alignItems:'end'}}>
            <div><label style={{fontSize:10,color:'#8892a4',fontWeight:700,display:'block',marginBottom:4}}>COMPETICAO</label><select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={{...inp,fontSize:12}}>{LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
            <div><label style={{fontSize:10,color:'#8892a4',fontWeight:700,display:'block',marginBottom:4}}>DATA</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,fontSize:12,width:140}}/></div>
            <button type="button" onClick={buscar} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap'}}>{loading?'...':'Buscar'}</button>
          </div>
          {searched&&!loading&&events.length===0&&<div style={{textAlign:'center',color:'#8892a4',padding:16,fontSize:13}}>Nenhuma partida.</div>}
          {events.length>0&&<div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>{events.map(event=>{
            const comps=event.competitions?.[0],home=comps?.competitors?.find(c=>c.homeAway==='home'),away=comps?.competitors?.find(c=>c.homeAway==='away')
            return <button type="button" key={event.id} onClick={()=>sel(event)} style={{background:'#141928',border:'1px solid #2a3048',borderRadius:8,padding:'9px 12px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10}} onMouseEnter={e=>e.currentTarget.style.borderColor='#3d5afe'} onMouseLeave={e=>e.currentTarget.style.borderColor='#2a3048'}>
              <img src={home?.team?.logo} style={{width:22,height:22,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
              <div style={{flex:1,fontSize:12,fontWeight:600,color:'#e8eaf6'}}>{home?.team?.displayName} x {away?.team?.displayName}</div>
              <img src={away?.team?.logo} style={{width:22,height:22,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
            </button>
          })}</div>}
        </div>
      )}
    </div>
  )
}

// ===================== INTELIGENCIA TAB =====================
function InteligenciaTab({ bets }) {
  const tt = {background:'#141928',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',fontSize:12}
  const finalizadas = useMemo(()=>bets.filter(b=>b.status!=='pendente'),[bets])
  const porMercado = useMemo(()=>{ const map={}; finalizadas.forEach(b=>{ const m=b.mercado||'Sem mercado'; if(!map[m]) map[m]={ganhou:0,total:0,lucro:0,invested:0}; map[m].total++;map[m].invested+=b.valor; if(b.status==='ganhou'){map[m].ganhou++;map[m].lucro+=b.retorno-b.valor}else map[m].lucro-=b.valor }); return Object.entries(map).map(([name,v])=>({name,winrate:+((v.ganhou/v.total)*100).toFixed(0),lucro:+v.lucro.toFixed(2),total:v.total,roi:+(v.lucro/v.invested*100).toFixed(1)})).sort((a,b)=>b.roi-a.roi) },[finalizadas])
  const porOddRange = useMemo(()=>{ const ranges=[{label:'1.01-1.50',min:1.01,max:1.50},{label:'1.51-2.00',min:1.51,max:2.00},{label:'2.01-3.00',min:2.01,max:3.00},{label:'3.01-5.00',min:3.01,max:5.00},{label:'5.01+',min:5.01,max:999}]; return ranges.map(r=>{ const bts=finalizadas.filter(b=>b.odd>=r.min&&b.odd<=r.max); const won=bts.filter(b=>b.status==='ganhou'); const invested=bts.reduce((s,b)=>s+b.valor,0); const returned=won.reduce((s,b)=>s+(b.retorno||0),0); const lucro=returned-invested; return {name:r.label,total:bts.length,winrate:bts.length?+((won.length/bts.length)*100).toFixed(0):0,lucro:+lucro.toFixed(2),roi:invested?+(lucro/invested*100).toFixed(1):0} }).filter(r=>r.total>0) },[finalizadas])
  const porDia = useMemo(()=>{ const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sab']; const map={}; finalizadas.forEach(b=>{ const d=new Date(b.data+'T12:00:00').getDay(); const lbl=dias[d]; if(!map[lbl]) map[lbl]={ganhou:0,total:0,lucro:0}; map[lbl].total++; if(b.status==='ganhou'){map[lbl].ganhou++;map[lbl].lucro+=b.retorno-b.valor}else map[lbl].lucro-=b.valor }); return dias.map(d=>({name:d,...(map[d]||{ganhou:0,total:0,lucro:0})})) },[finalizadas])
  const insights = useMemo(()=>{ if(finalizadas.length<5) return [{tipo:'info',msg:'Registre pelo menos 5 apostas finalizadas para ver insights personalizados.'}]; const res=[]; const melhorMercado=[...porMercado].filter(m=>m.total>=2).sort((a,b)=>b.roi-a.roi)[0]; if(melhorMercado&&melhorMercado.roi>0) res.push({tipo:'positivo',msg:`Seu melhor mercado e "${melhorMercado.name}" com ROI de ${melhorMercado.roi}%. Foque mais nele.`}); const piorMercado=[...porMercado].filter(m=>m.total>=2).sort((a,b)=>a.roi-b.roi)[0]; if(piorMercado&&piorMercado.roi<-10) res.push({tipo:'negativo',msg:`Evite o mercado "${piorMercado.name}" com ROI de ${piorMercado.roi}%.`}); const melhorOdd=[...porOddRange].filter(o=>o.total>=3).sort((a,b)=>b.roi-a.roi)[0]; if(melhorOdd&&melhorOdd.roi>0) res.push({tipo:'positivo',msg:`Odds ${melhorOdd.name} sao as mais lucrativas (ROI ${melhorOdd.roi}%).`}); const won=finalizadas.filter(b=>b.status==='ganhou'); const wr=(won.length/finalizadas.length*100).toFixed(0); if(wr<40) res.push({tipo:'negativo',msg:`Taxa de acerto em ${wr}%. Seja mais seletivo.`}); else if(wr>60) res.push({tipo:'positivo',msg:`Taxa de acerto de ${wr}%! Acima da media.`}); const melhorDia=porDia.filter(d=>d.total>=2).sort((a,b)=>b.lucro-a.lucro)[0]; if(melhorDia&&melhorDia.lucro>0) res.push({tipo:'positivo',msg:`${melhorDia.name} e seu dia mais lucrativo.`}); return res.length?res:[{tipo:'info',msg:'Continue registrando apostas para insights mais precisos.'}] },[finalizadas,porMercado,porOddRange,porDia])
  const insightColors = {positivo:'#00e676',negativo:'#ff1744',alerta:'#ffab00',info:'#7c8cff'}
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Insights do seu Historico</div><div style={{display:'flex',flexDirection:'column',gap:10}}>{insights.map((ins,i)=><div key={i} style={{background:insightColors[ins.tipo]+'11',border:`1px solid ${insightColors[ins.tipo]}33`,borderRadius:10,padding:'12px 16px'}}><span style={{fontSize:13,color:'#e8eaf6',lineHeight:1.5}}>{ins.msg}</span></div>)}</div></GlassCard>
      {porMercado.length>0&&<GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>ROI por Mercado</div><div style={{display:'flex',flexDirection:'column',gap:8}}>{porMercado.map((m,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#0f1320',borderRadius:10}}><div style={{width:8,height:8,borderRadius:'50%',background:CHART_COLORS[i%CHART_COLORS.length]}}/><div style={{flex:1,fontSize:13,fontWeight:600}}>{m.name}</div><div style={{fontSize:11,color:'#8892a4'}}>{m.total} ap.</div><div style={{fontSize:12,color:'#ffab00',width:44,textAlign:'right'}}>{m.winrate}%</div><div style={{fontSize:13,fontWeight:700,color:m.roi>=0?'#00e676':'#ff1744',width:70,textAlign:'right'}}>ROI {m.roi}%</div><div style={{fontSize:13,fontWeight:700,color:m.lucro>=0?'#00e676':'#ff1744',width:90,textAlign:'right'}}>R$ {m.lucro}</div></div>)}</div></GlassCard>}
      {porOddRange.length>0&&<GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Performance por Faixa de Odd</div><ResponsiveContainer width="100%" height={200}><BarChart data={porOddRange}><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis dataKey="name" stroke="#8892a4" fontSize={11}/><YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`${v}%`}/><Tooltip contentStyle={tt} formatter={(v,n)=>n==='roi'?[`${v}%`,'ROI']:[`${v}%`,'Winrate']}/><Bar dataKey="roi" radius={[4,4,0,0]}>{porOddRange.map((e,i)=><Cell key={i} fill={e.roi>=0?'#00e676':'#ff1744'}/>)}</Bar></BarChart></ResponsiveContainer></GlassCard>}
      <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Lucro por Dia da Semana</div><ResponsiveContainer width="100%" height={180}><BarChart data={porDia}><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis dataKey="name" stroke="#8892a4" fontSize={12}/><YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/><Bar dataKey="lucro" radius={[4,4,0,0]}>{porDia.map((e,i)=><Cell key={i} fill={e.lucro>=0?'#00e676':'#ff1744'}/>)}</Bar></BarChart></ResponsiveContainer></GlassCard>
    </div>
  )
}

// ===================== ANALYTICS TAB =====================
function Analytics({ bets }) {
  const tt = {background:'#141928',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',fontSize:12}
  const bankrollData = useMemo(()=>{ const sorted=[...bets].filter(b=>b.status!=='pendente').sort((a,b)=>a.data.localeCompare(b.data)); let bal=0; return sorted.map(b=>{ const l=b.status==='ganhou'?b.retorno-b.valor:-b.valor; bal+=l; return {data:b.data.slice(5),lucro:+bal.toFixed(2)} }) },[bets])
  const byEsporte = useMemo(()=>{ const map={}; bets.filter(b=>b.status!=='pendente').forEach(b=>{ const e=b.esporte||'Outros'; if(!map[e]) map[e]={ganhou:0,perdeu:0,lucro:0}; if(b.status==='ganhou'){map[e].ganhou++;map[e].lucro+=b.retorno-b.valor}else{map[e].perdeu++;map[e].lucro-=b.valor} }); return Object.entries(map).map(([name,v])=>({name,...v,lucro:+v.lucro.toFixed(2)})) },[bets])
  const byCasa = useMemo(()=>{ const map={}; bets.filter(b=>b.status!=='pendente').forEach(b=>{ const c=b.casa||'Outra'; if(!map[c]) map[c]={total:0,ganhou:0,lucro:0}; map[c].total++; if(b.status==='ganhou'){map[c].ganhou++;map[c].lucro+=b.retorno-b.valor}else map[c].lucro-=b.valor }); return Object.entries(map).map(([name,v])=>({name,winrate:+((v.ganhou/v.total)*100).toFixed(0),lucro:+v.lucro.toFixed(2),total:v.total})) },[bets])
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Evolucao do Bankroll</div>{bankrollData.length<2?<div style={{color:'#8892a4',textAlign:'center',padding:40}}>Registre mais apostas finalizadas</div>:<ResponsiveContainer width="100%" height={220}><AreaChart data={bankrollData}><defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#00e676" stopOpacity={0.25}/><stop offset="95%" stopColor="#00e676" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis dataKey="data" stroke="#8892a4" fontSize={11}/><YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Saldo']}/><Area type="monotone" dataKey="lucro" stroke="#00e676" strokeWidth={2.5} fill="url(#ag)" dot={false}/></AreaChart></ResponsiveContainer>}</GlassCard>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:20}}>
        <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Lucro por Esporte</div>{byEsporte.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30}}>Sem dados</div>:<ResponsiveContainer width="100%" height={200}><BarChart data={byEsporte} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis type="number" stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><YAxis dataKey="name" type="category" stroke="#8892a4" fontSize={11} width={70}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/><Bar dataKey="lucro" radius={[0,4,4,0]}>{byEsporte.map((e,i)=><Cell key={i} fill={e.lucro>=0?'#00e676':'#ff1744'}/>)}</Bar></BarChart></ResponsiveContainer>}</GlassCard>
        <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Performance por Casa</div>{byCasa.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30}}>Sem dados</div>:<div style={{display:'flex',flexDirection:'column',gap:10}}>{byCasa.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#0f1320',borderRadius:10}}><div style={{width:8,height:8,borderRadius:'50%',background:CHART_COLORS[i%CHART_COLORS.length]}}/><div style={{flex:1,fontSize:13,fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:'#8892a4'}}>{c.total} ap.</div><div style={{fontSize:12,color:'#ffab00',width:40,textAlign:'right'}}>{c.winrate}%</div><div style={{fontSize:13,fontWeight:700,color:c.lucro>=0?'#00e676':'#ff1744',width:80,textAlign:'right'}}>R$ {c.lucro}</div></div>)}</div>}</GlassCard>
      </div>
    </div>
  )
}

// ===================== BANKROLL TAB =====================
function Bankroll({ bets, userId }) {
  const [config, setConfig] = useState({bankroll_inicial:1000,stop_loss_percent:20})
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(config)
  const [saving, setSaving] = useState(false)
  useEffect(()=>{ supabase.from('user_config').select('*').eq('user_id',userId).single().then(({data})=>{ if(data){setConfig(data);setForm(data)} }) },[userId])
  async function saveConfig() { setSaving(true); await supabase.from('user_config').upsert({...form,user_id:userId,updated_at:new Date().toISOString()}); setConfig(form);setEditing(false);setSaving(false) }
  const stats = useMemo(()=>{ const won=bets.filter(b=>b.status==='ganhou'),lost=bets.filter(b=>b.status==='perdeu'); const lucroTotal=won.reduce((s,b)=>s+(b.retorno-b.valor),0)-lost.reduce((s,b)=>s+b.valor,0); const saldoAtual=config.bankroll_inicial+lucroTotal; const stopLossVal=config.bankroll_inicial*(config.stop_loss_percent/100); const emRisco=lucroTotal<0&&Math.abs(lucroTotal)>=stopLossVal*0.7; return {lucroTotal,saldoAtual,stopLossVal,emRisco,pct:((lucroTotal/config.bankroll_inicial)*100).toFixed(1)} },[bets,config])
  const kelly = useMemo(()=>{ const fin=bets.filter(b=>b.status!=='pendente'); if(fin.length<5) return null; const p=bets.filter(b=>b.status==='ganhou').length/fin.length; const avgOdd=fin.reduce((s,b)=>s+b.odd,0)/fin.length; const b=avgOdd-1; const kf=(b*p-(1-p))/b; return {kf:(kf*100).toFixed(1),val:Math.max(0,kf*config.bankroll_inicial).toFixed(2)} },[bets,config])
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {stats.emRisco&&<div style={{background:'#ff174422',border:'1px solid #ff174466',borderRadius:14,padding:'16px 20px',display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:24}}>!</span><div><div style={{color:'#ff5252',fontWeight:700,fontSize:15}}>Atencao ao Stop Loss!</div><div style={{color:'#ff7070',fontSize:13,marginTop:2}}>Voce esta proximo ao limite de perda (R$ {stats.stopLossVal.toFixed(2)})</div></div></div>}
      <GlassCard><div style={{fontWeight:700,fontSize:15,marginBottom:20}}>Situacao do Bankroll</div><div style={{display:'flex',gap:14,flexWrap:'wrap'}}><StatCard label="Bankroll Inicial" value={`R$ ${Number(config.bankroll_inicial).toFixed(2)}`} color="#7c8cff"/><StatCard label="Saldo Atual" value={`R$ ${stats.saldoAtual.toFixed(2)}`} color={stats.saldoAtual>=config.bankroll_inicial?'#00e676':'#ff1744'}/><StatCard label="Resultado Total" value={`R$ ${stats.lucroTotal.toFixed(2)}`} color={stats.lucroTotal>=0?'#00e676':'#ff1744'}/><StatCard label="Variacao" value={`${stats.pct}%`} color={parseFloat(stats.pct)>=0?'#00e676':'#ff1744'}/></div></GlassCard>
      {kelly&&<GlassCard glow="#ffab00"><div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Criterio de Kelly</div><div style={{color:'#8892a4',fontSize:12,marginBottom:14}}>Baseado no seu historico</div><div style={{display:'flex',gap:24,flexWrap:'wrap'}}><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>% DO BANKROLL</div><div style={{fontSize:28,fontWeight:900,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{kelly.kf}%</div></div><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>VALOR SUGERIDO</div><div style={{fontSize:28,fontWeight:900,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>R$ {kelly.val}</div></div></div><div style={{color:'#8892a4',fontSize:11,marginTop:10}}>Sugestao teorica. Nunca aposte mais do que pode perder.</div></GlassCard>}
      <GlassCard><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><div style={{fontWeight:700,fontSize:15}}>Configuracoes</div>{!editing&&<button onClick={()=>setEditing(true)} style={{background:'#1e2a4a',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>Editar</button>}</div>{editing?(<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:14}}><div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>BANKROLL INICIAL (R$)</label><input type="number" value={form.bankroll_inicial} onChange={e=>setForm(f=>({...f,bankroll_inicial:e.target.value}))} style={inp}/></div><div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>STOP LOSS (%)</label><input type="number" value={form.stop_loss_percent} onChange={e=>setForm(f=>({...f,stop_loss_percent:e.target.value}))} style={inp} min="1" max="100"/></div><div style={{gridColumn:'1 / span 2',display:'flex',gap:10}}><button onClick={()=>setEditing(false)} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:9,padding:10,cursor:'pointer'}}>Cancelar</button><button onClick={saveConfig} disabled={saving} style={{flex:2,background:'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:9,padding:10,cursor:'pointer',fontWeight:700}}>{saving?'Salvando...':'Salvar'}</button></div></div>):(<div style={{display:'flex',gap:24}}><div><div style={{fontSize:11,color:'#8892a4'}}>BANKROLL INICIAL</div><div style={{fontSize:18,fontWeight:700,marginTop:3}}>R$ {Number(config.bankroll_inicial).toFixed(2)}</div></div><div><div style={{fontSize:11,color:'#8892a4'}}>STOP LOSS</div><div style={{fontSize:18,fontWeight:700,color:'#ff5252',marginTop:3}}>{config.stop_loss_percent}% = R$ {stats.stopLossVal.toFixed(2)}</div></div></div>)}</GlassCard>
    </div>
  )
}

// ===================== BET FORM =====================
function BetForm({ editData, userId, onSave, onClose }) {
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState({
    data:       editData?.data      ?? new Date().toISOString().slice(0,10),
    evento:     editData?.evento    ?? '',
    esporte:    editData?.esporte   ?? 'Futebol',
    mercado:    editData?.mercado   ?? '',
    selecao:    editData?.selecao   ?? '',
    casa:       editData?.casa      ?? 'Bet365',
    tipo:       editData?.tipo      ?? 'simples',
    odd:        editData?.odd       ?? '',
    valor:      editData?.valor     ?? '',
    status:     editData?.status    ?? 'pendente',
    observacao: editData?.observacao?? '',
  })

  function upd(k,v) { setForm(p=>({...p,[k]:v})) }

  function preencherPartida({ evento, esporte, data, mercado }) {
    setForm(p=>({...p,evento,esporte,data,mercado}))
  }

  // Preview do retorno em tempo real
  const retornoPreview = form.status==='ganhou'
    ? (safeNum(form.odd)*safeNum(form.valor)).toFixed(2)
    : form.status==='perdeu' ? '0.00' : (safeNum(form.odd)*safeNum(form.valor)).toFixed(2)
  const lucroPreview = form.status==='ganhou'
    ? (safeNum(form.odd)*safeNum(form.valor)-safeNum(form.valor)).toFixed(2)
    : form.status==='perdeu' ? (-safeNum(form.valor)).toFixed(2)
    : (safeNum(form.odd)*safeNum(form.valor)-safeNum(form.valor)).toFixed(2)

  async function handleSave() {
    setErro('')
    if (!form.evento) return setErro('Preencha o Evento')
    if (!safeNum(form.odd)||safeNum(form.odd)<=1) return setErro('Odd deve ser maior que 1')
    if (!safeNum(form.valor)||safeNum(form.valor)<=0) return setErro('Valor deve ser maior que 0')
    setSaving(true)
    const odd=safeNum(form.odd), valor=safeNum(form.valor)
    const retorno=form.status==='ganhou'?+(odd*valor).toFixed(2):form.status==='perdeu'?0:null
    const payload={...form,odd,valor,retorno,user_id:userId}
    if(editData?.id) await supabase.from('apostas').update(payload).eq('id',editData.id)
    else await supabase.from('apostas').insert(payload)
    setSaving(false)
    showToast(editData?.id?'Aposta atualizada!':'Aposta registrada!')
    onSave()
  }

  const lbl=(t)=><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>{t}</label>

  return (
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,backdropFilter:'blur(6px)',padding:16}}>
      <div style={{background:'linear-gradient(135deg,#141928,#1a1f2e)',border:'1px solid #2a3048',borderRadius:20,padding:28,width:'100%',maxWidth:540,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 20px 60px #00000066'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
          <div style={{fontSize:17,fontWeight:800}}>{editData?.id?'Editar Aposta':'Nova Aposta'}</div>
          <button onClick={onClose} style={{background:'transparent',border:'none',color:'#8892a4',cursor:'pointer',fontSize:20,lineHeight:1}}>×</button>
        </div>

        {!editData?.id&&<MatchSearch onSelect={preencherPartida}/>}

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:13,marginTop:12}}>
          <div>{lbl('DATA')}<input type="date" value={form.data} onChange={e=>upd('data',e.target.value)} style={inp}/></div>
          <div>{lbl('STATUS')}<select value={form.status} onChange={e=>upd('status',e.target.value)} style={inp}><option>pendente</option><option>ganhou</option><option>perdeu</option></select></div>
          <div style={{gridColumn:'1 / -1'}}>{lbl('EVENTO / JOGO')}<input type="text" value={form.evento} onChange={e=>upd('evento',e.target.value)} placeholder="Ex: Flamengo x Palmeiras" style={inp}/></div>
          <div>{lbl('ESPORTE')}<select value={form.esporte} onChange={e=>upd('esporte',e.target.value)} style={inp}>{ESPORTES.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('CASA')}<select value={form.casa} onChange={e=>upd('casa',e.target.value)} style={inp}>{CASAS.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('TIPO')}<select value={form.tipo} onChange={e=>upd('tipo',e.target.value)} style={inp}><option>simples</option><option>multipla</option><option>ao vivo</option></select></div>
          <div>{lbl('MERCADO')}<input type="text" value={form.mercado} onChange={e=>upd('mercado',e.target.value)} placeholder="Ex: Over 2.5" style={inp}/></div>
          <div style={{gridColumn:'1 / -1'}}>{lbl('SELECAO')}<input type="text" value={form.selecao} onChange={e=>upd('selecao',e.target.value)} placeholder="Ex: Flamengo vence" style={inp}/></div>
          <div>{lbl('ODD')}<input type="number" step="0.01" min="1.01" value={form.odd} onChange={e=>upd('odd',e.target.value)} style={{...inp,color:'#ffab00',fontWeight:700,fontSize:16}}/></div>
          <div>{lbl('VALOR (R$)')}<input type="number" step="0.01" min="0.01" value={form.valor} onChange={e=>upd('valor',e.target.value)} style={inp}/></div>
          <div style={{gridColumn:'1 / -1'}}>{lbl('OBSERVACAO')}<input type="text" value={form.observacao} onChange={e=>upd('observacao',e.target.value)} style={inp}/></div>
        </div>

        {/* Preview de retorno */}
        {safeNum(form.odd)>1&&safeNum(form.valor)>0&&(
          <div style={{marginTop:14,padding:'12px 16px',background:'#1a2040',border:'1px solid #3d5afe33',borderRadius:10,display:'flex',gap:20,alignItems:'center'}}>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'#8892a4',fontWeight:700}}>RETORNO POTENCIAL</div>
              <div style={{fontSize:20,fontWeight:900,color:'#7c8cff',fontFamily:"'Bebas Neue',cursive"}}>R$ {retornoPreview}</div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:10,color:'#8892a4',fontWeight:700}}>LUCRO POTENCIAL</div>
              <div style={{fontSize:20,fontWeight:900,color:safeNum(lucroPreview)>=0?'#00e676':'#ff5252',fontFamily:"'Bebas Neue',cursive"}}>R$ {lucroPreview}</div>
            </div>
          </div>
        )}

        {erro&&<div style={{marginTop:10,color:'#ff7070',fontSize:12,padding:'8px 12px',background:'#ff174411',borderRadius:8,fontWeight:600}}>{erro}</div>}

        <div style={{display:'flex',gap:10,marginTop:18}}>
          <button onClick={onClose} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:10,padding:12,cursor:'pointer',fontWeight:600}}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{flex:2,background:saving?'#1e2538':'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:10,padding:12,cursor:'pointer',fontWeight:700,fontSize:14,opacity:saving?0.7:1,transition:'all 0.2s'}}>{saving?'Salvando...':'Salvar Aposta'}</button>
        </div>
      </div>
    </div>
  )
}

// ===================== APOSTAS TAB =====================
function ApostasTab({ bets, userId, onRefresh }) {
  const [filter, setFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('data')
  const [sortDir, setSortDir] = useState('desc')
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)
  const [localBets, setLocalBets] = useState(bets)
  const [verificando, setVerificando] = useState(false)
  const [verificMsg, setVerificMsg] = useState('')

  useEffect(() => { setLocalBets(bets) }, [bets])

  // Atualização otimista — UI instantânea, sync com Supabase em background
  async function updateStatus(id, status) {
    const bet = localBets.find(b => b.id === id)
    if (!bet) return
    const odd = safeNum(bet.odd); const valor = safeNum(bet.valor)
    const retorno = status === 'ganhou' ? +(odd * valor).toFixed(2) : 0
    // Atualiza local primeiro (sem esperar Supabase)
    setLocalBets(prev => prev.map(b => b.id===id ? {...b, status, retorno} : b))
    // Sync em background
    await supabase.from('apostas').update({status, retorno}).eq('id', id)
    onRefresh()
  }

  async function deleteBet(id) {
    if (!confirm('Excluir esta aposta?')) return
    setLocalBets(prev => prev.filter(b => b.id !== id))
    await supabase.from('apostas').delete().eq('id', id)
    showToast('Aposta excluida', 'error')
    onRefresh()
  }

  // Verificação automática de resultados via ESPN
  async function verificarResultados() {
    setVerificando(true); setVerificMsg('')
    const pendentes = localBets.filter(b => b.status === 'pendente' && b.data <= new Date().toISOString().slice(0,10))
    if (pendentes.length === 0) { setVerificMsg('Nenhuma aposta pendente para verificar.'); setVerificando(false); return }
    let atualizadas = 0
    for (const bet of pendentes) {
      try {
        // Busca jogos do dia da aposta nas ligas ESPN
        const ligas = ['bra.1','bra.2','bra.3','conmebol.libertadores','uefa.champions','eng.1','esp.1','ita.1','ger.1']
        for (const liga of ligas) {
          const events = await fetchESPN(liga, bet.data)
          const termos = bet.evento?.toLowerCase().split(/\s+x\s+|\s+vs\s+/) || []
          const match = events.find(ev => {
            const comps = ev.competitions?.[0]?.competitors || []
            return termos.some(t => comps.some(c => c.team?.displayName?.toLowerCase().includes(t?.trim())))
          })
          if (match && match.status?.type?.completed) {
            const comps = match.competitions?.[0]?.competitors || []
            const home = comps.find(c=>c.homeAway==='home')
            const away = comps.find(c=>c.homeAway==='away')
            const hScore = parseInt(home?.score||0)
            const aScore = parseInt(away?.score||0)
            const totalGols = hScore + aScore
            const sel = bet.selecao?.toLowerCase() || ''
            let novoStatus = null
            if (sel.includes('over 2.5')) novoStatus = totalGols > 2 ? 'ganhou' : 'perdeu'
            else if (sel.includes('over 1.5')) novoStatus = totalGols > 1 ? 'ganhou' : 'perdeu'
            else if (sel.includes('ambas')) novoStatus = hScore>0 && aScore>0 ? 'ganhou' : 'perdeu'
            else if (sel.includes(home?.team?.displayName?.toLowerCase()||'casa')) novoStatus = hScore>aScore?'ganhou':'perdeu'
            else if (sel.includes(away?.team?.displayName?.toLowerCase()||'fora')) novoStatus = aScore>hScore?'ganhou':'perdeu'
            if (novoStatus) {
              const placar = `${home?.team?.shortDisplayName||'Casa'} ${hScore}-${aScore} ${away?.team?.shortDisplayName||'Fora'}`
              const obsBase = (bet.observacao||'').replace(/\s*\|?\s*Resultado:[^|]*/g,'').trim()
              const novaObs = (obsBase ? obsBase + ' | ' : '') + `Resultado: ${placar}`
              // Optimistic local update com placar
              setLocalBets(prev => prev.map(b => b.id===bet.id
                ? {...b, status:novoStatus, retorno:novoStatus==='ganhou'?+(bet.odd*bet.valor).toFixed(2):0, observacao:novaObs}
                : b))
              // Persiste no Supabase
              await supabase.from('apostas').update({
                status: novoStatus,
                retorno: novoStatus==='ganhou' ? +(bet.odd*bet.valor).toFixed(2) : 0,
                observacao: novaObs
              }).eq('id', bet.id)
              atualizadas++; break
            }
          }
        }
      } catch(e) {}
    }
    setVerificMsg(atualizadas > 0 ? `${atualizadas} aposta(s) atualizada(s) automaticamente!` : 'Nenhum resultado encontrado via ESPN. Atualize manualmente.')
    setVerificando(false)
  }
  const counts = useMemo(()=>({todos:localBets.length,pendente:localBets.filter(b=>b.status==='pendente').length,ganhou:localBets.filter(b=>b.status==='ganhou').length,perdeu:localBets.filter(b=>b.status==='perdeu').length}),[localBets])
  const filtered = useMemo(()=>{ let list=filter==='todos'?localBets:localBets.filter(b=>b.status===filter); if(search) list=list.filter(b=>b.evento?.toLowerCase().includes(search.toLowerCase())||b.selecao?.toLowerCase().includes(search.toLowerCase())||b.casa?.toLowerCase().includes(search.toLowerCase())); return [...list].sort((a,b)=>{ let av=a[sortField],bv=b[sortField]; if(typeof av==='string') return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av); return sortDir==='asc'?av-bv:bv-av }) },[localBets,filter,search,sortField,sortDir])
  function hs(f){if(sortField===f) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortField(f);setSortDir('desc')}}
  return (
    <>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        {[['todos',`Todos (${counts.todos})`],['pendente',`Pendentes (${counts.pendente})`],['ganhou',`Ganhos (${counts.ganhou})`],['perdeu',`Perdidos (${counts.perdeu})`]].map(([f,l])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'#1e2a4a':'transparent',border:`1px solid ${filter===f?'#3d5afe':'#2a3048'}`,color:filter===f?'#fff':'#8892a4',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>
        ))}
        <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:180,marginLeft:'auto'}}/>
        <button onClick={()=>exportCSV(filtered)} style={{background:'#1a2030',border:'1px solid #2a3048',color:'#8892a4',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>Exportar CSV</button>
        <button onClick={verificarResultados} disabled={verificando} style={{background:verificando?'#1a2030':'#1a2a1a',border:'1px solid #00e67644',color:'#00e676',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:700,whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:5}}>
          {verificando ? '⏳ Verificando...' : '🔍 Verificar Resultados'}
        </button>
      </div>
      {verificMsg && <div style={{marginBottom:12,padding:'9px 14px',background:verificMsg.includes('atualizada')?'#00e67611':'#ffab0011',border:`1px solid ${verificMsg.includes('atualizada')?'#00e67633':'#ffab0033'}`,borderRadius:8,fontSize:12,color:verificMsg.includes('atualizada')?'#00e676':'#ffab00',fontWeight:600}}>{verificMsg}</div>}
      <div style={{background:'#111724',borderRadius:16,border:'1px solid #1e2538',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
          <thead>
            <tr style={{background:'#0f1320',borderBottom:'1px solid #1e2538'}}>
              {[['data','Data'],['evento','Evento'],['esporte','Esporte'],['casa','Casa'],['odd','Odd'],['valor','Valor'],['status','Status'],['retorno','Retorno']].map(([f,l])=>(
                <th key={f} onClick={()=>hs(f)} style={{padding:'11px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#8892a4',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>{l} {sortField===f?(sortDir==='asc'?'^':'v'):''}</th>
              ))}
              <th style={{padding:'11px 14px',fontSize:10,color:'#8892a4',letterSpacing:1,textTransform:'uppercase'}}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'#8892a4'}}>Nenhuma aposta encontrada</td></tr>}
            {filtered.map((bet,i)=>(
              <tr key={bet.id} style={{borderBottom:'1px solid #1a2030',background:i%2===0?'transparent':'#0a0d18'}}>
                <td style={{padding:'12px 14px',fontSize:12,color:'#8892a4'}}>{bet.data}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:600}}>
                  {bet.evento}
                  <div style={{fontSize:11,color:'#7c8cff'}}>{bet.selecao}</div>
                  {bet.mercado&&<div style={{fontSize:10,color:'#8892a4'}}>{bet.mercado}</div>}
                  {bet.observacao?.includes('Resultado:')&&(
                    <div style={{fontSize:11,fontWeight:700,marginTop:3,color:bet.status==='ganhou'?'#00e676':'#ff5252',background:bet.status==='ganhou'?'#00e67611':'#ff174411',border:`1px solid ${bet.status==='ganhou'?'#00e67633':'#ff174433'}`,borderRadius:5,padding:'1px 7px',display:'inline-block'}}>
                      ⚽ {bet.observacao.match(/Resultado: ([^|]+)/)?.[1]?.trim()}
                    </div>
                  )}
                </td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.esporte||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.casa||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:'#ffab00'}}>{toOdd(bet.odd)}</td>
                <td style={{padding:'12px 14px',fontSize:13}}>R$ {toMoney(bet.valor)}</td>
                <td style={{padding:'12px 14px'}}>{bet.status==='pendente'?<div style={{display:'flex',gap:5}}><button onClick={()=>updateStatus(bet.id,'ganhou')} style={{background:'#00e67622',border:'1px solid #00e67644',color:'#00e676',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>V</button><button onClick={()=>updateStatus(bet.id,'perdeu')} style={{background:'#ff174422',border:'1px solid #ff174444',color:'#ff1744',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>X</button></div>:<Badge status={bet.status}/>}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:bet.retorno==null?'#8892a4':safeNum(bet.retorno)>0?'#00e676':'#ff1744'}}>{bet.retorno==null?'-':`R$ ${toMoney(bet.retorno)}`}</td>
                <td style={{padding:'12px 14px'}}><div style={{display:'flex',gap:5}}><button onClick={()=>{setEditData(bet);setShowForm(true)}} style={{background:'#1e2a4a',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:6,padding:'4px 9px',cursor:'pointer',fontSize:12}}>E</button><button onClick={()=>deleteBet(bet.id)} style={{background:'#2a1a1f',border:'1px solid #ff174433',color:'#ff5252',borderRadius:6,padding:'4px 9px',cursor:'pointer',fontSize:12}}>D</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm&&<BetForm editData={editData} userId={userId} onSave={()=>{setShowForm(false);onRefresh()}} onClose={()=>setShowForm(false)}/>}
    </>
  )
}

// ===================== BET APP =====================
function BetApp({ user }) {
  const [bets, setBets] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('dashboard')
  const [showForm, setShowForm] = useState(false)
  const fetchBets = useCallback(async()=>{ const {data}=await supabase.from('apostas').select('*').eq('user_id',user.id).order('data',{ascending:false}); setBets(data||[]); setLoading(false) },[user.id])
  useEffect(()=>{fetchBets()},[fetchBets])

  const TABS=[['dashboard','Dashboard'],['apostas','Apostas'],['analytics','Analytics'],['inteligencia','Inteligencia'],['sugestoes','Sugestoes'],['comparador','Comparador'],['scouts','Scouts'],['bankroll','Bankroll']]

  return (
    <div style={{minHeight:'100vh',background:'#0b0e1a',color:'#e8eaf6',fontFamily:"'DM Sans',sans-serif"}}>
      <div id="bc-toast" style={{position:'fixed',bottom:24,left:'50%',transform:'translateX(-50%) translateY(10px)',padding:'10px 22px',borderRadius:10,border:'1px solid',fontSize:13,fontWeight:700,zIndex:9999,opacity:0,transition:'all 0.3s',pointerEvents:'none',backdropFilter:'blur(8px)'}}/>
      <div style={{background:'linear-gradient(180deg,#0f1320,#0b0e1a)',borderBottom:'1px solid #1e2538',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100,backdropFilter:'blur(10px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:38,height:38,background:'linear-gradient(135deg,#00c853,#00897b)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:900,color:'#fff',boxShadow:'0 4px 16px #00c85344'}}>B</div>
          <div><div style={{fontSize:17,fontWeight:800,letterSpacing:0.5}}>BetControl</div><div style={{fontSize:10,color:'#8892a4',letterSpacing:1}}>{user.email}</div></div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowForm(true)} style={{background:'linear-gradient(135deg,#00c853,#00897b)',color:'#fff',border:'none',borderRadius:10,padding:'9px 18px',fontWeight:700,fontSize:13,cursor:'pointer',boxShadow:'0 4px 14px #00c85333'}}>+ Nova</button>
          <button onClick={()=>supabase.auth.signOut()} style={{background:'#1a1f2e',color:'#8892a4',border:'1px solid #2a3048',borderRadius:10,padding:'9px 14px',fontSize:13,cursor:'pointer'}}>Sair</button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:'0 auto',padding:'22px 16px 40px'}}>
        <div style={{display:'flex',gap:3,marginBottom:22,background:'#111724',borderRadius:14,padding:5,overflowX:'auto',flexWrap:'nowrap'}}>
          {TABS.map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'linear-gradient(135deg,#1e2a4a,#1a2540)':'transparent',border:`1px solid ${tab===t?'#3d5afe44':'transparent'}`,color:tab===t?'#fff':'#8892a4',borderRadius:10,padding:'8px 14px',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',boxShadow:tab===t?'0 2px 12px #3d5afe22':'none',transition:'all 0.15s'}}>{l}</button>
          ))}
        </div>

        {loading?<div style={{textAlign:'center',padding:60,color:'#8892a4'}}>Carregando...</div>
          :tab==='dashboard'?<DashboardTab bets={bets} onNewBet={()=>setShowForm(true)} onTabChange={setTab}/>
          :tab==='apostas'?<ApostasTab bets={bets} userId={user.id} onRefresh={fetchBets}/>
          :tab==='analytics'?<Analytics bets={bets}/>
          :tab==='inteligencia'?<InteligenciaTab bets={bets}/>
          :tab==='sugestoes'?<SugestoesTab/>
          :tab==='comparador'?<ComparadorTab/>
          :tab==='scouts'?<ScoutsTab/>
          :<Bankroll bets={bets} userId={user.id}/>}
      </div>

      {showForm&&<BetForm editData={null} userId={user.id} onSave={()=>{setShowForm(false);fetchBets()}} onClose={()=>setShowForm(false)}/>}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  useEffect(()=>{ supabase.auth.getSession().then(({data:{session}})=>setSession(session)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return ()=>subscription.unsubscribe() },[])
  if(session===undefined) return <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0b0e1a'}}><div style={{color:'#8892a4'}}>Carregando...</div></div>
  return session?<BetApp user={session.user}/>:<Auth/>
}
