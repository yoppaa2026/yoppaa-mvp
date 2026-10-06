-- ════════════════════════════════════════════════════════════════════════════
-- Le plafond du paiement sur place, réglé par le commerçant
-- Mineurs de l'audit livraison, décision d'Alex le 06/10
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Une commande « payée sur place » ne demandait rien : de fausses
-- commandes pouvaient bloquer les créneaux et le stock d'un commerce. Deux
-- règles, appliquées par le serveur (lib/sur-place.js) :
--   • au plus 2 commandes sur place en cours par email ou téléphone (aucune
--     colonne : la règle compte les commandes existantes) ;
--   • un plafond par commande, ICI : `paiement_sur_place_max`, en euros.
--     NULL = aucun plafond, le comportement d'avant pour tous.
--
-- ⚠️ À PASSER AVANT LE DÉPLOIEMENT DU CODE, sur l'essai PUIS sur la prod :
-- la création de commande lit cette colonne, et une colonne absente fait
-- échouer TOUTE la requête (donc toute commande).
--
-- Le commerçant l'écrit lui-même depuis l'onglet Paiements : droit de mise à
-- jour sur CETTE colonne pour `authenticated` (même schéma que
-- `rdv_horizon_jours`), la RLS de `commercants` limitant déjà à sa ligne.
-- La vue publique `commercants_public` n'est PAS touchée.
--
-- Idempotent. Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS paiement_sur_place_max numeric(10,2);

ALTER TABLE public.commercants
  DROP CONSTRAINT IF EXISTS commercants_paiement_sur_place_max_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_paiement_sur_place_max_check
  CHECK (paiement_sur_place_max IS NULL OR (paiement_sur_place_max > 0 AND paiement_sur_place_max <= 10000));

COMMENT ON COLUMN public.commercants.paiement_sur_place_max IS
  'Montant maximal (EUR) d une commande payée sur place. NULL = pas de plafond. Appliqué par create-commande (lib/sur-place.js).';

GRANT SELECT (paiement_sur_place_max) ON public.commercants TO authenticated;
GRANT UPDATE (paiement_sur_place_max) ON public.commercants TO authenticated;
GRANT SELECT, UPDATE (paiement_sur_place_max) ON public.commercants TO service_role;

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne creee' AS controle,
         (SELECT data_type || ' ' || numeric_precision || ',' || numeric_scale || ' null=' || is_nullable
            FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commercants' AND column_name = 'paiement_sur_place_max')::text AS valeur,
         'numeric 10,2 null=YES' AS attendu
  UNION ALL SELECT 2, 'contrainte du plafond',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.commercants'::regclass AND conname = 'commercants_paiement_sur_place_max_check')::text,
         'CHECK (((paiement_sur_place_max IS NULL) OR ((paiement_sur_place_max > (0)::numeric) AND (paiement_sur_place_max <= (10000)::numeric))))'
  UNION ALL SELECT 3, 'le commercant peut le regler (authenticated UPDATE)',
         has_column_privilege('authenticated', 'public.commercants', 'paiement_sur_place_max', 'UPDATE')::text,
         'true'
  UNION ALL SELECT 4, 'le serveur le lit (service_role SELECT)',
         has_column_privilege('service_role', 'public.commercants', 'paiement_sur_place_max', 'SELECT')::text,
         'true'
  UNION ALL SELECT 5, 'aucun commerce plafonne (rien ne change a la migration)',
         (SELECT count(*) FROM public.commercants WHERE paiement_sur_place_max IS NOT NULL)::text,
         '0'
  UNION ALL SELECT 6, 'la vue publique ne l expose pas',
         (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'commercants_public' AND column_name = 'paiement_sur_place_max')::text,
         '0'
) t ORDER BY n;
