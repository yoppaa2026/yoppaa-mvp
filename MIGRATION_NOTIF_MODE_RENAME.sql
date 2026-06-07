-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION RENAME notif_rdv_mode → notif_mode
-- À passer dans Supabase SQL Editor APRÈS que Vercel ait redéployé le commit
-- qui utilise notif_mode (sinon crash sauvegarde profil pendant ~1 min).
--
-- Raison : la colonne devient générique pour gérer les notifs RDV (vitrines)
-- ET les notifs commandes C&C (alimentaire). Un commerçant n'est jamais les 2,
-- donc un seul toggle suffit (label adapté selon catégorie côté UI).
--
-- Date : 2026-06-07
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Renomme la colonne (data conservée automatiquement)
ALTER TABLE commercants RENAME COLUMN notif_rdv_mode TO notif_mode;

-- Update du commentaire pour refléter la nouvelle sémantique
COMMENT ON COLUMN commercants.notif_mode IS
  'Mode notification email (RDV vitrine OU commandes C&C alim) : chaque (instant) / recap_jour (cron 8h) / aucun (dashboard only).';

COMMIT;


-- ─── Vérif ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'commercants' AND column_name IN ('notif_mode', 'notif_rdv_mode')
ORDER BY column_name;
-- Output attendu : 1 ligne, notif_mode, text, 'recap_jour'::text
