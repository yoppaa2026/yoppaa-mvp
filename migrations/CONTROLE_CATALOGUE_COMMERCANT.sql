-- ============================================================================
-- LE COMMERÇANT NON PUBLIÉ VOIT-IL ENCORE SON CATALOGUE ? (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture seule, dans une transaction, et le rôle est
-- toujours rendu. Aucune donnée personnelle n'en sort : que des comptages.
--
-- POURQUOI CE CONTRÔLE EXISTE. C'est le seul test de la migration du catalogue
-- qui puisse surprendre, et c'est aussi celui qu'on ne peut PAS faire à l'écran
-- en étant Alex : la règle contient une branche « ou je suis l'admin », donc
-- l'administrateur voit tout, de toute façon, y compris ce qu'un commerçant ne
-- devrait pas voir. Ouvrir le tableau de bord en impersonation ne prouverait
-- donc RIEN : la session reste celle de l'admin.
--
-- Ici, on emprunte l'identité du commerçant lui-même, comme le fait un vrai
-- jeton, et on prend son rôle. C'est la seule façon honnête de répondre.
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS essai_catalogue (
  ordre text, controle text, valeur text, attendu text, verdict text
);
TRUNCATE essai_catalogue;

DO $$
DECLARE
  cid          uuid;
  uid          uuid;
  nom_commerce text;
  n_articles   integer;
  n_creneaux   integer;
  n_blocages   integer;
  n_photos     integer;
  n_anon       integer;
BEGIN
  -- Le premier commerce non publié qui a bien un compte rattaché.
  SELECT c.id, c.auth_user_id, c.nom INTO cid, uid, nom_commerce
  FROM public.commercants c
  WHERE c.statut_publication IS DISTINCT FROM 'publie' AND c.auth_user_id IS NOT NULL
  ORDER BY c.nom LIMIT 1;

  IF cid IS NULL THEN
    INSERT INTO essai_catalogue VALUES ('C00', 'Commerce non publie avec un compte',
      'AUCUN', 'au moins un, sinon rien a tester', '>>> TEST IMPOSSIBLE');
    RETURN;
  END IF;

  INSERT INTO essai_catalogue VALUES ('C00', 'Commerce teste', nom_commerce,
    'un de tes deux commerces en attente', 'INFO');

  -- ── On devient ce commerçant : mêmes claims qu'un vrai jeton, même rôle ──
  -- ⚠️ On ne met PAS d'email dans les claims : sans lui `is_yoppaa_admin()`
  -- vaut false, donc la branche admin ne peut pas fausser le résultat. C'est
  -- bien la policy du PROPRIÉTAIRE que l'on mesure.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  SELECT count(*) INTO n_articles FROM public.articles        WHERE commercant_id = cid;
  SELECT count(*) INTO n_creneaux FROM public.creneaux        WHERE commercant_id = cid;
  SELECT count(*) INTO n_blocages FROM public.creneaux_blocages WHERE commercant_id = cid;
  SELECT count(*) INTO n_photos
    FROM public.article_photos p
    JOIN public.articles a ON a.id = p.article_id
   WHERE a.commercant_id = cid;

  -- ── Puis on redevient un visiteur anonyme, sans aucune identité ──────────
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO n_anon FROM public.articles WHERE commercant_id = cid;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);

  INSERT INTO essai_catalogue VALUES
    ('C01', 'Articles vus par SON commercant', n_articles::text,
     'tous les siens (0 seulement s il n en a pas encore)',
     CASE WHEN n_articles > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
    ('C02', 'Creneaux vus par SON commercant', n_creneaux::text,
     'tous les siens',
     CASE WHEN n_creneaux > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
    -- 🔴 LA LIGNE QUI COMPTE : creneaux_blocages n a AUCUNE policy SELECT pour
    -- le proprietaire. Sans la branche « ou je suis le proprietaire » portee
    -- par commerce_lisible, ses blocages auraient disparu de son tableau de bord.
    ('C03', 'Blocages de creneaux vus par SON commercant', n_blocages::text,
     'tous les siens',
     CASE WHEN n_blocages > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
    ('C04', 'Photos d articles vues par SON commercant', n_photos::text,
     'toutes les siennes',
     CASE WHEN n_photos > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
    ('C05', 'Articles de ce commerce vus par un ANONYME', n_anon::text,
     'zero',
     CASE WHEN n_anon = 0 THEN 'OK' ELSE '>>> ECHEC, le catalogue sort encore' END);
END $$;

SELECT * FROM essai_catalogue ORDER BY ordre;

COMMIT;

-- ============================================================================
-- COMMENT LIRE
--
--   • C01 a C04 doivent montrer des nombres > 0 : le commerçant voit encore
--     son catalogue. ⚠️ Un zéro n'est un échec QUE s'il possède réellement des
--     articles, des créneaux, des blocages ou des photos. Sur une fiche à peine
--     commencée, zéro est normal : le contrôle dit alors « A VERIFIER ».
--   • C05 doit être à zéro : plus rien ne sort pour un visiteur anonyme.
--
-- Si C01 à C04 sont tous à zéro, c'est que ce commerce n'a pas encore de
-- contenu : le test ne prouve rien. Dis-le-moi, on testera autrement.
-- ============================================================================
