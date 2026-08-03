-- ============================================================
-- MIGRATION_FIDELITE_SMS.sql
-- B.6 Fidélité étape 6 : envoi des SMS (Brevo) et décompte des crédits.
--
-- Le décompte doit être ATOMIQUE : deux SMS partis en même temps ne
-- doivent jamais faire passer le solde sous zéro (un SMS envoyé et non
-- décompté, c'est de l'argent perdu par Yoppaa). D'où une RPC qui
-- décrémente et renvoie le solde dans la même instruction.
-- ============================================================

-- 1. Consomme UN crédit SMS. Renvoie le solde restant, ou -1 si le
--    commerçant n'a plus de crédit (l'appelant n'envoie alors rien).
CREATE OR REPLACE FUNCTION consommer_sms_credit(p_commercant_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restant int;
BEGIN
  UPDATE commercants
     SET fidelite_sms_credits = fidelite_sms_credits - 1
   WHERE id = p_commercant_id
     AND fidelite_sms_credits > 0
  RETURNING fidelite_sms_credits INTO restant;

  IF NOT FOUND THEN
    RETURN -1;   -- plus de crédit : aucun SMS ne part
  END IF;
  RETURN restant;
END;
$$;

-- 2. Rend un crédit si l'envoi Brevo a échoué (on ne facture pas un SMS
--    qui n'est jamais parti).
CREATE OR REPLACE FUNCTION rendre_sms_credit(p_commercant_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE commercants
     SET fidelite_sms_credits = fidelite_sms_credits + 1
   WHERE id = p_commercant_id;
$$;

-- 3. Crédite un pack acheté (webhook Stripe). Idempotence assurée côté
--    webhook par la table des achats ci-dessous.
CREATE OR REPLACE FUNCTION crediter_sms_pack(p_commercant_id uuid, p_nb int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restant int;
BEGIN
  UPDATE commercants
     SET fidelite_sms_credits = fidelite_sms_credits + GREATEST(0, p_nb)
   WHERE id = p_commercant_id
  RETURNING fidelite_sms_credits INTO restant;
  RETURN COALESCE(restant, 0);
END;
$$;

-- 4. Achats de packs SMS : trace comptable + idempotence du webhook.
CREATE TABLE IF NOT EXISTS fidelite_sms_achats (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commercant_id     uuid NOT NULL REFERENCES commercants(id) ON DELETE CASCADE,
  pack              text NOT NULL CHECK (pack IN ('100', '500')),
  nb_sms            int NOT NULL CHECK (nb_sms > 0),
  montant_htva      numeric(8,2) NOT NULL,
  statut            text NOT NULL DEFAULT 'paiement_en_attente'
    CHECK (statut IN ('paiement_en_attente', 'paye', 'annule')),
  stripe_session_id text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_achats_commercant ON fidelite_sms_achats (commercant_id, created_at);

-- 5. RLS : le commerçant lit SES achats (facturation), les écritures
--    passent par les API serveur (service_role).
ALTER TABLE fidelite_sms_achats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_achats_own ON fidelite_sms_achats;
CREATE POLICY sms_achats_own ON fidelite_sms_achats
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM commercants c
            WHERE c.id = fidelite_sms_achats.commercant_id AND c.auth_user_id = auth.uid())
  );

-- 6. GRANT explicites (règle projet)
GRANT SELECT ON fidelite_sms_achats TO authenticated;
GRANT ALL    ON fidelite_sms_achats TO service_role;

REVOKE ALL ON FUNCTION consommer_sms_credit(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rendre_sms_credit(uuid)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION crediter_sms_pack(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION consommer_sms_credit(uuid)   TO service_role;
GRANT EXECUTE ON FUNCTION rendre_sms_credit(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION crediter_sms_pack(uuid, int) TO service_role;
