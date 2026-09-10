-- MODULE RESTAURANT, migration 6 sur 7 — passee par Alex le 09/09/2026.

-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 1 DU MODULE RESTAURANT : LA DUREE SUIT LA TAILLE DU GROUPE
--
-- Une table de deux reste 90 minutes, une table de six en reste 150. Aujourd hui
-- `duree_minutes` vaut pour tout le monde : l agenda libere une table de huit
-- trop tot, ou bloque une table de deux trop longtemps. Les deux erreurs
-- coutent, et dans les deux sens.
--
-- FORME : un tableau de paliers, trie ou non, du type
--   [{"des": 5, "minutes": 150}, {"des": 7, "minutes": 180}]
-- lu comme « a partir de 5 couverts, compter 150 minutes ».
-- NULL ou tableau vide = la duree de base s applique a tout le monde, donc le
-- parc existant ne bouge pas d un pouce.
--
-- ⚠️ AUCUN NOUVEL OBJET N EST CREE : on ajoute une colonne a une table qui
-- existe, ses droits et ses policies s appliquent telles quelles. Le GRANT
-- ci-dessous est donc une VERIFICATION, pas une ouverture.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS duree_paliers jsonb;

COMMENT ON COLUMN public.rdv_prestations.duree_paliers IS
  'Paliers de duree selon le nombre de couverts : [{"des":5,"minutes":150}]. NULL = duree_minutes pour tous.';

-- Un tableau, ou rien. Une valeur scalaire ou un objet ferait planter la
-- lecture applicative en silence, et le moteur retomberait sur la duree de base
-- sans que personne le sache.
ALTER TABLE public.rdv_prestations
  DROP CONSTRAINT IF EXISTS rdv_prestations_duree_paliers_array;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_duree_paliers_array
  CHECK (duree_paliers IS NULL OR jsonb_typeof(duree_paliers) = 'array');

-- ⚠️ `anon` LIT les prestations (fiche publique), il n en ECRIT aucune.
-- On reaffirme la lecture et on s assure qu aucune ecriture n a ete ouverte.
GRANT SELECT ON public.rdv_prestations TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rdv_prestations FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE : une ligne par verification, la valeur ET l attendu, tout en text.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'la colonne existe'::text AS controle,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='duree_paliers') AS valeur,
       '1'::text AS attendu
UNION ALL
SELECT 'son type',
       COALESCE((SELECT data_type::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='duree_paliers'), 'ABSENTE'),
       'jsonb'
UNION ALL
SELECT 'elle accepte NULL (le parc existant ne bouge pas)',
       COALESCE((SELECT is_nullable::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='duree_paliers'), 'ABSENTE'),
       'YES'
UNION ALL
SELECT 'aucune prestation existante n a de paliers',
       (SELECT count(*)::text FROM public.rdv_prestations WHERE duree_paliers IS NOT NULL),
       '0'
UNION ALL
SELECT 'la contrainte « tableau uniquement » est posee',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname='rdv_prestations_duree_paliers_array'),
       '1'
UNION ALL
SELECT 'anon peut LIRE les prestations',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND grantee='anon' AND privilege_type='SELECT'),
       '1'
UNION ALL
SELECT 'anon ne peut RIEN ecrire',
       (SELECT count(*)::text FROM information_schema.role_table_grants
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND grantee='anon' AND privilege_type IN ('INSERT','UPDATE','DELETE')),
       '0'
UNION ALL
SELECT 'la RLS reste active sur la table',
       (SELECT CASE WHEN relrowsecurity THEN 'true' ELSE 'false' END
          FROM pg_class WHERE oid='public.rdv_prestations'::regclass),
       'true'
UNION ALL
SELECT 'le nombre de prestations est inchange',
       (SELECT count(*)::text FROM public.rdv_prestations),
       'le meme qu avant la migration';
