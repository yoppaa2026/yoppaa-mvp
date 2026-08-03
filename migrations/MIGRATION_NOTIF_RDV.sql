-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION NOTIF RDV COMMERCANT — choix du mode de notification email pour les RDV
-- À passer dans Supabase SQL Editor.
-- Date : 2026-06-07
--
-- Le commercant choisit comment etre notifie des nouveaux RDV :
--   • 'chaque'     : email a chaque nouvelle resa (instantane)
--   • 'recap_jour' : email recap quotidien a 8h avec tous les RDV du jour (default)
--   • 'aucun'      : pas d'email (le dashboard suffit)
--
-- Toggle dans dashboard Profil. La logique d'envoi est cote webhook Stripe
-- (pour 'chaque') et cron quotidien (pour 'recap_jour').
-- ════════════════════════════════════════════════════════════════════════════


ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS notif_rdv_mode TEXT NOT NULL DEFAULT 'recap_jour'
    CHECK (notif_rdv_mode IN ('chaque', 'recap_jour', 'aucun'));

COMMENT ON COLUMN commercants.notif_rdv_mode IS
  'Mode notification email RDV : chaque (instant) / recap_jour (cron 8h) / aucun (dashboard only).';


-- ─── Vérif ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'commercants' AND column_name = 'notif_rdv_mode';
-- Output attendu : 1 ligne, text, 'recap_jour'::text, NO
