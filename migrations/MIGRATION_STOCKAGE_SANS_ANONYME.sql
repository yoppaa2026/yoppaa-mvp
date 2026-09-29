-- PERSONNE N'ENVOIE PLUS DE FICHIER DANS LE STOCKAGE SANS COMPTE (29/09/2026)
--
-- Le contrôle de MIGRATION_ADMIN_ECRITURE_FICHE.sql a lu les policies du
-- stockage. Ligne C10 : « Upload logos public » — PERMISSIVE / INSERT /
-- public / CHECK (bucket_id = 'logos'). Le rôle `public` comprend `anon` :
-- N'IMPORTE QUI, SANS COMPTE, peut déposer un fichier dans le bucket des logos
-- et des photos de fiches, avec l'adresse publique du projet. Stockage
-- facturé, contenu hébergé sous notre nom.
--
-- ⚠️ AUCUN ÉCRAN N'EN A BESOIN, et c'est vérifié dans le code : les quatorze
-- envois vers `logos` partent du tableau de bord ou de l'inscription, APRÈS
-- la création du compte (session `authenticated`), et la suppression de
-- l'admin passe par la clé de service. Les policies `authenticated`
-- (C06, C09) couvrent donc tous les envois réels.
--
-- 🔴 CE QUI RESTE OUVERT, ET C'EST DIT : tout compte CONNECTÉ, y compris un
-- Yopper, peut encore remplacer ou supprimer n'importe quel fichier du bucket
-- (aucune policy ne vérifie à qui il appartient). Le fermer demande de ranger
-- chaque image dans le dossier de son commerce : chantier à part, voir la
-- todo du 29/09. Cette migration ferme ce qui se ferme sans toucher au code.
--
-- Idempotent. Une seule transaction.

BEGIN;

DROP POLICY IF EXISTS "Upload logos public" ON storage.objects;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'envoi dans logos ouvert a public ou anon' AS controle,
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND cmd IN ('INSERT', 'ALL') AND permissive = 'PERMISSIVE'
           AND (roles @> ARRAY['public']::name[] OR roles @> ARRAY['anon']::name[])
           AND coalesce(with_check, qual, '') LIKE '%logos%') AS valeur,
       '0' AS attendu
UNION ALL
SELECT 'A2', 'envoi dans logos pour un compte connecte',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND cmd = 'INSERT' AND permissive = 'PERMISSIVE'
           AND roles @> ARRAY['authenticated']::name[]
           AND coalesce(with_check, '') LIKE '%logos%'),
       'au moins 1'
UNION ALL
SELECT 'A3', 'lecture publique des logos intacte',
       (SELECT count(*)::text FROM pg_policies
         WHERE schemaname = 'storage' AND tablename = 'objects'
           AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
           AND coalesce(qual, '') LIKE '%logos%'),
       'au moins 1'
ORDER BY 1;
