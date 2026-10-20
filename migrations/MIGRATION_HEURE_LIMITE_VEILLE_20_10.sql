-- L'HEURE LIMITE DE LA VEILLE, 20/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Demande de la boulangerie Aux Délices des 7 Abbayes : elle commande chez son
-- fournisseur à 18 h. Une commande « sur commande » pour le lendemain, passée
-- après 18 h, ne peut pas être servie.
--
-- ✅ DÉCISIONS D'ALEX (tableau, 20/10) : une HEURE LIMITE LA VEILLE pour le
-- circuit « sur commande, pour un autre jour » (pas J+2, qui refuserait toutes
-- les commandes pour le lendemain, même à 10 h) ; UN réglage pour tout le
-- commerce. Le jour même ne change pas.
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. La
-- colonne naît VIDE (NULL = minuit, la règle d'aujourd'hui).
--
-- ⚠️ LA FICHE LIT `commercants_public` : la colonne doit y être, sinon l'écran
-- proposerait demain après 18 h et le serveur refuserait au paiement. La vue
-- est refaite SUR SA DÉFINITION VIVANTE ET NULLE AUTRE (patron du 03/10,
-- MIGRATION_RELECTURE_STORES.sql) : si elle n'a pas exactement les 60
-- colonnes attendues, dans l'ordre, ou si son filtre n'est plus celui des
-- fiches publiées + relecture des stores, la migration S'ARRÊTE et nomme ce
-- qu'elle a trouvé ; rien n'est changé. Ses options sont notées avant et
-- reposées après (`CREATE OR REPLACE VIEW` les efface).
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

-- ─── 0. Les options de la vue, AVANT ──────────────────────────────────────
DROP TABLE IF EXISTS pg_temp.vue_avant_veille;
CREATE TEMP TABLE vue_avant_veille AS
SELECT reloptions AS options FROM pg_class WHERE oid = 'public.commercants_public'::regclass;

-- ─── 1. La colonne ───────────────────────────────────────────────────────
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS commande_veille_avant time;

COMMENT ON COLUMN public.commercants.commande_veille_avant IS
  'Heure limite la veille (20/10) pour le circuit « sur commande » : après cette heure, une commande pour le lendemain part au surlendemain. Vide = minuit (aucune limite).';

GRANT SELECT (commande_veille_avant) ON public.commercants TO anon, authenticated;
GRANT UPDATE (commande_veille_avant) ON public.commercants TO authenticated;

-- ─── 2. La vue publique, sur la définition vivante et nulle autre ────────
DO $$
DECLARE
  attendu text := 'id,nom,type,telephone,created_at,adresse,latitude,longitude,horaires,description,infos_pratiques,logo_url,heure_ouverture_resa,horaires_detail,slug,horizon_commande,mode_capacite,statut_publication,plan,heure_limite_morning,est_service,categorie,rdv_actif,rdv_acompte_global,rdv_delai_annulation_heures,rdv_paiement_cash,rdv_paiement_ligne,rdv_message_confirmation,stripe_account_charges_enabled,stripe_account_details_submitted,stripe_account_payouts_enabled,rdv_acompte_en_ligne_actif,livraison_actif,accepte_paiement_cash,fidelite_actif,notif_mode,delai_annulation_heures,photos_catalogue_actif,boutique_mode_vente,boutique_retrait_paiement,boutique_frais_port,boutique_gratuit_des,boutique_expedition_cp,fidelite_mecanique,fidelite_seuil_passages,fidelite_taux_cagnotte,fidelite_seuil_cagnotte,fidelite_recompense_type,fidelite_recompense_valeur,fidelite_recompense_libelle,boutique_delai_heures,bons_cadeaux_actif,essai_plan,rdv_horizon_jours,commande_actif,rdv_cadence_couverts,rdv_empreinte_actif,rdv_empreinte_seuil_couverts,rdv_empreinte_par_personne,ordre_categories';
  vivant text;
  filtre text;
BEGIN
  SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position) INTO vivant
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants_public';
  -- Rejouée, la vue porte déjà la colonne à la fin : c'est la même.
  IF vivant IS DISTINCT FROM attendu AND vivant IS DISTINCT FROM attendu || ',commande_veille_avant' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : commercants_public n a pas les 60 colonnes attendues, rien n a ete change. Colonnes vivantes : %', coalesce(vivant, 'VUE ABSENTE');
  END IF;
  filtre := regexp_replace(lower(coalesce(substring(pg_get_viewdef('public.commercants_public'::regclass, true) from 'WHERE(.*)$'), '')),
                           '[[:space:]();]|commercants\.|::text', '', 'g');
  -- Le filtre vivant doit être celui du 03/10 : publiées + relecture des stores.
  IF filtre NOT LIKE 'statut_publication=''publie''orstatut_publication=''relecture''and%est_compte_relecture' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : le filtre des fiches publiees a change, rien n a ete change. Filtre vivant : %', filtre;
  END IF;
END
$$;

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
    commande_actif, rdv_cadence_couverts, rdv_empreinte_actif,
    rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne, ordre_categories,
    -- La nouvelle, À LA FIN : `CREATE OR REPLACE VIEW` n'autorise que ça.
    commande_veille_avant
   FROM commercants
  WHERE statut_publication = 'publie'::text
     OR (statut_publication = 'relecture'::text AND public.est_compte_relecture());

DO $$
DECLARE
  opts text[];
BEGIN
  SELECT options INTO opts FROM pg_temp.vue_avant_veille LIMIT 1;
  IF opts IS NOT NULL AND array_length(opts, 1) > 0 THEN
    EXECUTE format('ALTER VIEW public.commercants_public SET (%s)', array_to_string(opts, ', '));
  END IF;
END
$$;

-- ⚠️ UNE VUE NAÎT MODIFIABLE : lecture seule, par les droits, pour les deux rôles.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON public.commercants_public TO anon, authenticated;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'V1. colonne commercants.commande_veille_avant' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commercants' AND column_name = 'commande_veille_avant'), 'ABSENTE')::text AS valeur,
    'time without time zone' AS attendu
  UNION ALL
  SELECT 2, 'V2. la vue a 61 colonnes',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public'),
    '61'
  UNION ALL
  SELECT 3, 'V3. la nouvelle colonne est la DERNIÈRE de la vue',
    (SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public'
      ORDER BY ordinal_position DESC LIMIT 1),
    'commande_veille_avant'
  UNION ALL
  SELECT 4, 'V4. le filtre garde la relecture des stores',
    (pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%est_compte_relecture%')::text,
    'true'
  UNION ALL
  SELECT 5, 'V5. les options de la vue sont reposées à l''identique',
    ((SELECT reloptions FROM pg_class WHERE oid = 'public.commercants_public'::regclass)
       IS NOT DISTINCT FROM (SELECT options FROM pg_temp.vue_avant_veille LIMIT 1))::text,
    'true'
  UNION ALL
  SELECT 6, 'V6. anon lit la vue',
    has_table_privilege('anon', 'public.commercants_public', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 7, 'V7. anon n''écrit pas dans la vue',
    has_table_privilege('anon', 'public.commercants_public', 'INSERT')::text, 'false'
  UNION ALL
  SELECT 8, 'V8. authenticated n''écrit pas dans la vue',
    has_table_privilege('authenticated', 'public.commercants_public', 'UPDATE')::text, 'false'
  UNION ALL
  SELECT 9, 'V9. le commerçant connecté écrit sa colonne',
    has_column_privilege('authenticated', 'public.commercants', 'commande_veille_avant', 'UPDATE')::text, 'true'
  UNION ALL
  SELECT 10, 'V10. fiches visibles dans la vue = fiches publiées',
    (SELECT count(*) FROM public.commercants_public)::text || ' / ' || (SELECT count(*) FROM public.commercants WHERE statut_publication = 'publie')::text,
    'deux nombres égaux (3 / 3 en prod le 19/10)'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : personne ne doit avoir d'heure limite après la migration.
  SELECT 11, 'V11. commerces portant déjà une heure limite',
    (SELECT count(*) FROM public.commercants WHERE commande_veille_avant IS NOT NULL)::text,
    '0'
) t ORDER BY n;
