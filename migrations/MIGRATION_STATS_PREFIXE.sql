-- ════════════════════════════════════════════════════════════════════════════
-- La vue `commandes_stats` doit porter le PRÉFIXE et la SEMAINE du numéro
--
-- ⚠️ DÉFAUT DÉJÀ EN PRODUCTION, TROUVÉ LE 11/08. L'écran de retrait du Yopper
-- interroge cette vue en demandant `numero_prefixe, numero_semaine` :
--
--   app/commander/page.js  →  .from('commandes_stats')
--                             .select('numero_commande, numero_prefixe, numero_semaine')
--
-- Ces deux colonnes ont été créées sur `commandes` par MIGRATION_NUMERO_COMMANDE
-- le 10/08, mais la vue, elle, n'a jamais été recréée. PostgREST refuse donc la
-- requête (colonne inconnue), le repli échoue, et l'écran affiche « #? » au lieu
-- du numéro. C'est le recours prévu quand la référence arrive avec un instant de
-- retard sur le retour de paiement : il est mort depuis le 10/08.
--
-- La vue reste strictement NON PERSONNELLE : aucune colonne identifiante ni
-- financière n'est ajoutée, seulement les deux morceaux qui composent un numéro
-- déjà présent dans la vue.
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-08-11
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW commandes_stats AS
SELECT
  id,
  commercant_id,
  creneau_id,
  creneau_livraison_id,
  statut,
  mode_retrait,
  date_commande,
  numero_commande,
  numero_prefixe,   -- CC | LI | EX | RE, posé par le déclencheur
  numero_semaine,   -- 'IYYY-IW', la semaine de RETRAIT
  created_at
FROM commandes;

-- ⚠️ GRANT systématique : un CREATE OR REPLACE VIEW conserve les droits
-- existants, mais on les repose explicitement pour que cette migration soit
-- lisible seule, sans avoir à retrouver celle qui les avait posés.
GRANT SELECT ON commandes_stats TO anon, authenticated;

-- ─── Contrôle ───────────────────────────────────────────────────────────────
-- Attendu : colonnes_ajoutees = 2
SELECT count(*) AS colonnes_ajoutees
FROM information_schema.columns
WHERE table_name = 'commandes_stats'
  AND column_name IN ('numero_prefixe', 'numero_semaine');
