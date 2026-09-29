-- CHAQUE COMMERCE N'ÉCRIT PLUS QUE DANS SON DOSSIER D'IMAGES (29/09/2026)
--
-- ⚠️ À PASSER APRÈS LE DÉPLOIEMENT DU CODE QUI RANGE LES IMAGES DANS
-- `<commercant_id>/…` (lib/stockage-images.js). Dans l'autre ordre, chaque
-- envoi d'image serait refusé jusqu'au déploiement.
--
-- 🔴 LA FAILLE (contrôle du 29/09, lignes C01 à C09) : les policies
-- d'écriture du bucket `logos` ne vérifiaient QUE le nom du bucket. Tout
-- compte connecté, Yopper compris, pouvait remplacer ou supprimer le logo et
-- les photos de n'importe quel commerce. L'envoi anonyme a été fermé le même
-- jour (MIGRATION_STOCKAGE_SANS_ANONYME.sql).
--
-- CE QUE FAIT CETTE MIGRATION :
--   • retire les six policies d'écriture larges (trois doublons de trois) ;
--   • ENVOYER et REMPLACER : seulement dans le dossier d'un commerce dont
--     l'appelant est le propriétaire, ou pour l'admin ;
--   • SUPPRIMER : pareil, PLUS les anciennes images rangées à plat dont le
--     nom porte l'identifiant d'un de ses commerces (`gal-<id>-…`,
--     `cover-<id>-…`) : sans ça, supprimer une photo d'avant le 29/09
--     laisserait le fichier en place. Les autres anciennes images (articles,
--     variantes) restent lisibles et ne se suppriment plus que par l'admin.
--   • LA LECTURE PUBLIQUE N'EST PAS TOUCHÉE : toutes les images existantes
--     restent visibles.
--
-- ⚠️ PAS DE GRANT ICI : les droits de `storage.objects` appartiennent au
-- rôle du stockage de Supabase, qui les gère ; seules les policies sont
-- à nous.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS "Delete authentifie bucket logos" ON storage.objects;
DROP POLICY IF EXISTS "Logos authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Logos authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Logos authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Update authentifie bucket logos" ON storage.objects;
DROP POLICY IF EXISTS "Upload authentifie bucket logos" ON storage.objects;

DROP POLICY IF EXISTS logos_envoi_mon_dossier ON storage.objects;
CREATE POLICY logos_envoi_mon_dossier ON storage.objects
  AS PERMISSIVE
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.commercants c WHERE c.auth_user_id = auth.uid())
      OR public.is_yoppaa_admin()
    )
  );

DROP POLICY IF EXISTS logos_remplacement_mon_dossier ON storage.objects;
CREATE POLICY logos_remplacement_mon_dossier ON storage.objects
  AS PERMISSIVE
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.commercants c WHERE c.auth_user_id = auth.uid())
      OR public.is_yoppaa_admin()
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.commercants c WHERE c.auth_user_id = auth.uid())
      OR public.is_yoppaa_admin()
    )
  );

DROP POLICY IF EXISTS logos_suppression_mon_dossier ON storage.objects;
CREATE POLICY logos_suppression_mon_dossier ON storage.objects
  AS PERMISSIVE
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND (
      (storage.foldername(name))[1] IN (SELECT c.id::text FROM public.commercants c WHERE c.auth_user_id = auth.uid())
      OR public.is_yoppaa_admin()
      OR (
        coalesce(array_length(storage.foldername(name), 1), 0) = 0
        AND EXISTS (SELECT 1 FROM public.commercants c
                     WHERE c.auth_user_id = auth.uid()
                       AND position(c.id::text IN name) > 0)
      )
    )
  );

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'ecritures du bucket logos qui ne verifient QUE le bucket' AS controle,
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL') AND permissive = 'PERMISSIVE'
           AND coalesce(with_check, qual, '') LIKE '%logos%'
           AND coalesce(with_check, qual, '') NOT LIKE '%auth.uid()%'
           AND coalesce(with_check, qual, '') NOT LIKE '%is_yoppaa_admin()%') AS valeur,
       '0' AS attendu
UNION ALL
SELECT 'A2', 'envoi : ' || coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'logos_envoi_mon_dossier'), 'ABSENTE'),
       (SELECT CASE WHEN with_check LIKE '%foldername%' AND with_check LIKE '%auth.uid()%' AND with_check LIKE '%is_yoppaa_admin()%'
                    THEN 'oui' ELSE 'NON' END
          FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'logos_envoi_mon_dossier' AND permissive = 'PERMISSIVE'),
       'oui'
UNION ALL
SELECT 'A3', 'remplacement : ' || coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'logos_remplacement_mon_dossier'), 'ABSENTE'),
       (SELECT CASE WHEN qual LIKE '%foldername%' AND with_check LIKE '%foldername%' THEN 'oui' ELSE 'NON' END
          FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'logos_remplacement_mon_dossier' AND permissive = 'PERMISSIVE'),
       'oui'
UNION ALL
SELECT 'A4', 'suppression : ' || coalesce((SELECT permissive || ' / ' || cmd FROM pg_policies
                  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'logos_suppression_mon_dossier'), 'ABSENTE'),
       (SELECT CASE WHEN qual LIKE '%foldername%' AND qual LIKE '%position%' THEN 'oui' ELSE 'NON' END
          FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
           AND policyname = 'logos_suppression_mon_dossier' AND permissive = 'PERMISSIVE'),
       'oui'
UNION ALL
SELECT 'A5', 'lecture publique des logos intacte',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND cmd = 'SELECT' AND permissive = 'PERMISSIVE' AND coalesce(qual, '') LIKE '%logos%'),
       '3'
UNION ALL
SELECT 'A6', 'aucune policy RESTRICTIVE sur le stockage',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects' AND permissive = 'RESTRICTIVE'),
       '0'
ORDER BY 1;
