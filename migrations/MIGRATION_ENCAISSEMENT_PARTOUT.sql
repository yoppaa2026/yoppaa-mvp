-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_ENCAISSEMENT_PARTOUT.sql
--
-- ⚠️ LE MÊME DÉFAUT AUX DEUX AUTRES ENDROITS OÙ L'ON ENCAISSE AU COMPTOIR.
--
-- MIGRATION_RDV_ENCAISSEMENT a réparé les rendez-vous. Alex, le même jour :
-- « je suppose que tu appliques ces règles de paiement à la totalité du
-- système et aussi pour les autres où il y a un paiement au comptoir ? »
-- La réponse était non, et il avait raison de demander. Restaient :
--
--   • les COMMANDES payées sur place : leur montant partait bien au comptoir,
--     mais SANS SON MOYEN. Un Click and Collect réglé en liquide et un autre
--     au terminal se ressemblaient comme deux gouttes d'eau dans le journal.
--   • les ABONNEMENTS inscrits à la main : `mode_paiement` ne connaissait que
--     `sur_place`, un mot qui ne dit pas par quel moyen.
--
-- Règle posée par Alex le 17/08, désormais non négociable : une amélioration
-- qui touche d'autres endroits de l'application doit y être appliquée AUSSI.
-- Un correctif partiel est pire qu'un correctif absent, parce qu'il se présente
-- comme fini.
--
-- Idempotente : ré-exécutable sans effet de bord. Aucune donnée n'est modifiée.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Les commandes ──────────────────────────────────────────────────────

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS encaisse_mode    text,
  ADD COLUMN IF NOT EXISTS encaisse_montant numeric(10,2),
  ADD COLUMN IF NOT EXISTS encaisse_le      timestamptz;

-- Mêmes valeurs que sur les rendez-vous, au virement près : personne ne fait un
-- virement en repartant avec son pain.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commandes_encaisse_mode_check'
  ) THEN
    ALTER TABLE commandes
      ADD CONSTRAINT commandes_encaisse_mode_check
      CHECK (encaisse_mode IS NULL OR encaisse_mode IN ('terminal', 'especes', 'rien'));
  END IF;
END $$;

COMMENT ON COLUMN commandes.encaisse_mode IS
  'Comment le commerçant DÉCLARE avoir encaissé au comptoir une commande payée sur place : terminal, especes, ou rien (récupérée sans être payée). NULL tant que rien n''a été déclaré. Yoppaa ne traite aucun de ces paiements, il les enregistre.';
COMMENT ON COLUMN commandes.encaisse_montant IS
  'Montant réellement encaissé au comptoir, en euros, bon cadeau déduit. Figé au moment de l''encaissement.';
COMMENT ON COLUMN commandes.encaisse_le IS
  'Quand l''encaissement au comptoir a été déclaré.';

-- ─── 2. Les abonnements ────────────────────────────────────────────────────
--
-- ⚠️ AUCUNE COLONNE NOUVELLE ICI : `mode_paiement` existe déjà et porte
-- `en_ligne` ou `sur_place`. On ÉLARGIT simplement ses valeurs, parce que
-- « sur place » ne dit pas par quel moyen. Les lignes existantes restent
-- valides : `sur_place` continue d'être accepté, il signifie juste « encaissé
-- chez le commerçant, moyen non précisé ».
--
-- ⚠️ ET LE VIREMENT EST GARDÉ : l'écran d'inscription à la main le proposait
-- déjà, et un abonnement à trois chiffres se règle couramment ainsi. Il n'est
-- pas proposé sur les rendez-vous ni sur les commandes, où il n'a aucun sens.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'abonnements_mode_paiement_check'
  ) THEN
    ALTER TABLE abonnements DROP CONSTRAINT abonnements_mode_paiement_check;
  END IF;
  ALTER TABLE abonnements
    ADD CONSTRAINT abonnements_mode_paiement_check
    CHECK (mode_paiement IS NULL OR mode_paiement IN
      ('en_ligne', 'sur_place', 'terminal', 'especes', 'virement'));
END $$;

COMMENT ON COLUMN abonnements.mode_paiement IS
  'Comment le contrat a été payé : en_ligne (Stripe), ou terminal / especes / virement quand le commerçant l''a encaissé lui-même. sur_place reste accepté pour les inscriptions antérieures, où le moyen n''était pas demandé.';

-- Aucun GRANT ici : les deux tables existent déjà avec leurs droits et leurs
-- policies, et l'ajout de colonnes en hérite. La règle du GRANT explicite vaut
-- pour toute table CRÉÉE, ce qui n'est pas le cas ici.

-- ─── 3. Vérification ───────────────────────────────────────────────────────
-- Attendu : 3 lignes.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'commandes'
  AND column_name IN ('encaisse_mode', 'encaisse_montant', 'encaisse_le')
ORDER BY column_name;

-- Attendu : 2 lignes (le CHECK des commandes et celui des abonnements).
SELECT conname FROM pg_constraint
WHERE conname IN ('commandes_encaisse_mode_check', 'abonnements_mode_paiement_check')
ORDER BY conname;

-- Combien de commandes payées sur place attendent leur moyen. Elles resteront
-- telles quelles : on ne devine pas comment quelqu'un a été payé.
SELECT
  count(*) FILTER (WHERE paye_en_ligne IS NOT TRUE)                            AS payees_sur_place,
  count(*) FILTER (WHERE paye_en_ligne IS NOT TRUE AND encaisse_mode IS NULL)  AS sans_moyen
FROM commandes;
