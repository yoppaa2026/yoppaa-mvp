-- MIGRATION_COMMANDES_STATUT_CHECK.sql
--
-- Ajoute une contrainte CHECK sur commandes.statut pour verrouiller le vocabulaire
-- des statuts au niveau base. Aujourd'hui, une typo de statut cote code passerait
-- sans erreur et corromprait la commande (le dashboard tomberait sur le fallback
-- STATUTS['en_attente'] et masquerait le probleme).
--
-- Les 8 statuts valides, recenses de facon exhaustive (05/07/2026) :
--   - paiement_en_attente    : commande creee, avant webhook Stripe (create-commande)
--   - en_attente             : paiement OK, en attente de prise en charge marchand (webhook)
--   - en_preparation         : le marchand a demarre la prepa (dashboard)
--   - pret                   : commande prete a etre retiree (dashboard)
--   - recupere               : retiree par le client (dashboard / pickup Yopper)
--   - non_retire             : client non venu (cron non-retire-daily / dashboard)
--   - annulee_client_refund  : annulee par le client avec refund (cancel / webhook)
--   - annulee_paiement_ko    : paiement echoue ou jamais finalise (webhook / cron expire)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ETAPE 1 - DIAGNOSTIC (a lancer EN PREMIER)
-- Verifier que la base ne contient QUE ces 8 valeurs. Si une autre valeur
-- apparait, NE PAS passer l'etape 2 : me la signaler pour qu'on l'ajoute a la
-- liste ou qu'on nettoie les lignes concernees d'abord.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT statut, count(*) AS n
FROM commandes
GROUP BY statut
ORDER BY n DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- ETAPE 2 - CONTRAINTE (a passer seulement si l'etape 1 ne montre QUE les 8 valeurs)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE commandes
  ADD CONSTRAINT commandes_statut_check
  CHECK (statut IN (
    'paiement_en_attente',
    'en_attente',
    'en_preparation',
    'pret',
    'recupere',
    'non_retire',
    'annulee_client_refund',
    'annulee_paiement_ko'
  ));
