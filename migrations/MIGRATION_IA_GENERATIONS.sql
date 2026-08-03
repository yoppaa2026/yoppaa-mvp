-- MIGRATION_IA_GENERATIONS.sql
-- Ch3bis (Bloc B) : journal des générations de textes IA par marchand.
-- Sert au comptage du quota mensuel + suivi de conso (tokens). Aucune donnée sensible.
--
-- A executer dans Supabase (SQL Editor). Attendre "Success" avant de tester le
-- generateur : l'API /api/ia/generer-post compte le quota depuis cette table.

CREATE TABLE IF NOT EXISTS ia_generations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id  UUID NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  type           TEXT NOT NULL DEFAULT 'post',   -- 'post' | 'deal' | 'actu' (surface d'origine)
  occasion       TEXT,                            -- ex 'nouveaute', 'promo', 'evenement'...
  modele         TEXT NOT NULL,                   -- 'haiku' | 'sonnet'
  tokens_in      INTEGER NOT NULL DEFAULT 0,
  tokens_out     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comptage rapide du quota mensuel (commercant + fenetre temporelle).
CREATE INDEX IF NOT EXISTS idx_ia_generations_commercant_date
  ON ia_generations (commercant_id, created_at DESC);

-- RLS : le marchand peut LIRE ses propres generations (compteur "il te reste X").
-- L'ecriture se fait exclusivement en service_role cote API (aucune policy INSERT).
ALTER TABLE ia_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ia_generations_select_own ON ia_generations;
CREATE POLICY ia_generations_select_own ON ia_generations
  FOR SELECT
  USING (
    commercant_id IN (SELECT id FROM commercants WHERE auth_user_id = auth.uid())
  );

-- GRANT explicites (regle projet : toujours sur une nouvelle table).
GRANT SELECT ON ia_generations TO authenticated;
GRANT ALL    ON ia_generations TO service_role;
