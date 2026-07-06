-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION CLIENTS CODE_POSTAL — ciblage zone (Good Morning Yoppers) DB-driven
--
-- Contexte : le push GMY (cron morning-yoppers) ciblait les Yoppers par le tag
-- OneSignal `code_postal`. Ce tag ne se pose pas quand OneSignal renvoie un 409
-- (même compte logué sur plusieurs appareils → external_id ambigu). On bascule
-- donc le ciblage de zone sur la DB, comme le favori : on stocke le code postal
-- du Yopper (déduit de sa commune géolocalisée) sur sa fiche client, et le cron
-- pousse par external_id aux clients de la zone.
--
-- Le code postal est renseigné progressivement par /api/yopper/sync-tags à chaque
-- passage du Yopper dans l'app (best-effort, non bloquant). Pas de nouvelle table
-- → pas de GRANT à ajouter.
--
-- Idempotent (IF NOT EXISTS). À passer dans Supabase SQL Editor.
-- Date : 2026-07-06
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS code_postal text;

-- Index pour le ciblage par zone (WHERE code_postal = ...).
CREATE INDEX IF NOT EXISTS idx_clients_code_postal ON clients (code_postal);
