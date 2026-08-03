-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION M4 FICHES ENRICHIES — Deals + Actus + GMY 7h30 + stats + Bonnes affaires
-- À passer dans Supabase SQL Editor APRÈS validation Alex.
--
-- Contexte : décisions Alex 01/07/2026 pour Sprint 2 étendu M4 DEF.
--   - Fiches enrichies Deals + Actus (Communiquer + Vendre) : photo + texte long
--     + CTA transactionnel (Vendre uniquement)
--   - Exister GMY : 1 apparition/semaine calendaire lundi-dim
--   - Stats deals (vues + clics + cta_clics)
--   - Bonnes affaires : badge sur fiche
--   - GMY 7h30 : cron + statut_morning tracking pending/envoye/ignore
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. yoppaa_deals : fiches enrichies + stats + bonnes affaires ───────────
BEGIN;

ALTER TABLE yoppaa_deals
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS description_longue TEXT,
  ADD COLUMN IF NOT EXISTS cta_type TEXT NOT NULL DEFAULT 'aucun',
  ADD COLUMN IF NOT EXISTS cta_ref_id UUID,
  ADD COLUMN IF NOT EXISTS statut_morning TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS vues INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clics INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_clics INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS est_bonne_affaire BOOLEAN NOT NULL DEFAULT FALSE;

-- CHECK constraints
ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_cta_type_check;
ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_cta_type_check
  CHECK (cta_type IN ('aucun', 'commander', 'reserver_rdv', 'reserver_table', 'reserver_produit'));

ALTER TABLE yoppaa_deals DROP CONSTRAINT IF EXISTS yoppaa_deals_statut_morning_check;
ALTER TABLE yoppaa_deals
  ADD CONSTRAINT yoppaa_deals_statut_morning_check
  CHECK (statut_morning IN ('pending', 'envoye', 'ignore'));

COMMIT;


-- ─── 2. actualites : fiches enrichies + flag inclus_gmy Exister hebdo ───────
BEGIN;

ALTER TABLE actualites
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS contenu_long TEXT,
  ADD COLUMN IF NOT EXISTS inclus_gmy BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS push_envoye_at TIMESTAMPTZ;

COMMIT;


-- ─── 3. RLS : garantir que le repo est source de vérité ─────────────────────
-- ATTENTION : à ne passer QUE si Alex confirme que RLS n'est PAS déjà activée
-- sur ces tables via le dashboard Supabase (audit du 01/07 dit "inconnu").
-- Vérif préalable :
--   SELECT tablename, rowsecurity FROM pg_tables
--   WHERE tablename IN ('yoppaa_deals', 'actualites');
-- Si rowsecurity = false pour ces 2 tables, décommenter et exécuter le bloc
-- ci-dessous.

/*
BEGIN;

ALTER TABLE yoppaa_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE actualites   ENABLE ROW LEVEL SECURITY;

-- Deals : lecture publique si actif + commerçant gère ses deals
DROP POLICY IF EXISTS "Deals actifs visibles publiquement" ON yoppaa_deals;
CREATE POLICY "Deals actifs visibles publiquement" ON yoppaa_deals
  FOR SELECT TO anon, authenticated
  USING (actif = TRUE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE));

DROP POLICY IF EXISTS "Commercant gere ses deals" ON yoppaa_deals;
CREATE POLICY "Commercant gere ses deals" ON yoppaa_deals
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants
      WHERE commercants.id = yoppaa_deals.commercant_id
        AND commercants.auth_user_id = auth.uid()
    )
  );

-- Actus : lecture publique si actif + fenêtre temporelle valide + commerçant gère
DROP POLICY IF EXISTS "Actus actives visibles publiquement" ON actualites;
CREATE POLICY "Actus actives visibles publiquement" ON actualites
  FOR SELECT TO anon, authenticated
  USING (
    actif = TRUE
    AND (date_debut IS NULL OR date_debut <= CURRENT_DATE)
    AND (date_fin   IS NULL OR date_fin   >= CURRENT_DATE)
  );

DROP POLICY IF EXISTS "Commercant gere ses actus" ON actualites;
CREATE POLICY "Commercant gere ses actus" ON actualites
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants
      WHERE commercants.id = actualites.commercant_id
        AND commercants.auth_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON yoppaa_deals TO authenticated, service_role;
GRANT SELECT                           ON yoppaa_deals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON actualites   TO authenticated, service_role;
GRANT SELECT                           ON actualites   TO anon;

COMMIT;
*/


-- ─── 4. Vérifications finales ───────────────────────────────────────────────
-- Confirmer que toutes les colonnes ont été ajoutées
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'yoppaa_deals'
  AND column_name IN ('photo_url', 'description_longue', 'cta_type', 'cta_ref_id',
                      'statut_morning', 'vues', 'clics', 'cta_clics', 'est_bonne_affaire')
ORDER BY column_name;

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'actualites'
  AND column_name IN ('photo_url', 'contenu_long', 'inclus_gmy', 'push_envoye_at')
ORDER BY column_name;

-- Confirmer les CHECK constraints
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('yoppaa_deals_cta_type_check', 'yoppaa_deals_statut_morning_check');
