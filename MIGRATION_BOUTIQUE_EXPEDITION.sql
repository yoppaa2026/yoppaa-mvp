-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION BOUTIQUE EXPÉDITION (Module 2 étape 5) — 23/07/2026
-- 1) mode_retrait accepte 'expedition' (commande boutique expédiée)
-- 2) colonne de suivi manuel (n° de suivi saisi par le commerçant au dashboard)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commandes DROP CONSTRAINT IF EXISTS commandes_mode_retrait_check;
ALTER TABLE commandes ADD CONSTRAINT commandes_mode_retrait_check
  CHECK (mode_retrait IN ('retrait', 'livraison', 'expedition'));

ALTER TABLE commandes ADD COLUMN IF NOT EXISTS expedition_suivi text;
