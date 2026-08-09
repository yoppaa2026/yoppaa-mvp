-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_CHARGE_CRENEAU_ANNULEES.sql
--
-- Les commandes ANNULÉES saturaient les créneaux pour toujours.
--
-- LE DÉFAUT. `charge_preparation_par_creneau` sert à afficher un créneau comme
-- complet côté client. Elle excluait `recupere` et `non_retire`, c'est-à-dire
-- les commandes terminées, mais elle comptait toujours :
--   • `annulee_client_refund`  — le client s'est désisté et a été remboursé ;
--   • `annulee_paiement_ko`    — le paiement n'a jamais abouti, panier abandonné.
--
-- Ces deux-là n'existeront jamais. Elles occupaient pourtant une place, et
-- définitivement : un créneau du samedi matin se remplissait de paniers
-- abandonnés jusqu'à afficher « complet » alors que PERSONNE n'avait réservé.
-- Le commerçant perdait des ventes sans comprendre pourquoi.
--
-- La liste retenue est la même que celle du serveur
-- (`STATUTS_OCCUPENT_CRENEAU` dans lib/creneaux.js) : occupent un créneau les
-- commandes qui attendent encore d'être préparées ou remises.
--
-- ⚠️ `paiement_en_attente` COMPTE, et c'est voulu : la commande est en cours de
-- paiement sur Stripe, sa place lui est réservée. Le cron d'expiration libère
-- celles qui n'aboutissent pas.
--
-- Signature INCHANGÉE : le navigateur continue d'appeler la fonction avec le
-- seul identifiant du commerçant, rien à modifier côté application.
--
-- ⏭️ RESTE À FAIRE, plus tard et pas ici : la fonction agrège TOUTES DATES
-- CONFONDUES. Une commande de mardi pèse donc sur l'affichage du créneau de
-- jeudi. C'est pessimiste, donc sans danger, mais faux. Le corriger demande un
-- paramètre `p_date` et une modification du navigateur : ça se fera d'un bloc.
-- Le contrôle SERVEUR, lui, filtre déjà sur `date_commande`.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- Vérification attendue en fin de script : annulees_comptees = 0
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION charge_preparation_par_creneau(
  p_commercant_id uuid
)
RETURNS TABLE (creneau_id uuid, nb_commandes bigint, temps_total numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.creneau_id,
         COUNT(DISTINCT c.id)::bigint,
         COALESCE(SUM(ca.quantite * COALESCE(a.temps_prepa, 1)), 0)::numeric
    FROM commandes c
    LEFT JOIN commande_articles ca ON ca.commande_id = c.id
    LEFT JOIN articles a           ON a.id = ca.article_id
   WHERE c.commercant_id = p_commercant_id
     AND c.creneau_id IS NOT NULL
     AND c.statut IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret')
   GROUP BY c.creneau_id;
$$;

-- La jointure reste en LEFT : une commande sans ligne (cas théorique) doit tout
-- de même compter dans le nombre de commandes du créneau, sinon la capacité
-- affichée serait trop optimiste.

REVOKE ALL ON FUNCTION charge_preparation_par_creneau(uuid) FROM public;
GRANT EXECUTE ON FUNCTION charge_preparation_par_creneau(uuid) TO anon, authenticated;

-- ─── Vérification ──────────────────────────────────────────────────────────
--
-- ⚠️ LA PREMIÈRE VERSION DE CE CONTRÔLE NE PROUVAIT RIEN. Elle demandait les
-- commandes dont le statut appartenait À LA FOIS à la liste des morts et à
-- celle des vivants, deux ensembles disjoints : elle renvoyait 0 que la
-- migration soit passée ou non. Alex a exécuté, lu « 0 », et aurait pu croire
-- que c'était bon.
--
-- Une vérification de migration doit interroger l'ÉTAT RÉEL de la base, jamais
-- une tautologie. Celle-ci lit le corps de la fonction tel qu'il est stocké.
--
-- Attendu : 1. Un 0 signifie que la migration n'a pas pris.
SELECT COUNT(*) AS fonction_a_jour
FROM pg_proc
WHERE proname = 'charge_preparation_par_creneau'
  AND prosrc LIKE '%paiement_en_attente%';
