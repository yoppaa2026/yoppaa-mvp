-- ============================================================================
-- A-T-ON CASSÉ QUELQUE CHOSE ? LES DIX TABLES, COMPARÉES (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Lecture seule, rôle toujours rendu, aucune donnée
-- personnelle : uniquement des comptages.
--
-- POURQUOI CELUI-CI. Le contrôle précédent a montré, sur le commerce publié le
-- mieux fourni, 7 articles, 428 créneaux et 8 groupes d'options visibles par un
-- anonyme — mais **0 photo d'article**. Deux lectures possibles, opposées :
--   • ce commerce n'a tout simplement pas de photos d'articles ;
--   • ou les photos ne sortent plus, et toutes les fiches ont perdu leurs
--     images sans que rien ne le signale.
--
-- 🔴 UN CHIFFRE QU'ON NE SAIT PAS INTERPRÉTER N'EST PAS UN RÉSULTAT. On tranche
-- en comparant, pour chaque table, CE QUI EXISTE chez les commerces publiés
-- avec CE QU'UN ANONYME EN VOIT. Les deux doivent être égaux.
--
-- C'est le contrôle de non-régression qui aurait dû exister dès le début : il
-- ne demande pas « est-ce fermé ? » mais « est-ce resté ouvert là où il faut ? ».
--
-- Coller TOUT le bloc d'un coup.
-- ============================================================================

BEGIN;

CREATE TEMP TABLE IF NOT EXISTS essai_regression (
  ordre text, controle text, valeur text, attendu text, verdict text
);
TRUNCATE essai_regression;

DO $$
DECLARE
  ids      uuid[];
  noms     text[] := ARRAY['articles', 'article_photos', 'article_variantes',
                           'article_options_groupes', 'article_options_valeurs',
                           'article_stock_jour', 'creneaux', 'creneaux_blocages',
                           'commercant_lieux', 'rdv_creneau_prestations'];
  gabarits text[] := ARRAY[
    'SELECT count(*) FROM public.articles WHERE commercant_id = ANY(%L::uuid[])',
    'SELECT count(*) FROM public.article_photos p WHERE EXISTS (SELECT 1 FROM public.articles a WHERE a.id = p.article_id AND a.commercant_id = ANY(%L::uuid[]))',
    'SELECT count(*) FROM public.article_variantes v WHERE EXISTS (SELECT 1 FROM public.articles a WHERE a.id = v.article_id AND a.commercant_id = ANY(%L::uuid[]))',
    'SELECT count(*) FROM public.article_options_groupes g WHERE EXISTS (SELECT 1 FROM public.articles a WHERE a.id = g.article_id AND a.commercant_id = ANY(%L::uuid[]))',
    'SELECT count(*) FROM public.article_options_valeurs va WHERE EXISTS (SELECT 1 FROM public.article_options_groupes g JOIN public.articles a ON a.id = g.article_id WHERE g.id = va.groupe_id AND a.commercant_id = ANY(%L::uuid[]))',
    'SELECT count(*) FROM public.article_stock_jour WHERE commercant_id = ANY(%L::uuid[])',
    'SELECT count(*) FROM public.creneaux WHERE commercant_id = ANY(%L::uuid[])',
    'SELECT count(*) FROM public.creneaux_blocages WHERE commercant_id = ANY(%L::uuid[])',
    'SELECT count(*) FROM public.commercant_lieux WHERE commercant_id = ANY(%L::uuid[])',
    'SELECT count(*) FROM public.rdv_creneau_prestations cp WHERE EXISTS (SELECT 1 FROM public.rdv_creneaux k WHERE k.id = cp.creneau_id AND k.commercant_id = ANY(%L::uuid[]))'
  ];
  i         integer;
  requete   text;
  n_reel    bigint;
  n_anon    bigint;
BEGIN
  -- ⚠️ Les identifiants sont calculés UNE FOIS, hors de tout rôle : si on
  -- joignait `commercants` en étant `anon`, sa propre RLS fausserait tout.
  SELECT array_agg(id) INTO ids
  FROM public.commercants WHERE statut_publication = 'publie';

  IF ids IS NULL THEN
    INSERT INTO essai_regression VALUES ('R00', 'Commerces publies', 'AUCUN',
      'au moins un', '>>> RIEN A TESTER');
    RETURN;
  END IF;

  INSERT INTO essai_regression VALUES ('R00', 'Commerces publies pris en compte',
    array_length(ids, 1)::text, 'les douze fiches en ligne', 'INFO');

  FOR i IN 1..array_length(noms, 1) LOOP
    requete := format(gabarits[i], ids);

    EXECUTE 'RESET ROLE';
    EXECUTE requete INTO n_reel;

    PERFORM set_config('request.jwt.claims', '', true);
    EXECUTE 'SET LOCAL ROLE anon';
    EXECUTE requete INTO n_anon;
    EXECUTE 'RESET ROLE';

    INSERT INTO essai_regression VALUES (
      'R' || lpad(i::text, 2, '0'),
      noms[i],
      n_anon::text || ' vues sur ' || n_reel::text || ' existantes',
      'les deux chiffres identiques',
      CASE
        WHEN n_reel = 0        THEN 'RIEN A VOIR (aucune ligne chez les publies)'
        WHEN n_anon = n_reel   THEN 'OK'
        WHEN n_anon = 0        THEN '>>> REGRESSION : plus rien ne sort'
        ELSE                        '>>> REGRESSION PARTIELLE'
      END
    );
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;

SELECT * FROM essai_regression ORDER BY ordre;

COMMIT;

-- ============================================================================
-- COMMENT LIRE
--
--   • « OK » : un anonyme voit tout ce qui existe chez les commerces publiés.
--     C'est ce qu'on veut, table par table.
--   • « RIEN A VOIR » : aucune ligne n'existe pour les publiés. Ce n'est NI un
--     succès NI un échec, c'est une absence de matière. Pour `article_photos`,
--     cela répondrait à la question laissée ouverte : les fiches n'ont
--     simplement pas de photos d'articles.
--   • « REGRESSION » : à traiter immédiatement, les fiches en ligne ont perdu
--     quelque chose.
-- ============================================================================
