-- BASCULE STRIPE EN LIVE (17/09)
--
-- 🔴 A PASSER JUSTE APRES avoir change les variables dans Vercel, jamais avant.
-- Entre les deux, la production tourne en live avec des comptes de test : aucun
-- paiement ne passe. Ce creneau doit etre le plus court possible.
--
-- ⚠️ CE SCRIPT EXIGE `MIGRATION_MODE_COMPTE_STRIPE.sql`, passee AVANT. Sans la
-- colonne `stripe_account_mode`, il ne peut designer personne et ne fait rien.
--
-- 🔴 POURQUOI IL NE NOMME PLUS PERSONNE. La premiere version visait trois
-- enseignes par leur nom. Un nom mal orthographie ne leve aucune erreur et ne
-- modifie rien, EN SILENCE : le commercant decouvrait le probleme en cliquant
-- sur un parcours casse. Et les noms changent (Alex renomme les fiches de
-- demonstration le 17/09). Le critere est desormais le MONDE DU COMPTE, qui ne
-- se trompe pas d orthographe.
--
-- 🔴 ET IL LES DETACHE TOUS, PAS SEULEMENT LES VRAIS. Apres la bascule, AUCUN
-- compte ne en test n existe plus. Une fiche de demonstration qui garde
-- `charges_enabled = true` affiche « Payer en ligne » sur un compte mort : le
-- Yopper, ou le RELECTEUR D APPLE, tombe sur une erreur au bout du tunnel.
-- C est le motif de rejet numero un des stores (2.1, App Completeness).
--
-- ⚠️ AUCUNE VENTE N EST TOUCHEE. Ce script n ecrit que des colonnes de
-- `commercants`. Les commandes, les bons et les recompenses restent intacts :
-- le controle G le verifie.

-- ═══ 1. DETACHER TOUS LES COMPTES NES EN TEST ══════════════════════════════
-- L ancien identifiant part dans `stripe_account_id_precedent` : le parcours
-- repart propre, et rien n est perdu si la bascule doit se rejouer.
DO $$
DECLARE touches int;
BEGIN
  UPDATE commercants
     SET stripe_account_id_precedent      = stripe_account_id,
         stripe_account_id                = NULL,
         stripe_account_mode              = NULL,
         stripe_account_charges_enabled   = false,
         stripe_account_details_submitted = false,
         stripe_account_payouts_enabled   = false
   WHERE stripe_account_mode = 'test';

  GET DIAGNOSTICS touches = ROW_COUNT;
  RAISE NOTICE 'Comptes de test detaches : %', touches;
END
$$;

-- ═══ 1 BIS. DETACHER LES ABONNEMENTS ET LES CLIENTS NES EN TEST (02/10) ════
-- 🔴 LE TROU QUE LA VERSION DU 17/09 LAISSAIT. Elle detachait les comptes de
-- PAIEMENT (Connect), pas les ABONNEMENTS Yoppaa. La plateforme ayant toujours
-- tourne en test, chaque `stripe_subscription_id` de la base est un abonnement
-- de test (8 « trialing » au releve du 02/10). Apres la bascule, la base
-- dirait « en essai », Stripe n en connaitrait aucun, et personne ne serait
-- facture au 9 janvier : EN SILENCE.
-- Les vrais commercants recoivent ensuite un abonnement REEL par
-- `scripts/creer-abonnements-reels.mjs` (lance par Alex, liste validee par lui).
-- Leurs droits ne bougent pas entre les deux : ils dependent du forfait, pas
-- de l abonnement.
--
-- ⚠️ ON NE JETTE RIEN : tout part d abord dans `stripe_bascule_archive`
-- (`MIGRATION_ARCHIVE_BASCULE_STRIPE.sql`, a passer AVANT).
--
-- 🔴 UNE SEULE FOIS. Aucune colonne ne dit le monde d un abonnement : rejoue
-- apres la creation des abonnements reels, ce bloc les detacherait. Il
-- s arrete donc s il trouve deja une archive de test.
DO $$
DECLARE archives int; detaches int;
BEGIN
  IF to_regclass('public.stripe_bascule_archive') IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_ARCHIVE_BASCULE_STRIPE.sql doit passer AVANT. Rien n a ete fait.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.stripe_bascule_archive WHERE monde = 'test') THEN
    RAISE NOTICE 'Abonnements de test deja detaches lors d un passage precedent : bloc ignore.';
    RETURN;
  END IF;

  INSERT INTO public.stripe_bascule_archive
         (commercant_id, monde, stripe_customer_id, stripe_subscription_id,
          subscription_status, subscription_trial_end, motif)
  SELECT id, 'test', stripe_customer_id, stripe_subscription_id,
         subscription_status, subscription_trial_end,
         'bascule en reel : client et abonnement nes en test'
    FROM public.commercants
   WHERE stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL;
  GET DIAGNOSTICS archives = ROW_COUNT;

  UPDATE public.commercants
     SET stripe_customer_id     = NULL,
         stripe_subscription_id = NULL,
         subscription_status    = NULL,
         subscription_trial_end = NULL
   WHERE stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL;
  GET DIAGNOSTICS detaches = ROW_COUNT;

  -- Ce qu on detache doit etre exactement ce qu on a archive.
  IF archives <> detaches THEN
    RAISE EXCEPTION 'Archive (%) et detachement (%) different : tout est annule.', archives, detaches;
  END IF;
  RAISE NOTICE 'Abonnements et clients de test archives puis detaches : %', detaches;
END
$$;

-- ═══ 2. OUVRIR LE COMPTOIR SUR LES FICHES PUBLIEES ═════════════════════════
-- 🔴 SANS CE BLOC, UNE FICHE PUBLIEE NE PEUT PLUS RIEN VENDRE DU TOUT. Son
-- paiement en ligne vient de mourir ; si le comptoir n est pas ouvert,
-- `modePaiementEffectif` rend `null` et le tunnel s arrete sans moyen de payer.
--
-- ⚠️ ON N EFFACE AUCUN CHOIX DEFINITIF. Le commerce garde son reglage de
-- paiement en ligne : il redeviendra actif tout seul quand `charges_enabled`
-- repassera a vrai apres reconnexion. On ouvre une porte, on n en ferme aucune.
UPDATE commercants
   SET accepte_paiement_cash = true
 WHERE statut_publication = 'publie'
   AND accepte_paiement_cash IS DISTINCT FROM true;

-- ⚠️ ET RIEN POUR LE RENDEZ-VOUS, VERIFIE LE 17/09. Les colonnes
-- `rdv_paiement_cash` et `rdv_paiement_ligne` existent, sont exposees par
-- `commercants_public`, et ne sont lues NULLE PART dans le code : ni dans
-- `app/`, ni dans `lib/`. Les ecrire ici ferait croire qu on a agi. Le
-- rendez-vous se ferme par `stripe_account_charges_enabled`, deja remis a faux
-- au bloc 1, et il reste reservable sans paiement d avance.

-- ⚠️ LE DETAIL EN RETRAIT TRANCHE, ET C EST EXCLUSIF : tant que le choix est
-- « en_ligne », `cashOK` reste faux meme avec `accepte_paiement_cash`. Le
-- basculer sur « magasin » est la seule facon de garder le tunnel ouvert.
UPDATE commercants
   SET boutique_retrait_paiement = 'magasin'
 WHERE statut_publication = 'publie'
   AND coalesce(boutique_mode_vente, 'retrait') = 'retrait'
   AND coalesce(boutique_retrait_paiement, 'en_ligne') = 'en_ligne';

-- ═══ CONTROLE : une ligne par verification, valeur ET attendu ══════════════
SELECT 'A. comptes encore nes en test'::text AS controle,
       (SELECT count(*)::text FROM commercants WHERE stripe_account_mode = 'test') AS valeur,
       '0 : chacun serait un parcours de paiement mort'::text AS attendu
UNION ALL
SELECT 'B. anciens identifiants conserves'::text,
       (SELECT count(*)::text FROM commercants WHERE stripe_account_id_precedent IS NOT NULL),
       'autant que de comptes detaches : la bascule se rejoue si besoin'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE : plus aucune fiche PUBLIEE ne doit pretendre
-- encaisser. Chacune serait une erreur au bout du tunnel, pour un Yopper ou
-- pour le relecteur d un store.
SELECT 'C. fiches PUBLIEES qui pretendent encore encaisser'::text,
       (SELECT count(*)::text FROM commercants
         WHERE statut_publication = 'publie' AND stripe_account_charges_enabled IS TRUE),
       '0 : toute autre valeur est un paiement qui echouera'::text
UNION ALL
-- 🔴 ET LE CONTROLE JUMEAU, celui qu on oublie : une fiche publiee SANS AUCUN
-- moyen de paiement. Le detail en EXPEDITION ne peut pas encaisser au comptoir
-- (un colis part avant toute rencontre) : si son paiement en ligne est mort,
-- son tunnel s arrete sans issue, et rien a l ecran ne le dit.
SELECT 'D. fiches PUBLIEES sans AUCUN moyen de paiement'::text,
       (SELECT count(*)::text FROM commercants
         WHERE statut_publication = 'publie'
           AND stripe_account_charges_enabled IS NOT TRUE
           AND boutique_mode_vente = 'expedition'),
       '0 : sinon leur tunnel de commande s arrete sans issue'::text
UNION ALL
SELECT 'E. et lesquelles, pour les basculer en retrait'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM commercants
                  WHERE statut_publication = 'publie'
                    AND stripe_account_charges_enabled IS NOT TRUE
                    AND boutique_mode_vente = 'expedition'), '(aucune)'),
       'a passer en retrait, ou a depublier avant les captures'::text
UNION ALL
SELECT 'F. fiches publiees qui encaissent au comptoir'::text,
       (SELECT count(*)::text FROM commercants
         WHERE statut_publication = 'publie' AND accepte_paiement_cash IS TRUE),
       'toutes les fiches publiees : le tunnel doit aller au bout'::text
UNION ALL
SELECT 'G. commandes en base (AUCUNE ne doit disparaitre)'::text,
       (SELECT count(*)::text FROM commandes),
       'inchange : ce script ne touche que des colonnes de commercants'::text
UNION ALL
SELECT 'H. fiches publiees, toutes confondues'::text,
       (SELECT count(*)::text FROM commercants WHERE statut_publication = 'publie'),
       'les fiches de demonstration seront depubliees avant le 1er octobre'::text
UNION ALL
SELECT 'J. abonnements ou clients Stripe encore en base'::text,
       (SELECT count(*)::text FROM commercants
         WHERE stripe_subscription_id IS NOT NULL OR stripe_customer_id IS NOT NULL),
       '0 : chacun est un abonnement de test que personne ne facturera'::text
UNION ALL
SELECT 'K. abonnements et clients de test archives'::text,
       (SELECT count(*)::text FROM stripe_bascule_archive WHERE monde = 'test'),
       '14 au releve du 02/10 (rien n est jete)'::text
UNION ALL
SELECT 'I. et lesquelles'::text,
       coalesce((SELECT string_agg(nom, ' · ' ORDER BY nom) FROM commercants
                  WHERE statut_publication = 'publie'), '(aucune)'),
       'la liste exacte, pour verifier qu aucune ne se dit « test »'::text;
