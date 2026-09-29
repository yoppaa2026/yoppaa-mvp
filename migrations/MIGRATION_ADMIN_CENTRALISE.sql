-- L'ADMIN SE RECONNAÎT EN UN SEUL ENDROIT DE LA BASE (29/09/2026)
--
-- Étape 1 de la double authentification de l'admin, voulue par Alex le 29/09.
--
-- Le relevé du 29/09 a trouvé CINQ policies qui comparaient encore l'adresse
-- de l'admin en dur, au lieu d'appeler `is_yoppaa_admin()` :
--   P1 admin_impersonations · « Admin only impersonations »
--   P3 commercants · « Admin Yoppaa modifie tout »
--   P4 commercants · « Admin Yoppaa voit tout »
--   P7 stripe_webhook_events · « Admin only stripe events »
--   P8 storage.objects · kyb_select_own_or_admin (les pièces d'identité)
-- 45 autres passaient déjà par la fonction.
--
-- 🔴 POURQUOI C'EST LA CONDITION DE TOUT LE RESTE : à l'étape 4,
-- `is_yoppaa_admin()` exigera que la session ait donné le code à six
-- chiffres. Une seule policy qui compare encore l'adresse, et on entre
-- dans les dossiers d'identité avec le seul mot de passe.
--
-- CETTE MIGRATION NE CHANGE AUCUN COMPORTEMENT AUJOURD'HUI : la fonction et
-- l'adresse disent exactement la même chose tant que l'étape 4 n'est pas
-- passée. Même nom, même commande, même rôle pour chaque policy.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS "Admin only impersonations" ON public.admin_impersonations;
CREATE POLICY "Admin only impersonations" ON public.admin_impersonations
  AS PERMISSIVE FOR ALL TO public
  USING (public.is_yoppaa_admin()) WITH CHECK (public.is_yoppaa_admin());

DROP POLICY IF EXISTS "Admin Yoppaa modifie tout" ON public.commercants;
CREATE POLICY "Admin Yoppaa modifie tout" ON public.commercants
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.is_yoppaa_admin()) WITH CHECK (public.is_yoppaa_admin());

DROP POLICY IF EXISTS "Admin Yoppaa voit tout" ON public.commercants;
CREATE POLICY "Admin Yoppaa voit tout" ON public.commercants
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.is_yoppaa_admin());

DROP POLICY IF EXISTS "Admin only stripe events" ON public.stripe_webhook_events;
CREATE POLICY "Admin only stripe events" ON public.stripe_webhook_events
  AS PERMISSIVE FOR ALL TO public
  USING (public.is_yoppaa_admin()) WITH CHECK (public.is_yoppaa_admin());

DROP POLICY IF EXISTS kyb_select_own_or_admin ON storage.objects;
CREATE POLICY kyb_select_own_or_admin ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyb_documents'
    AND ((storage.foldername(name))[1] = (auth.uid())::text OR public.is_yoppaa_admin())
  );

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'policies qui comparent encore l adresse admin' AS controle,
       (SELECT count(*)::text FROM pg_policies
         WHERE permissive IN ('PERMISSIVE', 'RESTRICTIVE')
           AND (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%verstappenalexandre%') AS valeur,
       '0' AS attendu
UNION ALL
SELECT 'A2', 'fonctions qui portent l adresse',
       (SELECT string_agg(n.nspname || '.' || p.proname, ', ')
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname IN ('public', 'storage') AND p.prosrc ILIKE '%verstappenalexandre%'),
       'public.is_yoppaa_admin'
UNION ALL
SELECT 'B' || row_number() OVER (ORDER BY schemaname, tablename, policyname),
       schemaname || '.' || tablename || ' · ' || policyname,
       permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',') || ' / '
         || CASE WHEN (coalesce(qual, '') || coalesce(with_check, '')) ILIKE '%is_yoppaa_admin()%' THEN 'fonction' ELSE 'NON' END,
       CASE policyname
         WHEN 'Admin Yoppaa modifie tout' THEN 'PERMISSIVE / UPDATE / authenticated / fonction'
         WHEN 'Admin Yoppaa voit tout' THEN 'PERMISSIVE / SELECT / authenticated / fonction'
         WHEN 'kyb_select_own_or_admin' THEN 'PERMISSIVE / SELECT / authenticated / fonction'
         ELSE 'PERMISSIVE / ALL / public / fonction' END
  FROM pg_policies
 WHERE policyname IN ('Admin only impersonations', 'Admin Yoppaa modifie tout', 'Admin Yoppaa voit tout',
                      'Admin only stripe events', 'kyb_select_own_or_admin')
ORDER BY 1;
