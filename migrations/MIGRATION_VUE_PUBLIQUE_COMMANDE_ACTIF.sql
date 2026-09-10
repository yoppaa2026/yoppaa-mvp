-- ═══════════════════════════════════════════════════════════════════════════
-- MODULE RESTAURANT, migration 3 sur 7 — passee par Alex le 09/09/2026.
--
-- La vue publique expose commande_actif (55 colonnes). APRES la 2 : elle lit sa colonne.
--
-- ⚠️ RANGEE LE 10/09, APRES COUP. Ce texte a ete fourni dans la conversation
-- et passe a la main dans l editeur Supabase, mais il n avait jamais ete
-- depose ici : le schema de la reservation de table n etait trace NULLE PART
-- hors de la base. Il est recopie a l identique depuis l historique, pas
-- reconstitue de memoire. Idempotent : le rejouer ne change rien.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE VIEW public.commercants_public AS
 SELECT id, nom, type, telephone, created_at, adresse, latitude, longitude,
    horaires, description, infos_pratiques, logo_url, heure_ouverture_resa,
    horaires_detail, slug, horizon_commande, mode_capacite, statut_publication,
    plan, heure_limite_morning, est_service, categorie, rdv_actif,
    rdv_acompte_global, rdv_delai_annulation_heures, rdv_paiement_cash,
    rdv_paiement_ligne, rdv_message_confirmation,
    stripe_account_charges_enabled, stripe_account_details_submitted,
    stripe_account_payouts_enabled, rdv_acompte_en_ligne_actif,
    livraison_actif, accepte_paiement_cash, fidelite_actif, notif_mode,
    delai_annulation_heures, photos_catalogue_actif, boutique_mode_vente,
    boutique_retrait_paiement, boutique_frais_port, boutique_gratuit_des,
    boutique_expedition_cp, fidelite_mecanique, fidelite_seuil_passages,
    fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type,
    fidelite_recompense_valeur, fidelite_recompense_libelle,
    boutique_delai_heures, bons_cadeaux_actif, essai_plan, rdv_horizon_jours,
    commande_actif
   FROM commercants
  WHERE statut_publication = 'publie'::text;

COMMIT;

select 'colonnes de la vue' as controle,
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='commercants_public') as valeur,
       '55' as attendu
union all
select 'commande_actif y est',
       (select count(*)::text from information_schema.columns
         where table_schema='public' and table_name='commercants_public'
           and column_name='commande_actif'),
       '1'
union all
select 'aucune colonne perdue',
       (select case when count(*) = 0 then 'aucune'
                    else string_agg(c, ', ') end
          from unnest(ARRAY['boutique_expedition_cp','essai_plan','rdv_horizon_jours',
                            'fidelite_recompense_libelle','boutique_delai_heures',
                            'bons_cadeaux_actif','logo_url','slug']) c
         where c not in (select column_name from information_schema.columns
                          where table_schema='public' and table_name='commercants_public')),
       'aucune'
union all
select 'la vue ne montre que les publies',
       (select case when pg_get_viewdef('public.commercants_public'::regclass, true)
                    like '%statut_publication = ''publie''%' then 'oui' else 'NON' end),
       'oui'
union all
select 'options de securite',
       (select coalesce(array_to_string(reloptions, ','), 'AUCUNE')
          from pg_class where relname='commercants_public'),
       'security_invoker doit avoir survecu'
union all
select 'droits anon sur la vue',
       (select coalesce(string_agg(distinct privilege_type::text, '+' order by privilege_type::text), 'AUCUN')
          from information_schema.role_table_grants
         where table_schema='public' and table_name='commercants_public' and grantee='anon'),
       'SELECT seul';
