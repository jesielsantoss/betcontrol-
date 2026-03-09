-- Execute este SQL no painel do Supabase (SQL Editor)
-- https://supabase.com/dashboard → seu projeto → SQL Editor

-- 1. Criar tabela de apostas
CREATE TABLE apostas (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  data        DATE NOT NULL,
  evento      TEXT NOT NULL,
  mercado     TEXT,
  selecao     TEXT,
  odd         NUMERIC(8,2) NOT NULL,
  valor       NUMERIC(10,2) NOT NULL,
  status      TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'ganhou', 'perdeu')),
  retorno     NUMERIC(10,2),
  observacao  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar Row Level Security (cada usuário vê só as próprias apostas)
ALTER TABLE apostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê próprias apostas"
  ON apostas FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
