-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION Ch2+ — Nom de commerce sur la préinscription
-- Capture l'enseigne citée par l'inscrit (requis commerçant, optionnel curieux).
-- Distinct de ref_commercant (slug d'attribution via ?ref) : ici c'est du texte
-- libre saisi par la personne (son enseigne, ou un commerce qu'elle réclame).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE pre_inscriptions
  ADD COLUMN IF NOT EXISTS commercant_nom TEXT;
