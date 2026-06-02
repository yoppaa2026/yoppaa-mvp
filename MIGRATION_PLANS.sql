-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION PLANS — Refactor 7 plans → 3 plans (ON / FULL / PUBLIC)
-- À passer dans Supabase SQL Editor APRÈS que Vercel ait déployé le nouveau code.
-- Date : 2026-06-02
--
-- Mapping :
--   'live'    → 'on'    (descend en gratuit, perte de palier théorique)
--   'boost'   → 'full'  (alimentaire)
--   'max'     → 'full'  (alimentaire, livraison maintenant incluse)
--   'pro'     → 'full'  (vitrine)
--   'proplus' → 'full'  (vitrine, multi-praticiens maintenant inclus)
--   'on'      → 'on'    (inchangé)
--
-- Success packs : on retire 'essentiel' (n'existe plus) → mapping vers 'starter'.
-- (Le pack 'premium' reste 'premium', juste contenu/prix mis à jour côté code.)
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. Audit AVANT migration ────────────────────────────────────────────────
-- À lancer en premier pour vérifier les commerçants affectés
SELECT plan, COUNT(*) AS nb_commercants,
       COUNT(CASE WHEN statut_publication = 'publie' THEN 1 END) AS nb_publies
FROM commercants
GROUP BY plan
ORDER BY nb_commercants DESC;


-- ─── 2. UPDATE commercants.plan ─────────────────────────────────────────────
BEGIN;

UPDATE commercants SET plan = 'on'
  WHERE plan = 'live';

UPDATE commercants SET plan = 'full'
  WHERE plan IN ('boost', 'max', 'pro', 'proplus');

-- Verif post-migration
SELECT plan, COUNT(*) AS nb FROM commercants GROUP BY plan ORDER BY plan;

COMMIT;


-- ─── 3. UPDATE onboarding_commercants.plan_choisi ───────────────────────────
BEGIN;

UPDATE onboarding_commercants SET plan_choisi = 'on'
  WHERE plan_choisi = 'live';

UPDATE onboarding_commercants SET plan_choisi = 'full'
  WHERE plan_choisi IN ('boost', 'max', 'pro', 'proplus');

COMMIT;


-- ─── 4. UPDATE success_packs (table) + onboarding_commercants.success_pack_choisi ──
-- Le pack 'essentiel' n'existe plus, on le redirige vers 'starter' (le moins cher).
-- Si tu préfères annuler le pack à la place (refund éventuel), commente les 2 lignes
-- ci-dessous et remplace par UPDATE ... SET success_pack_choisi = NULL.
BEGIN;

UPDATE onboarding_commercants SET success_pack_choisi = 'starter'
  WHERE success_pack_choisi = 'essentiel';

-- Si la table success_packs existe et contient des lignes 'essentiel' en attente :
UPDATE success_packs SET type = 'starter', montant_ht = 49
  WHERE type = 'essentiel' AND statut = 'en_attente';

COMMIT;


-- ─── 5. DROP COLUMNS url_reservation / label_reservation ────────────────────
-- Le module RDV natif Yoppaa remplace ces colonnes.
-- AVERTISSEMENT : irréversible. Sauve les données AVANT si tu veux les conserver :
--   SELECT id, nom, slug, url_reservation, label_reservation
--   FROM commercants
--   WHERE url_reservation IS NOT NULL OR label_reservation IS NOT NULL;
BEGIN;

ALTER TABLE commercants DROP COLUMN IF EXISTS url_reservation;
ALTER TABLE commercants DROP COLUMN IF EXISTS label_reservation;

COMMIT;


-- ─── 6. CHECK constraint (sécurité) ─────────────────────────────────────────
-- Empêche tout futur insert/update avec une valeur de plan invalide.
-- Si une CHECK existe déjà, le DROP la retire pour redéfinir avec les nouveaux noms.
BEGIN;

ALTER TABLE commercants DROP CONSTRAINT IF EXISTS commercants_plan_check;
ALTER TABLE commercants
  ADD CONSTRAINT commercants_plan_check
  CHECK (plan IN ('on', 'full', 'public'));

COMMIT;


-- ─── 7. Vérification finale ──────────────────────────────────────────────────
-- Doit retourner uniquement 'on', 'full' (et 'public' si tu as des services publics)
SELECT plan, COUNT(*) AS nb FROM commercants GROUP BY plan ORDER BY plan;

-- Vérifie qu'aucune colonne url_reservation/label_reservation ne reste
SELECT column_name FROM information_schema.columns
WHERE table_name = 'commercants' AND column_name IN ('url_reservation', 'label_reservation');
-- Output attendu : 0 lignes
