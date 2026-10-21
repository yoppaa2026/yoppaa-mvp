-- PAIEMENT « LES DEUX » ET HORIZON DU DÉTAIL, 21/10. À LANCER SUR TEST, PUIS
-- SUR PROD, AVANT LE CODE.
--
-- Retours d'Alex après sa visite au Caprice de Magali (lingerie, détail).
-- ✅ DÉCISIONS D'ALEX (tableau, 21/10) :
--   A. retrait en boutique : une 3e possibilité « Les deux, le client
--      choisit » (`boutique_retrait_paiement = 'les_deux'`) ;
--   B. l'horizon de retrait d'un commerce de détail se RÈGLE (7, 14, 21 ou 30
--      jours), dans Profil › Boutique ; vide = 14 jours, la règle du serveur
--      aujourd'hui (`boutique_horizon_jours`).
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. La
-- contrainte accepte une valeur DE PLUS (les valeurs actuelles restent
-- valables) ; la colonne naît VIDE.
--
-- ⚠️ LA FICHE LIT `commercants_public` : la colonne doit y être. La vue est
-- refaite SUR SA DÉFINITION VIVANTE ET NULLE AUTRE (patron du 20/10) : si
-- elle n'a pas exactement les 61 colonnes attendues, dans l'ordre, ou si son
-- filtre n'est plus celui des fiches publiées + relecture des stores, la
-- migration S'ARRÊTE et nomme ce qu'elle a trouvé ; rien n'est changé. Ses
-- options sont notées avant et reposées après.
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

-- ─── 0. Les options de la vue, AVANT ──────────────────────────────────────
DROP TABLE IF EXISTS pg_temp.vue_avant_21_10;
CREATE TEMP TABLE vue_avant_21_10 AS
SELECT reloptions AS options FROM pg_class WHERE oid = 'public.commercants_public'::regclass;

-- ─── A. « Les deux » ──────────────────────────────────────────────────────
-- La contrainte d'origine (MIGRATION_BOUTIQUE_VARIANTES) n'a pas de nom
-- choisi : on retire TOUTE contrainte CHECK qui porte sur cette seule colonne,
-- puis on pose la nouvelle, nommée.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.commercants'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%boutique_retrait_paiement%'
  LOOP
    EXECUTE format('ALTER TABLE public.commercants DROP CONSTRAINT %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_boutique_retrait_paiement_check
  CHECK (boutique_retrait_paiement IN ('en_ligne', 'magasin', 'les_deux'));

COMMENT ON COLUMN public.commercants.boutique_retrait_paiement IS
  'Retrait en boutique : en_ligne (payé à la commande), magasin (au comptoir), les_deux (le client choisit, 21/10).';

-- ─── B. L'horizon du détail ───────────────────────────────────────────────
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS boutique_horizon_jours integer;

ALTER TABLE public.commercants DROP CONSTRAINT IF EXISTS commercants_boutique_horizon_jours_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_boutique_horizon_jours_check
  CHECK (boutique_horizon_jours IS NULL OR boutique_horizon_jours IN (7, 14, 21, 30));

COMMENT ON COLUMN public.commercants.boutique_horizon_jours IS
  'Détail (21/10) : jusqu''à combien de jours à l''avance un client peut choisir son retrait en boutique. Vide = 14 jours.';

GRANT SELECT (boutique_horizon_jours) ON public.commercants TO anon, authenticated;
GRANT UPDATE (boutique_horizon_jours) ON public.commercants TO authenticated;

-- ─── C. La vue publique, sur la définition vivante et nulle autre ────────
DO $$
DECLARE
  attendu text := 'id,nom,type,telephone,created_at,adresse,latitude,longitude,horaires,description,infos_pratiques,logo_url,heure_ouverture_resa,horaires_detail,slug,horizon_commande,mode_capacite,statut_publication,plan,heure_limite_morning,est_service,categorie,rdv_actif,rdv_acompte_global,rdv_delai_annulation_heures,rdv_paiement_cash,rdv_paiement_ligne,rdv_message_confirmation,stripe_account_charges_enabled,stripe_account_details_submitted,stripe_account_payouts_enabled,rdv_acompte_en_ligne_actif,livraison_actif,accepte_paiement_cash,fidelite_actif,notif_mode,delai_annulation_heures,photos_catalogue_actif,boutique_mode_vente,boutique_retrait_paiement,boutique_frais_port,boutique_gratuit_des,boutique_expedition_cp,fidelite_mecanique,fidelite_seuil_passages,fidelite_taux_cagnotte,fidelite_seuil_cagnotte,fidelite_recompense_type,fidelite_recompense_valeur,fidelite_recompense_libelle,boutique_delai_heures,bons_cadeaux_actif,essai_plan,rdv_horizon_jours,commande_actif,rdv_cadence_couverts,rdv_empreinte_actif,rdv_empreinte_seuil_couverts,rdv_empreinte_par_personne,ordre_categories,commande_veille_avant';
  vivant text;
  filtre text;
BEGIN
  SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position) INTO vivant
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants_public';
  -- Rejouée, la vue porte déjà la colonne à la fin : c'est la même.
  IF vivant IS DISTINCT FROM attendu AND vivant IS DISTINCT FROM attendu || ',boutique_horizon_jours' THEN
    RAISE EXCEPTION 'VUE_DERIVEE : commercants_public n a pas les 61 colonnes attendues, rien n a ete change. Colonnes vivantes : %', coalesce(vivant, 'VUE ABSENTE');
  END IF;
  filtre := regexp_replace(lower(coalesce(substring(pg_get_viewdef('public.commercants_public'::regclass, true) from 'WHERE(.*)$'), '')),
                           '[[:space:]();]|commercants\.|::text', '', 'g');
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
    commande_veille_avant,
    -- La nouvelle, À LA FIN : `CREATE OR REPLACE VIEW` n'autorise que ça.
    boutique_horizon_jours
   FROM commercants
  WHERE statut_publication = 'publie'::text
     OR (statut_publication = 'relecture'::text AND public.est_compte_relecture());

DO $$
DECLARE
  opts text[];
BEGIN
  SELECT options INTO opts FROM pg_temp.vue_avant_21_10 LIMIT 1;
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
  SELECT 1 AS n, 'P1. contrainte du paiement : en_ligne, magasin, les_deux' AS controle,
    coalesce((SELECT string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | ') FROM pg_constraint
              WHERE conrelid = 'public.commercants'::regclass AND contype = 'c'
                AND pg_get_constraintdef(oid) LIKE '%boutique_retrait_paiement%'), 'ABSENTE')::text AS valeur,
    'une seule : commercants_boutique_retrait_paiement_check, avec les_deux' AS attendu
  UNION ALL
  SELECT 2, 'P2. personne n''est encore en « les deux »',
    (SELECT count(*) FROM public.commercants WHERE boutique_retrait_paiement = 'les_deux')::text, '0'
  UNION ALL
  SELECT 3, 'H1. colonne commercants.boutique_horizon_jours',
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'commercants' AND column_name = 'boutique_horizon_jours'), 'ABSENTE')::text,
    'integer'
  UNION ALL
  SELECT 4, 'H2. contrainte 7 / 14 / 21 / 30',
    coalesce((SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'commercants_boutique_horizon_jours_check'), 'ABSENTE')::text,
    'CHECK (boutique_horizon_jours IS NULL OR boutique_horizon_jours = ANY (ARRAY[7, 14, 21, 30]))'
  UNION ALL
  SELECT 5, 'H3. personne n''a encore d''horizon de boutique',
    (SELECT count(*) FROM public.commercants WHERE boutique_horizon_jours IS NOT NULL)::text, '0'
  UNION ALL
  SELECT 6, 'H4. le commerçant connecté écrit sa colonne',
    has_column_privilege('authenticated', 'public.commercants', 'boutique_horizon_jours', 'UPDATE')::text, 'true'
  UNION ALL
  SELECT 7, 'V1. la vue a 62 colonnes',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public'),
    '62'
  UNION ALL
  SELECT 8, 'V2. la nouvelle colonne est la DERNIÈRE de la vue',
    (SELECT column_name::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public'
      ORDER BY ordinal_position DESC LIMIT 1),
    'boutique_horizon_jours'
  UNION ALL
  SELECT 9, 'V3. le filtre garde la relecture des stores',
    (pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%est_compte_relecture%')::text, 'true'
  UNION ALL
  SELECT 10, 'V4. les options de la vue sont reposées à l''identique',
    ((SELECT reloptions FROM pg_class WHERE oid = 'public.commercants_public'::regclass)
       IS NOT DISTINCT FROM (SELECT options FROM pg_temp.vue_avant_21_10 LIMIT 1))::text,
    'true'
  UNION ALL
  SELECT 11, 'V5. anon lit la vue, n''y écrit pas',
    (has_table_privilege('anon', 'public.commercants_public', 'SELECT')::text || '/'
     || has_table_privilege('anon', 'public.commercants_public', 'INSERT')::text),
    'true/false'
  UNION ALL
  SELECT 12, 'V6. authenticated n''écrit pas dans la vue',
    has_table_privilege('authenticated', 'public.commercants_public', 'UPDATE')::text, 'false'
  UNION ALL
  SELECT 13, 'V7. fiches visibles dans la vue = fiches publiées',
    (SELECT count(*) FROM public.commercants_public)::text || ' / ' || (SELECT count(*) FROM public.commercants WHERE statut_publication = 'publie')::text,
    'deux nombres égaux'
) t ORDER BY n;
