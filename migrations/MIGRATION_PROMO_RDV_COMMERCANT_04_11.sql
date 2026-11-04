-- LE PRIX BARRÉ D'UN RENDEZ-VOUS NE S'ÉCRIT QUE PAR LE SERVEUR (04/11).
--
-- 🔴 POURQUOI. Depuis le 28/10, un rendez-vous garde la trace de sa promo
-- (`prix_plein`, `promo_deal_id`) et l'email au client dit « Tu as économisé
-- X € ». Mais la fenêtre du commerçant écrit ses rendez-vous DEPUIS LE
-- NAVIGATEUR : rien n'empêchait d'y poser un faux « prix avant promo », et la
-- cliente aurait lu une économie inventée.
--
-- ✅ Décision d'Alex (03/11) : la promo d'un rendez-vous encodé par le commerce
-- est calculée PAR LE SERVEUR (`/api/rdv/prix-commercant`, clé de service) ;
-- le commerçant ne fait que la garder ou la retirer.
--
-- Deux règles, pour tout compte connecté qui n'est pas l'admin :
--   1) À LA CRÉATION, `prix_plein` et `promo_deal_id` restent vides
--      (nouveau déclencheur `trg_rdv_trace_promo_serveur`).
--   2) EN MODIFICATION, ils rejoignent les colonnes gelées de
--      `rdv_colonnes_reservees`, pour le commerçant ET pour la cliente.
-- Le serveur (clé de service, `auth.uid()` vide) n'est pas concerné : la
-- réservation en ligne et la nouvelle route continuent d'écrire.
--
-- ⚠️ La liste gelée est complétée EN PARTANT DE LA VERSION EN BASE (comme le
-- 18/10), jamais d'une copie du dépôt.
-- ⚠️ AUCUNE DONNÉE TOUCHÉE. À lancer AVANT le code (TEST, puis PROD) : le code
-- ne l'exige pas pour fonctionner, mais c'est elle qui ferme la porte.

BEGIN;

-- ─── 1) À LA CRÉATION ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rdv_trace_promo_serveur()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_yoppaa_admin() THEN RETURN NEW; END IF;
  IF NEW.prix_plein IS NOT NULL OR NEW.promo_deal_id IS NOT NULL THEN
    RAISE EXCEPTION 'La promo d''un rendez-vous se pose par le serveur, pas depuis le navigateur'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rdv_trace_promo_serveur ON public.rdv_reservations;
CREATE TRIGGER trg_rdv_trace_promo_serveur
  BEFORE INSERT ON public.rdv_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.rdv_trace_promo_serveur();

-- ─── 2) EN MODIFICATION : les deux colonnes rejoignent la liste gelée ────────
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure) INTO def;
  IF position('''promo_deal_id''' IN def) = 0 THEN
    IF position('''stripe_refund_id''' IN def) = 0 THEN
      RAISE EXCEPTION 'rdv_colonnes_reservees : ancre « stripe_refund_id » introuvable, rien modifié';
    END IF;
    -- L'ancre est dans les DEUX listes (commerçant et cliente) : les deux gèlent.
    def := replace(def, '''stripe_refund_id''', '''stripe_refund_id'', ''prix_plein'', ''promo_deal_id''');
    EXECUTE def;
  END IF;
END $$;

COMMIT;

-- ─── 3) CONTRÔLES : une ligne par contrôle, valeur et attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'P1. déclencheur à la création' AS controle,
    (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_rdv_trace_promo_serveur' AND NOT tgisinternal)::text AS valeur,
    '1' AS attendu
  UNION ALL
  SELECT 2, 'P2. promo_deal_id gelé en modification (2 listes)',
    ((length(pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure))
      - length(replace(pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure), '''promo_deal_id''', '')))
      / length('''promo_deal_id'''))::text,
    '2'
  UNION ALL
  SELECT 3, 'P3. prix_plein gelé en modification (2 listes)',
    ((length(pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure))
      - length(replace(pg_get_functiondef('public.rdv_colonnes_reservees()'::regprocedure), '''prix_plein''', '')))
      / length('''prix_plein'''))::text,
    '2'
  UNION ALL
  SELECT 4, 'P4. déclencheur des colonnes réservées toujours en place',
    (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_rdv_colonnes_reservees' AND NOT tgisinternal)::text,
    '1'
  UNION ALL
  SELECT 5, 'P5. aucun rendez-vous touché (promos déjà tracées, inchangées)',
    (SELECT count(*) FROM public.rdv_reservations WHERE prix_plein IS NOT NULL AND promo_deal_id IS NULL)::text,
    '0'
) t ORDER BY n;
