-- ════════════════════════════════════════════════════════════════════════════
-- RETRAIT DES TROIS COLONNES rdv_fidelite_* — 27/08 (suite)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fait suite à MIGRATION_RETRAIT_ANCIENNE_FIDELITE_RDV.sql, qui a basculé le
-- dernier commerce et supprimé la table, le déclencheur et la fonction.
-- Il ne reste que les trois colonnes, et elles sont exposées par la vue
-- publique : c'est pourquoi elles n'ont pas pu partir avec le reste.
--
-- ⚠️ CREATE OR REPLACE VIEW NE SAIT PAS RETIRER UNE COLONNE. Postgres refuse
-- explicitement (« cannot drop columns from view »). Il faut donc DROP puis
-- CREATE, et REPOSER le GRANT : sans lui, la vue reviendrait muette pour anon
-- et TOUTES les fiches publiques deviendraient vides.
--
-- ⚠️ ÉCRITE SUR LA DÉFINITION RÉELLE, relue en base via pg_get_viewdef, jamais
-- de mémoire. C'est la règle depuis que j'ai failli amputer treize colonnes de
-- cette même vue en la recopiant d'une migration voisine.
--
-- ⚠️ CE QU'ON NE FAIT PAS ICI, ET POURQUOI : on ne pose PAS `security_invoker`.
-- La vue tourne aujourd'hui avec les droits de son propriétaire. L'activer lui
-- ferait appliquer la RLS de `commercants` pour l'appelant, et si la policy de
-- `anon` sur la table ne couvre pas exactement les lignes publiées, toutes les
-- fiches publiques s'éteignent d'un coup. Ça se décide avec les policies sous
-- les yeux, pas dans une migration qui traite d'autre chose. Les droits
-- d'écriture d'anon sur la vue ont déjà été retirés, elle est en lecture seule.
--
--   56 colonnes avant, 53 après. Les trois retirées : rdv_fidelite_actif,
--   rdv_fidelite_seuil, rdv_fidelite_pourcent.


-- ─── BLOC 0 — CONTRÔLE AVANT ────────────────────────────────────────────────
--
-- Attendu : 56, et aucun commerce ne portant encore l'ancien drapeau.

SELECT count(*) AS colonnes_avant
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'commercants_public';

SELECT count(*) AS restes_ancien_drapeau
FROM commercants WHERE rdv_fidelite_actif = true;


-- ─── BLOC 1 — LA VUE, RECONSTRUITE SANS LES TROIS ───────────────────────────
--
-- Sans CASCADE : si un autre objet dépend de cette vue, on veut que Postgres
-- refuse et nous le dise, pas qu'il l'emporte en silence.

DROP VIEW public.commercants_public;

CREATE VIEW public.commercants_public AS
 SELECT id,
    nom,
    type,
    telephone,
    created_at,
    adresse,
    latitude,
    longitude,
    horaires,
    description,
    infos_pratiques,
    logo_url,
    heure_ouverture_resa,
    horaires_detail,
    slug,
    horizon_commande,
    mode_capacite,
    statut_publication,
    plan,
    heure_limite_morning,
    est_service,
    categorie,
    rdv_actif,
    rdv_acompte_global,
    rdv_delai_annulation_heures,
    rdv_paiement_cash,
    rdv_paiement_ligne,
    rdv_message_confirmation,
    stripe_account_charges_enabled,
    stripe_account_details_submitted,
    stripe_account_payouts_enabled,
    rdv_acompte_en_ligne_actif,
    livraison_actif,
    accepte_paiement_cash,
    fidelite_actif,
    notif_mode,
    delai_annulation_heures,
    photos_catalogue_actif,
    boutique_mode_vente,
    boutique_retrait_paiement,
    boutique_frais_port,
    boutique_gratuit_des,
    boutique_expedition_cp,
    fidelite_mecanique,
    fidelite_seuil_passages,
    fidelite_taux_cagnotte,
    fidelite_seuil_cagnotte,
    fidelite_recompense_type,
    fidelite_recompense_valeur,
    fidelite_recompense_libelle,
    boutique_delai_heures,
    bons_cadeaux_actif,
    essai_plan
   FROM commercants
  WHERE statut_publication = 'publie'::text;

-- ⚠️ 🔴 LE REVOKE EST INDISPENSABLE ICI, ET IL EST FACILE À OUBLIER.
-- Une vue NEUVE dans `public` NAÎT ÉCRIVABLE : les privilèges par défaut de
-- Supabase accordent l'écriture à `anon` et `authenticated` sur tout objet
-- créé, et un `GRANT SELECT` explicite s'AJOUTE à ces droits au lieu de les
-- restreindre. C'est exactement comme ça que la porte s'était ouverte sur cette
-- vue-ci, prouvée le 27/08 : `anon` pouvait écrire dans `commercants` à travers
-- elle, avec les droits du propriétaire, donc EN CONTOURNANT LA RLS, sur une
-- vue qui expose `plan`.
--
-- Recréer la vue sans ce REVOKE, c'est rouvrir la porte qu'on vient de fermer.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON commercants_public TO anon, authenticated;


-- ─── BLOC 2 — LES COLONNES ──────────────────────────────────────────────────

ALTER TABLE commercants
  DROP COLUMN IF EXISTS rdv_fidelite_actif,
  DROP COLUMN IF EXISTS rdv_fidelite_seuil,
  DROP COLUMN IF EXISTS rdv_fidelite_pourcent;


-- ─── BLOC 3 — CONTRÔLE APRÈS ────────────────────────────────────────────────
--
-- Attendu : 53 colonnes, 0 colonne rdv_fidelite_* restante, et les deux rôles
-- publics avec SELECT et RIEN D'AUTRE.

SELECT count(*) AS colonnes_apres
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'commercants_public';

SELECT count(*) AS colonnes_rdv_fidelite_restantes
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'commercants'
  AND column_name LIKE 'rdv_fidelite%';

-- ⚠️ ATTENDU : anon SELECT et authenticated SELECT, RIEN D'AUTRE. Si INSERT,
-- UPDATE ou DELETE réapparaissent, c'est que le REVOKE du bloc 1 n'a pas été
-- joué, et la vue est de nouveau écrivable par un visiteur non connecté.
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'commercants_public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, privilege_type;

-- ⚠️ ET LE CONTRÔLE QUI COMPTE VRAIMENT : une fiche publique doit encore se
-- lire. Un compte de colonnes ne prouve pas qu'on voit quelque chose.
SELECT count(*) AS commerces_visibles FROM commercants_public;
