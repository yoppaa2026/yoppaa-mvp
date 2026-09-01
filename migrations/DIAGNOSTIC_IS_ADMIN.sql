-- ═══════════════════════════════════════════════════════════════════════════
-- LA DERNIÈRE INCONNUE : QUE FAIT `is_admin()` ?
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 POURQUOI ELLE COMPTE PLUS QUE TOUTES LES AUTRES. Trois policies en `ALL`
-- — sur `clients`, `avis` et `commercants` — ne reposent QUE sur elle, en
-- lecture ET en écriture. Toutes les autres policies comparent `auth.uid()` à
-- un propriétaire et se vident d'elles-mêmes pour un visiteur sans compte.
-- Celles-ci délèguent entièrement leur jugement à cette fonction.
--
-- Si elle lit le jeton et le compare à une adresse : tout va bien.
-- Si elle peut rendre `true` sans jeton : c'est un accès total à la table des
-- clients, lecture et écriture, avec la clé publique.
--
-- ⚠️ ON LIT LA RÈGLE, ON NE LA SONDE PAS. J'ai écarté l'idée d'appeler
-- `is_admin()` ici : un appel direct planterait toute la requête si la fonction
-- vivait dans un autre schéma, et le résultat dans l'éditeur ne reproduit pas
-- fidèlement le contexte d'un visiteur. La DÉFINITION suffit à juger, et elle
-- ne peut rien casser.
--
-- ⚠️ ON REGARDE AUSSI `search_path`. Une fonction SECURITY DEFINER sans
-- `search_path` figé peut être détournée par un schéma placé devant `public` :
-- c'est un piège classique de Postgres, indépendant de ce que la fonction croit
-- faire.
--
-- Aucune donnée personnelle ne sort d'ici : que la définition d'une fonction.

SELECT 'definition de is_admin()'::text AS controle,
       COALESCE((SELECT pg_get_functiondef(p.oid)
                 FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE p.proname = 'is_admin'
                 LIMIT 1), 'FONCTION INTROUVABLE')::text AS valeur,
       'doit comparer auth.jwt() a une adresse, et rien d autre'::text AS attendu

UNION ALL

SELECT 'schema de is_admin()',
       COALESCE((SELECT n.nspname FROM pg_proc p
                 JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE p.proname = 'is_admin' LIMIT 1), 'INTROUVABLE')::text,
       'public'::text

UNION ALL

SELECT 'is_admin() est SECURITY',
       COALESCE((SELECT CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
                 FROM pg_proc p WHERE p.proname = 'is_admin' LIMIT 1), 'INTROUVABLE')::text,
       'a savoir, les deux se defendent'::text

UNION ALL

SELECT 'search_path fige sur is_admin()',
       COALESCE((SELECT array_to_string(p.proconfig, ' ') FROM pg_proc p
                 WHERE p.proname = 'is_admin' AND p.proconfig IS NOT NULL LIMIT 1),
                'AUCUN')::text,
       'search_path=... OBLIGATOIRE si SECURITY DEFINER'::text

UNION ALL

SELECT 'nombre de policies qui en dependent',
       (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public'
          AND (COALESCE(qual, '') LIKE '%is_admin%' OR COALESCE(with_check, '') LIKE '%is_admin%'))::text,
       '(pour information)'::text

UNION ALL

-- ⚠️ ET LE FRÈRE : `is_admin` n'est peut-être pas la seule fonction sur
-- laquelle une policy s'appuie aveuglément. On les compte toutes.
SELECT 'autres fonctions appelees par des policies',
       COALESCE((SELECT string_agg(DISTINCT f.proname, ', ' ORDER BY f.proname)
                 FROM pg_policies p
                 JOIN pg_proc f ON (COALESCE(p.qual, '') || COALESCE(p.with_check, '')) LIKE ('%' || f.proname || '(%')
                 JOIN pg_namespace fn ON fn.oid = f.pronamespace
                 WHERE p.schemaname = 'public' AND fn.nspname = 'public'), 'aucune')::text,
       'chacune doit etre relue comme is_admin'::text

ORDER BY 1;
