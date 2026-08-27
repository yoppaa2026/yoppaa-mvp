-- ════════════════════════════════════════════════════════════════════════════
-- Délai de préparation d'une boutique de détail, en heures
--
-- ⚠️ CE RÉGLAGE N'EXISTAIT PAS, et c'est ce qui rendait le jour de retrait
-- impossible à calculer honnêtement. Les cinq colonnes `boutique_*` déjà en
-- base (mode de vente, paiement au retrait, frais de port, seuil de gratuité,
-- codes postaux desservis) ne disent rien du TEMPS qu'il faut au commerçant
-- pour préparer.
--
-- Tous les délais existants sont attachés aux CRÉNEAUX (`cutoff_heures`,
-- `delta_minutes`, `horizon_commande`) : une boutique de détail n'en a aucun,
-- donc aucun ne s'applique à elle.
--
-- Décision d'Alex (11/08) : le retrait le jour même est proposé si la boutique
-- est ouverte ET qu'il reste au moins ce délai avant sa fermeture. Une
-- bijouterie met dix minutes, un opticien deux jours : une règle unique serait
-- fausse pour la moitié d'entre eux.
--
-- DÉFAUT À 2 HEURES. C'est un changement de comportement assumé : jusqu'ici,
-- le jour même était proposé jusqu'à la seconde précédant la fermeture. Un
-- commerçant pouvait recevoir à 18h25 une commande à préparer pour 18h30.
--
-- ⚠️ EN DEUX TEMPS. La vue `commercants_public` doit porter la colonne, car
-- l'écran client ne lit jamais la table directement. Mais la définition
-- enregistrée dans MIGRATION_RLS_COMMERCANTS est PÉRIMÉE : la vue vivante
-- expose des colonnes (`boutique_mode_vente`, entre autres) qui n'y figurent
-- pas, donc elle a été recréée en base sans que le dépôt suive. On ne réécrit
-- pas une vue de production sur une définition qu'on ne connaît pas.
--
-- Étape 1 (ce fichier) : la colonne.
-- Étape 2 : la vue, écrite explicitement une fois sa définition vivante relue.
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-08-11
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE commercants
  ADD COLUMN IF NOT EXISTS boutique_delai_heures integer NOT NULL DEFAULT 2;

-- ─── Contrôle ───────────────────────────────────────────────────────────────
-- Attendu : colonne_creee = 1, defaut = 2
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commercants' AND column_name = 'boutique_delai_heures') AS colonne_creee,
  (SELECT column_default FROM information_schema.columns
    WHERE table_name = 'commercants' AND column_name = 'boutique_delai_heures') AS defaut;

-- ─── Étape 2 : la vue publique ──────────────────────────────────────────────
-- Définition RELUE en base le 11/08 (52 colonnes), reprise à l'identique et
-- dans le même ordre. Deux colonnes s'ajoutent À LA FIN, jamais au milieu.
--
-- ⚠️ `bons_cadeaux_actif` MANQUAIT, ET LA PASTILLE ÉTAIT MORTE. `getPillsStatut`
-- (lib/plans.js) teste `commercant?.bons_cadeaux_actif === true` sur l'objet
-- venu de CETTE vue : la colonne étant absente, la valeur vaut `undefined` et
-- la pastille « Bons cadeaux » ne s'affichait sur AUCUNE carte, ni sur aucune
-- fiche. Le bouton « Offrir un bon cadeau » de la fiche, lui, fonctionne : il
-- passe par une route serveur qui lit la table directement. D'où un défaut
-- invisible — la fonctionnalité marche, mais rien ne l'annonce.
CREATE OR REPLACE VIEW commercants_public AS
SELECT
  id, nom, type, telephone, created_at, adresse, latitude, longitude,
  horaires, description, infos_pratiques, logo_url, heure_ouverture_resa,
  horaires_detail, slug, horizon_commande, mode_capacite, statut_publication,
  plan, heure_limite_morning, est_service, categorie,
  rdv_actif, rdv_acompte_global, rdv_delai_annulation_heures,
  rdv_paiement_cash, rdv_paiement_ligne, rdv_fidelite_actif, rdv_fidelite_seuil,
  rdv_fidelite_pourcent, rdv_message_confirmation,
  stripe_account_charges_enabled, stripe_account_details_submitted,
  stripe_account_payouts_enabled, rdv_acompte_en_ligne_actif,
  livraison_actif, accepte_paiement_cash, fidelite_actif, notif_mode,
  delai_annulation_heures, photos_catalogue_actif,
  boutique_mode_vente, boutique_retrait_paiement, boutique_frais_port,
  boutique_gratuit_des, boutique_expedition_cp,
  fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte,
  fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur,
  fidelite_recompense_libelle,
  -- Les deux nouvelles, à la fin :
  boutique_delai_heures,
  bons_cadeaux_actif
FROM commercants
WHERE statut_publication = 'publie';

REVOKE INSERT, UPDATE, DELETE ON commercants_public FROM anon, authenticated;
GRANT SELECT ON commercants_public TO anon, authenticated;

-- ─── Contrôle de l'étape 2 ──────────────────────────────────────────────────
-- Attendu : colonnes_vue = 54, les_deux_nouvelles = 2
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commercants_public') AS colonnes_vue,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commercants_public'
      AND column_name IN ('boutique_delai_heures', 'bons_cadeaux_actif')) AS les_deux_nouvelles;
