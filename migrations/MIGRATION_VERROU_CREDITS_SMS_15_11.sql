-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_VERROU_CREDITS_SMS_15_11.sql
-- À coller UNE fois : TEST d'abord, puis PROD. AVANT le code.
-- Une seule transaction, idempotente (la recoller ne change rien).
--
-- 🔴 LE DÉFAUT (audit du 15/11) : `fidelite_sms_credits` n'était PAS dans le
-- verrou des colonnes réservées. Un commerçant connecté pouvait écrire son
-- propre solde depuis la console du navigateur (des milliers de SMS que Brevo
-- facture à Yoppaa), et l'écran redonnait 25 SMS à chaque réactivation de la
-- fidélité avec un solde à zéro, sans fin.
--
-- CE QUE FAIT CETTE MIGRATION :
--   1. une colonne `fidelite_sms_offerts_at` : la date où les 25 SMS de
--      bienvenue ont été donnés. Remplie d'office pour tout commerce qui a
--      déjà activé sa fidélité ou qui a déjà des crédits : il les a reçus.
--   2. le verrou : le solde et cette date ne s'écrivent plus que par le
--      serveur (clé de service) ou un admin Yoppaa. Le déclencheur est patché
--      EN PARTANT DE SA VERSION EN BASE, pas d'une copie du dépôt.
--   3. une fonction `offrir_sms_bienvenue` : donne les 25 SMS UNE fois, de
--      façon atomique (deux clics simultanés ne donnent pas 50). Réservée au
--      serveur.
--
-- Les envois de SMS, les packs achetés et le crédit rendu après un échec
-- Brevo passent DÉJÀ par la clé de service : ils ne sont pas touchés.
--
-- RETOUR ARRIÈRE : voir le bloc en fin de fichier (commenté).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) La date du cadeau de bienvenue
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS fidelite_sms_offerts_at timestamptz;

-- Qui a déjà reçu ses 25 SMS : tout commerce dont la fidélité a été activée,
-- ou qui a un solde, ou qui a déjà des cartes. Prudent dans le bon sens : au
-- pire, un commerce qui ne les avait pas eus ne les recevra pas (Alex peut les
-- lui donner depuis l'admin), jamais l'inverse.
UPDATE public.commercants c
   SET fidelite_sms_offerts_at = now()
 WHERE c.fidelite_sms_offerts_at IS NULL
   AND (   c.fidelite_actif = true
        OR coalesce(c.fidelite_sms_credits, 0) > 0
        OR EXISTS (SELECT 1 FROM public.fidelite_cartes f WHERE f.commercant_id = c.id));

-- 2) Le verrou, patché depuis la version EN BASE
DO $$
DECLARE
  def    text;
  ancre  text := 'IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt';
  bloc   text := $blk$-- 🔴 LES SMS SE PAIENT : le solde et le cadeau de bienvenue ne
  -- s'écrivent que par le serveur (packs achetés, envois, cadeau unique).
  IF NEW.fidelite_sms_credits IS DISTINCT FROM OLD.fidelite_sms_credits
     OR NEW.fidelite_sms_offerts_at IS DISTINCT FROM OLD.fidelite_sms_offerts_at THEN
    RAISE EXCEPTION 'Le solde de SMS se recharge par un pack, depuis le tableau de bord'
      USING ERRCODE = '42501';
  END IF;

  $blk$;
BEGIN
  SELECT pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure) INTO def;
  IF position('fidelite_sms_credits' IN def) = 0 THEN
    IF position(ancre IN def) = 0 THEN
      RAISE EXCEPTION 'commercants_colonnes_reservees : ancre « billing_exempt » introuvable, rien modifié';
    END IF;
    def := replace(def, ancre, bloc || ancre);
    EXECUTE def;
  END IF;
END $$;

-- 3) Le cadeau de bienvenue, une seule fois, par le serveur seulement
CREATE OR REPLACE FUNCTION public.offrir_sms_bienvenue(p_commercant_id uuid, p_nb int DEFAULT 25)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restant int;
BEGIN
  UPDATE commercants
     SET fidelite_sms_credits = fidelite_sms_credits + GREATEST(0, p_nb),
         fidelite_sms_offerts_at = now()
   WHERE id = p_commercant_id
     AND fidelite_sms_offerts_at IS NULL
  RETURNING fidelite_sms_credits INTO restant;
  IF NOT FOUND THEN
    RETURN -1;   -- déjà offerts (ou commerce inconnu) : rien n'est donné
  END IF;
  RETURN restant;
END;
$$;

REVOKE ALL ON FUNCTION public.offrir_sms_bienvenue(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offrir_sms_bienvenue(uuid, int) TO service_role;

COMMIT;

-- ─── CONTRÔLES (un seul résultat : valeur ET attendu) ─────────────────────
SELECT 1 AS n, 'colonne fidelite_sms_offerts_at' AS controle,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema='public' AND table_name='commercants' AND column_name='fidelite_sms_offerts_at')::text AS valeur,
       '1' AS attendu
UNION ALL SELECT 2, 'le verrou ferme le solde de SMS',
       (position('fidelite_sms_credits' IN pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure)) > 0)::text, 'true'
UNION ALL SELECT 3, 'le verrou ferme la date du cadeau',
       (position('fidelite_sms_offerts_at' IN pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure)) > 0)::text, 'true'
UNION ALL SELECT 4, 'le verrou garde la facturation (rien perdu)',
       (position('billing_exempt' IN pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure)) > 0)::text, 'true'
UNION ALL SELECT 5, 'déclencheur des colonnes réservées en place',
       (SELECT count(*) FROM pg_trigger WHERE tgname='trg_commercants_colonnes_reservees' AND NOT tgisinternal)::text, '1'
UNION ALL SELECT 6, 'fonction offrir_sms_bienvenue',
       (SELECT count(*) FROM pg_proc WHERE proname='offrir_sms_bienvenue')::text, '1'
UNION ALL SELECT 7, 'anon peut l''appeler',
       has_function_privilege('anon', 'public.offrir_sms_bienvenue(uuid,int)', 'EXECUTE')::text, 'false'
UNION ALL SELECT 8, 'authenticated peut l''appeler',
       has_function_privilege('authenticated', 'public.offrir_sms_bienvenue(uuid,int)', 'EXECUTE')::text, 'false'
UNION ALL SELECT 9, 'service_role peut l''appeler',
       has_function_privilege('service_role', 'public.offrir_sms_bienvenue(uuid,int)', 'EXECUTE')::text, 'true'
UNION ALL SELECT 10, 'fidélité activée sans date de cadeau',
       (SELECT count(*) FROM commercants WHERE fidelite_actif = true AND fidelite_sms_offerts_at IS NULL)::text, '0'
UNION ALL SELECT 11, 'commerces marqués « 25 SMS déjà reçus » (pour information)',
       (SELECT count(*) FROM commercants WHERE fidelite_sms_offerts_at IS NOT NULL)::text, 'pour information'
UNION ALL SELECT 12, 'commerces qui recevront les 25 SMS à l''activation (pour information)',
       (SELECT count(*) FROM commercants WHERE fidelite_sms_offerts_at IS NULL)::text, 'pour information'
ORDER BY n;

-- ─── RETOUR ARRIÈRE (ne pas lancer sauf besoin) ───────────────────────────
-- BEGIN;
-- DO $$
-- DECLARE def text; debut int; fin int;
-- BEGIN
--   SELECT pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure) INTO def;
--   debut := position('-- 🔴 LES SMS SE PAIENT' IN def);
--   fin   := position('IF NEW.billing_exempt IS DISTINCT FROM OLD.billing_exempt' IN def);
--   IF debut > 0 AND fin > debut THEN
--     def := substr(def, 1, debut - 1) || substr(def, fin);
--     EXECUTE def;
--   END IF;
-- END $$;
-- DROP FUNCTION IF EXISTS public.offrir_sms_bienvenue(uuid, int);
-- ALTER TABLE public.commercants DROP COLUMN IF EXISTS fidelite_sms_offerts_at;
-- COMMIT;
