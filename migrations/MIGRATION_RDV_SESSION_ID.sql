-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION RDV stripe_checkout_session_id
-- À passer dans Supabase SQL Editor.
-- Date : 2026-06-07
--
-- Raison : pour retrouver le RDV au retour Stripe (success_url), on a besoin
-- du session_id de la Checkout Session. Le webhook le stocke directement
-- pour eviter d'avoir a interroger Stripe SDK (qui retourne "No such session"
-- de maniere non-reproductible en mode test).
-- ════════════════════════════════════════════════════════════════════════════


ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_rdv_stripe_session
  ON rdv_reservations(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;


-- ─── Vérif ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'rdv_reservations' AND column_name = 'stripe_checkout_session_id';
