import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STATUS_COLORS = { ganhou: '#00e676', perdeu: '#ff1744', pendente: '#ffab00' }
const STATUS_LABELS = { ganhou: 'Ganhou', perdeu: 'Perdeu', pendente: 'Pendente' }
const ESPORTES = ['Futebol','Basquete','Tennis','Volei','MMA/UFC','E-Sports','Outros']
const CASAS = ['Bet365','Sportingbet','Betano','KTO','Novibet','Blaze','Vaidebet','Outra']
const CHART_COLORS = ['#7c8cff','#00e676','#ffab00','#ff1744','#00bcd4','#e040fb']
const inp = { background:'#0f1320',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',padding:'9px 12px',fontSize:14,outline:'none',width:'100%',fontFamily:'inherit' }

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

async function fetchESPN(leagueId, date) {
  const d = date.replace(/-/g,'')
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/scoreboard?dates=${d}`
  const res = await fetch(url)
  const data = await res.json()
  return data.events || []
}

async function fetchTeamStats(leagueId, teamId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/teams/${teamId}`
  const res = await fetch(url)
  const data = await res.json()
  return data.team || null
}

function ProbBar({ label, value, color='#7c8cff' }) {
  return (
    <div style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
        <span style={{fontSize:12,color:'#a0aec0'}}>{label}</span>
        <span style={{fontSize:13,fontWeight:700,color}}>{value}%</span>
      </div>
      <div style={{background:'#1e2538',borderRadius:6,height:7}}>
        <div style={{background:color,borderRadius:6,height:7,width:`${value}%`,transition:'width 0.6s ease'}}/>
      </div>
    </div>
  )
}

function Badge({ status }) {
  return <span style={{ background:STATUS_COLORS[status]+'22',color:STATUS_COLORS[status],border:`1px solid ${STATUS_COLORS[status]}44`,borderRadius:6,padding:'2px 10px',fontSize:11,fontWeight:700,letterSpacing:1,textTransform:'uppercase' }}>{STATUS_LABELS[status]}</span>
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background:'linear-gradient(135deg,#1a1f2e 60%,#1e2538)',border:`1px solid ${color}33`,borderRadius:16,padding:'18px 22px',flex:1,minWidth:130,position:'relative',overflow:'hidden' }}>
      <div style={{ position:'absolute',top:-16,right:-16,width:72,height:72,borderRadius:'50%',background:color+'18' }} />
      <div style={{ color:'#8892a4',fontSize:10,fontWeight:700,letterSpacing:1,textTransform:'uppercase',marginBottom:5 }}>{label}</div>
      <div style={{ color,fontSize:22,fontWeight:800,fontFamily:"'Bebas Neue',cursive" }}>{value}</div>
      {sub && <div style={{ color:'#8892a4',fontSize:10,marginTop:3 }}>{sub}</div>}
    </div>
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

// ===================== SUGESTOES TAB =====================
function SugestoesTab() {
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [loading, setLoading] = useState(false)
  const [sugestoes, setSugestoes] = useState([])
  const [searched, setSearched] = useState(false)

  async function buscarSugestoes() {
    setLoading(true); setSearched(true); setSugestoes([])
    try {
      // busca proximos 7 dias
      const hoje = new Date()
      const todos = []
      for (let i = 0; i <= 6; i++) {
        const d = new Date(hoje)
        d.setDate(d.getDate() + i)
        const date = d.toISOString().slice(0,10)
        const events = await fetchESPN(liga.id, date)
        events.forEach(e => { if (!e.status?.type?.completed) todos.push({...e, _date: date}) })
      }

      const cards = []
      for (const event of todos.slice(0, 20)) {
        const comps = event.competitions?.[0]
        const home = comps?.competitors?.find(c=>c.homeAway==='home')
        const away = comps?.competitors?.find(c=>c.homeAway==='away')
        if (!home || !away) continue

        const parseRecord = (rec) => {
          if (!rec) return {w:0,d:0,l:0,total:1,gf:0,ga:0}
          const parts = rec.split('-').map(Number)
          return {w:parts[0]||0,d:parts[1]||0,l:parts[2]||0,total:Math.max(1,(parts[0]||0)+(parts[1]||0)+(parts[2]||0))}
        }

        const hr = parseRecord(home?.records?.[0]?.summary)
        const ar = parseRecord(away?.records?.[0]?.summary)

        const homeAttack = (hr.w + hr.d*0.5) / hr.total
        const awayAttack = (ar.w + ar.d*0.5) / ar.total
        const homeDefense = hr.l / hr.total
        const awayDefense = ar.l / ar.total

        const expGoals = homeAttack * 1.4 + awayAttack * 1.2
        const over25prob = Math.min(88, Math.round(expGoals * 28 + 15))
        const over15prob = Math.min(95, Math.round(over25prob + 14))
        const bttsProb = Math.min(85, Math.round(homeAttack * awayAttack * 110 + 18))
        const homeWinProb = Math.min(85, Math.round(homeAttack * 55 + awayDefense * 20 + 8))
        const awayWinProb = Math.min(80, Math.round(awayAttack * 50 + homeDefense * 18 + 5))
        const drawProb = Math.max(8, Math.min(38, 100 - homeWinProb - awayWinProb))

        const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
        const dataFormatada = new Date(event._date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})

        // gerar sugestoes de valor
        const bets = []

        if (over25prob >= 58) bets.push({
          tipo: 'Over 2.5 Gols',
          prob: over25prob,
          oddSugerida: +(100/over25prob * 0.92).toFixed(2),
          cor: '#00e676',
          icone: 'GOL',
          motivo: `Media de gols e ataque forte dos dois times`
        })

        if (bttsProb >= 60) bets.push({
          tipo: 'Ambas Marcam',
          prob: bttsProb,
          oddSugerida: +(100/bttsProb * 0.92).toFixed(2),
          cor: '#7c8cff',
          icone: 'BTTS',
          motivo: `Os dois times tem bom poder ofensivo`
        })

        if (homeWinProb >= 62) bets.push({
          tipo: `Vitoria ${home.team?.displayName}`,
          prob: homeWinProb,
          oddSugerida: +(100/homeWinProb * 0.93).toFixed(2),
          cor: '#ffab00',
          icone: 'CASA',
          motivo: `Mandante com ${Math.round(hr.w/hr.total*100)}% de aproveitamento`
        })

        if (awayWinProb >= 58) bets.push({
          tipo: `Vitoria ${away.team?.displayName}`,
          prob: awayWinProb,
          oddSugerida: +(100/awayWinProb * 0.93).toFixed(2),
          cor: '#e040fb',
          icone: 'FORA',
          motivo: `Visitante com bom aproveitamento fora`
        })

        if (over15prob >= 80) bets.push({
          tipo: 'Over 1.5 Gols',
          prob: over15prob,
          oddSugerida: +(100/over15prob * 0.92).toFixed(2),
          cor: '#00bcd4',
          icone: 'GOL',
          motivo: `Alta probabilidade de pelo menos 2 gols`
        })

        if (bets.length === 0) continue

        // pegar melhor sugestao
        const melhor = bets.sort((a,b)=>b.prob-a.prob)[0]
        const confianca = melhor.prob >= 70 ? 'Alta' : melhor.prob >= 60 ? 'Media' : 'Baixa'
        const confCor = melhor.prob >= 70 ? '#00e676' : melhor.prob >= 60 ? '#ffab00' : '#ff5252'

        cards.push({
          id: event.id,
          homeName: home.team?.displayName,
          awayName: away.team?.displayName,
          homeLogo: home.team?.logo,
          awayLogo: away.team?.logo,
          homeRecord: home?.records?.[0]?.summary,
          awayRecord: away?.records?.[0]?.summary,
          data: dataFormatada,
          hora,
          bets: bets.sort((a,b)=>b.prob-a.prob).slice(0,3),
          melhor,
          confianca,
          confCor,
          over25prob,
          bttsProb,
          homeWinProb,
          awayWinProb,
        })
      }

      setSugestoes(cards.sort((a,b)=>b.melhor.prob-a.melhor.prob))
    } catch(e) { console.error(e) }
    setLoading(false)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Sugestoes de Apostas</div>
        <div style={{color:'#8892a4',fontSize:12,marginBottom:16}}>Analisa os proximos 7 dias e sugere apostas com maior probabilidade baseado nas estatisticas dos times.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>COMPETICAO</label>
            <select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={inp}>
              {LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <button onClick={buscarSugestoes} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:14,whiteSpace:'nowrap'}}>
            {loading?'Analisando...':'Analisar Jogos'}
          </button>
        </div>
        {loading&&(
          <div style={{textAlign:'center',padding:40,color:'#8892a4'}}>
            <div style={{fontSize:24,marginBottom:10}}>...</div>
            <div style={{fontSize:13}}>Buscando e analisando partidas dos proximos 7 dias...</div>
          </div>
        )}
      </div>

      {searched&&!loading&&sugestoes.length===0&&(
        <div style={{textAlign:'center',color:'#8892a4',padding:40,background:'#111724',borderRadius:16,border:'1px solid #1e2538'}}>
          Nenhuma partida encontrada para os proximos 7 dias nesta competicao.
        </div>
      )}

      {sugestoes.length>0&&(
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[['Alta',sugestoes.filter(s=>s.confianca==='Alta').length,'#00e676'],
              ['Media',sugestoes.filter(s=>s.confianca==='Media').length,'#ffab00'],
              ['Baixa',sugestoes.filter(s=>s.confianca==='Baixa').length,'#ff5252']].map(([lbl,val,cor])=>(
              <div key={lbl} style={{background:'#111724',border:`1px solid ${cor}33`,borderRadius:12,padding:'14px 18px',textAlign:'center'}}>
                <div style={{fontSize:10,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:6}}>CONFIANCA {lbl.toUpperCase()}</div>
                <div style={{fontSize:28,fontWeight:900,color:cor,fontFamily:"'Bebas Neue',cursive"}}>{val}</div>
                <div style={{fontSize:11,color:'#8892a4'}}>sugestoes</div>
              </div>
            ))}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {sugestoes.map(s=>(
              <div key={s.id} style={{background:'#111724',border:`1px solid ${s.confCor}33`,borderRadius:16,padding:'18px 22px'}}>
                {/* Header do jogo */}
                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                  <img src={s.homeLogo} style={{width:32,height:32,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:800}}>{s.homeName} <span style={{color:'#8892a4',fontWeight:400}}>x</span> {s.awayName}</div>
                    <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>{s.data} - {s.hora} &nbsp;|&nbsp; {s.homeRecord||'--'} vs {s.awayRecord||'--'}</div>
                  </div>
                  <img src={s.awayLogo} style={{width:32,height:32,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{background:s.confCor+'22',border:`1px solid ${s.confCor}44`,borderRadius:8,padding:'4px 10px',textAlign:'center',flexShrink:0}}>
                    <div style={{fontSize:9,color:s.confCor,fontWeight:700,letterSpacing:1}}>CONFIANCA</div>
                    <div style={{fontSize:13,color:s.confCor,fontWeight:800}}>{s.confianca}</div>
                  </div>
                </div>

                {/* Sugestoes */}
                <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                  {s.bets.map((bet,i)=>(
                    <div key={i} style={{background:'#0f1320',border:`1px solid ${bet.cor}33`,borderRadius:12,padding:'12px 16px',flex:1,minWidth:180}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{background:bet.cor+'22',color:bet.cor,borderRadius:5,padding:'2px 7px',fontSize:9,fontWeight:800,letterSpacing:1}}>{bet.icone}</span>
                        <span style={{fontSize:13,fontWeight:700,color:'#e8eaf6'}}>{bet.tipo}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end'}}>
                        <div>
                          <div style={{fontSize:10,color:'#8892a4',marginBottom:2}}>PROBABILIDADE</div>
                          <div style={{fontSize:22,fontWeight:900,color:bet.cor,fontFamily:"'Bebas Neue',cursive"}}>{bet.prob}%</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:10,color:'#8892a4',marginBottom:2}}>ODD MINIMA</div>
                          <div style={{fontSize:18,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{bet.oddSugerida}</div>
                        </div>
                      </div>
                      <div style={{marginTop:8}}>
                        <div style={{background:'#1e2538',borderRadius:4,height:5}}>
                          <div style={{background:bet.cor,borderRadius:4,height:5,width:`${bet.prob}%`}}/>
                        </div>
                      </div>
                      <div style={{fontSize:10,color:'#8892a4',marginTop:6}}>{bet.motivo}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{background:'#ff174411',border:'1px solid #ff174433',borderRadius:12,padding:'14px 18px'}}>
            <div style={{fontSize:12,color:'#ff7070',fontWeight:700,marginBottom:4}}>Aviso importante</div>
            <div style={{fontSize:12,color:'#a0aec0'}}>As sugestoes sao baseadas em estatisticas historicas dos times e probabilidades matematicas. Nao garantem resultado. Use como ferramenta de apoio, nunca como certeza. Aposte com responsabilidade.</div>
          </div>
        </>
      )}
    </div>
  )
}

// ===================== SCOUTS TAB (ESPN) =====================
function ScoutsTab() {
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [searched, setSearched] = useState(false)

  async function buscar() {
    setLoading(true); setSearched(true); setSelected(null)
    try {
      const data = await fetchESPN(liga.id, date)
      setEvents(data)
    } catch(e) { setEvents([]) }
    setLoading(false)
  }

  function getStatusInfo(event) {
    const status = event.status?.type
    if (!status) return { label: '--', color: '#8892a4', aoVivo: false }
    if (status.completed) return { label: 'Encerrado', color: '#8892a4', aoVivo: false }
    if (status.name === 'STATUS_IN_PROGRESS') return { label: 'AO VIVO', color: '#ff5252', aoVivo: true }
    const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
    return { label: hora, color: '#ffab00', aoVivo: false }
  }

  function getScore(event) {
    const comps = event.competitions?.[0]
    if (!comps) return null
    const home = comps.competitors?.find(c=>c.homeAway==='home')
    const away = comps.competitors?.find(c=>c.homeAway==='away')
    if (!home || !away) return null
    return { home: home.score||'0', away: away.score||'0' }
  }

  function getTeams(event) {
    const comps = event.competitions?.[0]
    if (!comps) return null
    const home = comps.competitors?.find(c=>c.homeAway==='home')
    const away = comps.competitors?.find(c=>c.homeAway==='away')
    return {
      home: { name: home?.team?.displayName||'Casa', logo: home?.team?.logo, id: home?.team?.id, record: home?.records?.[0]?.summary||'' },
      away: { name: away?.team?.displayName||'Fora', logo: away?.team?.logo, id: away?.team?.id, record: away?.records?.[0]?.summary||'' }
    }
  }

  function getStats(event) {
    const comps = event.competitions?.[0]
    if (!comps) return null
    const home = comps.competitors?.find(c=>c.homeAway==='home')
    const away = comps.competitors?.find(c=>c.homeAway==='away')
    const getStatVal = (stats, name) => stats?.find(s=>s.name===name)?.displayValue || '0'
    return {
      home: {
        shots: getStatVal(home?.statistics, 'shotsOnTarget'),
        possession: getStatVal(home?.statistics, 'possessionPct'),
        fouls: getStatVal(home?.statistics, 'fouls'),
        corners: getStatVal(home?.statistics, 'cornerKicks'),
        yellowCards: getStatVal(home?.statistics, 'yellowCards'),
        redCards: getStatVal(home?.statistics, 'redCards'),
      },
      away: {
        shots: getStatVal(away?.statistics, 'shotsOnTarget'),
        possession: getStatVal(away?.statistics, 'possessionPct'),
        fouls: getStatVal(away?.statistics, 'fouls'),
        corners: getStatVal(away?.statistics, 'cornerKicks'),
        yellowCards: getStatVal(away?.statistics, 'yellowCards'),
        redCards: getStatVal(away?.statistics, 'redCards'),
      }
    }
  }

  function calcProbs(event) {
    const comps = event.competitions?.[0]
    const home = comps?.competitors?.find(c=>c.homeAway==='home')
    const away = comps?.competitors?.find(c=>c.homeAway==='away')

    // usar odds da ESPN se disponivel
    const odds = comps?.odds?.[0]
    const homeOdd = odds?.homeTeamOdds?.moneyLine
    const awayOdd = odds?.awayTeamOdds?.moneyLine
    const drawOdd = odds?.drawOdds?.moneyLine

    // probabilidade baseada em record W-D-L
    const parseRecord = (rec) => {
      if (!rec) return {w:0,d:0,l:0,total:1}
      const parts = rec.split('-').map(Number)
      const w=parts[0]||0, d=parts[1]||0, l=parts[2]||0
      return {w,d,l,total:Math.max(1,w+d+l)}
    }

    const hr = parseRecord(home?.records?.[0]?.summary)
    const ar = parseRecord(away?.records?.[0]?.summary)

    const homeWinRate = hr.w/hr.total
    const awayWinRate = ar.w/ar.total
    const homeLoseRate = hr.l/hr.total
    const awayLoseRate = ar.l/ar.total
    const homeScoreRate = (hr.w+hr.d*0.5)/hr.total
    const awayScoreRate = (ar.w+ar.d*0.5)/ar.total

    const over25 = Math.min(90, Math.round((homeScoreRate + awayScoreRate) * 55 + 10))
    const btts = Math.min(85, Math.round(homeScoreRate * awayScoreRate * 100 + 20))
    const homeWin = Math.min(88, Math.round(homeWinRate * 65 + awayLoseRate * 20 + 5))
    const awayWin = Math.min(85, Math.round(awayWinRate * 60 + homeLoseRate * 20 + 5))
    const draw = Math.max(5, Math.min(40, 100 - homeWin - awayWin))
    const over15 = Math.min(95, over25 + 15)

    return { over25, over15, btts, homeWin, awayWin, draw }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Buscar Partidas</div>
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
          <button onClick={buscar} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'9px 20px',cursor:'pointer',fontWeight:700,fontSize:13,whiteSpace:'nowrap'}}>
            {loading?'Buscando...':'Buscar'}
          </button>
        </div>

        {searched&&!loading&&events.length===0&&(
          <div style={{textAlign:'center',color:'#8892a4',padding:30,fontSize:13,marginTop:10}}>
            Nenhuma partida encontrada para esta data.
          </div>
        )}

        {events.length>0&&(
          <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:8,maxHeight:300,overflowY:'auto'}}>
            {events.map(event=>{
              const teams = getTeams(event)
              const score = getScore(event)
              const si = getStatusInfo(event)
              const sel = selected?.id===event.id
              if (!teams) return null
              return (
                <button key={event.id} onClick={()=>setSelected(sel?null:event)}
                  style={{background:sel?'#1e2a4a':'#141928',border:`1px solid ${sel?'#3d5afe':'#2a3048'}`,borderRadius:10,padding:'12px 16px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:12,transition:'all 0.15s'}}
                  onMouseEnter={e=>{ if(!sel) e.currentTarget.style.borderColor='#3d5afe44' }}
                  onMouseLeave={e=>{ if(!sel) e.currentTarget.style.borderColor='#2a3048' }}>
                  <img src={teams.home.logo} style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#e8eaf6'}}>{teams.home.name} <span style={{color:'#8892a4',fontWeight:400}}>x</span> {teams.away.name}</div>
                    <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>{event.name}</div>
                    {teams.home.record&&<div style={{fontSize:10,color:'#8892a4',marginTop:1}}>{teams.home.record} vs {teams.away.record}</div>}
                  </div>
                  <img src={teams.away.logo} style={{width:30,height:30,objectFit:'contain',flexShrink:0}} alt="" onError={e=>e.target.style.display='none'}/>
                  <div style={{textAlign:'right',minWidth:80,flexShrink:0}}>
                    {si.aoVivo
                      ? <div><span style={{background:'#ff174422',color:'#ff5252',border:'1px solid #ff174444',borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700}}>AO VIVO</span>{score&&<div style={{fontSize:14,fontWeight:800,color:'#fff',marginTop:4}}>{score.home} - {score.away}</div>}</div>
                      : si.label==='Encerrado'
                        ? <div><div style={{fontSize:14,fontWeight:800,color:'#8892a4'}}>{score?.home} - {score?.away}</div><div style={{fontSize:10,color:'#8892a4'}}>Encerrado</div></div>
                        : <span style={{color:'#ffab00',fontSize:13,fontWeight:600}}>{si.label}</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selected&&(()=>{
        const teams = getTeams(selected)
        const score = getScore(selected)
        const probs = calcProbs(selected)
        const stats = getStats(selected)
        const si = getStatusInfo(selected)
        if (!teams) return null
        return (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {/* Header */}
            <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
              <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:20}}>
                <img src={teams.home.logo} style={{width:48,height:48,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                <div style={{flex:1,textAlign:'center'}}>
                  {score&&si.aoVivo&&<div style={{fontSize:36,fontWeight:900,letterSpacing:4,color:'#fff',fontFamily:"'Bebas Neue',cursive"}}>{score.home} - {score.away}</div>}
                  <div style={{fontSize:16,fontWeight:800,marginTop:score?4:0}}>{teams.home.name} x {teams.away.name}</div>
                  <div style={{fontSize:12,color:'#8892a4',marginTop:3}}>{selected.name}</div>
                  {si.aoVivo&&<span style={{background:'#ff174422',color:'#ff5252',border:'1px solid #ff174444',borderRadius:5,padding:'2px 10px',fontSize:11,fontWeight:700,marginTop:6,display:'inline-block'}}>AO VIVO</span>}
                </div>
                <img src={teams.away.logo} style={{width:48,height:48,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
              </div>

              <div style={{fontWeight:700,fontSize:14,marginBottom:14,color:'#7c8cff'}}>Probabilidades</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
                <div>
                  <ProbBar label={`Vitoria ${teams.home.name}`} value={probs.homeWin} color="#00e676"/>
                  <ProbBar label="Empate" value={probs.draw} color="#ffab00"/>
                  <ProbBar label={`Vitoria ${teams.away.name}`} value={probs.awayWin} color="#ff5252"/>
                </div>
                <div>
                  <ProbBar label="Over 2.5 gols" value={probs.over25} color="#7c8cff"/>
                  <ProbBar label="Over 1.5 gols" value={probs.over15} color="#00bcd4"/>
                  <ProbBar label="Ambas marcam (BTTS)" value={probs.btts} color="#e040fb"/>
                </div>
              </div>
            </div>

            {/* Stats ao vivo */}
            {stats&&(stats.home.shots!=='0'||stats.home.possession!=='0')&&(
              <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Estatisticas da Partida</div>
                {[
                  ['Chutes no Alvo', stats.home.shots, stats.away.shots],
                  ['Posse de Bola %', stats.home.possession, stats.away.possession],
                  ['Faltas', stats.home.fouls, stats.away.fouls],
                  ['Escanteios', stats.home.corners, stats.away.corners],
                  ['Cartoes Amarelos', stats.home.yellowCards, stats.away.yellowCards],
                ].map(([label, h, a])=>{
                  const hv = parseFloat(h)||0, av = parseFloat(a)||0, total = hv+av||1
                  const hpct = Math.round(hv/total*100)
                  return (
                    <div key={label} style={{marginBottom:12}}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                        <span style={{fontSize:13,fontWeight:700,color:'#7c8cff'}}>{h}</span>
                        <span style={{fontSize:11,color:'#8892a4'}}>{label}</span>
                        <span style={{fontSize:13,fontWeight:700,color:'#ff5252'}}>{a}</span>
                      </div>
                      <div style={{background:'#1e2538',borderRadius:6,height:6,display:'flex',overflow:'hidden'}}>
                        <div style={{background:'#7c8cff',width:`${hpct}%`,transition:'width 0.5s'}}/>
                        <div style={{background:'#ff5252',flex:1}}/>
                      </div>
                    </div>
                  )
                })}
                <div style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                  <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:10,height:10,borderRadius:2,background:'#7c8cff'}}/><span style={{fontSize:11,color:'#8892a4'}}>{teams.home.name}</span></div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:10,height:10,borderRadius:2,background:'#ff5252'}}/><span style={{fontSize:11,color:'#8892a4'}}>{teams.away.name}</span></div>
                </div>
              </div>
            )}

            {/* Times */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
              {[['Casa', teams.home], ['Fora', teams.away]].map(([tipo, team])=>(
                <div key={tipo} style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'18px 20px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
                    <img src={team.logo} style={{width:32,height:32,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>{team.name}</div>
                      <div style={{fontSize:11,color:'#8892a4'}}>{tipo} · {team.record||'--'}</div>
                    </div>
                  </div>
                  {team.record&&(()=>{
                    const parts = team.record.split('-').map(Number)
                    const w=parts[0]||0, d=parts[1]||0, l=parts[2]||0
                    const total = w+d+l||1
                    return (
                      <div style={{display:'flex',gap:8}}>
                        {[['V',w,'#00e676'],['E',d,'#ffab00'],['D',l,'#ff1744']].map(([lbl,val,cor])=>(
                          <div key={lbl} style={{flex:1,background:'#0f1320',borderRadius:8,padding:'8px',textAlign:'center'}}>
                            <div style={{fontSize:11,color:cor,fontWeight:700}}>{lbl}</div>
                            <div style={{fontSize:18,fontWeight:800,color:cor}}>{val}</div>
                            <div style={{fontSize:10,color:'#8892a4'}}>{Math.round(val/total*100)}%</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ))}
            </div>

            <div style={{background:'#ffab0011',border:'1px solid #ffab0033',borderRadius:12,padding:'14px 18px'}}>
              <div style={{fontSize:12,color:'#a0aec0'}}>Probabilidades calculadas com base no desempenho historico dos times. Dados via ESPN. Aposte com responsabilidade.</div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ===================== MATCH SEARCH (formulario) =====================
function MatchSearch({ onSelect }) {
  const [open, setOpen] = useState(false)
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [date, setDate] = useState(new Date().toISOString().slice(0,10))
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function buscar() {
    setLoading(true); setSearched(true)
    try {
      const data = await fetchESPN(liga.id, date)
      setEvents(data)
    } catch(e) { setEvents([]) }
    setLoading(false)
  }

  function selecionar(event) {
    const comps = event.competitions?.[0]
    const home = comps?.competitors?.find(c=>c.homeAway==='home')
    const away = comps?.competitors?.find(c=>c.homeAway==='away')
    onSelect({
      evento: `${home?.team?.displayName||''} x ${away?.team?.displayName||''}`,
      esporte: 'Futebol', data: date, mercado: liga.nome
    })
    setOpen(false)
  }

  return (
    <div style={{gridColumn:'1 / span 2',marginBottom:4}}>
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{width:'100%',background:'#1a2540',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'9px 14px',cursor:'pointer',fontWeight:700,fontSize:13,textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
        Buscar partida para preencher automaticamente
        <span style={{marginLeft:'auto',fontSize:11,color:'#8892a4'}}>{open?'v':'^'}</span>
      </button>
      {open&&(
        <div style={{background:'#0f1320',border:'1px solid #2a3048',borderRadius:10,padding:14,marginTop:8}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,marginBottom:10,alignItems:'end'}}>
            <div>
              <label style={{fontSize:10,color:'#8892a4',fontWeight:700,display:'block',marginBottom:4}}>COMPETICAO</label>
              <select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={{...inp,fontSize:12}}>
                {LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:10,color:'#8892a4',fontWeight:700,display:'block',marginBottom:4}}>DATA</label>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{...inp,fontSize:12,width:140}}/>
            </div>
            <button type="button" onClick={buscar} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'9px 16px',cursor:'pointer',fontWeight:700,fontSize:12,whiteSpace:'nowrap'}}>
              {loading?'Buscando...':'Buscar'}
            </button>
          </div>
          {searched&&!loading&&events.length===0&&<div style={{textAlign:'center',color:'#8892a4',padding:16,fontSize:13}}>Nenhuma partida encontrada.</div>}
          {events.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:240,overflowY:'auto'}}>
              {events.map(event=>{
                const comps = event.competitions?.[0]
                const home = comps?.competitors?.find(c=>c.homeAway==='home')
                const away = comps?.competitors?.find(c=>c.homeAway==='away')
                const status = event.status?.type
                const aoVivo = status?.name==='STATUS_IN_PROGRESS'
                const fim = status?.completed
                const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
                return (
                  <button type="button" key={event.id} onClick={()=>selecionar(event)}
                    style={{background:'#141928',border:'1px solid #2a3048',borderRadius:8,padding:'10px 14px',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:10}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='#3d5afe'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='#2a3048'}>
                    <img src={home?.team?.logo} style={{width:24,height:24,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:'#e8eaf6'}}>{home?.team?.displayName} x {away?.team?.displayName}</div>
                      <div style={{fontSize:11,color:'#8892a4',marginTop:1}}>{liga.nome}</div>
                    </div>
                    <img src={away?.team?.logo} style={{width:24,height:24,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                    <div style={{minWidth:60,textAlign:'right'}}>
                      {aoVivo?<span style={{background:'#ff174422',color:'#ff5252',border:'1px solid #ff174444',borderRadius:5,padding:'2px 6px',fontSize:10,fontWeight:700}}>AO VIVO</span>
                        :fim?<span style={{color:'#8892a4',fontSize:12}}>{comps?.competitors?.find(c=>c.homeAway==='home')?.score} - {comps?.competitors?.find(c=>c.homeAway==='away')?.score}</span>
                        :<span style={{color:'#ffab00',fontSize:12,fontWeight:600}}>{hora}</span>}
                    </div>
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

// ===================== INTELIGENCIA TAB =====================
function InteligenciaTab({ bets }) {
  const tt = {background:'#141928',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',fontSize:12}
  const finalizadas = useMemo(()=>bets.filter(b=>b.status!=='pendente'),[bets])

  const porMercado = useMemo(()=>{
    const map={}
    finalizadas.forEach(b=>{
      const m = b.mercado||'Sem mercado'
      if(!map[m]) map[m]={ganhou:0,total:0,lucro:0,invested:0}
      map[m].total++; map[m].invested+=b.valor
      if(b.status==='ganhou'){map[m].ganhou++;map[m].lucro+=b.retorno-b.valor}
      else map[m].lucro-=b.valor
    })
    return Object.entries(map).map(([name,v])=>({name,winrate:+((v.ganhou/v.total)*100).toFixed(0),lucro:+v.lucro.toFixed(2),total:v.total,roi:+(v.lucro/v.invested*100).toFixed(1)})).sort((a,b)=>b.roi-a.roi)
  },[finalizadas])

  const porOddRange = useMemo(()=>{
    const ranges=[{label:'1.01-1.50',min:1.01,max:1.50},{label:'1.51-2.00',min:1.51,max:2.00},{label:'2.01-3.00',min:2.01,max:3.00},{label:'3.01-5.00',min:3.01,max:5.00},{label:'5.01+',min:5.01,max:999}]
    return ranges.map(r=>{
      const bts=finalizadas.filter(b=>b.odd>=r.min&&b.odd<=r.max)
      const won=bts.filter(b=>b.status==='ganhou')
      const invested=bts.reduce((s,b)=>s+b.valor,0)
      const returned=won.reduce((s,b)=>s+(b.retorno||0),0)
      const lucro=returned-invested
      return {name:r.label,total:bts.length,winrate:bts.length?+((won.length/bts.length)*100).toFixed(0):0,lucro:+lucro.toFixed(2),roi:invested?+(lucro/invested*100).toFixed(1):0}
    }).filter(r=>r.total>0)
  },[finalizadas])

  const porDia = useMemo(()=>{
    const dias=['Dom','Seg','Ter','Qua','Qui','Sex','Sab']
    const map={}
    finalizadas.forEach(b=>{
      const d=new Date(b.data+'T12:00:00').getDay()
      const lbl=dias[d]
      if(!map[lbl]) map[lbl]={ganhou:0,total:0,lucro:0}
      map[lbl].total++
      if(b.status==='ganhou'){map[lbl].ganhou++;map[lbl].lucro+=b.retorno-b.valor}
      else map[lbl].lucro-=b.valor
    })
    return dias.map(d=>({name:d,...(map[d]||{ganhou:0,total:0,lucro:0})}))
  },[finalizadas])

  const insights = useMemo(()=>{
    if(finalizadas.length<5) return [{tipo:'info',msg:'Registre pelo menos 5 apostas finalizadas para ver insights personalizados.'}]
    const res=[]
    const melhorMercado=[...porMercado].filter(m=>m.total>=2).sort((a,b)=>b.roi-a.roi)[0]
    if(melhorMercado&&melhorMercado.roi>0) res.push({tipo:'positivo',msg:`Seu melhor mercado e "${melhorMercado.name}" com ROI de ${melhorMercado.roi}%. Foque mais nele.`})
    const piorMercado=[...porMercado].filter(m=>m.total>=2).sort((a,b)=>a.roi-b.roi)[0]
    if(piorMercado&&piorMercado.roi<-10) res.push({tipo:'negativo',msg:`Evite o mercado "${piorMercado.name}" com ROI de ${piorMercado.roi}%. Essa esta te custando dinheiro.`})
    const melhorOdd=[...porOddRange].filter(o=>o.total>=3).sort((a,b)=>b.roi-a.roi)[0]
    if(melhorOdd&&melhorOdd.roi>0) res.push({tipo:'positivo',msg:`Odds entre ${melhorOdd.name} sao as mais lucrativas pra voce (ROI ${melhorOdd.roi}%).`})
    const won=finalizadas.filter(b=>b.status==='ganhou')
    const wr=(won.length/finalizadas.length*100).toFixed(0)
    if(wr<40) res.push({tipo:'negativo',msg:`Sua taxa de acerto esta em ${wr}%. Seja mais seletivo nas entradas.`})
    else if(wr>60) res.push({tipo:'positivo',msg:`Taxa de acerto de ${wr}%! Voce esta acima da media.`})
    const avgOdd=finalizadas.reduce((s,b)=>s+b.odd,0)/finalizadas.length
    if(avgOdd>3) res.push({tipo:'alerta',msg:`Sua odd media e ${avgOdd.toFixed(2)}. Odds muito altas tem menor taxa de acerto.`})
    const melhorDia=porDia.filter(d=>d.total>=2).sort((a,b)=>b.lucro-a.lucro)[0]
    if(melhorDia&&melhorDia.lucro>0) res.push({tipo:'positivo',msg:`${melhorDia.name} e seu dia mais lucrativo. Priorize apostas nesse dia.`})
    return res.length?res:[{tipo:'info',msg:'Continue registrando apostas para receber insights mais precisos.'}]
  },[finalizadas,porMercado,porOddRange,porDia])

  const insightColors = {positivo:'#00e676',negativo:'#ff1744',alerta:'#ffab00',info:'#7c8cff'}

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Insights do seu Historico</div>
        <div style={{display:'flex',flexDirection:'column',gap:10}}>
          {insights.map((ins,i)=>(
            <div key={i} style={{background:insightColors[ins.tipo]+'11',border:`1px solid ${insightColors[ins.tipo]}33`,borderRadius:10,padding:'12px 16px'}}>
              <span style={{fontSize:13,color:'#e8eaf6',lineHeight:1.5}}>{ins.msg}</span>
            </div>
          ))}
        </div>
      </div>

      {porMercado.length>0&&(
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>ROI por Mercado</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {porMercado.map((m,i)=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',background:'#0f1320',borderRadius:10}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:CHART_COLORS[i%CHART_COLORS.length],flexShrink:0}}/>
                <div style={{flex:1,fontSize:13,fontWeight:600}}>{m.name}</div>
                <div style={{fontSize:11,color:'#8892a4'}}>{m.total} ap.</div>
                <div style={{fontSize:12,color:'#ffab00',width:44,textAlign:'right'}}>{m.winrate}%</div>
                <div style={{fontSize:13,fontWeight:700,color:m.roi>=0?'#00e676':'#ff1744',width:70,textAlign:'right'}}>ROI {m.roi}%</div>
                <div style={{fontSize:13,fontWeight:700,color:m.lucro>=0?'#00e676':'#ff1744',width:90,textAlign:'right'}}>R$ {m.lucro}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {porOddRange.length>0&&(
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Performance por Faixa de Odd</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={porOddRange}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/>
              <XAxis dataKey="name" stroke="#8892a4" fontSize={11}/>
              <YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`${v}%`}/>
              <Tooltip contentStyle={tt} formatter={(v,n)=>n==='roi'?[`${v}%`,'ROI']:[`${v}%`,'Winrate']}/>
              <Bar dataKey="roi" radius={[4,4,0,0]}>
                {porOddRange.map((e,i)=><Cell key={i} fill={e.roi>=0?'#00e676':'#ff1744'}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
            {porOddRange.map((o,i)=>(
              <div key={i} style={{background:'#0f1320',borderRadius:10,padding:'10px 14px',flex:1,minWidth:100,textAlign:'center'}}>
                <div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>{o.name}</div>
                <div style={{fontSize:16,fontWeight:800,color:o.roi>=0?'#00e676':'#ff1744'}}>{o.roi}%</div>
                <div style={{fontSize:10,color:'#8892a4'}}>{o.total} apostas</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Lucro por Dia da Semana</div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={porDia}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/>
            <XAxis dataKey="name" stroke="#8892a4" fontSize={12}/>
            <YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/>
            <Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/>
            <Bar dataKey="lucro" radius={[4,4,0,0]}>
              {porDia.map((e,i)=><Cell key={i} fill={e.lucro>=0?'#00e676':'#ff1744'}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
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
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Evolucao do Bankroll</div>
        {bankrollData.length<2?<div style={{color:'#8892a4',textAlign:'center',padding:40}}>Registre mais apostas finalizadas para ver o grafico</div>
          :<ResponsiveContainer width="100%" height={220}><LineChart data={bankrollData}><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis dataKey="data" stroke="#8892a4" fontSize={11}/><YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Saldo']}/><Line type="monotone" dataKey="lucro" stroke="#00e676" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:20}}>
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Lucro por Esporte</div>
          {byEsporte.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30,fontSize:13}}>Sem dados</div>
            :<ResponsiveContainer width="100%" height={200}><BarChart data={byEsporte} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis type="number" stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><YAxis dataKey="name" type="category" stroke="#8892a4" fontSize={11} width={70}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/><Bar dataKey="lucro" radius={[0,4,4,0]}>{byEsporte.map((e,i)=><Cell key={i} fill={e.lucro>=0?'#00e676':'#ff1744'}/>)}</Bar></BarChart></ResponsiveContainer>}
        </div>
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Performance por Casa</div>
          {byCasa.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30,fontSize:13}}>Sem dados</div>
            :<div style={{display:'flex',flexDirection:'column',gap:10}}>{byCasa.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:8,height:8,borderRadius:'50%',background:CHART_COLORS[i%CHART_COLORS.length],flexShrink:0}}/><div style={{flex:1,fontSize:13,fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:'#8892a4'}}>{c.total} ap.</div><div style={{fontSize:12,color:'#ffab00',width:40,textAlign:'right'}}>{c.winrate}%</div><div style={{fontSize:13,fontWeight:700,color:c.lucro>=0?'#00e676':'#ff1744',width:80,textAlign:'right'}}>R$ {c.lucro}</div></div>)}</div>}
        </div>
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
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:24}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:20}}>Situacao do Bankroll</div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
          <StatCard label="Bankroll Inicial" value={`R$ ${Number(config.bankroll_inicial).toFixed(2)}`} color="#7c8cff"/>
          <StatCard label="Saldo Atual" value={`R$ ${stats.saldoAtual.toFixed(2)}`} color={stats.saldoAtual>=config.bankroll_inicial?'#00e676':'#ff1744'}/>
          <StatCard label="Resultado Total" value={`R$ ${stats.lucroTotal.toFixed(2)}`} color={stats.lucroTotal>=0?'#00e676':'#ff1744'}/>
          <StatCard label="Variacao" value={`${stats.pct}%`} color={parseFloat(stats.pct)>=0?'#00e676':'#ff1744'}/>
        </div>
      </div>
      {kelly&&<div style={{background:'#111724',border:'1px solid #ffab0033',borderRadius:16,padding:'20px 24px'}}><div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Criterio de Kelly</div><div style={{color:'#8892a4',fontSize:12,marginBottom:14}}>Baseado no seu historico</div><div style={{display:'flex',gap:24,flexWrap:'wrap'}}><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>% DO BANKROLL</div><div style={{fontSize:26,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{kelly.kf}%</div></div><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>VALOR SUGERIDO</div><div style={{fontSize:26,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>R$ {kelly.val}</div></div></div><div style={{color:'#8892a4',fontSize:11,marginTop:10}}>Sugestao teorica. Nunca aposte mais do que pode perder.</div></div>}
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15}}>Configuracoes</div>
          {!editing&&<button onClick={()=>setEditing(true)} style={{background:'#1e2a4a',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>Editar</button>}
        </div>
        {editing?(
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>BANKROLL INICIAL (R$)</label><input type="number" value={form.bankroll_inicial} onChange={e=>setForm(f=>({...f,bankroll_inicial:e.target.value}))} style={inp}/></div>
            <div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>STOP LOSS (%)</label><input type="number" value={form.stop_loss_percent} onChange={e=>setForm(f=>({...f,stop_loss_percent:e.target.value}))} style={inp} min="1" max="100"/></div>
            <div style={{gridColumn:'1 / span 2',display:'flex',gap:10}}>
              <button onClick={()=>setEditing(false)} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:9,padding:10,cursor:'pointer'}}>Cancelar</button>
              <button onClick={saveConfig} disabled={saving} style={{flex:2,background:'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:9,padding:10,cursor:'pointer',fontWeight:700}}>{saving?'Salvando...':'Salvar'}</button>
            </div>
          </div>
        ):(
          <div style={{display:'flex',gap:24}}>
            <div><div style={{fontSize:11,color:'#8892a4'}}>BANKROLL INICIAL</div><div style={{fontSize:18,fontWeight:700,marginTop:3}}>R$ {Number(config.bankroll_inicial).toFixed(2)}</div></div>
            <div><div style={{fontSize:11,color:'#8892a4'}}>STOP LOSS</div><div style={{fontSize:18,fontWeight:700,color:'#ff5252',marginTop:3}}>{config.stop_loss_percent}% = R$ {stats.stopLossVal.toFixed(2)}</div></div>
          </div>
        )}
      </div>
    </div>
  )
}

// ===================== BET FORM =====================
function BetForm({ editData, userId, onSave, onClose }) {
  const [saving, setSaving] = useState(false)
  const r = { data:useRef(),evento:useRef(),esporte:useRef(),mercado:useRef(),selecao:useRef(),casa:useRef(),tipo:useRef(),odd:useRef(),valor:useRef(),status:useRef(),observacao:useRef() }

  function preencherPartida({ evento, esporte, data, mercado }) {
    if(r.evento.current) r.evento.current.value=evento
    if(r.esporte.current) r.esporte.current.value=esporte
    if(r.data.current) r.data.current.value=data
    if(r.mercado.current) r.mercado.current.value=mercado
  }

  async function handleSave() {
    const evento=r.evento.current.value, odd=parseFloat(r.odd.current.value), valor=parseFloat(r.valor.current.value)
    if(!evento||!odd||!valor) return alert('Preencha Evento, Odd e Valor')
    setSaving(true)
    const status=r.status.current.value
    const retorno=status==='ganhou'?+(odd*valor).toFixed(2):status==='perdeu'?0:null
    const payload={data:r.data.current.value,evento,esporte:r.esporte.current.value,mercado:r.mercado.current.value,selecao:r.selecao.current.value,casa:r.casa.current.value,tipo:r.tipo.current.value,odd,valor,status,retorno,observacao:r.observacao.current.value,user_id:userId}
    if(editData?.id) await supabase.from('apostas').update(payload).eq('id',editData.id)
    else await supabase.from('apostas').insert(payload)
    setSaving(false); onSave()
  }

  const lbl=(t)=><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>{t}</label>
  const dv=(k)=>editData?.[k]??''

  return (
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,backdropFilter:'blur(4px)',padding:16}}>
      <div style={{background:'#141928',border:'1px solid #2a3048',borderRadius:18,padding:28,width:'100%',maxWidth:520,maxHeight:'92vh',overflowY:'auto'}}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:18}}>{editData?.id?'Editar Aposta':'Nova Aposta'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}>
          {!editData?.id&&<MatchSearch onSelect={preencherPartida}/>}
          <div>{lbl('DATA')}<input ref={r.data} type="date" defaultValue={editData?.data??new Date().toISOString().slice(0,10)} style={inp}/></div>
          <div>{lbl('STATUS')}<select ref={r.status} defaultValue={dv('status')||'pendente'} style={inp}><option>pendente</option><option>ganhou</option><option>perdeu</option></select></div>
          <div style={{gridColumn:'1 / span 2'}}>{lbl('EVENTO / JOGO')}<input ref={r.evento} type="text" defaultValue={dv('evento')} style={inp}/></div>
          <div>{lbl('ESPORTE')}<select ref={r.esporte} defaultValue={dv('esporte')||'Futebol'} style={inp}>{ESPORTES.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('CASA DE APOSTAS')}<select ref={r.casa} defaultValue={dv('casa')||'Bet365'} style={inp}>{CASAS.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('TIPO')}<select ref={r.tipo} defaultValue={dv('tipo')||'simples'} style={inp}><option>simples</option><option>multipla</option><option>ao vivo</option></select></div>
          <div>{lbl('MERCADO')}<input ref={r.mercado} type="text" defaultValue={dv('mercado')} style={inp}/></div>
          <div>{lbl('SELECAO')}<input ref={r.selecao} type="text" defaultValue={dv('selecao')} style={inp}/></div>
          <div>{lbl('ODD')}<input ref={r.odd} type="number" step="0.01" min="1.01" defaultValue={dv('odd')} style={inp}/></div>
          <div>{lbl('VALOR (R$)')}<input ref={r.valor} type="number" step="0.01" min="0.01" defaultValue={dv('valor')} style={inp}/></div>
          <div style={{gridColumn:'1 / span 2'}}>{lbl('OBSERVACAO')}<input ref={r.observacao} type="text" defaultValue={dv('observacao')} style={inp}/></div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:22}}>
          <button onClick={onClose} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:10,padding:12,cursor:'pointer',fontWeight:600}}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{flex:2,background:saving?'#1e2538':'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:10,padding:12,cursor:'pointer',fontWeight:700,fontSize:15}}>{saving?'Salvando...':'Salvar'}</button>
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
  async function updateStatus(id,status) { const bet=bets.find(b=>b.id===id); const retorno=status==='ganhou'?+(bet.odd*bet.valor).toFixed(2):0; await supabase.from('apostas').update({status,retorno}).eq('id',id); onRefresh() }
  async function deleteBet(id) { if(!confirm('Excluir esta aposta?')) return; await supabase.from('apostas').delete().eq('id',id); onRefresh() }
  const counts = useMemo(()=>({todos:bets.length,pendente:bets.filter(b=>b.status==='pendente').length,ganhou:bets.filter(b=>b.status==='ganhou').length,perdeu:bets.filter(b=>b.status==='perdeu').length}),[bets])
  const filtered = useMemo(()=>{ let list=filter==='todos'?bets:bets.filter(b=>b.status===filter); if(search) list=list.filter(b=>b.evento?.toLowerCase().includes(search.toLowerCase())||b.selecao?.toLowerCase().includes(search.toLowerCase())||b.casa?.toLowerCase().includes(search.toLowerCase())); return [...list].sort((a,b)=>{ let av=a[sortField],bv=b[sortField]; if(typeof av==='string') return sortDir==='asc'?av.localeCompare(bv):bv.localeCompare(av); return sortDir==='asc'?av-bv:bv-av }) },[bets,filter,search,sortField,sortDir])
  function hs(f){if(sortField===f) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortField(f);setSortDir('desc')}}
  return (
    <>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        {[['todos',`Todos (${counts.todos})`],['pendente',`Pend. (${counts.pendente})`],['ganhou',`Ganhos (${counts.ganhou})`],['perdeu',`Perdidos (${counts.perdeu})`]].map(([f,l])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'#1e2a4a':'transparent',border:`1px solid ${filter===f?'#3d5afe':'#2a3048'}`,color:filter===f?'#fff':'#8892a4',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>
        ))}
        <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:200,marginLeft:'auto'}}/>
        <button onClick={()=>exportCSV(filtered)} style={{background:'#1a2030',border:'1px solid #2a3048',color:'#8892a4',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>Exportar CSV</button>
      </div>
      <div style={{background:'#111724',borderRadius:16,border:'1px solid #1e2538',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
          <thead>
            <tr style={{background:'#0f1320',borderBottom:'1px solid #1e2538'}}>
              {[['data','Data'],['evento','Evento'],['esporte','Esporte'],['casa','Casa'],['odd','Odd'],['valor','Valor'],['status','Status'],['retorno','Retorno']].map(([f,l])=>(
                <th key={f} onClick={()=>hs(f)} style={{padding:'11px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#8892a4',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>{l} {sortField===f?(sortDir==='asc'?'↑':'↓'):''}</th>
              ))}
              <th style={{padding:'11px 14px',fontSize:10,fontWeight:700,color:'#8892a4',letterSpacing:1,textTransform:'uppercase'}}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0&&<tr><td colSpan={9} style={{textAlign:'center',padding:40,color:'#8892a4'}}>Nenhuma aposta encontrada</td></tr>}
            {filtered.map((bet,i)=>(
              <tr key={bet.id} style={{borderBottom:'1px solid #1a2030',background:i%2===0?'transparent':'#0f1320'}}>
                <td style={{padding:'12px 14px',fontSize:12,color:'#8892a4'}}>{bet.data}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:600}}>{bet.evento}<div style={{fontSize:11,color:'#7c8cff'}}>{bet.selecao}</div>{bet.mercado&&<div style={{fontSize:10,color:'#8892a4'}}>{bet.mercado}</div>}</td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.esporte||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.casa||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:'#ffab00'}}>{Number(bet.odd).toFixed(2)}</td>
                <td style={{padding:'12px 14px',fontSize:13}}>R$ {Number(bet.valor).toFixed(2)}</td>
                <td style={{padding:'12px 14px'}}>{bet.status==='pendente'?<div style={{display:'flex',gap:5}}><button onClick={()=>updateStatus(bet.id,'ganhou')} style={{background:'#00e67622',border:'1px solid #00e67644',color:'#00e676',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11}}>V</button><button onClick={()=>updateStatus(bet.id,'perdeu')} style={{background:'#ff174422',border:'1px solid #ff174444',color:'#ff1744',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11}}>X</button></div>:<Badge status={bet.status}/>}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:bet.retorno===null?'#8892a4':bet.retorno>0?'#00e676':'#ff1744'}}>{bet.retorno===null?'-':`R$ ${Number(bet.retorno).toFixed(2)}`}</td>
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
  const [tab, setTab] = useState('apostas')
  const [showForm, setShowForm] = useState(false)
  const fetchBets = useCallback(async()=>{ const {data}=await supabase.from('apostas').select('*').eq('user_id',user.id).order('data',{ascending:false}); setBets(data||[]); setLoading(false) },[user.id])
  useEffect(()=>{fetchBets()},[fetchBets])
  const stats = useMemo(()=>{ const won=bets.filter(b=>b.status==='ganhou'),lost=bets.filter(b=>b.status==='perdeu'); const fin=won.length+lost.length; const invested=bets.reduce((s,b)=>s+Number(b.valor),0); const returned=won.reduce((s,b)=>s+(b.retorno||0),0); const profit=returned-won.reduce((s,b)=>s+Number(b.valor),0)-lost.reduce((s,b)=>s+Number(b.valor),0); const roi=invested>0?((returned-invested)/invested*100).toFixed(1):'0.0'; const winrate=fin>0?((won.length/fin)*100).toFixed(0):'0'; return {total:bets.length,won:won.length,lost:lost.length,pending:bets.filter(b=>b.status==='pendente').length,invested,profit,roi,winrate} },[bets])
  const TABS=[['apostas','Apostas'],['analytics','Analytics'],['inteligencia','Inteligencia'],['sugestoes','Sugestoes'],['scouts','Scouts'],['bankroll','Bankroll']]
  return (
    <div style={{minHeight:'100vh',background:'#0b0e1a',color:'#e8eaf6',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:'#0f1320',borderBottom:'1px solid #1e2538',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,background:'linear-gradient(135deg,#00c853,#00897b)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:900,color:'#fff'}}>B</div>
          <div><div style={{fontSize:16,fontWeight:800}}>BetControl</div><div style={{fontSize:10,color:'#8892a4',letterSpacing:1}}>{user.email}</div></div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>setShowForm(true)} style={{background:'linear-gradient(135deg,#00c853,#00897b)',color:'#fff',border:'none',borderRadius:9,padding:'9px 16px',fontWeight:700,fontSize:13,cursor:'pointer'}}>+ Nova</button>
          <button onClick={()=>supabase.auth.signOut()} style={{background:'#1a1f2e',color:'#8892a4',border:'1px solid #2a3048',borderRadius:9,padding:'9px 12px',fontSize:13,cursor:'pointer'}}>Sair</button>
        </div>
      </div>
      <div style={{maxWidth:1100,margin:'0 auto',padding:'22px 16px 40px'}}>
        <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
          <StatCard label="Total Apostado" value={`R$ ${stats.invested.toFixed(2)}`} color="#7c8cff"/>
          <StatCard label="Lucro/Prejuizo" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit>=0?'#00e676':'#ff1744'}/>
          <StatCard label="ROI" value={`${stats.roi}%`} color={parseFloat(stats.roi)>=0?'#00e676':'#ff1744'}/>
          <StatCard label="Taxa de Acerto" value={`${stats.winrate}%`} sub={`${stats.won}G / ${stats.lost}P / ${stats.pending} pend.`} color="#ffab00"/>
        </div>
        <div style={{display:'flex',gap:4,marginBottom:20,background:'#111724',borderRadius:12,padding:4,flexWrap:'wrap'}}>
          {TABS.map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'#1e2a4a':'transparent',border:`1px solid ${tab===t?'#3d5afe44':'transparent'}`,color:tab===t?'#fff':'#8892a4',borderRadius:9,padding:'8px 16px',fontSize:13,fontWeight:600,cursor:'pointer'}}>{l}</button>
          ))}
        </div>
        {loading?<div style={{textAlign:'center',padding:60,color:'#8892a4'}}>Carregando...</div>
          :tab==='apostas'?<ApostasTab bets={bets} userId={user.id} onRefresh={fetchBets}/>
          :tab==='analytics'?<Analytics bets={bets}/>
          :tab==='inteligencia'?<InteligenciaTab bets={bets}/>
          :tab==='sugestoes'?<SugestoesTab/>
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
