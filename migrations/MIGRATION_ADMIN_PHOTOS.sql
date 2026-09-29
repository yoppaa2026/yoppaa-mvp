-- L'ADMIN VOIT LES PHOTOS D'UNE FICHE PAS ENCORE PUBLIÉE (29/09/2026)
--
-- Alex, en testant « Voir Dashboard » sur une fiche validée et non publiée :
-- « les photos ne s'y trouvent pas alors que je suis certain de les avoir
-- ajoutées ». Le commerçant, lui, les voyait.
--
-- CAUSE : `commercant_photos` ne se lit qu'à deux conditions depuis le 21/08,
-- « commerce publié, ou le mien » (MIGRATION_SECURITE_LECTURES_PUBLIEES_2).
-- En mode admin, la session est celle d'Alex, qui n'est ni l'un ni l'autre.
-- Les autres tables de la fiche portent la policy « Admin Yoppaa FULL »
-- (MIGRATION_ADMIN_RLS, juillet) : `commercant_photos` manque à sa liste.
-- Ça ne se voyait pas tant que valider publiait ; depuis le 28/09, c'est
-- précisément AVANT la publication qu'Alex relit une fiche.
--
-- CE QUE FAIT CETTE MIGRATION : la même policy que les autres tables, rien de
-- plus. Elle s'AJOUTE aux policies existantes (PERMISSIVE, donc un OU) : on
-- ne réécrit pas la règle de lecture publique, qu'on ne connaît que par le
-- dépôt.
--
-- Le contrôle liste aussi, POUR INFORMATION, toutes les tables sous RLS où
-- l'admin n'a aucune policy : ce sont les endroits où le même aveuglement
-- peut se reproduire.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS "Admin Yoppaa FULL" ON public.commercant_photos;
CREATE POLICY "Admin Yoppaa FULL" ON public.commercant_photos
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (public.is_yoppaa_admin())
  WITH CHECK (public.is_yoppaa_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.commercant_photos TO authenticated;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'policy admin sur commercant_photos : permissive, commande, role' AS controle,
       coalesce((SELECT permissive || ' / ' || cmd || ' / ' || array_to_string(roles, ',')
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercant_photos'
                    AND policyname = 'Admin Yoppaa FULL'), 'ABSENTE') AS valeur,
       'PERMISSIVE / ALL / authenticated' AS attendu
UNION ALL
SELECT 'A2', 'elle ne laisse passer que l admin',
       coalesce((SELECT CASE WHEN qual LIKE '%is_yoppaa_admin()%' AND with_check LIKE '%is_yoppaa_admin()%' THEN 'oui' ELSE 'NON : ' || qual END
                        || ' (' || permissive || ')'
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercant_photos'
                    AND policyname = 'Admin Yoppaa FULL'), 'ABSENTE'),
       'oui (PERMISSIVE)'
UNION ALL
SELECT 'A3', 'aucune policy RESTRICTIVE ne la contredit sur commercant_photos',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercant_photos' AND permissive = 'RESTRICTIVE'),
       '0'
UNION ALL
SELECT 'A4', 'la lecture publique est toujours en place',
       coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercant_photos'
                    AND policyname = 'photos_lecture_publique'), 'ABSENTE'),
       'PERMISSIVE / SELECT'
UNION ALL
SELECT 'B' || row_number() OVER (ORDER BY c.relname),
       'table sous RLS SANS policy admin : ' || c.relname,
       (SELECT count(*)::text || ' policy(s) en tout, dont '
               || count(*) FILTER (WHERE p.permissive = 'RESTRICTIVE')::text || ' restrictive(s)'
          FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname),
       'pour information'
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace
   AND c.relkind = 'r'
   AND c.relrowsecurity
   AND NOT EXISTS (
     -- ⚠️ SEULE UNE POLICY PERMISSIVE OUVRE : une restrictive qui cite
     -- l'admin ne lui donne rien à lire.
     SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = c.relname
        AND p.permissive = 'PERMISSIVE'
        AND (p.qual LIKE '%is_yoppaa_admin()%' OR p.with_check LIKE '%is_yoppaa_admin()%')
   )
ORDER BY 1;
