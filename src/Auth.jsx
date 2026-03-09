import { useState } from 'react'
import { supabase } from './supabaseClient'

const inp = {
  background: '#0f1320', border: '1px solid #2a3048', borderRadius: 10,
  color: '#e8eaf6', padding: '12px 16px', fontSize: 15, outline: 'none',
  width: '100%', fontFamily: 'inherit', transition: 'border-color 0.2s',
}

export default function Auth() {
  const [mode, setMode] = useState('login') // login | register | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  async function handleSubmit() {
    setLoading(true)
    setMsg(null)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'register') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg({ type: 'success', text: 'Conta criada! Verifique seu e-mail para confirmar.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email)
        if (error) throw error
        setMsg({ type: 'success', text: 'E-mail de recuperação enviado!' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 50% 0%, #0d1e2f 0%, #0b0e1a 60%)',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #00c853, #00897b)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 30, margin: '0 auto 16px',
            boxShadow: '0 0 40px #00c85344',
          }}>🎯</div>
          <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Bebas Neue', cursive", letterSpacing: 2 }}>BetControl</div>
          <div style={{ color: '#8892a4', fontSize: 13, marginTop: 4 }}>
            {mode === 'login' ? 'Entre na sua conta' : mode === 'register' ? 'Crie sua conta gratuita' : 'Recupere sua senha'}
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: '#141928', border: '1px solid #2a3048',
          borderRadius: 20, padding: 32,
          boxShadow: '0 20px 60px #00000066',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: '#8892a4', fontWeight: 600, display: 'block', marginBottom: 6 }}>E-MAIL</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" style={inp}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label style={{ fontSize: 12, color: '#8892a4', fontWeight: 600, display: 'block', marginBottom: 6 }}>SENHA</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" style={inp}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
              </div>
            )}

            {msg && (
              <div style={{
                background: msg.type === 'success' ? '#00e67622' : '#ff174422',
                border: `1px solid ${msg.type === 'success' ? '#00e67644' : '#ff174444'}`,
                color: msg.type === 'success' ? '#00e676' : '#ff5252',
                borderRadius: 8, padding: '10px 14px', fontSize: 13,
              }}>{msg.text}</div>
            )}

            <button onClick={handleSubmit} disabled={loading} style={{
              background: loading ? '#1e2538' : 'linear-gradient(135deg, #00c853, #00897b)',
              color: loading ? '#8892a4' : '#fff', border: 'none', borderRadius: 12,
              padding: '14px', fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              marginTop: 4, transition: 'all 0.2s',
            }}>
              {loading ? 'Aguarde...' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar Conta' : 'Enviar E-mail'}
            </button>
          </div>

          {/* Footer links */}
          <div style={{ marginTop: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {mode === 'login' && <>
              <span style={{ color: '#8892a4', fontSize: 13 }}>
                Não tem conta?{' '}
                <button onClick={() => { setMode('register'); setMsg(null) }} style={{ background: 'none', border: 'none', color: '#7c8cff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                  Cadastre-se grátis
                </button>
              </span>
              <button onClick={() => { setMode('forgot'); setMsg(null) }} style={{ background: 'none', border: 'none', color: '#8892a4', cursor: 'pointer', fontSize: 12 }}>
                Esqueci minha senha
              </button>
            </>}
            {mode !== 'login' && (
              <button onClick={() => { setMode('login'); setMsg(null) }} style={{ background: 'none', border: 'none', color: '#7c8cff', cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>
                ← Voltar ao login
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
