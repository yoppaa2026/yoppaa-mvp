-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION PLAN 3 PALIERS — Refonte on/full → exister/communiquer/vendre
-- À passer dans Supabase SQL Editor APRÈS déploiement du code qui remplace les
-- défauts legacy 'on'/'full' par 'exister'/'vendre'.
--
-- Contexte : refonte modèle économique 15/06/2026 (mémoire
-- project_refonte_modele_on_full.md). MIGRATION_PLANS.sql (2026-06-02)
-- définissait CHECK (plan IN ('on', 'full', 'public')). Cette migration met
-- la contrainte à jour et migre les données.
--
-- Mapping :
--   'on'   → 'exister'      (palier gratuit)
--   'full' → 'vendre'       (palier transactionnel 49,90€/mois)
--   'public' → 'public'     (inchangé, flag PLAN_PUBLIC_ENABLED reste OFF)
--
-- Nouveau palier 'communiquer' (19,90€/mois) : uniquement via signup après
-- déploiement du code refonte. Aucune donnée existante à migrer.
--
-- Date : 2026-07-01
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Audit AVANT migration ───────────────────────────────────────────────
SELECT plan, COUNT(*) AS nb_commercants,
       COUNT(CASE WHEN statut_publication = 'publie' THEN 1 END) AS nb_publies
FROM commercants
GROUP BY plan
ORDER BY nb_commercants DESC;


-- ─── 2. Drop temporairement l'ancienne CHECK constraint ─────────────────────
-- Sinon les UPDATE ci-dessous échouent car les nouvelles valeurs ne sont pas
-- encore dans la contrainte.
BEGIN;

ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_plan_check;

COMMIT;


-- ─── 3. UPDATE commercants.plan : on→exister, full→vendre ───────────────────
BEGIN;

UPDATE commercants SET plan = 'exister'
  WHERE plan = 'on';

UPDATE commercants SET plan = 'vendre'
  WHERE plan = 'full';

-- Vérif post-update
SELECT plan, COUNT(*) AS nb FROM commercants GROUP BY plan ORDER BY plan;

COMMIT;


-- ─── 4. UPDATE onboarding_commercants.plan_choisi ───────────────────────────
BEGIN;

UPDATE onboarding_commercants SET plan_choisi = 'exister'
  WHERE plan_choisi = 'on';

UPDATE onboarding_commercants SET plan_choisi = 'vendre'
  WHERE plan_choisi = 'full';

SELECT plan_choisi, COUNT(*) AS nb FROM onboarding_commercants GROUP BY plan_choisi ORDER BY plan_choisi;

COMMIT;


-- ─── 5. Nouvelle CHECK constraint avec les 4 paliers 3-paliers + public ────
BEGIN;

ALTER TABLE commercants
  ADD CONSTRAINT commercants_plan_check
  CHECK (plan IN ('exister', 'communiquer', 'vendre', 'public'));

COMMIT;


-- ─── 6. Vérification finale ──────────────────────────────────────────────────
-- Doit retourner uniquement 'exister', 'vendre' (et éventuellement 'communiquer'
-- si des commerçants ont signé après déploiement, ou 'public' si des services
-- publics résiduels existent en base).
SELECT plan, COUNT(*) AS nb FROM commercants GROUP BY plan ORDER BY plan;

-- Confirmer la contrainte
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'commercants_plan_check';
