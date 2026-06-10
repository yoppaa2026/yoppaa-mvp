-- MIGRATION_SERVICES_TELEPHONE_NOTICE.sql
-- ════════════════════════════════════════════════════════════════════
-- Ajoute une colonne `telephone_notice` (TEXT nullable) à services_publics.
--
-- Usage : si non null, la fiche affiche une fenêtre de confirmation
-- avant de lancer l'appel téléphonique. Permet d'alerter sur :
--   - Un numéro surtaxé (ex : 0903 99 000 = 1,50 €/min)
--   - Un service limité (ex : "Réponse uniquement en français")
--   - Une condition d'usage particulière
--
-- À exécuter AVANT SEED_SERVICES_GARDE_METTET.sql (qui utilise le champ).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE services_publics
  ADD COLUMN IF NOT EXISTS telephone_notice TEXT;

COMMENT ON COLUMN services_publics.telephone_notice IS
  'Si non null, affiché dans une modal de confirmation avant l''appel téléphonique. Utile pour avertir sur les numéros surtaxés ou les restrictions d''usage.';
