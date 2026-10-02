-- TROIS FICHES DE TEST PASSENT EN « EXISTER » (02/10/2026)
--
-- À COLLER DANS L'ÉDITEUR SQL DE LA PRODUCTION.
--
-- Pourquoi : après la bascule en réel, `npm run controle:abonnements` signale
-- trois forfaits Communiquer « que rien ne facture ». Ce sont des fiches de
-- TEST (classement d'Alex du 02/10) : Le traiteur Alexandre, Sushi Yuki, New
-- Signup. Elles ne seront jamais facturées ; les laisser en forfait payant
-- ferait sonner l'alarme à chaque contrôle, et une alarme qui sonne tout le
-- temps n'est plus écoutée. Décision d'Alex : les passer en Exister (gratuit).
--
-- 🔴 UN NOM MAL ÉCRIT NE DOIT RIEN FAIRE EN SILENCE (leçon du 17/09). Le bloc
-- compte d'abord : il faut EXACTEMENT ces trois fiches, en Communiquer, non
-- exemptées et sans abonnement. Sinon il s'arrête et rien n'est modifié.
--
-- Aucun objet créé, donc pas de GRANT. Une seule transaction.

DO $$
DECLARE trouvees int; touchees int;
BEGIN
  SELECT count(*) INTO trouvees
    FROM public.commercants
   WHERE lower(btrim(nom)) IN ('le traiteur alexandre', 'sushi yuki', 'new signup')
     AND plan = 'communiquer'
     AND billing_exempt IS NOT TRUE
     AND stripe_subscription_id IS NULL;

  IF trouvees <> 3 THEN
    RAISE EXCEPTION 'Il faut exactement 3 fiches de test a passer en Exister, trouvees : %. Rien n a ete modifie.', trouvees;
  END IF;

  UPDATE public.commercants
     SET plan = 'exister'
   WHERE lower(btrim(nom)) IN ('le traiteur alexandre', 'sushi yuki', 'new signup')
     AND plan = 'communiquer'
     AND billing_exempt IS NOT TRUE
     AND stripe_subscription_id IS NULL;
  GET DIAGNOSTICS touchees = ROW_COUNT;

  IF touchees <> 3 THEN
    RAISE EXCEPTION 'Modification inattendue (% fiches) : tout est annule.', touchees;
  END IF;
END
$$;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'T1' AS n, 'les trois fiches de test et leur forfait' AS controle,
       coalesce((SELECT string_agg(nom || ' = ' || plan, ' · ' ORDER BY nom)
                   FROM public.commercants
                  WHERE lower(btrim(nom)) IN ('le traiteur alexandre', 'sushi yuki', 'new signup')), '(aucune)') AS valeur,
       'Le traiteur Alexandre = exister · New Signup = exister · Sushi Yuki = exister' AS attendu
UNION ALL
SELECT 'T2', 'forfaits payants VALIDES, non exemptes, sans abonnement',
       (SELECT count(*) FROM public.commercants
         WHERE plan IN ('communiquer', 'vendre')
           AND statut IN ('valide', 'actif')
           AND billing_exempt IS NOT TRUE
           AND stripe_subscription_id IS NULL)::text,
       '0'
UNION ALL
SELECT 'T3', 'abonnements reels en place',
       (SELECT count(*) FROM public.commercants WHERE stripe_subscription_id IS NOT NULL)::text,
       '6';
