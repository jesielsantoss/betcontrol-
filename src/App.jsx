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
    const invested = bets.reduce((s,b)=>s+Number(b.valor),0)
    const returned = won.reduce((s,b)=>s+(b.retorno||0),0)
    const profit = returned - won.reduce((s,b)=>s+Number(b.valor),0) - lost.reduce((s,b)=>s+Number(b.valor),0)
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
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
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
  const [evento, setEvento] = useState('')
  const [mercado, setMercado] = useState('Resultado Final')
  const [selecao, setSelecao] = useState('')
  const [linhas, setLinhas] = useState([
    {casa:'Bet365', odd:''},
    {casa:'Betano', odd:''},
    {casa:'Sportingbet', odd:''},
    {casa:'KTO', odd:''},
  ])

  const MERCADOS = ['Resultado Final','Over/Under 2.5','Ambas Marcam','Handicap','Dupla Hipotese','Marcador','Over/Under 1.5','Over/Under 3.5']

  function updateLinha(i, field, value) {
    setLinhas(ls => ls.map((l,idx) => idx===i ? {...l,[field]:value} : l))
  }

  function addLinha() {
    setLinhas(ls => [...ls, {casa:'', odd:''}])
  }

  function removeLinha(i) {
    setLinhas(ls => ls.filter((_,idx)=>idx!==i))
  }

  const analise = useMemo(() => {
    const validas = linhas.filter(l => l.casa && parseFloat(l.odd) > 1)
    if (validas.length < 2) return null

    const odds = validas.map(l => ({...l, odd: parseFloat(l.odd)}))
    const melhor = odds.reduce((a,b) => b.odd > a.odd ? b : a)
    const pior = odds.reduce((a,b) => b.odd < a.odd ? b : a)
    const media = odds.reduce((s,l)=>s+l.odd,0)/odds.length
    const impliedProbs = odds.map(l => ({...l, prob: +(100/l.odd).toFixed(1)}))
    const probMedia = +(100/media).toFixed(1)
    const diferenca = +(((melhor.odd - pior.odd)/pior.odd)*100).toFixed(1)
    const evMelhor = +(melhor.odd * (probMedia/100) - 1).toFixed(3)

    return { odds, melhor, pior, media: +media.toFixed(3), impliedProbs, probMedia, diferenca, evMelhor }
  },[linhas])

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <GlassCard>
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Comparador de Odds</div>
        <div style={{color:'#8892a4',fontSize:12,marginBottom:20}}>Compare odds de diferentes casas e descubra onde tem mais valor.</div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>EVENTO</label>
            <input value={evento} onChange={e=>setEvento(e.target.value)} placeholder="Ex: Flamengo x Palmeiras" style={inp}/>
          </div>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>MERCADO</label>
            <select value={mercado} onChange={e=>setMercado(e.target.value)} style={inp}>
              {MERCADOS.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div style={{gridColumn:'1 / span 2'}}>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>SELECAO</label>
            <input value={selecao} onChange={e=>setSelecao(e.target.value)} placeholder="Ex: Flamengo vence, Over 2.5..." style={inp}/>
          </div>
        </div>

        <div style={{fontWeight:700,fontSize:13,marginBottom:10,color:'#8892a4'}}>ODDS POR CASA</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {linhas.map((l,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 140px auto',gap:10,alignItems:'center'}}>
              <select value={l.casa} onChange={e=>updateLinha(i,'casa',e.target.value)} style={{...inp,fontSize:13}}>
                <option value="">Casa de aposta...</option>
                {CASAS.map(c=><option key={c}>{c}</option>)}
              </select>
              <input type="number" step="0.01" min="1.01" value={l.odd} onChange={e=>updateLinha(i,'odd',e.target.value)} placeholder="Odd" style={{...inp,fontSize:15,fontWeight:700,textAlign:'center'}}/>
              <button onClick={()=>removeLinha(i)} style={{background:'#2a1020',border:'1px solid #ff174433',color:'#ff5252',borderRadius:8,width:36,height:36,cursor:'pointer',fontSize:16,flexShrink:0}}>x</button>
            </div>
          ))}
        </div>
        <button onClick={addLinha} style={{marginTop:10,background:'transparent',border:'1px dashed #2a3048',color:'#8892a4',borderRadius:8,padding:'8px',width:'100%',cursor:'pointer',fontSize:12,fontWeight:600}}>+ Adicionar casa</button>
      </GlassCard>

      {analise && (
        <>
          {/* Resultado visual */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            <GlassCard glow="#00e676" style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:8}}>MELHOR ODD</div>
              <div style={{fontSize:36,fontWeight:900,color:'#00e676',fontFamily:"'Bebas Neue',cursive"}}>{analise.melhor.odd}</div>
              <div style={{fontSize:13,color:'#00e676',fontWeight:700}}>{analise.melhor.casa}</div>
              <div style={{fontSize:11,color:'#8892a4',marginTop:4}}>Prob. implicita: {(100/analise.melhor.odd).toFixed(1)}%</div>
            </GlassCard>
            <GlassCard style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:8}}>ODD MEDIA</div>
              <div style={{fontSize:36,fontWeight:900,color:'#7c8cff',fontFamily:"'Bebas Neue',cursive"}}>{analise.media}</div>
              <div style={{fontSize:11,color:'#8892a4',marginTop:4}}>Prob. media: {analise.probMedia}%</div>
            </GlassCard>
            <GlassCard glow="#ffab00" style={{textAlign:'center'}}>
              <div style={{fontSize:10,color:'#8892a4',fontWeight:700,letterSpacing:1,marginBottom:8}}>DIFERENCA</div>
              <div style={{fontSize:36,fontWeight:900,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{analise.diferenca}%</div>
              <div style={{fontSize:11,color:'#8892a4',marginTop:4}}>entre melhor e pior</div>
            </GlassCard>
          </div>

          {/* Tabela de comparacao */}
          <GlassCard>
            <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>Comparativo Detalhado</div>
            {evento && <div style={{fontSize:13,color:'#7c8cff',marginBottom:4,fontWeight:600}}>{evento}{selecao?' — '+selecao:''}</div>}
            {mercado && <div style={{fontSize:11,color:'#8892a4',marginBottom:16}}>{mercado}</div>}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {[...analise.odds].sort((a,b)=>b.odd-a.odd).map((l,i)=>{
                const isMelhor = l.casa===analise.melhor.casa
                const diff = +(((l.odd-analise.pior.odd)/analise.pior.odd)*100).toFixed(1)
                const probImpl = (100/l.odd).toFixed(1)
                const ev = ((l.odd * (analise.probMedia/100)) - 1)
                return (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:isMelhor?'#00e67609':'#0f1320',border:`1px solid ${isMelhor?'#00e67633':'#1e2538'}`,borderRadius:12}}>
                    {isMelhor && <div style={{width:4,height:40,background:'#00e676',borderRadius:2,flexShrink:0}}/>}
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:700,color:isMelhor?'#00e676':'#e8eaf6'}}>{l.casa}</div>
                      <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>Prob. implicita: {probImpl}%</div>
                    </div>
                    <div style={{textAlign:'center',minWidth:60}}>
                      <div style={{fontSize:22,fontWeight:900,color:isMelhor?'#00e676':'#e8eaf6',fontFamily:"'Bebas Neue',cursive"}}>{l.odd}</div>
                    </div>
                    <div style={{textAlign:'right',minWidth:80}}>
                      <div style={{fontSize:12,fontWeight:700,color:ev>0?'#00e676':ev>-0.05?'#ffab00':'#ff5252'}}>EV: {ev>0?'+':''}{(ev*100).toFixed(1)}%</div>
                      {i>0&&<div style={{fontSize:11,color:'#8892a4'}}>-{diff}% vs melhor</div>}
                      {i===0&&<div style={{fontSize:11,color:'#00e676',fontWeight:700}}>MELHOR VALOR</div>}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{marginTop:16,padding:'12px 16px',background:'#7c8cff11',border:'1px solid #7c8cff22',borderRadius:10}}>
              <div style={{fontSize:12,color:'#a0aec0'}}>
                <strong style={{color:'#7c8cff'}}>EV (Expected Value)</strong>: valor esperado por aposta. EV positivo indica aposta com valor estatistico. Calculado com base na probabilidade media de todas as casas.
              </div>
            </div>
          </GlassCard>

          {/* Recomendacao */}
          <GlassCard glow={analise.evMelhor>0?'#00e676':'#ffab00'}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:8}}>Recomendacao</div>
            {analise.evMelhor > 0
              ? <div style={{fontSize:13,color:'#00e676',lineHeight:1.6}}>
                  Apostar na <strong>{analise.melhor.casa}</strong> oferece a melhor odd ({analise.melhor.odd}) com EV positivo de {(analise.evMelhor*100).toFixed(1)}%. Ha valor nesta aposta comparado a media do mercado.
                </div>
              : <div style={{fontSize:13,color:'#ffab00',lineHeight:1.6}}>
                  Nenhuma casa apresenta EV positivo neste mercado. O mercado esta com odds baixas — considere aguardar movimento ou buscar outro mercado.
                </div>}
          </GlassCard>
        </>
      )}
    </div>
  )
}

// ===================== SUGESTOES TAB =====================
function SugestoesTab() {
  const [liga, setLiga] = useState(LIGAS_ESPN[0])
  const [loading, setLoading] = useState(false)
  const [sugestoes, setSugestoes] = useState([])
  const [searched, setSearched] = useState(false)
  const [filtro, setFiltro] = useState('todos')

  const parseRecord = (rec) => {
    if (!rec) return {w:0,d:0,l:0,total:1}
    const parts = rec.split('-').map(Number)
    const w=parts[0]||0, d=parts[1]||0, l=parts[2]||0
    return {w,d,l,total:Math.max(1,w+d+l)}
  }

  async function buscarSugestoes() {
    setLoading(true); setSearched(true); setSugestoes([])
    try {
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
      for (const event of todos.slice(0, 25)) {
        const comps = event.competitions?.[0]
        const home = comps?.competitors?.find(c=>c.homeAway==='home')
        const away = comps?.competitors?.find(c=>c.homeAway==='away')
        if (!home || !away) continue

        const hr = parseRecord(home?.records?.[0]?.summary)
        const ar = parseRecord(away?.records?.[0]?.summary)
        const homeAllRec = parseRecord(home?.records?.[1]?.summary)
        const awayAllRec = parseRecord(away?.records?.[1]?.summary)

        const homeWinRate = hr.w / hr.total
        const awayWinRate = ar.w / ar.total
        const homeLoseRate = hr.l / hr.total
        const awayLoseRate = ar.l / ar.total
        const homeDrawRate = hr.d / hr.total
        const awayDrawRate = ar.d / ar.total
        const homeAttack = (hr.w + hr.d*0.4) / hr.total
        const awayAttack = (ar.w + ar.d*0.4) / ar.total

        const expGoals = homeAttack * 1.45 + awayAttack * 1.25
        const over25prob = Math.min(88, Math.round(expGoals * 27 + 14))
        const over15prob = Math.min(95, Math.round(over25prob + 14))
        const bttsProb = Math.min(84, Math.round(homeAttack * awayAttack * 115 + 16))
        const homeWinProb = Math.min(85, Math.round(homeWinRate * 55 + awayLoseRate * 22 + 7))
        const awayWinProb = Math.min(80, Math.round(awayWinRate * 50 + homeLoseRate * 20 + 5))
        const drawProb = Math.max(8, Math.min(38, 100 - homeWinProb - awayWinProb))

        const hora = new Date(event.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
        const dataFormatada = new Date(event._date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'})

        const bets = []
        if (over25prob >= 58) bets.push({tipo:'Over 2.5 Gols',prob:over25prob,oddMin:+(100/over25prob*0.92).toFixed(2),cor:'#00e676',icone:'GOL',motivo:'Ambos times com bom poder ofensivo'})
        if (bttsProb >= 58) bets.push({tipo:'Ambas Marcam',prob:bttsProb,oddMin:+(100/bttsProb*0.92).toFixed(2),cor:'#7c8cff',icone:'BTTS',motivo:'Os dois times tem historico de marcar'})
        if (homeWinProb >= 62) bets.push({tipo:`Vitoria ${home.team?.shortDisplayName||home.team?.displayName}`,prob:homeWinProb,oddMin:+(100/homeWinProb*0.93).toFixed(2),cor:'#ffab00',icone:'CASA',motivo:`Mandante com ${Math.round(hr.w/hr.total*100)}% de aproveitamento em casa`})
        if (awayWinProb >= 58) bets.push({tipo:`Vitoria ${away.team?.shortDisplayName||away.team?.displayName}`,prob:awayWinProb,oddMin:+(100/awayWinProb*0.93).toFixed(2),cor:'#e040fb',icone:'FORA',motivo:`Visitante com bom aproveitamento fora`})
        if (over15prob >= 80 && !bets.find(b=>b.tipo.includes('2.5'))) bets.push({tipo:'Over 1.5 Gols',prob:over15prob,oddMin:+(100/over15prob*0.92).toFixed(2),cor:'#00bcd4',icone:'GOL',motivo:'Alta chance de pelo menos 2 gols'})

        if (bets.length === 0) continue
        const melhor = bets.sort((a,b)=>b.prob-a.prob)[0]
        const confianca = melhor.prob >= 70 ? 'Alta' : melhor.prob >= 60 ? 'Media' : 'Baixa'
        const confCor = melhor.prob >= 70 ? '#00e676' : melhor.prob >= 60 ? '#ffab00' : '#ff5252'

        cards.push({
          id:event.id,
          homeName:home.team?.displayName, awayName:away.team?.displayName,
          homeShort:home.team?.shortDisplayName||home.team?.displayName,
          awayShort:away.team?.shortDisplayName||away.team?.displayName,
          homeLogo:home.team?.logo, awayLogo:away.team?.logo,
          homeRecord:home?.records?.[0]?.summary, awayRecord:away?.records?.[0]?.summary,
          homeAllRecord:home?.records?.[1]?.summary||home?.records?.[0]?.summary,
          awayAllRecord:away?.records?.[1]?.summary||away?.records?.[0]?.summary,
          hr, ar, homeWinRate, awayWinRate, homeDrawRate, awayDrawRate,
          data:dataFormatada, hora,
          bets: bets.sort((a,b)=>b.prob-a.prob).slice(0,3),
          melhor, confianca, confCor,
          over25prob, over15prob, bttsProb, homeWinProb, awayWinProb, drawProb,
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
        <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>Sugestoes de Apostas</div>
        <div style={{color:'#8892a4',fontSize:12,marginBottom:18}}>Analisa os proximos 7 dias com estatisticas detalhadas de cada time.</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,alignItems:'end'}}>
          <div>
            <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>COMPETICAO</label>
            <select value={liga.id} onChange={e=>setLiga(LIGAS_ESPN.find(l=>l.id===e.target.value))} style={inp}>
              {LIGAS_ESPN.map(l=><option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </div>
          <button onClick={buscarSugestoes} disabled={loading} style={{background:'linear-gradient(135deg,#3d5afe,#651fff)',border:'none',color:'#fff',borderRadius:8,padding:'10px 22px',cursor:'pointer',fontWeight:700,fontSize:14,whiteSpace:'nowrap',boxShadow:'0 4px 16px #3d5afe44'}}>
            {loading?'Analisando...':'Analisar Jogos'}
          </button>
        </div>
      </GlassCard>

      {searched && !loading && sugestoes.length === 0 && (
        <div style={{textAlign:'center',color:'#8892a4',padding:50,background:'#111724',borderRadius:16,border:'1px solid #1e2538'}}>Nenhuma partida encontrada para os proximos 7 dias.</div>
      )}

      {sugestoes.length > 0 && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
            {[['Alta','alta','#00e676'],['Media','media','#ffab00'],['Baixa','baixa','#ff5252']].map(([lbl,val,cor])=>{
              const count = sugestoes.filter(s=>s.confianca===lbl).length
              return (
                <button key={lbl} onClick={()=>setFiltro(filtro===val?'todos':val)}
                  style={{background:filtro===val?cor+'18':'#111724',border:`1px solid ${filtro===val?cor:cor+'33'}`,borderRadius:14,padding:'14px 18px',textAlign:'center',cursor:'pointer',transition:'all 0.15s'}}>
                  <div style={{fontSize:10,color:cor,fontWeight:700,letterSpacing:1,marginBottom:6}}>{lbl.toUpperCase()}</div>
                  <div style={{fontSize:28,fontWeight:900,color:cor,fontFamily:"'Bebas Neue',cursive"}}>{count}</div>
                </button>
              )
            })}
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {filtradas.map(s => (
              <GlassCard key={s.id} glow={s.confCor} style={{padding:'0 0 0 0',overflow:'hidden'}}>
                {/* Header */}
                <div style={{padding:'18px 22px',borderBottom:'1px solid #1e2538'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <img src={s.homeLogo} style={{width:36,height:36,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:15,fontWeight:800}}>{s.homeName} <span style={{color:'#8892a4',fontWeight:400}}>x</span> {s.awayName}</div>
                      <div style={{fontSize:11,color:'#8892a4',marginTop:2}}>{s.data} · {s.hora}</div>
                    </div>
                    <img src={s.awayLogo} style={{width:36,height:36,objectFit:'contain'}} alt="" onError={e=>e.target.style.display='none'}/>
                    <div style={{background:s.confCor+'18',border:`1px solid ${s.confCor}44`,borderRadius:8,padding:'5px 12px',textAlign:'center',flexShrink:0,boxShadow:`0 0 12px ${s.confCor}22`}}>
                      <div style={{fontSize:9,color:s.confCor,fontWeight:700,letterSpacing:1}}>CONFIANCA</div>
                      <div style={{fontSize:14,color:s.confCor,fontWeight:900}}>{s.confianca}</div>
                    </div>
                  </div>
                </div>

                {/* Stats dos times */}
                <div style={{padding:'14px 22px',borderBottom:'1px solid #1e2538',background:'#0a0e1a'}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[['Casa',s.homeShort,s.hr,s.homeWinRate],['Fora',s.awayShort,s.ar,s.awayWinRate]].map(([tipo,nome,rec,wr])=>(
                      <div key={tipo} style={{background:'#0f1320',borderRadius:12,padding:'12px 14px'}}>
                        <div style={{fontSize:11,color:'#8892a4',marginBottom:6,fontWeight:700}}>{tipo}: {nome}</div>
                        <div style={{display:'flex',gap:6,marginBottom:8}}>
                          {[['V',rec.w,'#00e676'],['E',rec.d,'#ffab00'],['D',rec.l,'#ff1744']].map(([lbl,val,cor])=>(
                            <div key={lbl} style={{flex:1,background:'#0a0e1a',borderRadius:7,padding:'5px',textAlign:'center'}}>
                              <div style={{fontSize:9,color:cor,fontWeight:700}}>{lbl}</div>
                              <div style={{fontSize:15,fontWeight:900,color:cor}}>{val}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{background:'#1e2538',borderRadius:4,height:4}}>
                          <div style={{background:`linear-gradient(90deg,#00e676,#00c853)`,borderRadius:4,height:4,width:`${Math.round(wr*100)}%`}}/>
                        </div>
                        <div style={{fontSize:10,color:'#8892a4',marginTop:4}}>{Math.round(wr*100)}% aproveitamento</div>
                      </div>
                    ))}
                  </div>

                  {/* Mini prob overview */}
                  <div style={{marginTop:12,display:'flex',gap:8}}>
                    {[
                      [s.homeShort,s.homeWinProb,'#ffab00'],
                      ['Empate',s.drawProb,'#8892a4'],
                      [s.awayShort,s.awayWinProb,'#7c8cff'],
                    ].map(([lbl,prob,cor])=>(
                      <div key={lbl} style={{flex:1,textAlign:'center'}}>
                        <div style={{fontSize:10,color:'#8892a4',marginBottom:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{lbl}</div>
                        <div style={{fontSize:16,fontWeight:900,color:cor,fontFamily:"'Bebas Neue',cursive"}}>{prob}%</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sugestoes */}
                <div style={{padding:'14px 22px',display:'flex',gap:10,flexWrap:'wrap'}}>
                  {s.bets.map((bet,i)=>(
                    <div key={i} style={{background:'#0f1320',border:`1px solid ${bet.cor}22`,borderRadius:12,padding:'12px 16px',flex:1,minWidth:160,boxShadow:`0 2px 12px ${bet.cor}08`}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                        <span style={{background:bet.cor+'22',color:bet.cor,borderRadius:5,padding:'2px 7px',fontSize:9,fontWeight:800,letterSpacing:1}}>{bet.icone}</span>
                        <span style={{fontSize:12,fontWeight:700,color:'#e8eaf6'}}>{bet.tipo}</span>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginBottom:8}}>
                        <div>
                          <div style={{fontSize:10,color:'#8892a4'}}>PROBABILIDADE</div>
                          <div style={{fontSize:26,fontWeight:900,color:bet.cor,fontFamily:"'Bebas Neue',cursive",lineHeight:1}}>{bet.prob}%</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:10,color:'#8892a4'}}>ODD MINIMA</div>
                          <div style={{fontSize:20,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive",lineHeight:1}}>{bet.oddMin}</div>
                        </div>
                      </div>
                      <div style={{background:'#1e2538',borderRadius:4,height:4,marginBottom:6}}>
                        <div style={{background:`linear-gradient(90deg,${bet.cor}88,${bet.cor})`,borderRadius:4,height:4,width:`${bet.prob}%`,boxShadow:`0 0 6px ${bet.cor}55`}}/>
                      </div>
                      <div style={{fontSize:10,color:'#8892a4'}}>{bet.motivo}</div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            ))}
          </div>

          <div style={{background:'#ff174411',border:'1px solid #ff174433',borderRadius:12,padding:'14px 18px'}}>
            <div style={{fontSize:12,color:'#ff7070',fontWeight:700,marginBottom:4}}>Aviso</div>
            <div style={{fontSize:12,color:'#a0aec0'}}>Sugestoes baseadas em estatisticas historicas ESPN. Nao garantem resultado. Aposte com responsabilidade.</div>
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

  const comps = event.competitions?.[0]
  const home = comps?.competitors?.find(c=>c.homeAway==='home')
  const away = comps?.competitors?.find(c=>c.homeAway==='away')
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
    try { const data = await fetchESPN(liga.id, date); setEvents(data) }
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
              <div style={{flex:1,fontSize:12,fontWeight:600}}>{home?.team?.displayName} x {away?.team?.displayName}</div>
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
      <GlassCard><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}><div style={{fontWeight:700,fontSize:15}}>Configuracoes</div>{!editing&&<button onClick={()=>setEditing(true)} style={{background:'#1e2a4a',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:700}}>Editar</button>}</div>{editing?(<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>BANKROLL INICIAL (R$)</label><input type="number" value={form.bankroll_inicial} onChange={e=>setForm(f=>({...f,bankroll_inicial:e.target.value}))} style={inp}/></div><div><label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>STOP LOSS (%)</label><input type="number" value={form.stop_loss_percent} onChange={e=>setForm(f=>({...f,stop_loss_percent:e.target.value}))} style={inp} min="1" max="100"/></div><div style={{gridColumn:'1 / span 2',display:'flex',gap:10}}><button onClick={()=>setEditing(false)} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:9,padding:10,cursor:'pointer'}}>Cancelar</button><button onClick={saveConfig} disabled={saving} style={{flex:2,background:'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:9,padding:10,cursor:'pointer',fontWeight:700}}>{saving?'Salvando...':'Salvar'}</button></div></div>):(<div style={{display:'flex',gap:24}}><div><div style={{fontSize:11,color:'#8892a4'}}>BANKROLL INICIAL</div><div style={{fontSize:18,fontWeight:700,marginTop:3}}>R$ {Number(config.bankroll_inicial).toFixed(2)}</div></div><div><div style={{fontSize:11,color:'#8892a4'}}>STOP LOSS</div><div style={{fontSize:18,fontWeight:700,color:'#ff5252',marginTop:3}}>{config.stop_loss_percent}% = R$ {stats.stopLossVal.toFixed(2)}</div></div></div>)}</GlassCard>
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
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,backdropFilter:'blur(6px)',padding:16}}>
      <div style={{background:'linear-gradient(135deg,#141928,#1a1f2e)',border:'1px solid #2a3048',borderRadius:20,padding:28,width:'100%',maxWidth:520,maxHeight:'92vh',overflowY:'auto',boxShadow:'0 20px 60px #00000066'}}>
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
          <button onClick={handleSave} disabled={saving} style={{flex:2,background:saving?'#1e2538':'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:10,padding:12,cursor:'pointer',fontWeight:700,fontSize:15,boxShadow:saving?'none':'0 4px 16px #00c85344'}}>{saving?'Salvando...':'Salvar Aposta'}</button>
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
        {[['todos',`Todos (${counts.todos})`],['pendente',`Pendentes (${counts.pendente})`],['ganhou',`Ganhos (${counts.ganhou})`],['perdeu',`Perdidos (${counts.perdeu})`]].map(([f,l])=>(
          <button key={f} onClick={()=>setFilter(f)} style={{background:filter===f?'#1e2a4a':'transparent',border:`1px solid ${filter===f?'#3d5afe':'#2a3048'}`,color:filter===f?'#fff':'#8892a4',borderRadius:8,padding:'6px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>{l}</button>
        ))}
        <input placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:180,marginLeft:'auto'}}/>
        <button onClick={()=>exportCSV(filtered)} style={{background:'#1a2030',border:'1px solid #2a3048',color:'#8892a4',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>Exportar CSV</button>
      </div>
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
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:600}}>{bet.evento}<div style={{fontSize:11,color:'#7c8cff'}}>{bet.selecao}</div>{bet.mercado&&<div style={{fontSize:10,color:'#8892a4'}}>{bet.mercado}</div>}</td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.esporte||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:12,color:'#a0aec0'}}>{bet.casa||'-'}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:'#ffab00'}}>{Number(bet.odd).toFixed(2)}</td>
                <td style={{padding:'12px 14px',fontSize:13}}>R$ {Number(bet.valor).toFixed(2)}</td>
                <td style={{padding:'12px 14px'}}>{bet.status==='pendente'?<div style={{display:'flex',gap:5}}><button onClick={()=>updateStatus(bet.id,'ganhou')} style={{background:'#00e67622',border:'1px solid #00e67644',color:'#00e676',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>V</button><button onClick={()=>updateStatus(bet.id,'perdeu')} style={{background:'#ff174422',border:'1px solid #ff174444',color:'#ff1744',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>X</button></div>:<Badge status={bet.status}/>}</td>
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
  const [tab, setTab] = useState('dashboard')
  const [showForm, setShowForm] = useState(false)
  const fetchBets = useCallback(async()=>{ const {data}=await supabase.from('apostas').select('*').eq('user_id',user.id).order('data',{ascending:false}); setBets(data||[]); setLoading(false) },[user.id])
  useEffect(()=>{fetchBets()},[fetchBets])

  const TABS=[['dashboard','Dashboard'],['apostas','Apostas'],['analytics','Analytics'],['inteligencia','Inteligencia'],['sugestoes','Sugestoes'],['comparador','Comparador'],['scouts','Scouts'],['bankroll','Bankroll']]

  return (
    <div style={{minHeight:'100vh',background:'#0b0e1a',color:'#e8eaf6',fontFamily:"'DM Sans',sans-serif"}}>
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
