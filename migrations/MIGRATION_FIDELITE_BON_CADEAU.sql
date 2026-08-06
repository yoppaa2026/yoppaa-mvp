-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_FIDELITE_BON_CADEAU.sql
--
-- L'achat d'un bon cadeau doit remplir la carte de fidélité de l'acheteur.
--
-- LE BUG (Alex, 07/08) : acheter plusieurs bons cadeaux chez un commerçant
-- n'ajoutait rien à sa cagnotte. C'est pourtant de l'argent réellement dépensé
-- chez lui, et le plus engageant qui soit.
--
-- POURQUOI UNE MIGRATION. Le crédit de fidélité est idempotent grâce à des
-- index uniques : un webhook rejoué ne doit jamais créditer deux fois. Ces
-- index existent pour les commandes et les rendez-vous, pas pour les bons.
-- Sans la colonne, un rejeu Stripe doublerait la cagnotte, et cette
-- protection-là ne s'improvise pas côté application.
--
-- La source 'bon_cadeau' rejoint la contrainte CHECK existante.
--
-- Vérification attendue en fin de script :
--   colonne_creee = 1, index_cree = 1, source_ok = 1
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. La référence du bon, pour l'anti-doublon.
ALTER TABLE public.fidelite_mouvements
  ADD COLUMN IF NOT EXISTS bon_cadeau_id uuid;

COMMENT ON COLUMN public.fidelite_mouvements.bon_cadeau_id IS
  'Bon cadeau à l''origine du crédit. Sert d''ancre d''idempotence : un webhook Stripe rejoué ne doit jamais créditer deux fois.';

-- 2. L'index unique qui rend le rejeu inoffensif, sur le même modèle que
--    les commandes et les rendez-vous.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_fid_mvts_bon
  ON public.fidelite_mouvements (carte_id, bon_cadeau_id)
  WHERE bon_cadeau_id IS NOT NULL;

-- 3. La contrainte de source doit accepter 'bon_cadeau', sinon l'insertion
--    est rejetée. On remplace la contrainte existante par sa version élargie.
ALTER TABLE public.fidelite_mouvements
  DROP CONSTRAINT IF EXISTS fidelite_mouvements_source_check;

ALTER TABLE public.fidelite_mouvements
  ADD CONSTRAINT fidelite_mouvements_source_check
  CHECK (source IN ('comptoir', 'commande', 'rdv', 'bon_cadeau', 'system'));

-- Pas de GRANT à ajouter : on ne crée aucune table, fidelite_mouvements garde
-- ses droits et ses politiques RLS (aucune lecture publique, tout passe par
-- des routes en service_role).

-- ─── Vérification ──────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fidelite_mouvements'
      AND column_name = 'bon_cadeau_id')                        AS colonne_creee,
  (SELECT COUNT(*) FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uidx_fid_mvts_bon') AS index_cree,
  (SELECT COUNT(*) FROM pg_constraint
    WHERE conname = 'fidelite_mouvements_source_check'
      AND pg_get_constraintdef(oid) LIKE '%bon_cadeau%')        AS source_ok;
