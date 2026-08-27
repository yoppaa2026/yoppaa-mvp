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

-- ⚠️ LES DEUX NOUVELLES COLONNES VONT À LA FIN, ET C'EST OBLIGATOIRE.
-- `CREATE OR REPLACE VIEW` sait AJOUTER des colonnes, jamais en renommer ni en
-- réordonner. Les glisser avant `created_at` revient, pour Postgres, à demander
-- de renommer la neuvième colonne : il refuse par
--   ERROR 42P16: cannot change name of view column "created_at" to "numero_prefixe"
-- L'ordre des colonnes d'une vue n'a aucune importance pour l'application, qui
-- les demande par leur nom.
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
  created_at,
  numero_prefixe,   -- CC | LI | EX | RE, posé par le déclencheur
  numero_semaine    -- 'IYYY-IW', la semaine de RETRAIT
FROM commandes;

-- ⚠️ GRANT systématique : un CREATE OR REPLACE VIEW conserve les droits
-- existants, mais on les repose explicitement pour que cette migration soit
-- lisible seule, sans avoir à retrouver celle qui les avait posés.
REVOKE INSERT, UPDATE, DELETE ON commandes_stats FROM anon, authenticated;
GRANT SELECT ON commandes_stats TO anon, authenticated;

-- ─── Contrôle ───────────────────────────────────────────────────────────────
-- Attendu : colonnes_ajoutees = 2
SELECT count(*) AS colonnes_ajoutees
FROM information_schema.columns
WHERE table_name = 'commandes_stats'
  AND column_name IN ('numero_prefixe', 'numero_semaine');
