-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RDV_HORIZON_VUE.sql — ETAPE 2
-- La fiche publique apprend l'horizon choisi par le commercant.
--
-- ⚠️ A PASSER APRES MIGRATION_RDV_HORIZON.sql (etape 1, colonne creee).
--
-- 🔴 DEFINITION RELUE EN BASE LE 07/09, PAS RECOPIEE DU DEPOT. Les 53 colonnes
-- ci-dessous et leur ORDRE viennent du controle 7 de l'etape 1. La definition
-- enregistree dans MIGRATION_BOUTIQUE_DELAI etait PERIMEE : elle annoncait 54
-- colonnes dont trois (`rdv_fidelite_actif`, `rdv_fidelite_seuil`,
-- `rdv_fidelite_pourcent`) n'existent plus, et il en manquait deux
-- (`boutique_expedition_cp`, `essai_plan`). L'ecrire de memoire aurait FAIT
-- DISPARAITRE deux colonnes de la fiche publique, sans une seule erreur.
--
-- ⚠️ `CREATE OR REPLACE VIEW` n'autorise QUE l'ajout en fin de liste : ni
-- changement d'ordre, ni de type, ni de nom. C'est precisement pour ca qu'on
-- reprend la liste vivante a l'identique et qu'on ajoute UNE colonne A LA FIN.
-- Il conserve aussi les droits deja poses, la ou un DROP les aurait perdus :
-- on les repose quand meme, et le controle 3 le verifie au lieu de l'esperer.
--
-- ⚠️ ET LE FILTRE EST CELUI DE LA BASE, relu au controle 8 :
-- `WHERE statut_publication = 'publie'`. Une fiche non publiee ne sort pas.
--
-- Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW commercants_public AS
SELECT
  id, nom, type, telephone, created_at, adresse, latitude, longitude,
  horaires, description, infos_pratiques, logo_url, heure_ouverture_resa,
  horaires_detail, slug, horizon_commande, mode_capacite, statut_publication,
  plan, heure_limite_morning, est_service, categorie,
  rdv_actif, rdv_acompte_global, rdv_delai_annulation_heures,
  rdv_paiement_cash, rdv_paiement_ligne, rdv_message_confirmation,
  stripe_account_charges_enabled, stripe_account_details_submitted,
  stripe_account_payouts_enabled, rdv_acompte_en_ligne_actif,
  livraison_actif, accepte_paiement_cash, fidelite_actif, notif_mode,
  delai_annulation_heures, photos_catalogue_actif,
  boutique_mode_vente, boutique_retrait_paiement, boutique_frais_port,
  boutique_gratuit_des, boutique_expedition_cp,
  fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte,
  fidelite_seuil_cagnotte, fidelite_recompense_type,
  fidelite_recompense_valeur, fidelite_recompense_libelle,
  boutique_delai_heures, bons_cadeaux_actif, essai_plan,
  -- La nouvelle, A LA FIN :
  rdv_horizon_jours
FROM commercants
WHERE statut_publication = 'publie';

-- ⚠️ UNE VUE NAIT MODIFIABLE. Sans cette revocation, une vue simple sur une
-- seule table accepte les ecritures, et elles CONTOURNENT la RLS de la table
-- dessous. C'est la faille du 27/08 : quatre vues publiques etaient
-- ecrivables par `anon`.
REVOKE INSERT, UPDATE, DELETE ON commercants_public FROM anon, authenticated;
GRANT SELECT ON commercants_public TO anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE — une ligne par verification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '1. la vue porte l horizon'::text AS controle,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_name = 'commercants_public'
                            AND column_name = 'rdv_horizon_jours') THEN 'oui' ELSE 'NON' END::text AS valeur,
       'oui'::text AS attendu
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE. 53 + 1. Un nombre inferieur veut dire que des
-- colonnes ont ete PERDUES en cours de route, et chacune est une fonction qui
-- s'eteint en silence sur la fiche.
SELECT '2. aucune colonne perdue'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_name = 'commercants_public'),
       '54'::text
UNION ALL
-- ⚠️ Les colonnes du 06/09 sont toujours la : elles avaient disparu une fois.
SELECT '3. les colonnes recentes ont survecu'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_name = 'commercants_public'
           AND column_name IN ('boutique_expedition_cp', 'essai_plan', 'bons_cadeaux_actif', 'boutique_delai_heures')),
       '4'::text
UNION ALL
SELECT '4. la vue reste en lecture seule'::text,
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_name = 'commercants_public' AND grantee IN ('anon', 'authenticated')
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
       '0'::text
UNION ALL
SELECT '5. et lisible par les deux roles'::text,
       (SELECT count(DISTINCT grantee)::text FROM information_schema.table_privileges
         WHERE table_name = 'commercants_public' AND grantee IN ('anon', 'authenticated')
           AND privilege_type = 'SELECT'),
       '2'::text
UNION ALL
SELECT '6. une fiche non publiee ne sort toujours pas'::text,
       CASE WHEN pg_get_viewdef('commercants_public'::regclass, true) LIKE '%statut_publication%publie%'
            THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT '7. les commerces publies restent visibles'::text,
       (SELECT count(*)::text FROM commercants_public),
       'le nombre habituel, jamais 0'::text;
