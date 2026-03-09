import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth.jsx'

// ─── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_COLORS = { ganhou: '#00e676', perdeu: '#ff1744', pendente: '#ffab00' }
const STATUS_LABELS = { ganhou: 'Ganhou', perdeu: 'Perdeu', pendente: 'Pendente' }

const inp = {
  background: '#0f1320', border: '1px solid #2a3048', borderRadius: 8,
  color: '#e8eaf6', padding: '9px 12px', fontSize: 14, outline: 'none',
  width: '100%', fontFamily: 'inherit',
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Badge({ status }) {
  return (
    <span style={{
      background: STATUS_COLORS[status] + '22', color: STATUS_COLORS[status],
      border: `1px solid ${STATUS_COLORS[status]}44`, borderRadius: 6,
      padding: '2px 10px', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
    }}>{STATUS_LABELS[status]}</span>
  )
}

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1a1f2e 60%, #1e2538)',
      border: `1px solid ${color}33`, borderRadius: 16, padding: '18px 22px',
      flex: 1, minWidth: 130, position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -16, right: -16, width: 72, height: 72, borderRadius: '50%', background: color + '18' }} />
      <div style={{ color: '#8892a4', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 }}>{label}</div>
      <div style={{ color, fontSize: 22, fontWeight: 800, fontFamily: "'Bebas Neue', cursive" }}>{value}</div>
      {sub && <div style={{ color: '#8892a4', fontSize: 10, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

// ─── BetForm Modal ─────────────────────────────────────────────────────────────
function BetForm({ editData, userId, onSave, onClose }) {
  const [form, setForm] = useState(editData || {
    data: new Date().toISOString().slice(0, 10),
    evento: '', mercado: '', selecao: '', odd: '', valor: '', status: 'pendente', observacao: ''
  })
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!form.evento || !form.odd || !form.valor) return
    setSaving(true)
    const odd = parseFloat(form.odd)
    const valor = parseFloat(form.valor)
    const retorno = form.status === 'ganhou' ? +(odd * valor).toFixed(2) : form.status === 'perdeu' ? 0 : null
    const payload = { ...form, odd, valor, retorno, user_id: userId }
    if (editData?.id) {
      await supabase.from('apostas').update(payload).eq('id', editData.id)
    } else {
      await supabase.from('apostas').insert(payload)
    }
    setSaving(false)
    onSave()
  }

  const F = ({ k, label, type = 'text', full, opts }) => (
    <div style={{ gridColumn: full ? '1 / span 2' : 'auto' }}>
      <label style={{ fontSize: 11, color: '#8892a4', fontWeight: 700, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>{label}</label>
      {opts
        ? <select value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inp}>
            {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        : <input type={type} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} style={inp} step={type === 'number' ? '0.01' : undefined} />
      }
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, backdropFilter: 'blur(4px)', padding: 16 }}>
      <div style={{ background: '#141928', border: '1px solid #2a3048', borderRadius: 18, padding: 28, width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 22 }}>{editData?.id ? '✏️ Editar Aposta' : '🎯 Nova Aposta'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
          <F k="data" label="DATA" type="date" />
          <F k="status" label="STATUS" opts={[{ v: 'pendente', l: 'Pendente' }, { v: 'ganhou', l: 'Ganhou' }, { v: 'perdeu', l: 'Perdeu' }]} />
          <F k="evento" label="EVENTO / JOGO" full />
          <F k="mercado" label="MERCADO" />
          <F k="selecao" label="SELEÇÃO" />
          <F k="odd" label="ODD" type="number" />
          <F k="valor" label="VALOR (R$)" type="number" />
          <F k="observacao" label="OBSERVAÇÃO (opcional)" full />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid #2a3048', color: '#8892a4', borderRadius: 10, padding: 12, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, background: saving ? '#1e2538' : 'linear-gradient(135deg, #00c853, #00897b)', border: 'none', color: '#fff', borderRadius: 10, padding: 12, cursor: 'pointer', fontWeight: 700, fontSize: 15 }}>
            {saving ? 'Salvando...' : 'Salvar Aposta'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function BetApp({ user }) {
  const [bets, setBets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('data')
  const [sortDir, setSortDir] = useState('desc')
  const [showForm, setShowForm] = useState(false)
  const [editData, setEditData] = useState(null)

  async function fetchBets() {
    const { data } = await supabase.from('apostas').select('*').eq('user_id', user.id).order('data', { ascending: false })
    setBets(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBets() }, [])

  async function updateStatus(id, status) {
    const bet = bets.find(b => b.id === id)
    const retorno = status === 'ganhou' ? +(bet.odd * bet.valor).toFixed(2) : 0
    await supabase.from('apostas').update({ status, retorno }).eq('id', id)
    fetchBets()
  }

  async function deleteBet(id) {
    if (!confirm('Excluir esta aposta?')) return
    await supabase.from('apostas').delete().eq('id', id)
    fetchBets()
  }

  const stats = useMemo(() => {
    const won = bets.filter(b => b.status === 'ganhou')
    const lost = bets.filter(b => b.status === 'perdeu')
    const pending = bets.filter(b => b.status === 'pendente')
    const finished = won.length + lost.length
    const invested = bets.reduce((s, b) => s + Number(b.valor), 0)
    const returned = won.reduce((s, b) => s + (b.retorno || 0), 0)
    const profit = returned - won.reduce((s, b) => s + Number(b.valor), 0) - lost.reduce((s, b) => s + Number(b.valor), 0)
    const roi = invested > 0 ? ((returned - invested) / invested * 100).toFixed(1) : '0.0'
    const winrate = finished > 0 ? ((won.length / finished) * 100).toFixed(0) : '0'
    return { total: bets.length, won: won.length, lost: lost.length, pending: pending.length, invested, profit, roi, winrate }
  }, [bets])

  const filtered = useMemo(() => {
    let list = filter === 'todos' ? bets : bets.filter(b => b.status === filter)
    if (search) list = list.filter(b => b.evento?.toLowerCase().includes(search.toLowerCase()) || b.selecao?.toLowerCase().includes(search.toLowerCase()))
    return [...list].sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === 'asc' ? av - bv : bv - av
    })
  }, [bets, filter, search, sortField, sortDir])

  function handleSort(f) {
    if (sortField === f) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(f); setSortDir('desc') }
  }

  const isMobile = window.innerWidth < 700

  return (
    <div style={{ minHeight: '100vh', background: '#0b0e1a', color: '#e8eaf6', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ background: '#0f1320', borderBottom: '1px solid #1e2538', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #00c853, #00897b)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎯</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>BetControl</div>
            <div style={{ fontSize: 10, color: '#8892a4', letterSpacing: 1 }}>{user.email}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setEditData(null); setShowForm(true) }} style={{ background: 'linear-gradient(135deg, #00c853, #00897b)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>+ Nova</button>
          <button onClick={() => supabase.auth.signOut()} style={{ background: '#1a1f2e', color: '#8892a4', border: '1px solid #2a3048', borderRadius: 9, padding: '9px 12px', fontSize: 13, cursor: 'pointer' }}>Sair</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 16px 40px' }}>
        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Total Apostado" value={`R$ ${stats.invested.toFixed(2)}`} color="#7c8cff" />
          <StatCard label="Lucro/Prejuízo" value={`R$ ${stats.profit.toFixed(2)}`} color={stats.profit >= 0 ? '#00e676' : '#ff1744'} />
          <StatCard label="ROI" value={`${stats.roi}%`} color={parseFloat(stats.roi) >= 0 ? '#00e676' : '#ff1744'} />
          <StatCard label="Taxa de Acerto" value={`${stats.winrate}%`} sub={`${stats.won}G / ${stats.lost}P / ${stats.pending} pend.`} color="#ffab00" />
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['todos', `Todos (${stats.total})`], ['pendente', `Pend. (${stats.pending})`], ['ganhou', `Ganhos (${stats.won})`], ['perdeu', `Perdidos (${stats.lost})`]].map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              background: filter === f ? '#1e2a4a' : 'transparent',
              border: `1px solid ${filter === f ? '#3d5afe' : '#2a3048'}`,
              color: filter === f ? '#fff' : '#8892a4',
              borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{label}</button>
          ))}
          <input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...inp, width: 200, marginLeft: 'auto' }} />
        </div>

        {/* Table / Cards */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#8892a4' }}>Carregando apostas...</div>
        ) : isMobile ? (
          // Mobile card layout
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#8892a4' }}>Nenhuma aposta encontrada</div>}
            {filtered.map(bet => (
              <div key={bet.id} style={{ background: '#111724', border: '1px solid #1e2538', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{bet.evento}</div>
                    <div style={{ color: '#7c8cff', fontSize: 12 }}>{bet.selecao}</div>
                    <div style={{ color: '#8892a4', fontSize: 11, marginTop: 2 }}>{bet.mercado} · {bet.data}</div>
                  </div>
                  <Badge status={bet.status} />
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                  <span>Odd: <strong style={{ color: '#ffab00' }}>{Number(bet.odd).toFixed(2)}</strong></span>
                  <span>Valor: <strong>R$ {Number(bet.valor).toFixed(2)}</strong></span>
                  <span>Retorno: <strong style={{ color: bet.retorno === null ? '#8892a4' : bet.retorno > 0 ? '#00e676' : '#ff1744' }}>
                    {bet.retorno === null ? '-' : `R$ ${Number(bet.retorno).toFixed(2)}`}
                  </strong></span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {bet.status === 'pendente' && <>
                    <button onClick={() => updateStatus(bet.id, 'ganhou')} style={{ flex: 1, background: '#00e67622', border: '1px solid #00e67644', color: '#00e676', borderRadius: 7, padding: '7px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✓ Ganhou</button>
                    <button onClick={() => updateStatus(bet.id, 'perdeu')} style={{ flex: 1, background: '#ff174422', border: '1px solid #ff174444', color: '#ff1744', borderRadius: 7, padding: '7px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>✗ Perdeu</button>
                  </>}
                  <button onClick={() => { setEditData(bet); setShowForm(true) }} style={{ background: '#1e2a4a', border: '1px solid #3d5afe44', color: '#7c8cff', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                  <button onClick={() => deleteBet(bet.id)} style={{ background: '#2a1a1f', border: '1px solid #ff174433', color: '#ff5252', borderRadius: 7, padding: '7px 12px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Desktop table
          <div style={{ background: '#111724', borderRadius: 16, border: '1px solid #1e2538', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#0f1320', borderBottom: '1px solid #1e2538' }}>
                  {[['data', 'Data'], ['evento', 'Evento'], ['mercado', 'Mercado'], ['odd', 'Odd'], ['valor', 'Valor'], ['status', 'Status'], ['retorno', 'Retorno']].map(([f, l]) => (
                    <th key={f} onClick={() => handleSort(f)} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {l} {sortField === f ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </th>
                  ))}
                  <th style={{ padding: '11px 14px', fontSize: 10, fontWeight: 700, color: '#8892a4', letterSpacing: 1, textTransform: 'uppercase' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#8892a4' }}>Nenhuma aposta encontrada</td></tr>}
                {filtered.map((bet, i) => (
                  <tr key={bet.id} style={{ borderBottom: '1px solid #1a2030', background: i % 2 === 0 ? 'transparent' : '#0f1320' }}>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#8892a4' }}>{bet.data}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>
                      {bet.evento}
                      {bet.observacao && <div style={{ fontSize: 11, color: '#8892a4', marginTop: 2 }}>{bet.observacao}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 12, color: '#a0aec0' }}>{bet.mercado}<br /><span style={{ color: '#7c8cff' }}>{bet.selecao}</span></td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: '#ffab00' }}>{Number(bet.odd).toFixed(2)}</td>
                    <td style={{ padding: '12px 14px', fontSize: 13 }}>R$ {Number(bet.valor).toFixed(2)}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {bet.status === 'pendente'
                        ? <div style={{ display: 'flex', gap: 5 }}>
                            <button onClick={() => updateStatus(bet.id, 'ganhou')} style={{ background: '#00e67622', border: '1px solid #00e67644', color: '#00e676', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✓</button>
                            <button onClick={() => updateStatus(bet.id, 'perdeu')} style={{ background: '#ff174422', border: '1px solid #ff174444', color: '#ff1744', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontSize: 11 }}>✗</button>
                          </div>
                        : <Badge status={bet.status} />}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 700, color: bet.retorno === null ? '#8892a4' : bet.retorno > 0 ? '#00e676' : '#ff1744' }}>
                      {bet.retorno === null ? '-' : `R$ ${Number(bet.retorno).toFixed(2)}`}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={() => { setEditData(bet); setShowForm(true) }} style={{ background: '#1e2a4a', border: '1px solid #3d5afe44', color: '#7c8cff', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                        <button onClick={() => deleteBet(bet.id)} style={{ background: '#2a1a1f', border: '1px solid #ff174433', color: '#ff5252', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <BetForm editData={editData} userId={user.id} onSave={() => { setShowForm(false); fetchBets() }} onClose={() => setShowForm(false)} />}
    </div>
  )
}

// ─── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  if (session === undefined) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b0e1a' }}>
      <div style={{ color: '#8892a4' }}>Carregando...</div>
    </div>
  )

  return session ? <BetApp user={session.user} /> : <Auth />
}
