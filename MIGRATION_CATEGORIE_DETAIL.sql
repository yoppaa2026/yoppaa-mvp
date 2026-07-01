-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION CATEGORIE DETAIL — Ajout de 'detail' à la CHECK constraint
-- À passer dans Supabase SQL Editor immédiatement (blocage signup Détail).
--
-- Contexte : le code Yoppaa utilise 4 catégories (alimentaire, vitrine, detail,
-- publique) dans lib/plans.js, mais la CHECK constraint sur commercants.categorie
-- n'a jamais été mise à jour pour inclure 'detail'. Résultat : au signup catégorie
-- Détail, l'INSERT échoue avec :
--   new row for relation "commercants" violates check constraint
--   "commercants_categorie_check"
--
-- Note : la table onboarding_commercants n'a PAS de colonne 'categorie' (seul
-- plan_choisi est stocké côté onboarding). Rien à migrer côté onboarding.
--
-- Labels UI validés Alex 01/07/2026 :
--   • alimentaire → « Alimentaire »
--   • vitrine     → « Service »  (identifiant DB conservé pour compat code)
--   • detail      → « Détail »   (accent uniquement en UI)
--   • publique    → « Officiel » (flag OFF en V1)
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Diagnostic : voir la contrainte actuelle ────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'commercants_categorie_check';


-- ─── 2. Mise à jour commercants_categorie_check ─────────────────────────────
BEGIN;

ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_categorie_check;
ALTER TABLE commercants
  ADD CONSTRAINT commercants_categorie_check
  CHECK (categorie IN ('alimentaire', 'vitrine', 'detail', 'publique'));

COMMIT;


-- ─── 3. Vérification finale ─────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'commercants_categorie_check';

-- Doit retourner :
--   ((categorie = ANY (ARRAY['alimentaire'::text, 'vitrine'::text, 'detail'::text, 'publique'::text])))
