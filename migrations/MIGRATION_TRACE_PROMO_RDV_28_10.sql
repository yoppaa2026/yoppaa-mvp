-- LA TRACE DE LA PROMO SUR CHAQUE RENDEZ-VOUS (28/10, lot 1c du module promo).
--
-- 🔴 POURQUOI. Alex, 28/10, chez Salon Nathalie : la promo sur la prestation
-- passait, mais rien ne la gardait sur le rendez-vous. La lecture SQL ne la
-- voyait pas, et les emails donnaient le prix remisé comme un prix normal.
-- Même remède que les lignes de commande (MIGRATION_TRACE_PROMO_LIGNE_28_10) :
--   • prix_plein     : le prix de la prestation SANS la promo ;
--   • promo_deal_id  : la promo qui l'a baissé.
-- Nulles sans promo. La remise se lit : prix_plein - prix_estime.
--
-- ⚠️ PAS DE CLÉ ÉTRANGÈRE vers `yoppaa_deals` : une promo supprimée ne doit
-- ni bloquer sa suppression ni effacer l'histoire d'un rendez-vous.
--
-- ⚠️ À LANCER AVANT LE CODE (commit « lot 1c ») : le code écrit ces colonnes à
-- chaque réservation, et une colonne inconnue ferait échouer la réservation.
-- Sans le code, elles restent nulles : rien ne change. Ordre : TEST, puis PROD.

BEGIN;

ALTER TABLE public.rdv_reservations
  ADD COLUMN IF NOT EXISTS prix_plein numeric(10,2),
  ADD COLUMN IF NOT EXISTS promo_deal_id uuid;

ALTER TABLE public.rdv_reservations
  DROP CONSTRAINT IF EXISTS rdv_reservations_prix_plein_check;
ALTER TABLE public.rdv_reservations
  ADD CONSTRAINT rdv_reservations_prix_plein_check
  CHECK (prix_plein IS NULL OR prix_plein >= 0);

COMMENT ON COLUMN public.rdv_reservations.prix_plein IS
  'Prix de la prestation sans la promo. NULL = reserve au prix plein.';
COMMENT ON COLUMN public.rdv_reservations.promo_deal_id IS
  'La promo (yoppaa_deals) qui a baisse le prix du rendez-vous. NULL = aucune.';

-- Le commerçant connecté lit ses rendez-vous (règles de lecture).
GRANT SELECT (prix_plein, promo_deal_id) ON public.rdv_reservations TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'R1. colonne prix_plein' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'rdv_reservations' AND column_name = 'prix_plein'), 'ABSENTE')::text AS valeur,
    'numeric' AS attendu
  UNION ALL
  SELECT 2, 'R2. colonne promo_deal_id',
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'rdv_reservations' AND column_name = 'promo_deal_id'), 'ABSENTE')::text,
    'uuid'
  UNION ALL
  SELECT 3, 'R3. aucune clé étrangère sur promo_deal_id',
    (SELECT count(*)::text FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = 'public.rdv_reservations'::regclass AND c.contype = 'f' AND a.attname = 'promo_deal_id'),
    '0'
  UNION ALL
  SELECT 4, 'R4. le commerçant connecté lit les deux colonnes',
    (has_column_privilege('authenticated', 'public.rdv_reservations', 'prix_plein', 'SELECT')
     AND has_column_privilege('authenticated', 'public.rdv_reservations', 'promo_deal_id', 'SELECT'))::text,
    'true'
  UNION ALL
  SELECT 5, 'R5. aucun rendez-vous existant touché',
    (SELECT count(*)::text FROM public.rdv_reservations WHERE prix_plein IS NOT NULL OR promo_deal_id IS NOT NULL),
    '0'
) t ORDER BY n;
