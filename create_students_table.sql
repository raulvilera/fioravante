-- ============================================================
-- MIGRAÇÃO: Tabela de Alunos — EE Fioravante Iervolino
-- Projeto Supabase: nemztmnfnkaitixyqskq
-- Execute no: Supabase > SQL Editor > New Query
-- ============================================================

-- 1. Criar tabela students
CREATE TABLE IF NOT EXISTS public.students (
  id        TEXT        PRIMARY KEY,
  nome      TEXT        NOT NULL,
  ra        TEXT        NOT NULL,
  turma     TEXT        NOT NULL,
  escola    TEXT        NOT NULL DEFAULT 'fioravante',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices para performance
CREATE INDEX IF NOT EXISTS idx_students_escola ON public.students(escola);
CREATE INDEX IF NOT EXISTS idx_students_turma  ON public.students(turma);
CREATE INDEX IF NOT EXISTS idx_students_ra     ON public.students(ra);

-- 3. Habilitar RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- 4. Remover políticas antigas (se existirem) antes de recriar
DROP POLICY IF EXISTS "students_select_fioravante"    ON public.students;
DROP POLICY IF EXISTS "students_insert_authenticated" ON public.students;
DROP POLICY IF EXISTS "students_delete_authenticated" ON public.students;

-- 5. Criar políticas
CREATE POLICY "students_select_fioravante"
  ON public.students FOR SELECT
  TO authenticated
  USING (escola = 'fioravante');

CREATE POLICY "students_insert_authenticated"
  ON public.students FOR INSERT
  TO authenticated
  WITH CHECK (escola = 'fioravante');

CREATE POLICY "students_delete_authenticated"
  ON public.students FOR DELETE
  TO authenticated
  USING (escola = 'fioravante');

-- ============================================================
-- VERIFICAÇÃO: Após rodar, confirme com:
-- SELECT COUNT(*) FROM public.students WHERE escola = 'fioravante';
-- ============================================================
