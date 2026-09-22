-- ═══════════════════════════════════════════════════════════════════════════
-- LA VRAIE SERRURE : `is_yoppaa_admin()`
-- 22/09/2026 — LECTURE SEULE, AUCUNE DONNÉE PERSONNELLE AFFICHÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- CE QU'ON SAIT. Sur `commercants`, `anon` a DELETE, INSERT, SELECT, UPDATE au
-- niveau table. Une seule policy le vise, `admin_all_commercants [ALL,
-- PERMISSIVE, rôles: public]`, et sa condition est `is_admin()`. Les six autres
-- policies visent `authenticated` avec une identité prouvée.
--
-- 🔴 TOUT TIENT DONC À CETTE CONDITION, ET `is_admin()` NE DÉCIDE RIEN : elle
-- se contente de rendre `public.is_yoppaa_admin()`. La serrure est un cran plus
-- loin que là où on a regardé, et c'est exactement pour ça qu'on regarde.
--
-- ⚠️ DEUX CHOSES À ÉTABLIR, ET ELLES SE COMPLÈTENT :
--   1. ce que `is_yoppaa_admin()` lit pour décider. Une identité PROUVÉE
--      (`auth.uid()`, `auth.email()`) est un mur ; un paramètre, un en-tête ou
--      une table modifiable n'en est pas un ;
--   2. si quelqu'un peut créer un objet dans le schéma `public`. Les deux
--      fonctions sont `SECURITY DEFINER` avec `search_path = public` : qui peut
--      créer dans `public` peut y placer un objet qui détourne un nom, et une
--      fonction DEFINER devient alors une échelle.

SELECT '1. 🔴 ce que is_yoppaa_admin() fait exactement'::text AS controle,
       COALESCE((SELECT pg_get_functiondef(p.oid)::text
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE p.proname = 'is_yoppaa_admin' AND n.nspname = 'public' LIMIT 1),
                '🔴 ABSENTE : la policy appellerait une fonction inexistante')::text AS valeur,
       'elle lit auth.uid() ou auth.email(), jamais un paramètre ni un en-tête'::text AS attendu

UNION ALL
SELECT '2. est-elle SECURITY DEFINER'::text,
       COALESCE((SELECT CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE p.proname = 'is_yoppaa_admin' AND n.nspname = 'public' LIMIT 1), 'ABSENTE')::text,
       'DEFINER'::text

UNION ALL
SELECT '3. 🔴 son search_path est-il figé'::text,
       COALESCE((SELECT COALESCE(array_to_string(p.proconfig, ', '), '🔴 NON FIGÉ')
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE p.proname = 'is_yoppaa_admin' AND n.nspname = 'public' LIMIT 1), 'ABSENTE')::text,
       'search_path figé'::text

UNION ALL
-- ⚠️ PREND-ELLE UN ARGUMENT ? Une fonction de contrôle d'accès qui accepte un
-- paramètre laisse l'appelant dire qui il est. C'est le défaut qu'on cherche.
SELECT '4. 🔴 prend-elle des arguments'::text,
       COALESCE((SELECT CASE WHEN p.pronargs = 0 THEN 'aucun'
                             ELSE '🔴 ' || p.pronargs::text || ' argument(s) : ' || pg_get_function_arguments(p.oid) END
                   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE p.proname = 'is_yoppaa_admin' AND n.nspname = 'public' LIMIT 1), 'ABSENTE')::text,
       'aucun'::text

UNION ALL
-- 🔴 LE SCHÉMA `public` EST-IL OUVERT À LA CRÉATION ? Avec deux fonctions
-- DEFINER en `search_path = public`, quelqu'un qui peut y créer un objet peut
-- détourner un nom que ces fonctions résolvent. C'est le vecteur classique.
SELECT '5. 🔴 qui peut CRÉER dans le schéma public'::text,
       COALESCE((SELECT string_agg(r.rolname::text, ', ' ORDER BY r.rolname::text)
                   FROM pg_roles r
                  WHERE r.rolname IN ('anon', 'authenticated', 'public')
                    AND has_schema_privilege(r.rolname, 'public', 'CREATE')), 'aucun de anon/authenticated')::text,
       'aucun de anon/authenticated'::text

UNION ALL
SELECT '6. et PUBLIC (tous rôles) peut-il créer dans public'::text,
       (SELECT CASE WHEN has_schema_privilege('public', 'public', 'CREATE')
                    THEN '🔴 OUI' ELSE 'non' END)::text,
       'non'::text

UNION ALL
-- ⚠️ ET LA DETTE DÉJÀ CONNUE, MESURÉE ICI PLUTÔT QUE RACONTÉE : l'adresse
-- admin écrite en dur dans les policies. Deux des sept la portent. Le jour où
-- cette adresse change, ces deux-là cessent de fonctionner en silence.
SELECT '7. ⚠️ policies qui codent une adresse email en dur'::text,
       COALESCE((SELECT string_agg(policyname::text || ' [' || permissive || ']', ', ' ORDER BY policyname::text)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND (COALESCE(qual, '') LIKE '%@%' OR COALESCE(with_check, '') LIKE '%@%')), 'aucune')::text,
       'aucune, à terme : is_admin() doit être la seule porte'::text

UNION ALL
-- ⚠️ COMBIEN D'AUTRES TABLES S'APPUIENT SUR CETTE MÊME FONCTION. Si elle est
-- saine, tout va bien ; si elle ne l'est pas, ce n'est pas `commercants` qu'il
-- faut corriger, c'est tout ce qui s'y adosse.
-- ⚠️ ET ICI AUSSI ON DIT LE TYPE. Une policy permissive OUVRE une porte de
-- plus ; une restrictive en ferme une. Les compter ensemble sans le dire,
-- c'est additionner des serrures et des clés.
SELECT '8. combien de policies, dans toute la base, appellent is_admin()'::text,
       (SELECT count(*)::text || ' dont ' || count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text || ' permissive(s)'
          FROM pg_policies
         WHERE COALESCE(qual, '') LIKE '%is_admin()%'
            OR COALESCE(with_check, '') LIKE '%is_admin()%')::text,
       'le nombre de tables protégées par cette seule fonction'::text

UNION ALL
SELECT '9. et combien de tables distinctes'::text,
       (SELECT count(DISTINCT tablename)::text || ' (permissive : '
               || count(DISTINCT tablename) FILTER (WHERE permissive = 'PERMISSIVE')::text || ')'
          FROM pg_policies
         WHERE COALESCE(qual, '') LIKE '%is_admin()%'
            OR COALESCE(with_check, '') LIKE '%is_admin()%')::text,
       'idem'::text;
