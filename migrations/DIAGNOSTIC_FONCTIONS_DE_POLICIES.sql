-- ═══════════════════════════════════════════════════════════════════════════
-- LES TROIS AUTRES FONCTIONS DONT DES POLICIES DÉPENDENT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ✅ `is_admin()` est lue et saine : elle compare `auth.jwt() ->> 'email'` à une
-- adresse, elle est STABLE, et son `search_path` est figé sur `public`, ce qui
-- ferme le piège du SECURITY DEFINER détournable.
--
-- ⚠️ MAIS ELLE N'ÉTAIT PAS SEULE. Le diagnostic a nommé QUATRE fonctions
-- appelées par des policies : `is_admin`, `is_yoppaa_admin`, `commerces_publies`
-- et `mes_commerces_bloques`. Conclure sur une seule reviendrait à solder un
-- audit sur un échantillon.
--
-- 🔴 ET DEUX D'ENTRE ELLES DISENT LA MÊME CHOSE. `is_admin` et
-- `is_yoppaa_admin` répondent toutes deux à « qui est administrateur ». Deux
-- sources de vérité pour une même question, c'est le motif qui a produit le
-- plus de défauts sur ce projet. Si elles divergent, l'une des deux ment.
--
-- Aucune donnée personnelle ne sort d'ici : que des définitions de fonctions.

SELECT ('definition de ' || p.proname || '()')::text AS controle,
       pg_get_functiondef(p.oid)::text AS valeur,
       'doit borner sur l identite, et son search_path doit etre fige'::text AS attendu
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_yoppaa_admin', 'commerces_publies', 'mes_commerces_bloques')

UNION ALL

SELECT ('securite de ' || p.proname || '()')::text,
       (CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END
        || ' | search_path=' || COALESCE(array_to_string(p.proconfig, ' '), 'AUCUN'))::text,
       'si DEFINER, un search_path fige est OBLIGATOIRE'::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_yoppaa_admin', 'commerces_publies', 'mes_commerces_bloques')

UNION ALL

-- 🔴 LE POINT QUI M'INTÉRESSE LE PLUS : les deux fonctions d'administration
-- disent-elles exactement la même chose ? Si leurs corps diffèrent, il existe
-- deux définitions de « administrateur » dans cette base, et l'une des deux
-- finira par être la mauvaise.
SELECT 'is_admin et is_yoppaa_admin disent-elles la meme chose'::text,
       (SELECT CASE
          WHEN count(DISTINCT prosrc) = 1 THEN 'IDENTIQUES'
          WHEN count(*) < 2 THEN 'une seule des deux existe'
          ELSE 'DIFFERENTES'
        END
        FROM pg_proc p2
        JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
        WHERE n2.nspname = 'public'
          AND p2.proname IN ('is_admin', 'is_yoppaa_admin'))::text,
       'IDENTIQUES, sinon il faut n en garder qu une'::text

UNION ALL

-- ⚠️ ET COMBIEN DE POLICIES DÉPENDENT DE CHACUNE : ça dit laquelle est la
-- vraie porte, et laquelle est le doublon oublié.
SELECT ('policies qui appellent ' || f.proname)::text,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public'
          AND (COALESCE(p.qual, '') || COALESCE(p.with_check, '')) LIKE ('%' || f.proname || '(%'))::text,
       '(pour information)'::text
FROM (VALUES ('is_admin'), ('is_yoppaa_admin'), ('commerces_publies'), ('mes_commerces_bloques')) AS f(proname)

ORDER BY 1;
