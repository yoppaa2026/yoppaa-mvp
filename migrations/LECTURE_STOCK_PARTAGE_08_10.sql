-- LECTURE SEULE (08/10) : avant la migration du STOCK PARTAGÉ (stock qui baisse).
-- Aucune écriture, aucune donnée personnelle : des types, des noms, des comptes.
-- À lancer sur l'ESSAI, puis la même sur la PROD.

SELECT '01 type de articles.stock_maj_le (null permis, defaut)'::text AS controle,
       (SELECT data_type || ' | ' || is_nullable || ' | ' || COALESCE(column_default, '-')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'stock_maj_le')::text AS valeur,
       'timestamp with time zone | NO | now()'::text AS attendu
UNION ALL
SELECT '02 type de commandes.created_at',
       (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes' AND column_name = 'created_at')::text,
       'timestamp without time zone'::text
UNION ALL
SELECT '03 colonnes de commande_stock_reservation',
       (SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commande_stock_reservation')::text,
       'a lire'::text
UNION ALL
SELECT '04 declencheurs sur commande_articles',
       (SELECT COALESCE(string_agg(tgname || ' -> ' || p.proname, ', ' ORDER BY tgname), 'aucun')
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.commande_articles'::regclass AND NOT t.tgisinternal)::text,
       'a lire (un declencheur qui touche au stock ?)'::text
UNION ALL
SELECT '05 declencheurs sur commandes',
       (SELECT COALESCE(string_agg(tgname || ' -> ' || p.proname, ', ' ORDER BY tgname), 'aucun')
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.commandes'::regclass AND NOT t.tgisinternal)::text,
       'a lire'::text
UNION ALL
SELECT '06 fonctions qui ecrivent articles.stock_jour',
       (SELECT COALESCE(string_agg(proname, ', ' ORDER BY proname), 'aucune')
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND prosrc ~* 'update\s+(public\.)?articles' AND prosrc ILIKE '%stock_jour%')::text,
       'aucune (sinon a lire avant d ecrire)'::text
UNION ALL
SELECT '07 contrainte du mode de stock',
       (SELECT COALESCE(string_agg(conname || ' : ' || pg_get_constraintdef(oid), ' | '), 'aucune')
          FROM pg_constraint
         WHERE conrelid = 'public.articles'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%stock_mode%')::text,
       'stock_mode IN (illimite, jour, magasin)'::text
UNION ALL
SELECT '08 articles en stock qui baisse, par categorie de commerce',
       (SELECT COALESCE(string_agg(cat || ' = ' || n, ', ' ORDER BY cat), 'aucun')
          FROM (SELECT COALESCE(c.categorie, 'alimentaire') AS cat, count(*)::text AS n
                  FROM public.articles a JOIN public.commercants c ON c.id = a.commercant_id
                 WHERE a.stock_mode = 'magasin' GROUP BY 1) s)::text,
       'a lire'::text
UNION ALL
SELECT '09 stock qui baisse marque sur commande (ne devrait pas exister)',
       (SELECT count(*) FROM public.articles WHERE stock_mode = 'magasin' AND commande_active = true)::text,
       '0'::text
UNION ALL
SELECT '10 stock qui baisse avec variantes geres a part',
       (SELECT count(*) FROM public.articles WHERE stock_mode = 'magasin' AND gere_variantes = true)::text,
       'a lire (le stock de la variante fait foi, hors de ce chantier)'::text;
