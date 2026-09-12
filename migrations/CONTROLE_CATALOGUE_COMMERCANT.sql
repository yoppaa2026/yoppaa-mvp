-- ============================================================================
-- LA RÈGLE DU CATALOGUE, ÉPROUVÉE DES DEUX CÔTÉS (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Aucun UPDATE, aucun DROP. Lecture seule, dans une
-- transaction, et le rôle est toujours rendu. Aucune donnée personnelle n'en
-- sort : des booléens et des comptages.
--
-- 🔴 POURQUOI CETTE VERSION REMPLACE LA PREMIÈRE. La première empruntait
-- l'identité du commerçant non publié et comptait ce qu'il voyait. Lancée le
-- 12/09, elle est tombée sur **Centre Respire**, qui n'a NI article, NI créneau,
-- NI photo : elle a donc rendu quatre zéros et un « à vérifier ». Un test qui
-- ne mesure rien n'est pas un test qui passe, c'est un test absent, et il ne
-- fallait surtout pas lire ces zéros comme une réussite.
--
-- ⚠️ ET ON NE DÉPUBLIE PAS UNE FICHE POUR SE DONNER UN CAS. Ce serait toucher
-- à de la production pour le confort d'une vérification, avec le risque qu'un
-- ROLLBACK oublié laisse un commerce hors ligne.
--
-- L'ANGLE JUSTE : la branche « ou je suis le propriétaire » s'interroge
-- DIRECTEMENT, sans avoir besoin du moindre contenu. Une fiche vide suffit à
-- prouver que son commerçant y a droit et qu'un inconnu ne l'a pas.
--
-- Et pour le risque inverse, celui d'avoir tout fermé, on compte ce qu'un
-- visiteur anonyme voit RÉELLEMENT du catalogue d'un commerce publié.
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
  cid_cache   uuid;  uid_cache   uuid;  nom_cache   text;
  cid_publie  uuid;  nom_publie  text;
  vu_proprio  boolean;
  vu_inconnu  boolean;
  n_articles  integer;
  n_creneaux  integer;
  n_photos    integer;
  n_options   integer;
BEGIN
  -- ── Un commerce NON publié, avec un compte rattaché ─────────────────────
  SELECT c.id, c.auth_user_id, c.nom INTO cid_cache, uid_cache, nom_cache
  FROM public.commercants c
  WHERE c.statut_publication IS DISTINCT FROM 'publie' AND c.auth_user_id IS NOT NULL
  ORDER BY c.nom LIMIT 1;

  -- ── Un commerce PUBLIÉ qui a réellement des articles ────────────────────
  -- ⚠️ On choisit celui qui en a LE PLUS : un test de non-régression sur une
  -- fiche vide ne prouverait rien non plus, c'est exactement l'erreur qu'on
  -- vient de corriger.
  SELECT c.id, c.nom INTO cid_publie, nom_publie
  FROM public.commercants c
  JOIN public.articles a ON a.commercant_id = c.id
  WHERE c.statut_publication = 'publie'
  GROUP BY c.id, c.nom
  ORDER BY count(a.id) DESC LIMIT 1;

  -- ── 1. La branche « je suis le propriétaire », sans contenu requis ──────
  IF cid_cache IS NULL THEN
    INSERT INTO essai_catalogue VALUES ('D00', 'Commerce non publie avec un compte',
      'AUCUN', 'au moins un', '>>> RIEN A TESTER');
  ELSE
    PERFORM set_config('request.jwt.claims',
      json_build_object('sub', uid_cache::text, 'role', 'authenticated')::text, true);
    SELECT public.commerce_lisible(cid_cache) INTO vu_proprio;

    -- Aucune identité du tout : le visiteur de passage.
    PERFORM set_config('request.jwt.claims', '', true);
    SELECT public.commerce_lisible(cid_cache) INTO vu_inconnu;

    INSERT INTO essai_catalogue VALUES
      ('D00', 'Commerce non publie teste', nom_cache, 'une fiche en attente', 'INFO'),
      ('D01', 'Sa fiche est lisible par SON commercant', COALESCE(vu_proprio::text, 'NULL'),
       'true : il travaille dessus avant publication',
       CASE WHEN vu_proprio IS NOT DISTINCT FROM true THEN 'OK' ELSE '>>> ECHEC, son tableau de bord serait vide' END),
      ('D02', 'Sa fiche est lisible par un INCONNU', COALESCE(vu_inconnu::text, 'NULL'),
       'false : c est tout l objet du chantier',
       CASE WHEN vu_inconnu IS NOT DISTINCT FROM false THEN 'OK' ELSE '>>> ECHEC, le catalogue sort encore' END);
  END IF;

  -- ── 2. La non-regression : les fiches en ligne montrent toujours tout ───
  IF cid_publie IS NULL THEN
    INSERT INTO essai_catalogue VALUES ('D03', 'Commerce publie avec des articles',
      'AUCUN', 'au moins un', '>>> RIEN A TESTER');
  ELSE
    PERFORM set_config('request.jwt.claims', '', true);
    EXECUTE 'SET LOCAL ROLE anon';

    SELECT count(*) INTO n_articles FROM public.articles WHERE commercant_id = cid_publie;
    SELECT count(*) INTO n_creneaux FROM public.creneaux WHERE commercant_id = cid_publie;
    SELECT count(*) INTO n_photos
      FROM public.article_photos p JOIN public.articles a ON a.id = p.article_id
     WHERE a.commercant_id = cid_publie;
    SELECT count(*) INTO n_options
      FROM public.article_options_groupes g JOIN public.articles a ON a.id = g.article_id
     WHERE a.commercant_id = cid_publie;

    EXECUTE 'RESET ROLE';

    INSERT INTO essai_catalogue VALUES
      ('D03', 'Commerce publie teste (celui qui a le plus d articles)', nom_publie,
       'une fiche en ligne', 'INFO'),
      ('D04', 'Ses articles vus par un ANONYME', n_articles::text,
       'plus de zero, sinon la fiche est cassee',
       CASE WHEN n_articles > 0 THEN 'OK' ELSE '>>> ECHEC, on a tout ferme' END),
      ('D05', 'Ses creneaux vus par un ANONYME', n_creneaux::text,
       'plus de zero s il en a',
       CASE WHEN n_creneaux > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
      ('D06', 'Ses photos d articles vues par un ANONYME', n_photos::text,
       'plus de zero s il en a',
       CASE WHEN n_photos > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END),
      ('D07', 'Ses groupes d options vus par un ANONYME', n_options::text,
       'plus de zero s il en a',
       CASE WHEN n_options > 0 THEN 'OK' ELSE 'A VERIFIER : en a-t-il ?' END);
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT * FROM essai_catalogue ORDER BY ordre;

COMMIT;

-- ============================================================================
-- COMMENT LIRE
--
--   • D01 doit dire true  → le commerçant voit sa fiche avant publication.
--     C'est la branche qui protège le tableau de bord de l'onboarding.
--   • D02 doit dire false → un inconnu ne la voit pas. C'est le chantier.
--   • D04 doit être > 0   → les fiches en ligne montrent toujours leur carte.
--     Un zéro ici voudrait dire qu'on a tout fermé, ce qui serait pire que le
--     défaut de départ.
--   • D05 a D07 : « A VERIFIER » n'est pas un echec, c'est « ce commerce n'en
--     a peut-etre pas ». Croise avec ce que tu vois sur sa fiche publique.
-- ============================================================================
