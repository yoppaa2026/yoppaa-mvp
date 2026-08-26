-- ════════════════════════════════════════════════════════════════════════════
-- L'ESSAI DOIT SE VOIR DEPUIS LA FICHE PUBLIQUE
--
-- 🔴 LE DÉFAUT, TROUVÉ LE 26/08 EN VÉRIFIANT AUTRE CHOSE. Depuis ce matin, un
-- commerçant peut demander l'essai de Vendre : son tableau de bord s'ouvre, les
-- onglets s'allument, le bandeau annonce sa date. Mais SA FICHE PUBLIQUE
-- CONTINUE DE REFUSER LES COMMANDES.
--
-- La raison est ici : tous les écrans Yopper lisent la vue `commercants_public`,
-- et cette vue n'expose PAS `essai_plan`. Sans cette colonne, `planEffectif` ne
-- peut pas savoir qu'un essai est en cours : il retombe sur `plan`, c'est-à-dire
-- Exister, et le bouton « commander » ne s'affiche jamais.
--
-- ⚠️ CE N'EST PAS UN DÉTAIL D'AFFICHAGE, C'EST L'ESSAI QUI NE SERT À RIEN. Le
-- commerçant l'active, va voir sa propre boutique, et constate que rien n'a
-- changé. « Qu'il y goûte, et qu'il y reste » (Alex) suppose qu'il puisse y
-- goûter : si ses clients ne voient aucune différence, il n'y a rien à goûter.
--
-- ⚠️ ET C'EST LE MÊME DÉFAUT QUE `created_at` : une colonne absente d'un select
-- ne lève AUCUNE erreur. Elle vaut `undefined`, la fonction rend son repli, et
-- tout a l'air de marcher. C'est le défaut le plus fréquent de ce projet.
--
-- CONFIDENTIALITÉ : `essai_plan` ne contient qu'un nom de formule
-- ('communiquer' ou 'vendre'). Aucune donnée personnelle, aucune donnée
-- financière. La vue expose déjà `plan` depuis le 06/07, pour la même raison :
-- les écrans doivent savoir ce que ce commerce propose.
--
-- ⚠️ LA LISTE CI-DESSOUS EST RECOPIÉE À L'IDENTIQUE DE `MIGRATION_BOUTIQUE_DELAI`,
-- la dernière migration à avoir redéfini cette vue, avec `essai_plan` ajoutée
-- EN FIN DE LISTE. Une première version de ce fichier avait été écrite de
-- mémoire à partir de `MIGRATION_RLS_COMMERCANTS` : il y manquait TREIZE
-- colonnes, dont toute la configuration de fidélité et les bons cadeaux.
-- `CREATE OR REPLACE VIEW` ne se contente pas d'ajouter, il REMPLACE : la vue
-- aurait perdu ces colonnes, et les fiches auraient cessé d'afficher la carte
-- de fidélité sans qu'aucune erreur ne soit levée nulle part.
--
-- ⚠️ ET L'ORDRE COMPTE. PostgreSQL n'autorise `CREATE OR REPLACE VIEW` que si
-- les colonnes existantes gardent leur ordre ET leur type ; les nouvelles se
-- posent obligatoirement à la fin. Si cette migration échoue avec « cannot
-- change name of view column », c'est que la vue a été modifiée entre-temps :
-- ne pas forcer, relire d'abord `SELECT pg_get_viewdef('commercants_public', true);`
--
-- Idempotent. À passer dans Supabase SQL Editor.
-- Date : 2026-08-26
-- ════════════════════════════════════════════════════════════════════════════

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
  boutique_delai_heures,
  bons_cadeaux_actif,
  -- ⬇️ LA COLONNE AJOUTÉE LE 26/08, et la seule.
  essai_plan
FROM commercants
WHERE statut_publication = 'publie';

-- Colonnes toujours EXCLUES (jamais exposées au public) : email, user_id,
-- auth_user_id, motif_rejet, statut, stripe_account_id, stripe_customer_id,
-- stripe_subscription_id, stripe_onboarding_done_at, subscription_*,
-- billing_exempt, plan_actif_depuis, bce, representant_legal_*, kyb_*.
--
-- ⚠️ `essai_demande_le` RESTE DEHORS : la date à laquelle un commerçant a
-- cliqué n'apprend rien à un habitant et n'entre dans aucun calcul d'écran.
-- On n'expose que ce qui sert.

-- ⚠️ GRANT SYSTÉMATIQUE. `CREATE OR REPLACE VIEW` conserve les droits
-- existants, mais on ne PARIE pas là-dessus : une vue sans GRANT, c'est la
-- fiche publique qui rend 42501 à tous les visiteurs, d'un coup.
GRANT SELECT ON commercants_public TO anon, authenticated;

-- ─── CONTRÔLE ───────────────────────────────────────────────────────────────
-- Attendu : essai_plan_expose = 1, colonnes_vue = 55 (54 + la nouvelle), et
-- commerces_visibles INCHANGÉ par rapport à avant la migration.
--
-- ⚠️ ON COMPTE AUSSI LES COLONNES, pas seulement la nouvelle. C'est ce qui
-- attraperait une liste amputée : `essai_plan` serait bien là, et treize autres
-- auraient disparu en silence.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commercants_public' AND column_name = 'essai_plan') AS essai_plan_expose,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'commercants_public') AS colonnes_vue,
  (SELECT count(*) FROM commercants_public) AS commerces_visibles;
