-- AVANT LA BASCULE STRIPE : QUI A UN ABONNEMENT, ET DANS QUEL MONDE (02/10/2026)
--
-- À COLLER DANS L'ÉDITEUR SQL DE LA PRODUCTION. LECTURE SEULE. Ne rend que le
-- nom du commerce et des statuts : aucune adresse, aucun téléphone, aucun
-- identifiant Stripe en clair (seulement « oui / non »).
--
-- Pourquoi : `npm run controle:abonnements` compte 8 commerçants « en règle »,
-- c'est-à-dire avec un `stripe_subscription_id`. La plateforme étant en mode
-- TEST depuis toujours, CHACUN de ces abonnements est un abonnement de test,
-- qui n'existera pas en réel. Après la bascule, la base dirait encore « en
-- essai » et personne ne serait facturé au 9 janvier, EN SILENCE.
-- `BASCULE_STRIPE_LIVE.sql` détache les comptes Connect, pas les abonnements :
-- il faut savoir qui est vrai et qui est de test avant d'écrire la suite.

SELECT c.nom,
       c.plan,
       c.statut,
       c.statut_publication,
       c.billing_exempt::text AS exempte,
       (c.stripe_subscription_id IS NOT NULL)::text AS a_un_abonnement,
       coalesce(c.subscription_status, '-') AS statut_abonnement,
       coalesce(to_char(c.subscription_trial_end, 'YYYY-MM-DD'), '-') AS fin_essai,
       (c.stripe_customer_id IS NOT NULL)::text AS a_un_client_stripe,
       coalesce(c.stripe_account_mode, '-') AS monde_compte_paiement
  FROM public.commercants c
 WHERE c.stripe_subscription_id IS NOT NULL
    OR c.stripe_customer_id IS NOT NULL
    OR c.plan IN ('communiquer', 'vendre')
 ORDER BY (c.stripe_subscription_id IS NOT NULL) DESC, c.nom;
