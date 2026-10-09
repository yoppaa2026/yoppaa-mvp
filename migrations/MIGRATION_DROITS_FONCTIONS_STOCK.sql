-- ═══════════════════════════════════════════════════════════════════════════
-- DEUX VIEILLES FONCTIONS DE STOCK, LANÇABLES PAR TOUT LE MONDE (relevé du 08/10)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 Le relevé du stock partagé (contrôle 10) a montré que `decrement_stock`
-- et `passer_commande_stock` ÉCRIVENT `articles.stock_jour`, et que PUBLIC,
-- `anon` et `authenticated` peuvent les EXÉCUTER. Un visiteur non connecté
-- pouvait donc changer le stock de n'importe quel article.
--
-- Aucun code ne les appelle (vérifié le 08/10 : app, lib, scripts, supabase).
-- On ne les supprime pas : on retire seulement le droit de les lancer. Le
-- serveur (`service_role`) et le propriétaire gardent la main.
--
-- À lancer sur l'ESSAI, puis sur la PROD (indépendant du temps 3).

BEGIN;

REVOKE EXECUTE ON FUNCTION public.decrement_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.passer_commande_stock(jsonb) FROM PUBLIC, anon, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une seule requête, une ligne par vérification, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════

SELECT '01 decrement_stock : qui peut encore la lancer'::text AS controle,
       (SELECT COALESCE(string_agg(grantee, ', ' ORDER BY grantee), 'personne')
          FROM information_schema.routine_privileges
         WHERE routine_name = 'decrement_stock' AND privilege_type = 'EXECUTE')::text AS valeur,
       'postgres, service_role'::text AS attendu
UNION ALL
SELECT '02 passer_commande_stock : qui peut encore la lancer',
       (SELECT COALESCE(string_agg(grantee, ', ' ORDER BY grantee), 'personne')
          FROM information_schema.routine_privileges
         WHERE routine_name = 'passer_commande_stock' AND privilege_type = 'EXECUTE')::text,
       'postgres, service_role'::text
UNION ALL
SELECT '03 anon ne peut plus lancer aucune des deux',
       (NOT has_function_privilege('anon', 'public.decrement_stock(uuid, integer)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.passer_commande_stock(jsonb)', 'EXECUTE'))::text,
       'true'::text
UNION ALL
SELECT '04 authenticated non plus',
       (NOT has_function_privilege('authenticated', 'public.decrement_stock(uuid, integer)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.passer_commande_stock(jsonb)', 'EXECUTE'))::text,
       'true'::text
UNION ALL
SELECT '05 elles tournaient avec les droits du proprietaire (SECURITY DEFINER)',
       (SELECT string_agg(proname || '=' || prosecdef::text, ', ' ORDER BY proname)
          FROM pg_proc WHERE proname IN ('decrement_stock', 'passer_commande_stock'))::text,
       'a lire (true = la faille etait ouverte)'::text;
