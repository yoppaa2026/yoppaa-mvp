-- ============================================================================
-- DURCISSEMENT DES ACCÈS (audit du 12/09/2026)
--
-- CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE :
--   1. fixe le `search_path` des deux fonctions SECURITY DEFINER ;
--   2. retire les droits SQL qui traînent sur trois tables verrouillées.
--
-- ⚠️ AUCUN CHANGEMENT FONCTIONNEL ATTENDU. Les trois tables ont la RLS active
-- et AUCUNE policy : tout y est déjà refusé pour `anon` comme pour un
-- commerçant connecté. Le droit SQL qui reste ne sert donc à rien aujourd'hui,
-- mais il arme un piège pour demain : le jour où quelqu'un ajoute une policy
-- permissive pour dépanner, il ouvrirait l'écriture publique d'un seul coup.
-- On ne veut pas que la fermeture repose sur une ABSENCE.
--
-- `article_likes` est servie par /api/articles/like en clé de service, qui
-- ignore la RLS et garde ses droits propres : la route continue de fonctionner.
-- `services` et `stock_jours` ne sont référencées NULLE PART dans le code
-- (vérifié le 12/09) : ce sont des résidus.
--
-- POURQUOI LE search_path. Une fonction `SECURITY DEFINER` s'exécute avec les
-- droits de son propriétaire, ici `postgres`. Sans `search_path` fixe, elle
-- résout ses tables dans les schémas de l'APPELANT : un objet de même nom placé
-- devant détourne la fonction avec les pleins pouvoirs. On épingle `public`, et
-- `pg_temp` explicitement EN DERNIER, qui est la parade standard.
--
-- Transactionnel : en cas d'erreur, rien ne reste à moitié fait. Idempotent :
-- relançable sans effet de bord.
--
-- Date : 2026-09-12
-- ============================================================================

BEGIN;

-- ─── 1. Les deux fonctions SECURITY DEFINER ─────────────────────────────────
-- Signatures relevées en base le 12/09 (contrôle n° 2, lignes I).
ALTER FUNCTION public.decrement_stock(uuid, integer)  SET search_path = public, pg_temp;
ALTER FUNCTION public.passer_commande_stock(jsonb)    SET search_path = public, pg_temp;

-- ─── 2. Les droits résiduels sur les tables verrouillées ────────────────────
-- ⚠️ ON NE TOUCHE PAS À `service_role` : c'est lui qui sert ces tables depuis
-- les routes API. On retire à `anon` et au rôle `PUBLIC`, dont `anon` hérite.
REVOKE ALL ON TABLE public.article_likes FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.services      FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.stock_jours   FROM anon, PUBLIC;

COMMIT;


-- ============================================================================
-- CONTRÔLE — une ligne par vérification, avec sa valeur ET l'attendu.
-- ============================================================================

SELECT 'Z01'::text AS ordre,
       'Fonctions SECURITY DEFINER sans search_path'::text AS controle,
       COALESCE(string_agg(p.proname::text, ', ' ORDER BY p.proname::text), 'aucune')::text AS valeur,
       'aucune'::text AS attendu,
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> ECHEC' END::text AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')

UNION ALL
SELECT 'Z02',
       'search_path de decrement_stock',
       COALESCE((SELECT array_to_string(p.proconfig, ' ') FROM pg_proc p
                 WHERE p.oid = 'public.decrement_stock(uuid,integer)'::regprocedure), 'ABSENT'),
       'search_path=public, pg_temp',
       CASE WHEN (SELECT array_to_string(p.proconfig, ' ') FROM pg_proc p
                  WHERE p.oid = 'public.decrement_stock(uuid,integer)'::regprocedure)
                 LIKE 'search_path=%' THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'Z03',
       'search_path de passer_commande_stock',
       COALESCE((SELECT array_to_string(p.proconfig, ' ') FROM pg_proc p
                 WHERE p.oid = 'public.passer_commande_stock(jsonb)'::regprocedure), 'ABSENT'),
       'search_path=public, pg_temp',
       CASE WHEN (SELECT array_to_string(p.proconfig, ' ') FROM pg_proc p
                  WHERE p.oid = 'public.passer_commande_stock(jsonb)'::regprocedure)
                 LIKE 'search_path=%' THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'Z04',
       'Droits anon/PUBLIC restants sur les trois tables',
       COALESCE(string_agg(DISTINCT (g.table_name || ':' || g.privilege_type), ', '), 'aucun'),
       'aucun',
       CASE WHEN count(*) = 0 THEN 'OK' ELSE '>>> ECHEC' END
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'PUBLIC')
  AND g.table_name IN ('article_likes', 'services', 'stock_jours')

-- ⚠️ LA VÉRIFICATION QUI COMPTE VRAIMENT : on a retiré à `anon` SANS toucher au
-- rôle qui fait tourner la route des cœurs. Sans cette ligne, un REVOKE trop
-- large passerait pour une réussite.
UNION ALL
SELECT 'Z05',
       'service_role garde ses droits sur article_likes',
       COALESCE(string_agg(DISTINCT g.privilege_type::text, ', '), 'AUCUN'),
       'DELETE, INSERT, SELECT, UPDATE',
       CASE WHEN count(*) >= 4 THEN 'OK' ELSE '>>> ECHEC, la route des coeurs casserait' END
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public' AND g.grantee = 'service_role' AND g.table_name = 'article_likes'

UNION ALL
SELECT 'Z06',
       'RLS toujours active sur les trois tables',
       COALESCE(string_agg(c.relname::text || '=' || c.relrowsecurity::text, ', ' ORDER BY c.relname::text), 'aucune'),
       'les trois a true',
       CASE WHEN count(*) FILTER (WHERE c.relrowsecurity) = 3 THEN 'OK' ELSE '>>> ECHEC' END
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('article_likes', 'services', 'stock_jours')

ORDER BY 1;
