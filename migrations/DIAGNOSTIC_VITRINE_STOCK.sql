-- DIAGNOSTIC : LA VITRINE PAR ARTICLE, LE STOCK SANS LIMITE, LE PRIX FERME (30/09/2026)
--
-- LECTURE SEULE. Aucune écriture, aucune donnée personnelle : la structure de
-- deux colonnes, et des NOMBRES sur le catalogue (articles, variantes,
-- prestations), comptés par catégorie de commerce.
--
-- Les questions, avant d'écrire la moindre migration :
--   A  `articles.stock_mode` et `articles.stock_base` existent en base, et le
--      code ne les lit NULLE PART. Quel type, quel défaut, quelle contrainte,
--      et une fonction ou un déclencheur s'en sert-il ?
--   B  Les valeurs qu'elles contiennent aujourd'hui.
--   C  Le stock tel que les commerçants l'ont rempli : vide (= sans limite
--      aujourd'hui), un « gros chiffre » (le 999 de la pizzeria), à zéro.
--   D  Ce que la règle « le prix est toujours ferme » va toucher : articles en
--      vitrine, articles sans prix, prestations « Prix sur demande » (hors
--      tables, qui n'ont jamais de prix).

SELECT 'A1' AS n, 'articles.stock_mode : type, défaut, vide permis' AS controle,
       coalesce((SELECT data_type || ' | défaut : ' || coalesce(column_default, 'aucun') || ' | vide permis : ' || is_nullable
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_mode'), 'COLONNE ABSENTE') AS valeur,
       'pour information' AS attendu
UNION ALL
SELECT 'A2', 'articles.stock_base : type, défaut, vide permis',
       coalesce((SELECT data_type || ' | défaut : ' || coalesce(column_default, 'aucun') || ' | vide permis : ' || is_nullable
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_base'), 'COLONNE ABSENTE'),
       'pour information'
UNION ALL
SELECT 'A3', 'contraintes des articles qui citent stock_mode ou stock_base',
       coalesce((SELECT string_agg(conname || ' : ' || pg_get_constraintdef(oid), ' || ')
                   FROM pg_constraint
                  WHERE conrelid = 'public.articles'::regclass
                    AND (pg_get_constraintdef(oid) ILIKE '%stock_mode%' OR pg_get_constraintdef(oid) ILIKE '%stock_base%')), 'aucune'),
       'pour information'
UNION ALL
SELECT 'A4', 'fonctions de la base qui citent stock_mode ou stock_base',
       coalesce((SELECT string_agg(DISTINCT p.proname, ', ')
                   FROM pg_proc p
                  WHERE p.pronamespace = 'public'::regnamespace
                    AND (p.prosrc ILIKE '%stock_mode%' OR p.prosrc ILIKE '%stock_base%')), 'aucune'),
       'pour information'
UNION ALL
SELECT 'A5', 'déclencheurs posés sur les articles',
       coalesce((SELECT string_agg(tgname, ', ') FROM pg_trigger
                  WHERE tgrelid = 'public.articles'::regclass AND NOT tgisinternal), 'aucun'),
       'pour information'
UNION ALL
SELECT 'B' || row_number() OVER (ORDER BY coalesce(stock_mode::text, 'VIDE')),
       'articles avec stock_mode = ' || coalesce(stock_mode::text, 'VIDE'),
       count(*)::text,
       'pour information'
  FROM public.articles
 GROUP BY stock_mode
UNION ALL
SELECT 'B9', 'articles avec un stock_base rempli',
       count(*)::text, 'pour information'
  FROM public.articles WHERE stock_base IS NOT NULL
UNION ALL
SELECT 'C' || row_number() OVER (ORDER BY coalesce(c.categorie, 'VIDE')),
       'articles actifs, catégorie ' || coalesce(c.categorie, 'VIDE')
         || ' : total | stock vide ou 0 | stock de 100 et plus | variantes gérées',
       count(*)::text
         || ' | ' || count(*) FILTER (WHERE coalesce(a.stock_jour, 0) = 0)::text
         || ' | ' || count(*) FILTER (WHERE a.stock_jour >= 100)::text
         || ' | ' || count(*) FILTER (WHERE a.gere_variantes IS TRUE)::text,
       'pour information'
  FROM public.articles a
  JOIN public.commercants c ON c.id = a.commercant_id
 WHERE a.actif IS NOT FALSE
 GROUP BY c.categorie
UNION ALL
SELECT 'C8', 'jours de stock réglés à 0 (article_stock_jour, actifs)',
       count(*)::text, 'pour information'
  FROM public.article_stock_jour WHERE actif IS NOT FALSE AND coalesce(stock, 0) = 0
UNION ALL
SELECT 'C9', 'variantes actives à stock 0 | à stock vide',
       count(*) FILTER (WHERE stock = 0)::text || ' | ' || count(*) FILTER (WHERE stock IS NULL)::text,
       'pour information'
  FROM public.article_variantes WHERE actif IS NOT FALSE
UNION ALL
SELECT 'D' || row_number() OVER (ORDER BY coalesce(c.categorie, 'VIDE')),
       'articles actifs, catégorie ' || coalesce(c.categorie, 'VIDE') || ' : en vitrine | sans prix (vide ou 0)',
       count(*) FILTER (WHERE a.est_vitrine IS TRUE)::text
         || ' | ' || count(*) FILTER (WHERE coalesce(a.prix, 0) = 0)::text,
       'pour information'
  FROM public.articles a
  JOIN public.commercants c ON c.id = a.commercant_id
 WHERE a.actif IS NOT FALSE
 GROUP BY c.categorie
UNION ALL
SELECT 'D8', 'prestations actives « Prix sur demande » (prix vide), HORS tables',
       count(*)::text, 'pour information'
  FROM public.rdv_prestations
 WHERE deleted_at IS NULL AND actif IS NOT FALSE AND prix IS NULL AND par_couverts IS NOT TRUE
UNION ALL
SELECT 'D9', 'commerces concernés par ces prestations sans prix',
       count(DISTINCT commercant_id)::text, 'pour information'
  FROM public.rdv_prestations
 WHERE deleted_at IS NULL AND actif IS NOT FALSE AND prix IS NULL AND par_couverts IS NOT TRUE
ORDER BY 1;
