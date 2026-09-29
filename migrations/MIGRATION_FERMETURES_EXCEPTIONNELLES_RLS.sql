-- LES FERMETURES EXCEPTIONNELLES S'ÉCRIVENT ET SE LISENT DE NOUVEAU (29/09/2026)
--
-- DIAGNOSTIC_FERMETURES_EXCEPTIONNELLES.sql a rendu :
--   A1 RLS active = true, A2 policies permissives = 0, A3 lignes = 0.
-- Sous RLS, sans AUCUNE policy permissive, personne ne lit ni n'écrit depuis
-- le navigateur. Le commerçant qui cliquait « Ajouter une fermeture » (onglet
-- Créneaux) recevait une erreur ; la fiche publique ne pouvait afficher
-- aucune fermeture. Seul le serveur de commande (clé de service) lisait la
-- table, et il la trouvait vide. Trouvé en cherchant pourquoi l'admin ne voit
-- pas les photos d'une fiche non publiée.
--
-- ⚠️ LA TABLE EST VIDE : cette migration ne change rien de visible tant
-- qu'aucun commerçant n'ajoute de fermeture. Sans risque pour l'examen Play.
--
-- LES TROIS RÈGLES, sur le modèle exact de `creneaux_blocages`, sa voisine :
--   • le commerçant gère SES fermetures ;
--   • tout le monde LIT celles d'un commerce lisible (`commerce_lisible` :
--     publié, ou le sien, ou l'admin ; vérifiée en base par B1 du diagnostic) ;
--   • l'admin gère tout, comme sur les autres tables de la fiche.
-- La RESTRICTIVE `zz_commerce_ouvert` reste en place : un compte non validé
-- ne touche toujours à rien.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS fermetures_exceptionnelles_proprietaire ON public.fermetures_exceptionnelles;
CREATE POLICY fermetures_exceptionnelles_proprietaire ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (commercant_id IN (SELECT c.id FROM public.commercants c WHERE c.auth_user_id = auth.uid()))
  WITH CHECK (commercant_id IN (SELECT c.id FROM public.commercants c WHERE c.auth_user_id = auth.uid()));

DROP POLICY IF EXISTS fermetures_exceptionnelles_lecture_publique ON public.fermetures_exceptionnelles;
CREATE POLICY fermetures_exceptionnelles_lecture_publique ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR SELECT TO anon, authenticated
  USING (public.commerce_lisible(commercant_id));

DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON public.fermetures_exceptionnelles;
CREATE POLICY "Admin Yoppaa FULL" ON public.fermetures_exceptionnelles
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.is_yoppaa_admin())
  WITH CHECK (public.is_yoppaa_admin());

GRANT SELECT ON public.fermetures_exceptionnelles TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.fermetures_exceptionnelles TO authenticated;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'policies permissives' AS controle,
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles' AND permissive = 'PERMISSIVE') AS valeur,
       '3' AS attendu
UNION ALL
SELECT 'A2', 'le commercant gere les siennes : ' || coalesce((SELECT permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',')
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'fermetures_exceptionnelles_proprietaire'), 'ABSENTE'),
       (SELECT CASE WHEN qual LIKE '%auth.uid()%' AND with_check LIKE '%auth.uid()%' THEN 'oui' ELSE 'NON' END
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
           AND policyname = 'fermetures_exceptionnelles_proprietaire'),
       'oui'
UNION ALL
SELECT 'A3', 'lecture : ' || coalesce((SELECT permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',')
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'fermetures_exceptionnelles_lecture_publique'), 'ABSENTE'),
       (SELECT CASE WHEN qual LIKE '%commerce_lisible(commercant_id)%' THEN 'oui' ELSE 'NON : ' || qual END
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
           AND policyname = 'fermetures_exceptionnelles_lecture_publique'),
       'oui'
UNION ALL
SELECT 'A4', 'admin : ' || coalesce((SELECT permissive || ' / ' || cmd
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'Admin Yoppaa FULL'), 'ABSENTE'),
       (SELECT CASE WHEN qual LIKE '%is_yoppaa_admin()%' THEN 'oui' ELSE 'NON' END
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
           AND policyname = 'Admin Yoppaa FULL'),
       'oui'
UNION ALL
SELECT 'A5', 'le verrou des comptes non valides reste en place',
       coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'fermetures_exceptionnelles'
                    AND policyname = 'zz_commerce_ouvert'), 'ABSENTE'),
       'RESTRICTIVE / ALL'
UNION ALL
SELECT 'A6', 'anon lit, mais n ecrit pas',
       (has_table_privilege('anon', 'public.fermetures_exceptionnelles', 'SELECT')::text || ' / '
        || has_table_privilege('anon', 'public.fermetures_exceptionnelles', 'INSERT')::text),
       'true / false, ou true / true (alors aucune policy n autorise anon a ecrire)'
UNION ALL
SELECT 'A7', 'authenticated lit et ecrit',
       (has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'SELECT')
        AND has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'INSERT')
        AND has_table_privilege('authenticated', 'public.fermetures_exceptionnelles', 'DELETE'))::text,
       'true'
ORDER BY 1;
