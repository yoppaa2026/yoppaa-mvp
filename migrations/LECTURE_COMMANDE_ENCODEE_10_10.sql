-- LECTURE SEULE (10/10) : avant la commande encodée à la main.
-- Aucune écriture, aucune donnée personnelle : des structures, des droits et
-- le texte des fonctions. À lancer sur l'ESSAI, puis la PROD.

SELECT '01 colonnes de commandes (nom:type:nullable:defaut)'::text AS controle,
       (SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable || ':' || coalesce(column_default, '-'), ' | ' ORDER BY column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes')::text AS valeur
UNION ALL SELECT '02 contraintes CHECK de commandes',
       (SELECT string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | ' ORDER BY conname)
          FROM pg_constraint WHERE conrelid = 'public.commandes'::regclass AND contype = 'c')::text
UNION ALL SELECT '03 declencheurs sur commandes',
       (SELECT string_agg(tgname || ' -> ' || p.proname, ', ' ORDER BY tgname)
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.commandes'::regclass AND NOT t.tgisinternal)::text
UNION ALL SELECT '04 authenticated : droits de table sur commandes',
       (SELECT string_agg(privilege_type, ', ' ORDER BY privilege_type)
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'commandes' AND grantee = 'authenticated')::text
UNION ALL SELECT '05 authenticated : colonnes de commandes NON lisibles',
       (SELECT coalesce(string_agg(column_name, ', ' ORDER BY column_name), '(aucune)')
          FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commandes'
           AND NOT has_column_privilege('authenticated', 'public.commandes', column_name, 'SELECT'))::text
UNION ALL SELECT '06 types de quantite et prix des lignes',
       (SELECT string_agg(table_name || '.' || column_name || ':' || data_type, ', ' ORDER BY table_name, column_name)
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name IN ('commande_articles', 'commande_stock_reservation', 'articles', 'article_stock_jour', 'yoppaa_deals')
           AND column_name IN ('quantite', 'prix_unitaire', 'prix', 'stock_jour', 'stock', 'stock_comptoir', 'commande_max_jour', 'temps_prepa', 'unites_par_deal', 'prix_deal'))::text
UNION ALL SELECT '07 texte de commandes_capacite_creneau',
       (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'commandes_capacite_creneau')::text
UNION ALL SELECT '08 texte de commandes_ecriture_serveur',
       (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'commandes_ecriture_serveur')::text;
