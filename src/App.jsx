import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const STATUS_COLORS = { ganhou: '#00e676', perdeu: '#ff1744', pendente: '#ffab00' }
const STATUS_LABELS = { ganhou: 'Ganhou', perdeu: 'Perdeu', pendente: 'Pendente' }
const ESPORTES = ['Futebol','Basquete','Tênis','Vôlei','MMA/UFC','E-Sports','Outros']
const CASAS = ['Bet365','Sportingbet','Betano','KTO','Novibet','Blaze','Vaidebet','Outra']
const CHART_COLORS = ['#7c8cff','#00e676','#ffab00','#ff1744','#00bcd4','#e040fb']
const inp = { background:'#0f1320',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',padding:'9px 12px',fontSize:14,outline:'none',width:'100%',fontFamily:'inherit' }

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
  const headers = ['Data','Evento','Esporte','Mercado','Seleção','Casa','Tipo','Odd','Valor','Status','Retorno','Lucro','Observação']
  const rows = bets.map(b => {
    const lucro = b.status==='ganhou'?(b.retorno-b.valor).toFixed(2):b.status==='perdeu'?(-b.valor).toFixed(2):''
    return [b.data,b.evento,b.esporte||'',b.mercado||'',b.selecao||'',b.casa||'',b.tipo||'simples',b.odd,b.valor,STATUS_LABELS[b.status],b.retorno||'',lucro,b.observacao||'']
  })
  const csv = [headers,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=`betcontrol_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
}

function BetForm({ editData, userId, onSave, onClose }) {
  const [form, setForm] = useState(editData || { data:new Date().toISOString().slice(0,10),evento:'',esporte:'Futebol',mercado:'',selecao:'',casa:'Bet365',tipo:'simples',odd:'',valor:'',status:'pendente',observacao:'' })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.evento||!form.odd||!form.valor) return
    setSaving(true)
    const odd=parseFloat(form.odd),valor=parseFloat(form.valor)
    const retorno=form.status==='ganhou'?+(odd*valor).toFixed(2):form.status==='perdeu'?0:null
    const payload={...form,odd,valor,retorno,user_id:userId}
    if (editData?.id) await supabase.from('apostas').update(payload).eq('id',editData.id)
    else await supabase.from('apostas').insert(payload)
    setSaving(false); onSave()
  }

  const set = (k) => (e) => setForm(f=>({...f,[k]:e.target.value}))
  const lbl = (t) => <label style={{fontSize:11,color:'#8892a4',fontWeight:700,display:'block',marginBottom:5}}>{t}</label>

  return (
    <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,backdropFilter:'blur(4px)',padding:16}}>
      <div style={{background:'#141928',border:'1px solid #2a3048',borderRadius:18,padding:28,width:'100%',maxWidth:500,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:17,fontWeight:800,marginBottom:22}}>{editData?.id?'✏️ Editar Aposta':'🎯 Nova Aposta'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:13}}>
          <div>{lbl('DATA')}<input type="date" value={form.data} onChange={set('data')} style={inp} /></div>
          <div>{lbl('STATUS')}<select value={form.status} onChange={set('status')} style={inp}><option>pendente</option><option>ganhou</option><option>perdeu</option></select></div>
          <div style={{gridColumn:'1 / span 2'}}>{lbl('EVENTO / JOGO')}<input type="text" value={form.evento} onChange={set('evento')} style={inp} /></div>
          <div>{lbl('ESPORTE')}<select value={form.esporte} onChange={set('esporte')} style={inp}>{ESPORTES.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('CASA DE APOSTAS')}<select value={form.casa} onChange={set('casa')} style={inp}>{CASAS.map(o=><option key={o}>{o}</option>)}</select></div>
          <div>{lbl('TIPO')}<select value={form.tipo} onChange={set('tipo')} style={inp}><option>simples</option><option>múltipla</option><option>ao vivo</option></select></div>
          <div>{lbl('MERCADO')}<input type="text" value={form.mercado} onChange={set('mercado')} style={inp} /></div>
          <div>{lbl('SELEÇÃO')}<input type="text" value={form.selecao} onChange={set('selecao')} style={inp} /></div>
          <div>{lbl('ODD')}<input type="number" step="0.01" value={form.odd} onChange={set('odd')} style={inp} /></div>
          <div>{lbl('VALOR (R$)')}<input type="number" step="0.01" value={form.valor} onChange={set('valor')} style={inp} /></div>
          <div style={{gridColumn:'1 / span 2'}}>{lbl('OBSERVAÇÃO')}<input type="text" value={form.observacao} onChange={set('observacao')} style={inp} /></div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:22}}>
          <button onClick={onClose} style={{flex:1,background:'transparent',border:'1px solid #2a3048',color:'#8892a4',borderRadius:10,padding:12,cursor:'pointer',fontWeight:600}}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{flex:2,background:saving?'#1e2538':'linear-gradient(135deg,#00c853,#00897b)',border:'none',color:'#fff',borderRadius:10,padding:12,cursor:'pointer',fontWeight:700,fontSize:15}}>{saving?'Salvando...':'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function Analytics({ bets }) {
  const tt = {background:'#141928',border:'1px solid #2a3048',borderRadius:8,color:'#e8eaf6',fontSize:12}
  const bankrollData = useMemo(()=>{ const sorted=[...bets].filter(b=>b.status!=='pendente').sort((a,b)=>a.data.localeCompare(b.data)); let bal=0; return sorted.map(b=>{ const l=b.status==='ganhou'?b.retorno-b.valor:-b.valor; bal+=l; return {data:b.data.slice(5),lucro:+bal.toFixed(2)} }) },[bets])
  const byEsporte = useMemo(()=>{ const map={}; bets.filter(b=>b.status!=='pendente').forEach(b=>{ const e=b.esporte||'Outros'; if(!map[e]) map[e]={ganhou:0,perdeu:0,lucro:0}; if(b.status==='ganhou'){map[e].ganhou++;map[e].lucro+=b.retorno-b.valor}else{map[e].perdeu++;map[e].lucro-=b.valor} }); return Object.entries(map).map(([name,v])=>({name,...v,lucro:+v.lucro.toFixed(2)})) },[bets])
  const byCasa = useMemo(()=>{ const map={}; bets.filter(b=>b.status!=='pendente').forEach(b=>{ const c=b.casa||'Outra'; if(!map[c]) map[c]={total:0,ganhou:0,lucro:0}; map[c].total++; if(b.status==='ganhou'){map[c].ganhou++;map[c].lucro+=b.retorno-b.valor}else map[c].lucro-=b.valor }); return Object.entries(map).map(([name,v])=>({name,winrate:+((v.ganhou/v.total)*100).toFixed(0),lucro:+v.lucro.toFixed(2),total:v.total})) },[bets])
  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>📈 Evolução do Bankroll</div>
        {bankrollData.length<2?<div style={{color:'#8892a4',textAlign:'center',padding:40}}>Registre mais apostas finalizadas para ver o gráfico</div>
          :<ResponsiveContainer width="100%" height={220}><LineChart data={bankrollData}><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis dataKey="data" stroke="#8892a4" fontSize={11}/><YAxis stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Saldo']}/><Line type="monotone" dataKey="lucro" stroke="#00e676" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:20}}>
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>⚽ Lucro por Esporte</div>
          {byEsporte.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30,fontSize:13}}>Sem dados</div>
            :<ResponsiveContainer width="100%" height={200}><BarChart data={byEsporte} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke="#1e2538"/><XAxis type="number" stroke="#8892a4" fontSize={11} tickFormatter={v=>`R$${v}`}/><YAxis dataKey="name" type="category" stroke="#8892a4" fontSize={11} width={70}/><Tooltip contentStyle={tt} formatter={v=>[`R$ ${v}`,'Lucro']}/><Bar dataKey="lucro" radius={[0,4,4,0]}>{byEsporte.map((e,i)=><Cell key={i} fill={e.lucro>=0?'#00e676':'#ff1744'}/>)}</Bar></BarChart></ResponsiveContainer>}
        </div>
        <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:16}}>🏠 Performance por Casa</div>
          {byCasa.length===0?<div style={{color:'#8892a4',textAlign:'center',padding:30,fontSize:13}}>Sem dados</div>
            :<div style={{display:'flex',flexDirection:'column',gap:10}}>{byCasa.map((c,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:10}}><div style={{width:8,height:8,borderRadius:'50%',background:CHART_COLORS[i%CHART_COLORS.length],flexShrink:0}}/><div style={{flex:1,fontSize:13,fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:'#8892a4'}}>{c.total} ap.</div><div style={{fontSize:12,color:'#ffab00',width:40,textAlign:'right'}}>{c.winrate}%</div><div style={{fontSize:13,fontWeight:700,color:c.lucro>=0?'#00e676':'#ff1744',width:80,textAlign:'right'}}>R$ {c.lucro}</div></div>)}</div>}
        </div>
      </div>
    </div>
  )
}

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
      {stats.emRisco&&<div style={{background:'#ff174422',border:'1px solid #ff174466',borderRadius:14,padding:'16px 20px',display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:24}}>⚠️</span><div><div style={{color:'#ff5252',fontWeight:700,fontSize:15}}>Atenção ao Stop Loss!</div><div style={{color:'#ff7070',fontSize:13,marginTop:2}}>Você está próximo ao limite de perda (R$ {stats.stopLossVal.toFixed(2)})</div></div></div>}
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:24}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:20}}>💰 Situação do Bankroll</div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
          <StatCard label="Bankroll Inicial" value={`R$ ${Number(config.bankroll_inicial).toFixed(2)}`} color="#7c8cff"/>
          <StatCard label="Saldo Atual" value={`R$ ${stats.saldoAtual.toFixed(2)}`} color={stats.saldoAtual>=config.bankroll_inicial?'#00e676':'#ff1744'}/>
          <StatCard label="Resultado Total" value={`R$ ${stats.lucroTotal.toFixed(2)}`} color={stats.lucroTotal>=0?'#00e676':'#ff1744'}/>
          <StatCard label="Variação" value={`${stats.pct}%`} color={parseFloat(stats.pct)>=0?'#00e676':'#ff1744'}/>
        </div>
      </div>
      {kelly&&<div style={{background:'#111724',border:'1px solid #ffab0033',borderRadius:16,padding:'20px 24px'}}><div style={{fontWeight:700,fontSize:15,marginBottom:4}}>🎯 Critério de Kelly</div><div style={{color:'#8892a4',fontSize:12,marginBottom:14}}>Baseado no seu histórico</div><div style={{display:'flex',gap:24,flexWrap:'wrap'}}><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>% DO BANKROLL</div><div style={{fontSize:26,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>{kelly.kf}%</div></div><div><div style={{fontSize:11,color:'#8892a4',marginBottom:4}}>VALOR SUGERIDO</div><div style={{fontSize:26,fontWeight:800,color:'#ffab00',fontFamily:"'Bebas Neue',cursive"}}>R$ {kelly.val}</div></div></div><div style={{color:'#8892a4',fontSize:11,marginTop:10}}>⚠️ Sugestão teórica. Nunca aposte mais do que pode perder.</div></div>}
      <div style={{background:'#111724',border:'1px solid #1e2538',borderRadius:16,padding:'20px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontWeight:700,fontSize:15}}>⚙️ Configurações</div>
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
        <button onClick={()=>exportCSV(filtered)} style={{background:'#1a2030',border:'1px solid #2a3048',color:'#8892a4',borderRadius:8,padding:'7px 14px',cursor:'pointer',fontSize:12,fontWeight:600,whiteSpace:'nowrap'}}>📥 Exportar CSV</button>
      </div>
      <div style={{background:'#111724',borderRadius:16,border:'1px solid #1e2538',overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',minWidth:820}}>
          <thead>
            <tr style={{background:'#0f1320',borderBottom:'1px solid #1e2538'}}>
              {[['data','Data'],['evento','Evento'],['esporte','Esporte'],['casa','Casa'],['odd','Odd'],['valor','Valor'],['status','Status'],['retorno','Retorno']].map(([f,l])=>(
                <th key={f} onClick={()=>hs(f)} style={{padding:'11px 14px',textAlign:'left',fontSize:10,fontWeight:700,color:'#8892a4',letterSpacing:1,textTransform:'uppercase',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none'}}>{l} {sortField===f?(sortDir==='asc'?'↑':'↓'):''}</th>
              ))}
              <th style={{padding:'11px 14px',fontSize:10,fontWeight:700,color:'#8892a4',letterSpacing:1,textTransform:'uppercase'}}>Ações</th>
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
                <td style={{padding:'12px 14px'}}>{bet.status==='pendente'?<div style={{display:'flex',gap:5}}><button onClick={()=>updateStatus(bet.id,'ganhou')} style={{background:'#00e67622',border:'1px solid #00e67644',color:'#00e676',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11}}>✓</button><button onClick={()=>updateStatus(bet.id,'perdeu')} style={{background:'#ff174422',border:'1px solid #ff174444',color:'#ff1744',borderRadius:6,padding:'3px 8px',cursor:'pointer',fontSize:11}}>✗</button></div>:<Badge status={bet.status}/>}</td>
                <td style={{padding:'12px 14px',fontSize:13,fontWeight:700,color:bet.retorno===null?'#8892a4':bet.retorno>0?'#00e676':'#ff1744'}}>{bet.retorno===null?'-':`R$ ${Number(bet.retorno).toFixed(2)}`}</td>
                <td style={{padding:'12px 14px'}}><div style={{display:'flex',gap:5}}><button onClick={()=>{setEditData(bet);setShowForm(true)}} style={{background:'#1e2a4a',border:'1px solid #3d5afe44',color:'#7c8cff',borderRadius:6,padding:'4px 9px',cursor:'pointer',fontSize:12}}>✏️</button><button onClick={()=>deleteBet(bet.id)} style={{background:'#2a1a1f',border:'1px solid #ff174433',color:'#ff5252',borderRadius:6,padding:'4px 9px',cursor:'pointer',fontSize:12}}>🗑️</button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm&&<BetForm editData={editData} userId={userId} onSave={()=>{setShowForm(false);onRefresh()}} onClose={()=>setShowForm(false)}/>}
    </>
  )
}

function BetApp({ user }) {
  const [bets, setBets] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('apostas')
  const [showForm, setShowForm] = useState(false)
  const fetchBets = useCallback(async()=>{ const {data}=await supabase.from('apostas').select('*').eq('user_id',user.id).order('data',{ascending:false}); setBets(data||[]); setLoading(false) },[user.id])
  useEffect(()=>{fetchBets()},[fetchBets])
  const stats = useMemo(()=>{ const won=bets.filter(b=>b.status==='ganhou'),lost=bets.filter(b=>b.status==='perdeu'); const fin=won.length+lost.length; const invested=bets.reduce((s,b)=>s+Number(b.valor),0); const returned=won.reduce((s,b)=>s+(b.retorno||0),0); const profit=returned-won.reduce((s,b)=>s+Number(b.valor),0)-lost.reduce((s,b)=>s+Number(b.valor),0); const roi=invested>0?((returned-invested)/invested*100).toFixed(1):'0.0'; const winrate=fin>0?((won.length/fin)*100).toFixed(0):'0'; return {total:bets.length,won:won.length,lost:lost.length,pending:bets.filter(b=>b.status==='pendente').length,invested,profit,roi,winrate} },[bets])
  return (
    <div style={{minHeight:'100vh',background:'#0b0e1a',color:'#e8eaf6',fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{background:'#0f1320',borderBottom:'1px solid #1e2538',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:100}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:36,height:36,background:'linear-gradient(135deg,#00c853,#00897b)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎯</div>
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
          <StatCard label="Lucro/Prejuízo" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit>=0?'#00e676':'#ff1744'}/>
          <StatCard label="ROI" value={`${stats.roi}%`} color={parseFloat(stats.roi)>=0?'#00e676':'#ff1744'}/>
          <StatCard label="Taxa de Acerto" value={`${stats.winrate}%`} sub={`${stats.won}G / ${stats.lost}P / ${stats.pending} pend.`} color="#ffab00"/>
        </div>
        <div style={{display:'flex',gap:4,marginBottom:20,background:'#111724',borderRadius:12,padding:4,width:'fit-content'}}>
          {[['apostas','🎯 Apostas'],['analytics','📊 Analytics'],['bankroll','💰 Bankroll']].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'#1e2a4a':'transparent',border:`1px solid ${tab===t?'#3d5afe44':'transparent'}`,color:tab===t?'#fff':'#8892a4',borderRadius:9,padding:'8px 18px',fontSize:13,fontWeight:600,cursor:'pointer'}}>{l}</button>
          ))}
        </div>
        {loading?<div style={{textAlign:'center',padding:60,color:'#8892a4'}}>Carregando...</div>
          :tab==='apostas'?<ApostasTab bets={bets} userId={user.id} onRefresh={fetchBets}/>
          :tab==='analytics'?<Analytics bets={bets}/>
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
