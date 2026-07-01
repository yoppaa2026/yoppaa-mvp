-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION AVIS DÉLAI 60 MIN + DISMISS SERVEUR
-- À passer dans Supabase SQL Editor.
--
-- Bug remonté par Alex 01/07/2026 :
-- 1. La modale d'évaluation apparaît DÈS que la commande passe à 'recupere',
--    sans laisser au Yopper le temps de goûter/utiliser. Il faut un délai de
--    45-60 min minimum après le retrait pour évaluer sincèrement.
-- 2. Le "Plus tard" est stocké en localStorage : sur un autre appareil, la
--    demande d'évaluation revient. Il faut persister côté serveur.
--
-- Fix DB :
-- - Colonne commandes.recupere_at : timestamp automatique quand statut →
--   'recupere' via trigger BEFORE UPDATE.
-- - Colonne commandes.avis_ignore_at : timestamp posé par la route
--   /api/commande/ignore-avis quand le Yopper clique "Plus tard".
--
-- Backfill : les commandes déjà 'recupere' aujourd'hui reçoivent
-- recupere_at = created_at (approximation raisonnable pour la migration).
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Ajouter les 2 colonnes ──────────────────────────────────────────────
BEGIN;

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS recupere_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avis_ignore_at TIMESTAMPTZ;

COMMIT;


-- ─── 2. Trigger BEFORE UPDATE : set recupere_at automatiquement ─────────────
-- Se déclenche quand statut passe à 'recupere' depuis n'importe quel autre
-- statut. Si le statut est déjà 'recupere', ne modifie rien (idempotent).
CREATE OR REPLACE FUNCTION set_recupere_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.statut = 'recupere' AND (OLD.statut IS NULL OR OLD.statut <> 'recupere') THEN
    NEW.recupere_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_recupere_at ON commandes;
CREATE TRIGGER trg_set_recupere_at
  BEFORE UPDATE ON commandes
  FOR EACH ROW
  EXECUTE FUNCTION set_recupere_at();


-- ─── 3. Backfill des commandes déjà 'recupere' ───────────────────────────────
-- Utilise created_at comme approximation (pas de meilleure info dispo).
BEGIN;

UPDATE commandes
SET recupere_at = created_at
WHERE statut = 'recupere' AND recupere_at IS NULL;

COMMIT;


-- ─── 4. Vérification finale ──────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'commandes'
  AND column_name IN ('recupere_at', 'avis_ignore_at')
ORDER BY column_name;

SELECT tgname, tgtype, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'commandes'::regclass AND tgname = 'trg_set_recupere_at';

-- Combien de commandes recuperees ont bien recupere_at ?
SELECT
  COUNT(*) FILTER (WHERE statut = 'recupere')                        AS nb_recuperees,
  COUNT(*) FILTER (WHERE statut = 'recupere' AND recupere_at IS NOT NULL) AS nb_avec_timestamp;
