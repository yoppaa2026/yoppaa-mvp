-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION RLS CLIENTS — fermeture fuite PII Yoppers (Sprint 3 #4b)
--
-- PROBLÈME (audit 06/07) : policies `Select client` + `public_select_clients`
-- (SELECT USING(true) {public}) → n'importe qui lisait email/téléphone/nom de
-- TOUS les Yoppers via la clé anon (dump PII bulk).
--
-- FIX : tous les accès navigateur à `clients` passent désormais par l'API serveur
-- /api/yopper/client (service_role). On retire les 2 policies SELECT ouvertes.
-- Restent : yopper_select_own_clients (auth_user_id = auth.uid(), pour le Yopper
-- connecté) + les policies admin. Les INSERT/UPDATE/DELETE ne sont pas touchés.
--
-- ⚠️ À LANCER SEULEMENT APRÈS :
--   1. déploiement du commit 7046ece (code qui lit via l'API), Vercel « Ready »
--   2. test OK : checkout invité + connecté, création de compte / magic link,
--      édition du profil, sélection de commune, Good Morning.
-- Tant que le code direct est live, ce drop casserait ces lectures.
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-07-06
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Select client" ON clients;
DROP POLICY IF EXISTS public_select_clients ON clients;

-- Vérif (optionnel) : il ne doit plus rester que les policies SELECT « own » + admin.
-- SELECT policyname, cmd, roles, qual FROM pg_policies
-- WHERE schemaname='public' AND tablename='clients' AND cmd IN ('SELECT','ALL');
