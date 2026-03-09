# 🎯 BetControl — Guia de Instalação Completo

---

## 📦 O que está neste projeto

- **Login com e-mail e senha** (cria conta, recupera senha)
- **Suas apostas ficam salvas no banco** (não perdem ao fechar)
- **Funciona no celular como app** (instale no iPhone/Android)
- **Cada usuário vê só as próprias apostas**

---

## 🛠️ PASSO 1 — Configurar o Supabase (banco de dados + login)

1. Acesse **https://supabase.com** e crie uma conta gratuita
2. Clique em **"New Project"** → dê um nome (ex: `betcontrol`) → crie uma senha → **Create project**
3. Aguarde ~2 minutos o projeto ser criado
4. No menu lateral, clique em **"SQL Editor"**
5. Cole o conteúdo do arquivo `supabase-setup.sql` e clique em **"Run"**
6. Vá em **Settings → API** e copie:
   - `Project URL` → coloque no `.env` como `VITE_SUPABASE_URL`
   - `anon public` key → coloque no `.env` como `VITE_SUPABASE_ANON_KEY`

---

## 💻 PASSO 2 — Configurar o arquivo .env

1. Copie o arquivo `.env.example` e renomeie para `.env`
2. Preencha com os valores do Supabase:

```
VITE_SUPABASE_URL=https://abcdefghij.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 🖥️ PASSO 3a — Rodar no computador (local)

Você precisa ter o **Node.js** instalado (baixe em https://nodejs.org)

Abra o terminal dentro da pasta do projeto e execute:

```bash
npm install
npm run dev
```

Acesse: **http://localhost:5173**

---

## 🌐 PASSO 3b — Colocar online com Vercel (gratuito)

1. Acesse **https://github.com** → crie uma conta se não tiver
2. Crie um novo repositório e suba os arquivos do projeto
3. Acesse **https://vercel.com** → faça login com sua conta GitHub
4. Clique em **"Add New Project"** → selecione o repositório
5. Em **"Environment Variables"**, adicione:
   - `VITE_SUPABASE_URL` = sua URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = sua chave anon
6. Clique em **"Deploy"** → aguarde ~1 minuto
7. Você receberá um link como: `https://betcontrol.vercel.app` ✅

---

## 📱 PASSO 4 — Instalar no iPhone como app (PWA)

Após colocar online no Vercel:

1. Abra o link no **Safari** no seu iPhone (não funciona em outros browsers)
2. Toque no ícone de **compartilhar** (quadrado com seta para cima)
3. Toque em **"Adicionar à Tela de Início"**
4. Confirme o nome **"BetControl"** e toque em **"Adicionar"**
5. O ícone aparecerá na tela inicial como um app nativo! 🎉

---

## ❓ Dúvidas frequentes

**Posso usar de graça?**
Sim! Supabase tem plano gratuito (até 500MB e 50.000 usuários) e Vercel também é gratuito.

**Meus dados são seguros?**
Sim. O banco usa Row Level Security — cada usuário só acessa as próprias apostas.

**Como criar a conta no app?**
Na tela de login, clique em "Cadastre-se grátis", informe e-mail e senha. Confirme no e-mail recebido.

**Posso usar no Android também?**
Sim! No Chrome/Android: menu (⋮) → "Adicionar à tela inicial".
