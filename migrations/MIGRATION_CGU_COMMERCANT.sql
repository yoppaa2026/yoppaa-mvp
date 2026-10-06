-- ════════════════════════════════════════════════════════════════════════════
-- Les CGU commerçant s'acceptent, et l'acceptation se PROUVE
-- Décision d'Alex, 06/10 (tableau) : « Case CGU avec preuve »
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Aucune case, aucune trace : la page légale disait « en créant un
-- compte, les commerçants acceptent sans réserve », sans rien pour le montrer.
-- Opposer des conditions (frais Stripe, rétrofacturations) suppose de prouver
-- QUI a accepté QUELLE version, et QUAND.
--
-- ⚠️ SEUL LE SERVEUR ÉCRIT L'ACCEPTATION, avec SON heure. La route
-- `/api/commercant/accepter-cgu` passe par la clé de service ; un déclencheur
-- refuse que le navigateur écrive ces colonnes lui-même (une date choisie par
-- le client ne prouverait rien).
--
-- ⚠️ ET CHAQUE ACCEPTATION EST GARDÉE (`cgu_acceptations`) : les colonnes de
-- `commercants` disent la DERNIÈRE version acceptée ; le journal garde
-- l'historique, qu'une nouvelle version n'efface pas.
--
-- Idempotent. À passer sur l'ESSAI puis la PROD, AVANT le code (le tableau de
-- bord lit `cgu_version`). Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS cgu_version text,
  ADD COLUMN IF NOT EXISTS cgu_acceptees_at timestamptz;

COMMENT ON COLUMN public.commercants.cgu_version IS
  'Derniere version des CGU commercant acceptee (lib/cgu.js). Ecrite par le serveur seul.';
COMMENT ON COLUMN public.commercants.cgu_acceptees_at IS
  'Instant (horloge du serveur) de la derniere acceptation des CGU commercant.';

-- Le commerçant LIT sa propre ligne (tableau de bord) ; il n'écrit pas ces
-- colonnes (déclencheur ci-dessous).
GRANT SELECT (cgu_version, cgu_acceptees_at) ON public.commercants TO authenticated;

CREATE TABLE IF NOT EXISTS public.cgu_acceptations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commercant_id uuid NOT NULL REFERENCES public.commercants(id) ON DELETE CASCADE,
  auth_user_id  uuid NOT NULL,
  version       text NOT NULL,
  acceptee_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cgu_acceptations_commercant ON public.cgu_acceptations (commercant_id, acceptee_at DESC);

-- Fermée à tous sauf au serveur (clé de service) : aucune règle d'accès.
ALTER TABLE public.cgu_acceptations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cgu_acceptations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cgu_acceptations TO service_role;

CREATE OR REPLACE FUNCTION public.commercants_cgu_par_serveur()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Clé de service (route serveur) : pas de JWT, donc pas d'auth.uid().
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.cgu_version IS NOT NULL OR NEW.cgu_acceptees_at IS NOT NULL THEN
      RAISE EXCEPTION 'L''acceptation des CGU est enregistree par le serveur'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.cgu_version IS DISTINCT FROM OLD.cgu_version
     OR NEW.cgu_acceptees_at IS DISTINCT FROM OLD.cgu_acceptees_at THEN
    RAISE EXCEPTION 'L''acceptation des CGU est enregistree par le serveur'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commercants_cgu_par_serveur() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commercants_cgu_par_serveur ON public.commercants;
CREATE TRIGGER trg_commercants_cgu_par_serveur
  BEFORE INSERT OR UPDATE OF cgu_version, cgu_acceptees_at ON public.commercants
  FOR EACH ROW EXECUTE FUNCTION public.commercants_cgu_par_serveur();

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne cgu_version' AS controle,
         coalesce((SELECT data_type FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'commercants'
                      AND column_name = 'cgu_version'), 'ABSENTE')::text AS valeur,
         'text' AS attendu
  UNION ALL SELECT 2, 'colonne cgu_acceptees_at',
         coalesce((SELECT data_type FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'commercants'
                      AND column_name = 'cgu_acceptees_at'), 'ABSENTE')::text,
         'timestamp with time zone'
  UNION ALL SELECT 3, 'authenticated lit cgu_version',
         has_column_privilege('authenticated', 'public.commercants', 'cgu_version', 'SELECT')::text,
         'true'
  UNION ALL SELECT 4, 'journal : RLS active',
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cgu_acceptations'::regclass)::text,
         'true'
  UNION ALL SELECT 5, 'journal : aucune regle d''acces (nom:permissive)',
         coalesce((SELECT string_agg(policyname || ':' || permissive, ', ') FROM pg_policies
                    WHERE schemaname = 'public' AND tablename = 'cgu_acceptations'), '(aucune)')::text,
         '(aucune)'
  UNION ALL SELECT 6, 'journal : ferme a anon et authenticated',
         (has_table_privilege('anon', 'public.cgu_acceptations', 'SELECT')
          OR has_table_privilege('authenticated', 'public.cgu_acceptations', 'SELECT')
          OR has_table_privilege('authenticated', 'public.cgu_acceptations', 'INSERT'))::text,
         'false'
  UNION ALL SELECT 7, 'declencheur present et actif',
         (SELECT count(*) FROM pg_trigger
           WHERE tgrelid = 'public.commercants'::regclass
             AND tgname = 'trg_commercants_cgu_par_serveur' AND tgenabled = 'O')::text,
         '1'
  UNION ALL SELECT 8, 'commercants ayant deja accepte (a lire)',
         (SELECT count(*) FROM public.commercants WHERE cgu_version IS NOT NULL)::text,
         '0'
) t ORDER BY n;
