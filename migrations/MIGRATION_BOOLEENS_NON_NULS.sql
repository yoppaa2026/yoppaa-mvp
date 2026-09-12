-- ============================================================================
-- UNE FONCTION BOOLÉENNE REND UN BOOLÉEN, JAMAIS NULL (12/09/2026)
--
-- ⚠️ NE PAS PASSER SANS LE GO D'ALEX. Elle touche `is_yoppaa_admin()`, dont
-- dépend une dizaine de policies.
--
-- COMMENT ON L'A VU. Le contrôle Z06 de la migration du catalogue affichait
-- « aucun commerce cache » alors qu'il y a deux commerces en attente. Sa valeur
-- de repli avait été prise : la fonction ne rendait donc pas `false`, elle
-- rendait NULL. Vérifié sur un Postgres en mémoire avant d'écrire une ligne.
--
-- LA CAUSE. `is_yoppaa_admin()` vaut `auth.email() = '...'`. Sans jeton,
-- `auth.email()` est NULL, et en SQL ternaire `NULL = 'quoi que ce soit'` vaut
-- NULL, pas false. Ensuite `false OR NULL` vaut NULL. La fonction
-- `commerce_lisible()` rendait donc NULL pour un commerce non publié.
--
-- ⚠️ CE N'EST PAS UN TROU DE SÉCURITÉ, ET IL FAUT LE DIRE PRÉCISÉMENT. Dans une
-- policy, `USING (NULL)` exclut la ligne exactement comme `USING (false)` : le
-- catalogue est bel et bien fermé, l'essai en rôle `anon` l'a montré. Le défaut
-- est ailleurs, et il est vicieux : PARTOUT AILLEURS, NULL ne se comporte pas
-- comme false. Un `WHERE NOT commerce_lisible(id)` ne rend rien au lieu de tout,
-- un `COALESCE` prend sa valeur de repli, un contrôle se croit vert. C'est
-- exactement ce qui vient d'arriver à mon propre contrôle.
--
-- C'est le cousin du piège du zéro, rencontré sept fois dans ce projet : une
-- valeur d'absence qui traverse une comparaison sans prévenir.
--
-- CE QUE ÇA CHANGE POUR LES POLICIES : RIEN. `NULL` et `false` y sont déjà
-- traités de la même façon. On rend la fonction honnête, on ne modifie aucun
-- comportement d'accès.
--
-- ✅ ESSAYÉE SUR UN POSTGRES EN MÉMOIRE (PGlite, base fabriquée) : 58 essais
-- conformes au total. Avant, `commerce_lisible` d'un commerce non publié rendait
-- NULL ; après, elle rend `false`. Et surtout, NON-RÉGRESSION vérifiée table par
-- table : `anon` voit toujours le seul commerce publié, le propriétaire non
-- publié voit toujours ses dix tables, l'admin voit toujours tout.
--
-- Idempotent. Transactionnel.
-- Date : 2026-09-12
-- ============================================================================

BEGIN;

-- 1. Le socle : l'admin. `is_admin()` délègue à celle-ci, elle en hérite donc.
CREATE OR REPLACE FUNCTION public.is_yoppaa_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.email() = 'verstappenalexandre@gmail.com', false)
$$;

-- 2. La règle du catalogue, qui héritait du NULL par son `OR`.
CREATE OR REPLACE FUNCTION public.commerce_lisible(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commercants c
    WHERE c.id = cid
      AND (c.statut_publication = 'publie' OR c.auth_user_id = auth.uid())
  ) OR COALESCE(public.is_yoppaa_admin(), false)
$$;

COMMIT;


-- ============================================================================
-- CONTRÔLE — celui de tout à l'heure, mais qui MESURE.
--
-- ⚠️ `IS NOT DISTINCT FROM false` distingue false de NULL, là où `= false` et
-- `COALESCE(..., false)` les confondent. C'est précisément cette confusion qui
-- a rendu le contrôle Z06 vert sans rien vérifier.
-- ============================================================================

SELECT 'N01'::text AS ordre,
       'is_yoppaa_admin() sans jeton'::text AS controle,
       COALESCE(public.is_yoppaa_admin()::text, 'NULL')::text AS valeur,
       'false'::text AS attendu,
       CASE WHEN public.is_yoppaa_admin() IS NOT DISTINCT FROM false
            THEN 'OK' ELSE '>>> ECHEC' END::text AS verdict

UNION ALL
SELECT 'N02',
       'is_admin() sans jeton (elle delegue a la precedente)',
       COALESCE(public.is_admin()::text, 'NULL'),
       'false',
       CASE WHEN public.is_admin() IS NOT DISTINCT FROM false THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'N03',
       'commerce_lisible() sur un commerce NON publie',
       COALESCE((SELECT public.commerce_lisible(id)::text FROM public.commercants
                 WHERE statut_publication IS DISTINCT FROM 'publie' LIMIT 1), 'NULL ou aucun commerce cache'),
       'false, et surtout pas NULL',
       CASE WHEN (SELECT public.commerce_lisible(id) FROM public.commercants
                  WHERE statut_publication IS DISTINCT FROM 'publie' LIMIT 1) IS NOT DISTINCT FROM false
            THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'N04',
       'commerce_lisible() sur un commerce publie',
       COALESCE((SELECT public.commerce_lisible(id)::text FROM public.commercants
                 WHERE statut_publication = 'publie' LIMIT 1), 'NULL'),
       'true',
       CASE WHEN (SELECT public.commerce_lisible(id) FROM public.commercants
                  WHERE statut_publication = 'publie' LIMIT 1) IS NOT DISTINCT FROM true
            THEN 'OK' ELSE '>>> ECHEC' END

-- ⚠️ LA VERIFICATION DE NON-REGRESSION : le catalogue doit rester ferme
-- exactement comme il l etait. Sans elle, une correction de confort pourrait
-- rouvrir ce qu on vient de fermer sans que personne ne le voie.
UNION ALL
SELECT 'N05',
       'Combien de commerces non publies restent caches',
       (SELECT count(*)::text FROM public.commercants
        WHERE statut_publication IS DISTINCT FROM 'publie'
          AND public.commerce_lisible(id) IS NOT DISTINCT FROM false),
       'les deux commerces en attente',
       CASE WHEN (SELECT count(*) FROM public.commercants
                  WHERE statut_publication IS DISTINCT FROM 'publie'
                    AND public.commerce_lisible(id) IS DISTINCT FROM false) = 0
            THEN 'OK' ELSE '>>> ECHEC' END

UNION ALL
SELECT 'N06',
       'Combien de commerces publies restent lisibles',
       (SELECT count(*)::text FROM public.commercants
        WHERE statut_publication = 'publie' AND public.commerce_lisible(id)),
       'les douze commerces publies',
       CASE WHEN (SELECT count(*) FROM public.commercants
                  WHERE statut_publication = 'publie' AND NOT public.commerce_lisible(id)) = 0
            THEN 'OK' ELSE '>>> ECHEC' END

ORDER BY 1;
