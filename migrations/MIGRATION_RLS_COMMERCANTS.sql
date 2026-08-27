-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION RLS COMMERCANTS — fermeture fuite lecture publique (Sprint 3 #4)
--
-- PROBLÈME (audit 06/07) : les policies "Lecture publique" (public, USING true)
-- et "Lecture publique commercants" (anon+authenticated, USING true) laissaient
-- N'IMPORTE QUI lire TOUTES les colonnes de TOUS les commerçants (publiés ou non)
-- via la clé anon publique : email, bce, representant_legal_*, stripe_*, données
-- d'abonnement, et surtout kyb_id_recto_url / kyb_id_verso_url (URLs de scans de
-- pièces d'identité). Fuite aussi commerçant-à-commerçant.
--
-- FIX :
--   1. Vue publique `commercants_public` = colonnes SÛRES uniquement, commerçants
--      PUBLIÉS uniquement. Les fiches côté Yopper (anon) lisent cette vue.
--   2. Table de base `commercants` : on retire les policies SELECT ouvertes.
--      - anon : plus aucun accès direct (passe par la vue).
--      - authenticated (commerçant) : lit UNIQUEMENT SA propre fiche (dashboard).
--      - admin : inchangé (policies is_admin / Admin Yoppaa conservées).
--
-- Décision Alex 06/07 : téléphone reste public ; email + stripe_account_id (et
-- toutes les colonnes internes/KYB/abonnement) deviennent privés.
--
-- La vue est SECURITY DEFINER (défaut PG15, owner postgres) : elle contourne le
-- RLS de la table de base et applique sa propre projection colonnes + filtre
-- publié. C'est voulu (projection publique restreinte).
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-07-06
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Vue publique : colonnes sûres, commerçants publiés ──────────────────
CREATE OR REPLACE VIEW commercants_public AS
SELECT
  id, nom, type, telephone, created_at, adresse, latitude, longitude,
  horaires, description, logo_url, heure_ouverture_resa, horaires_detail,
  slug, horizon_commande, mode_capacite, statut_publication, plan,
  heure_limite_morning, est_service, categorie,
  rdv_actif, rdv_acompte_global, rdv_delai_annulation_heures,
  rdv_paiement_cash, rdv_paiement_ligne, rdv_fidelite_actif, rdv_fidelite_seuil,
  rdv_fidelite_pourcent, rdv_message_confirmation,
  stripe_account_charges_enabled, stripe_account_details_submitted,
  stripe_account_payouts_enabled, rdv_acompte_en_ligne_actif,
  livraison_actif, accepte_paiement_cash, fidelite_actif, notif_mode,
  delai_annulation_heures
FROM commercants
WHERE statut_publication = 'publie';

-- Colonnes EXCLUES (jamais exposées au public) : email, user_id, auth_user_id,
-- motif_rejet, statut, stripe_account_id, stripe_customer_id,
-- stripe_subscription_id, stripe_onboarding_done_at, subscription_*,
-- billing_exempt, plan_actif_depuis, bce, representant_legal_*, kyb_*.

REVOKE INSERT, UPDATE, DELETE ON commercants_public FROM anon, authenticated;
GRANT SELECT ON commercants_public TO anon, authenticated;

-- ─── 2. Verrouillage de la table de base ────────────────────────────────────
-- On retire les 2 policies SELECT ouvertes (USING true).
DROP POLICY IF EXISTS "Lecture publique" ON commercants;
DROP POLICY IF EXISTS "Lecture publique commercants" ON commercants;

-- Le commerçant authentifié lit UNIQUEMENT sa propre fiche (dashboard a besoin
-- de toutes les colonnes, dont email/stripe, pour SON compte).
DROP POLICY IF EXISTS commercant_select_own ON commercants;
CREATE POLICY commercant_select_own ON commercants
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Les policies admin (admin_all_commercants / "Admin Yoppaa voit tout") et les
-- policies INSERT/UPDATE/DELETE existantes sont conservées telles quelles.
