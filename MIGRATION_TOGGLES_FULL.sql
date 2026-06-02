-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION TOGGLES FULL — Permet aux commerçants FULL de choisir d'activer ou
-- non certaines features (livraison, paiement cash sur place, fidélité).
-- À passer dans Supabase SQL Editor.
-- Date : 2026-06-02
--
-- Raison : un commerçant FULL alimentaire n'est pas forcé d'activer la livraison.
-- Idem, il peut accepter ou non le cash en plus du paiement en ligne. Et la
-- fidelite C&C reste optionnelle. Les pills client refletent l'etat effectif.
--
-- Pattern coherent avec rdv_actif (vitrines) qui existe deja.
-- ════════════════════════════════════════════════════════════════════════════


ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS livraison_actif         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepte_paiement_cash   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fidelite_actif          BOOLEAN NOT NULL DEFAULT FALSE;

-- Commentaires pour traçabilité
COMMENT ON COLUMN commercants.livraison_actif        IS 'Toggle FULL alim : le commerçant active ou non la livraison. Module complet (zone, frais, créneaux) à venir.';
COMMENT ON COLUMN commercants.accepte_paiement_cash  IS 'Toggle FULL : commerçant accepte le cash sur place en plus du paiement en ligne (Stripe).';
COMMENT ON COLUMN commercants.fidelite_actif         IS 'Toggle FULL alim : programme fidelite C&C activable. Vitrines utilisent rdv_fidelite_actif separe (legacy).';


-- ─── Vérif ───────────────────────────────────────────────────────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'commercants'
  AND column_name IN ('livraison_actif', 'accepte_paiement_cash', 'fidelite_actif')
ORDER BY column_name;
-- Output attendu : 3 lignes, type boolean, default false
