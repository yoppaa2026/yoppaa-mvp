-- MODULE RESTAURANT, migration 7 sur 7 — passee par Alex le 09/09/2026.

-- ═══════════════════════════════════════════════════════════════════════════
-- LOT 2a DU MODULE RESTAURANT : L INVENTAIRE PAR FORMAT
--
-- Aujourd hui une salle se compte en COUVERTS : quarante places, et l on accepte
-- tant qu il en reste. Un groupe de six passe donc alors que la salle n a plus
-- que trois tables de deux a trois endroits differents. Aucun specialiste ne
-- compte ainsi : tous tiennent un inventaire de TABLES.
--
-- Le commercant declare « table de 4, j en ai six ». Trois lignes suffisent au
-- Bistrologue : 6 x 4, 2 x 2, 2 x 6.
--
-- ⚠️ NULL = COMME AVANT, et c est la condition pour passer cette migration sans
-- rien casser. Tant qu un seul format de table du commerce n a pas sa quantite,
-- le calcul reste celui d aujourd hui, en couverts. Le mode inventaire ne
-- s allume que lorsque TOUS les formats actifs sont renseignes, et l ecran le
-- dit au commercant : pas de bascule silencieuse, pas de demi-verite.
--
-- ⚠️ AUCUN NOUVEL OBJET : une colonne sur une table qui existe, dont les droits
-- et les policies s appliquent telles quelles. Les GRANT sont des VERIFICATIONS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.rdv_prestations
  ADD COLUMN IF NOT EXISTS quantite integer;

COMMENT ON COLUMN public.rdv_prestations.quantite IS
  'Nombre d exemplaires de ce format de table. NULL = pas d inventaire, la salle se compte en couverts.';

-- Zero table n est pas « pas d inventaire » : c est un format qui n existe pas,
-- et il faut le supprimer plutot que de l inventorier a zero. Une quantite nulle
-- laisserait un format visible que rien ne peut jamais satisfaire.
ALTER TABLE public.rdv_prestations
  DROP CONSTRAINT IF EXISTS rdv_prestations_quantite_positive;
ALTER TABLE public.rdv_prestations
  ADD CONSTRAINT rdv_prestations_quantite_positive
  CHECK (quantite IS NULL OR (quantite >= 1 AND quantite <= 500));

GRANT SELECT ON public.rdv_prestations TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.rdv_prestations FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE : une ligne par verification, la valeur ET l attendu, tout en text.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'la colonne existe'::text AS controle,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='quantite') AS valeur,
       '1'::text AS attendu
UNION ALL
SELECT 'son type',
       COALESCE((SELECT data_type::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='quantite'), 'ABSENTE'),
       'integer'
UNION ALL
SELECT 'elle accepte NULL (le calcul reste en couverts)',
       COALESCE((SELECT is_nullable::text FROM information_schema.columns
         WHERE table_schema='public' AND table_name='rdv_prestations'
           AND column_name='quantite'), 'ABSENTE'),
       'YES'
UNION ALL
SELECT 'aucun format n a encore de quantite',
       (SELECT count(*)::text FROM public.rdv_prestations WHERE quantite IS NOT NULL),
       '0'
UNION ALL
SELECT 'la contrainte « au moins une table » est posee',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conname='rdv_prestations_quantite_positive'),
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
SELECT 'la RLS reste active',
       (SELECT CASE WHEN relrowsecurity THEN 'true' ELSE 'false' END
          FROM pg_class WHERE oid='public.rdv_prestations'::regclass),
       'true'
UNION ALL
-- Le paysage actuel des tables, pour savoir ce qu il reste a encoder.
SELECT 'formats de table declares (mode couverts pour l instant)',
       (SELECT count(*)::text FROM public.rdv_prestations
         WHERE par_couverts = true AND actif = true AND deleted_at IS NULL),
       'le nombre de tes formats de table'
UNION ALL
SELECT 'le nombre de prestations est inchange',
       (SELECT count(*)::text FROM public.rdv_prestations),
       '9';
