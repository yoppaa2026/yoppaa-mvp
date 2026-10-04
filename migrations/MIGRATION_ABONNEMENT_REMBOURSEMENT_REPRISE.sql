-- MIGRATION_ABONNEMENT_REMBOURSEMENT_REPRISE.sql  (04/10)
--
-- Deux points de l'audit des abonnements, décidés par Alex le 04/10 au soir :
--
-- 🔴 Abo-I1 · RENDRE L'ARGENT D'UN ABONNEMENT. Aucune route ne remboursait un
-- contrat : la commerçante passait par son tableau Stripe, Yoppaa n'en savait
-- rien, et l'export comptable comptait toujours la vente entière. Décisions :
-- montant libre plafonné au prix, part non utilisée proposée ; rembourser
-- RÉSILIE toujours ; payé au comptoir = remboursement NOTÉ (montant, moyen,
-- date) ; patron ou membre avec la case Argent ; email à la cliente ;
-- contrepassation à l'export.
--
--   rembourse_montant  ce qui est reparti, en euros (le CUMUL que Stripe
--                      connaît, comme `stripe_refund_amount` des rendez-vous)
--   rembourse_le       l'instant du remboursement : date de la contrepassation
--   rembourse_moyen    en_ligne (Stripe) | terminal | especes | virement
--   stripe_refund_id   la trace du remboursement Stripe
--
-- 🔴 Abo-I3 · LA REPRISE AU COMPTOIR. Une cliente qui a déjà suivi 12 séances
-- sur un carnet papier ne pouvait pas être inscrite telle quelle : son solde
-- repartait du début. `seances_deja_faites` compte ce qui a été suivi AVANT
-- Yoppaa, et le solde le déduit. Défaut 0 : aucun contrat existant ne bouge.
--
-- ⚠️ CE QUE LE NAVIGATEUR NE PEUT PAS ÉCRIRE. La policy `abonnements_own` laisse
-- le patron écrire TOUTE sa ligne depuis le navigateur (l'inscription et
-- l'encaissement au comptoir s'y font). Sans garde, un remboursement pourrait
-- s'y inscrire sans être passé par la route qui le vérifie, et l'export
-- comptable le croirait. Même mécanisme que `rdv_colonnes_reservees` (21/08) :
-- le serveur (clé de service, `auth.uid()` vide) et l'admin passent, le
-- navigateur ne touche pas aux colonnes d'argent écrites par Stripe ou par la
-- route.
--
-- GRANT : aucune table créée. Les colonnes ajoutées héritent des droits de
-- `abonnements` (GRANT de MIGRATION_ABONNEMENTS.sql). La fonction rend un
-- `trigger` : elle ne s'appelle pas par l'API, elle ne reçoit donc aucun droit,
-- comme `rdv_colonnes_reservees`.

ALTER TABLE public.abonnements
  ADD COLUMN IF NOT EXISTS rembourse_montant   numeric(10,2),
  ADD COLUMN IF NOT EXISTS rembourse_le        timestamptz,
  ADD COLUMN IF NOT EXISTS rembourse_moyen     text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id    text,
  ADD COLUMN IF NOT EXISTS seances_deja_faites int NOT NULL DEFAULT 0;

ALTER TABLE public.abonnements DROP CONSTRAINT IF EXISTS abonnements_rembourse_moyen_check;
ALTER TABLE public.abonnements ADD CONSTRAINT abonnements_rembourse_moyen_check
  CHECK (rembourse_moyen IS NULL OR rembourse_moyen IN ('en_ligne', 'terminal', 'especes', 'virement'));

ALTER TABLE public.abonnements DROP CONSTRAINT IF EXISTS abonnements_rembourse_montant_check;
ALTER TABLE public.abonnements ADD CONSTRAINT abonnements_rembourse_montant_check
  CHECK (rembourse_montant IS NULL OR rembourse_montant > 0);

ALTER TABLE public.abonnements DROP CONSTRAINT IF EXISTS abonnements_seances_deja_faites_check;
ALTER TABLE public.abonnements ADD CONSTRAINT abonnements_seances_deja_faites_check
  CHECK (seances_deja_faites >= 0);

CREATE OR REPLACE FUNCTION public.abonnements_colonnes_reservees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avant  jsonb;
  apres  jsonb := to_jsonb(NEW);
  col    text;
  gelees text[] := ARRAY[
    'rembourse_montant', 'rembourse_le', 'rembourse_moyen', 'stripe_refund_id',
    'stripe_payment_intent_id', 'stripe_frais', 'stripe_net'
  ];
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_yoppaa_admin() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    FOREACH col IN ARRAY gelees LOOP
      IF jsonb_exists(apres, col) AND (apres -> col) <> 'null'::jsonb THEN
        RAISE EXCEPTION 'Cette colonne d''un abonnement ne s''écrit pas depuis le navigateur (« % »)', col
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;

  avant := to_jsonb(OLD);
  FOREACH col IN ARRAY gelees LOOP
    IF jsonb_exists(avant, col)
       AND (apres -> col) IS DISTINCT FROM (avant -> col) THEN
      RAISE EXCEPTION 'Cette colonne d''un abonnement ne se modifie pas depuis le navigateur (« % »)', col
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_abonnements_colonnes_reservees ON public.abonnements;
CREATE TRIGGER trg_abonnements_colonnes_reservees
  BEFORE INSERT OR UPDATE ON public.abonnements
  FOR EACH ROW
  EXECUTE FUNCTION public.abonnements_colonnes_reservees();

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT * FROM (
  SELECT 1 AS n, 'colonnes ajoutees' AS controle,
         (SELECT string_agg(column_name || ':' || data_type, ', ' ORDER BY column_name)
            FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'abonnements'
             AND column_name IN ('rembourse_montant', 'rembourse_le', 'rembourse_moyen', 'stripe_refund_id', 'seances_deja_faites'))::text AS valeur,
         'rembourse_le:timestamp with time zone, rembourse_montant:numeric, rembourse_moyen:text, seances_deja_faites:integer, stripe_refund_id:text' AS attendu
  UNION ALL SELECT 2, 'seances_deja_faites : defaut 0, jamais vide',
         (SELECT column_default || ' / ' || is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'abonnements' AND column_name = 'seances_deja_faites')::text,
         '0 / NO'
  UNION ALL SELECT 3, 'contrats existants : aucun rembourse, aucune seance deja faite',
         (SELECT count(*) FILTER (WHERE rembourse_montant IS NOT NULL OR seances_deja_faites <> 0) || ' sur ' || count(*) FROM public.abonnements)::text,
         '0 sur (le nombre de contrats)'
  UNION ALL SELECT 4, 'contraintes posees',
         (SELECT count(*) FROM pg_constraint
           WHERE conrelid = 'public.abonnements'::regclass
             AND conname IN ('abonnements_rembourse_moyen_check', 'abonnements_rembourse_montant_check', 'abonnements_seances_deja_faites_check'))::text,
         '3'
  UNION ALL SELECT 5, 'declencheur des colonnes reservees',
         (SELECT string_agg(tgname || (CASE WHEN tgenabled = 'O' THEN ' actif' ELSE ' INACTIF' END), ', ')
            FROM pg_trigger WHERE tgrelid = 'public.abonnements'::regclass AND tgname = 'trg_abonnements_colonnes_reservees')::text,
         'trg_abonnements_colonnes_reservees actif'
  UNION ALL SELECT 6, 'declencheur sur INSERT et UPDATE',
         (SELECT CASE WHEN (tgtype & 4) <> 0 AND (tgtype & 16) <> 0 AND (tgtype & 2) <> 0 THEN 'avant insert et update' ELSE 'AUTRE' END
            FROM pg_trigger WHERE tgrelid = 'public.abonnements'::regclass AND tgname = 'trg_abonnements_colonnes_reservees')::text,
         'avant insert et update'
  UNION ALL SELECT 7, 'la fonction voit le serveur et l admin',
         (SELECT CASE WHEN prosrc LIKE '%auth.uid() IS NULL%' AND prosrc LIKE '%is_yoppaa_admin()%' AND prosecdef THEN 'oui' ELSE 'NON' END
            FROM pg_proc WHERE proname = 'abonnements_colonnes_reservees')::text,
         'oui'
  UNION ALL SELECT 8, 'policies de abonnements (toujours permissive)',
         (SELECT string_agg(policyname || ':' || permissive, ', ' ORDER BY policyname) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'abonnements')::text,
         'abonnements_own:PERMISSIVE'
) t ORDER BY n;
