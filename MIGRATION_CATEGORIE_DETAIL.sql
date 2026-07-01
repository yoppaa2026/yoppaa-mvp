-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION CATEGORIE DETAIL — Ajout de 'detail' aux CHECK constraints
-- À passer dans Supabase SQL Editor immédiatement (blocage signup Détail).
--
-- Contexte : le code Yoppaa utilise 4 catégories (alimentaire, vitrine, detail,
-- publique) dans lib/plans.js, mais les CHECK constraints en base n'ont
-- probablement jamais été mises à jour pour inclure 'detail'. Résultat : au
-- signup catégorie Détail, l'INSERT échoue avec :
--   new row for relation "commercants" violates check constraint
--   "commercants_categorie_check"
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Diagnostic : voir la contrainte actuelle ────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('commercants_categorie_check', 'onboarding_commercants_categorie_check');


-- ─── 2. Mise à jour commercants_categorie_check ─────────────────────────────
BEGIN;

ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_categorie_check;
ALTER TABLE commercants
  ADD CONSTRAINT commercants_categorie_check
  CHECK (categorie IN ('alimentaire', 'vitrine', 'detail', 'publique'));

COMMIT;


-- ─── 3. Mise à jour onboarding_commercants_categorie_check si présente ──────
-- La table onboarding_commercants a la même structure de catégorie et peut
-- avoir la même contrainte. Si elle existe, on la met à jour aussi.
BEGIN;

ALTER TABLE onboarding_commercants DROP CONSTRAINT IF EXISTS onboarding_commercants_categorie_check;
ALTER TABLE onboarding_commercants
  ADD CONSTRAINT onboarding_commercants_categorie_check
  CHECK (categorie IN ('alimentaire', 'vitrine', 'detail', 'publique'));

COMMIT;


-- ─── 4. Vérification finale ──────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname IN ('commercants_categorie_check', 'onboarding_commercants_categorie_check');

-- Doit retourner 2 lignes avec la nouvelle définition
--   ((categorie = ANY (ARRAY['alimentaire'::text, 'vitrine'::text, 'detail'::text, 'publique'::text])))
