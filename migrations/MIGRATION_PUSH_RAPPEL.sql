-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION PUSH RAPPEL — stockage de l'ID de notification OneSignal programmée
--
-- Contexte : les rappels avant retrait (C&C, 30 min avant le créneau) et avant
-- RDV / résa (1h avant) sont programmés via OneSignal `send_after` au moment de
-- la confirmation. Pour pouvoir ANNULER le rappel si la commande / le RDV est
-- annulé (sinon le Yopper reçoit « n'oublie pas ton retrait » sur une commande
-- annulée), on stocke l'ID de notification renvoyé par OneSignal.
--
-- Pas de nouvelle table (ALTER sur tables existantes) → pas de GRANT à ajouter,
-- les privilèges de colonnes suivent la table.
--
-- Idempotent (IF NOT EXISTS). À passer dans Supabase SQL Editor.
-- Date : 2026-07-05
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes
  ADD COLUMN IF NOT EXISTS rappel_push_id text;

ALTER TABLE rdv_reservations
  ADD COLUMN IF NOT EXISTS rappel_push_id text;
