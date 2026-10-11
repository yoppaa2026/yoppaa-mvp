-- ════════════════════════════════════════════════════════════════════════════
-- LECTURE SEULE (rien n'est modifié) : ce qui est RÉELLEMENT en base avant le
-- chantier « stock des lots + options obligatoires » (11/10).
-- À lancer sur l'ESSAI puis sur la PROD. Aucune donnée personnelle : des
-- empreintes de fonctions, des types, des droits et des COMPTES.
--
-- Lignes 1 à 4 : l'empreinte (md5 du texte sans espaces) de chaque fonction en
-- base, comparée à celle de nos fichiers. Si « valeur » ≠ « attendu », la base
-- tourne une AUTRE version : on repart de celle-là, jamais d'un fichier.
-- ════════════════════════════════════════════════════════════════════════════
SELECT * FROM (
  SELECT 1 AS n, 'empreinte reserver_stock_atomique'::text AS controle,
         (SELECT string_agg(md5(regexp_replace(p.prosrc, '\s+', '', 'g')), ' | ')
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'reserver_stock_atomique')::text AS valeur,
         '061b5d13b4723fb075a9f3175579246d (STOCK_PARTAGE)'::text AS attendu
  UNION ALL SELECT 2, 'empreinte stock_commande_par_article',
         (SELECT string_agg(md5(regexp_replace(p.prosrc, '\s+', '', 'g')), ' | ')
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'stock_commande_par_article')::text,
         '29149de89d4aedd00aad794396b8a555 (TEMPS3)'
  UNION ALL SELECT 3, 'empreinte ventes_stock_magasin',
         (SELECT string_agg(md5(regexp_replace(p.prosrc, '\s+', '', 'g')), ' | ')
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'ventes_stock_magasin')::text,
         '88d187d9723a56c3840707beefa59f0f (STOCK_PARTAGE)'
  UNION ALL SELECT 4, 'empreinte vendu_par_offre',
         (SELECT string_agg(md5(regexp_replace(p.prosrc, '\s+', '', 'g')), ' | ')
            FROM pg_proc p JOIN pg_namespace s ON s.oid = p.pronamespace
           WHERE s.nspname = 'public' AND p.proname = 'vendu_par_offre')::text,
         '48a869b115201edfe072034be428319e (VENDU_PAR_OFFRE)'
  UNION ALL SELECT 5, 'colonnes de commande_articles (nom:type:nullable)',
         (SELECT string_agg(column_name || ':' || data_type
                  || coalesce('(' || numeric_precision || ',' || numeric_scale || ')', '') || ':' || is_nullable, ', ' ORDER BY column_name)
            FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commande_articles')::text,
         'à lire : quantite integer, prix_unitaire numeric, pas encore de quantite_stock'
  UNION ALL SELECT 6, 'droits de TABLE sur commande_articles',
         (SELECT string_agg(grantee || ':' || privilege_type, ', ' ORDER BY grantee, privilege_type)
            FROM information_schema.table_privileges
           WHERE table_schema = 'public' AND table_name = 'commande_articles'
             AND grantee IN ('anon', 'authenticated'))::text,
         'à lire'
  UNION ALL SELECT 7, 'colonnes de commande_articles avec des droits PAR COLONNE',
         (SELECT count(*) FROM pg_attribute
           WHERE attrelid = 'public.commande_articles'::regclass AND attnum > 0 AND NOT attisdropped AND attacl IS NOT NULL)::text,
         '0 (sinon : GRANT calqué sur quantite pour la nouvelle colonne)'
  UNION ALL SELECT 8, 'contraintes CHECK de commande_articles',
         coalesce((SELECT string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' ; ')
            FROM pg_constraint WHERE conrelid = 'public.commande_articles'::regclass AND contype = 'c'), 'aucune')::text,
         'à lire'
  UNION ALL SELECT 9, 'déclencheurs sur commande_articles',
         coalesce((SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger
            WHERE tgrelid = 'public.commande_articles'::regclass AND NOT tgisinternal), 'aucun')::text,
         'à lire'
  UNION ALL SELECT 10, 'offres en LOT de plus d''une unité (actives / toutes)',
         ((SELECT count(*) FROM public.yoppaa_deals WHERE deal_type = 'lot' AND coalesce(unites_par_deal, 1) > 1 AND actif)
          || ' / ' || (SELECT count(*) FROM public.yoppaa_deals WHERE deal_type = 'lot' AND coalesce(unites_par_deal, 1) > 1))::text,
         'à lire : mesure du défaut 1'
  UNION ALL SELECT 11, 'offres DUO (actives / toutes)',
         ((SELECT count(*) FROM public.yoppaa_deals WHERE deal_type = 'bundle' AND actif)
          || ' / ' || (SELECT count(*) FROM public.yoppaa_deals WHERE deal_type = 'bundle'))::text,
         'à lire : mesure du défaut 1'
  UNION ALL SELECT 12, 'lignes déjà vendues en lot (plus d''une unité) ou en duo',
         (SELECT count(*) FROM public.commande_articles ca JOIN public.yoppaa_deals d ON d.id = ca.deal_id
           WHERE (d.deal_type = 'lot' AND coalesce(d.unites_par_deal, 1) > 1) OR d.deal_type = 'bundle')::text,
         'à lire : lignes au stock sous-compté'
  UNION ALL SELECT 13, 'groupes d''options obligatoires (articles concernés)',
         (SELECT count(DISTINCT article_id) FROM public.article_options_groupes WHERE obligatoire)::text,
         'à lire : mesure du défaut 2'
) t ORDER BY n;
