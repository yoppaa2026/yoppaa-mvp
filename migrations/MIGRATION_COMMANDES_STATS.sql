-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION COMMANDES — étape 1/3 : vue stats + policies commerçant (ADDITIF)
--
-- CONTEXTE (audit RLS 06/07, Sprint 3 #4c) : la policy `Select commande`
-- USING(true) {public} laisse N'IMPORTE QUI lire TOUTES les commandes via la clé
-- anon : email/nom/téléphone/adresse client, total, etc. (PII + business).
--
-- STRATÉGIE (3 étapes, comme clients/commercants) :
--   1) [CE FICHIER, ADDITIF] créer la vue `commandes_stats` (colonnes NON-PII,
--      pour les agrégats publics : dispo créneaux, capacité, stock, n° position)
--      + policies RLS propres pour le commerçant authentifié (dashboard) et
--      l'admin. Tout est additif : rien ne casse tant que USING(true) vit encore.
--   2) déployer le code (fiches → `commandes_stats`, « mes commandes » → API
--      serveur /api/yopper/commandes).
--   3) [MIGRATION_COMMANDES_DROP.sql] retirer la policy `Select commande`
--      USING(true) une fois les tests OK.
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-07-13
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Vue publique agrégats : colonnes NON-PII uniquement ─────────────────
-- Sert UNIQUEMENT à calculer des compteurs (places dispo par créneau, capacité,
-- position/numéro du jour). AUCUNE colonne identifiante ou financière :
--   exclues → client_email, client_nom, client_telephone, adresse_livraison,
--   total, notes, stripe_*, rappel_push_id, etc.
-- Incluses → le strict nécessaire aux agrégats + embeds PostgREST (id pour
-- commande_articles, creneau_id / creneau_livraison_id pour les créneaux).
CREATE OR REPLACE VIEW commandes_stats AS
SELECT
  id,
  commercant_id,
  creneau_id,
  creneau_livraison_id,
  statut,
  mode_retrait,
  date_commande,
  numero_commande,
  created_at
FROM commandes;

GRANT SELECT ON commandes_stats TO anon, authenticated;

-- ─── 2. Policies RLS commerçant (dashboard, authentifié Supabase Auth) ──────
-- Le commerçant lit/écrit UNIQUEMENT les commandes de SES commerces
-- (commercants.auth_user_id = auth.uid()). Additif : coexiste avec USING(true)
-- jusqu'au drop (étape 3), donc aucune régression sur le dashboard.

DROP POLICY IF EXISTS commande_select_own_commercant ON commandes;
CREATE POLICY commande_select_own_commercant ON commandes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commandes.commercant_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- UPDATE : le dashboard change le statut (en préparation / prête / récupérée…).
DROP POLICY IF EXISTS commande_update_own_commercant ON commandes;
CREATE POLICY commande_update_own_commercant ON commandes
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commandes.commercant_id
        AND c.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM commercants c
      WHERE c.id = commandes.commercant_id
        AND c.auth_user_id = auth.uid()
    )
  );

-- NB : l'admin Yoppaa (impersonation dashboard) conserve son accès via la policy
-- existante `Admin Yoppaa FULL` (FOR ALL, is_yoppaa_admin()) — vérifié au
-- diagnostic 13/07. Rien à ajouter côté admin.

-- Vérif : lister les policies après passage.
-- SELECT policyname, cmd, roles, qual, with_check FROM pg_policies
-- WHERE schemaname='public' AND tablename='commandes' ORDER BY cmd, policyname;
