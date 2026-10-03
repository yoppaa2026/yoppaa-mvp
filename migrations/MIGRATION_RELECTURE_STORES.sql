-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION_RELECTURE_STORES.sql (03/10)
-- LE TROISIÈME ÉTAT DE PUBLICATION : RÉSERVÉ À LA VÉRIFICATION DES STORES
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 POURQUOI (décision d'Alex, 03/10). Les relecteurs d'Apple et de Google
-- commandent chez « Chez Momo » et réservent chez « Salon Nathalie », deux
-- commerces de démonstration. Ils y reviennent à chaque mise à jour, et Google
-- revérifie parfois une app déjà publiée. Le public, lui, ne doit JAMAIS voir
-- ces démos : un habitant qui commande chez un commerce qui n'existe pas.
--
-- Une fiche en `relecture` n'est visible que des comptes inscrits dans
-- `comptes_relecture`, par IDENTIFIANT de compte (jamais par adresse : un
-- inconnu pourrait créer un compte avec une adresse prévue avant nous).
--
-- ⚠️ CETTE MIGRATION N'ACTIVE RIEN. La liste naît vide et aucune fiche ne
-- porte encore `relecture` : pour le public comme pour les relecteurs, rien
-- ne change. L'activation (remplir la liste, passer les démos en relecture)
-- est un fichier séparé, APRÈS les deux approbations des stores.
--
-- Ce qui change : les TROIS verrous de lecture de la base apprennent la
-- valeur `relecture`, pour les seuls comptes de la liste.
--   • la vue `commercants_public` (la fiche, la liste, la recherche) ;
--   • `commerces_publies()` (agenda, actus, deals, photos) ;
--   • `commerce_lisible()` (catalogue, créneaux, lieux…).
-- Le serveur fait le même tri pour ce qui s'écrit : lib/relecture-serveur.js.
--
-- ⚠️ LA VUE EST REFAITE SUR SA DÉFINITION VIVANTE ET NULLE AUTRE. La migration
-- REFUSE de s'appliquer si la vue n'a pas exactement les 60 colonnes
-- attendues, dans l'ordre, ou si son filtre n'est plus celui des fiches
-- publiées : elle nomme alors ce qu'elle a trouvé, et rien n'est changé.
-- Ses options (posées en base sans que le dépôt le sache) sont notées avant
-- et reposées après, `CREATE OR REPLACE VIEW` les effaçant.
--
-- Tout tient dans UNE transaction. Le contrôle suit, une ligne par point.

BEGIN;

-- ─── 0. Les options de la vue, AVANT ──────────────────────────────────────
DROP TABLE IF EXISTS pg_temp.vue_avant_relecture;
CREATE TEMP TABLE vue_avant_relecture AS
SELECT reloptions AS options FROM pg_class WHERE oid = 'public.commercants_public'::regclass;

-- ─── 1. La liste des comptes de vérification ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.comptes_relecture (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comptes_relecture IS
  'Comptes qui voient les fiches en statut_publication = relecture (demos des relecteurs Apple et Google, comptes d Alex). Par identifiant de compte, jamais par adresse.';

-- 🔴 PERSONNE NE LA LIT DEPUIS LE NAVIGATEUR. RLS active et AUCUNE policy :
-- ni `anon` ni `authenticated` n'y voient une ligne. Seules la fonction
-- ci-dessous (SECURITY DEFINER) et la clé de service la consultent.
ALTER TABLE public.comptes_relecture ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comptes_relecture FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comptes_relecture TO service_role;

-- ─── 2. La question « ce compte est-il un relecteur ? » ──────────────────
-- Sans compte (`auth.uid()` vide), la réponse est non.
CREATE OR REPLACE FUNCTION public.est_compte_relecture()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.comptes_relecture WHERE user_id = auth.uid())
$$;

REVOKE ALL ON FUNCTION public.est_compte_relecture() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_compte_relecture() TO anon, authenticated, service_role;

-- ─── 3. Agenda, actus, deals, photos ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.commerces_publies()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM commercants
   WHERE statut_publication = 'publie'
      OR (statut_publication = 'relecture' AND public.est_compte_relecture())
$$;

GRANT EXECUTE ON FUNCTION public.commerces_publies() TO anon, authenticated;

-- ─── 4. Catalogue, créneaux, lieux ───────────────────────────────────────
-- ⚠️ LE PROPRIÉTAIRE ET L'ADMIN GARDENT LEUR ACCÈS, à l'identique.
CREATE OR REPLACE FUNCTION public.commerce_lisible(cid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.commercants c
    WHERE c.id = cid
      AND (c.statut_publication = 'publie'
           OR c.auth_user_id = auth.uid()
           OR (c.statut_publication = 'relecture' AND public.est_compte_relecture()))
  ) OR COALESCE(public.is_yoppaa_admin(), false)
$$;

GRANT EXECUTE ON FUNCTION public.commerce_lisible(uuid) TO anon, authenticated;

-- ─── 5. La vue publique, sur la définition vivante et nulle autre ────────
DO $$
DECLARE
  attendu text := 'id,nom,type,telephone,created_at,adresse,latitude,longitude,horaires,description,infos_pratiques,logo_url,heure_ouverture_resa,horaires_detail,slug,horizon_commande,mode_capacite,statut_publication,plan,heure_limite_morning,est_service,categorie,rdv_actif,rdv_acompte_global,rdv_delai_annulation_heures,rdv_paiement_cash,rdv_paiement_ligne,rdv_message_confirmation,stripe_account_charges_enabled,stripe_account_details_submitted,stripe_account_payouts_enabled,rdv_acompte_en_ligne_actif,livraison_actif,accepte_paiement_cash,fidelite_actif,notif_mode,delai_annulation_heures,photos_catalogue_actif,boutique_mode_vente,boutique_retrait_paiement,boutique_frais_port,boutique_gratuit_des,boutique_expedition_cp,fidelite_mecanique,fidelite_seuil_passages,fidelite_taux_cagnotte,fidelite_seuil_cagnotte,fidelite_recompense_type,fidelite_recompense_valeur,fidelite_recompense_libelle,boutique_delai_heures,bons_cadeaux_actif,essai_plan,rdv_horizon_jours,commande_actif,rdv_cadence_couverts,rdv_empreinte_actif,rdv_empreinte_seuil_couverts,rdv_empreinte_par_personne,ordre_categories';
  vivant text;
  filtre text;
BEGIN
  SELECT string_agg(column_name::text, ',' ORDER BY ordinal_position) INTO vivant
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants_public';
  IF vivant IS DISTINCT FROM attendu THEN
    RAISE EXCEPTION 'VUE_DERIVEE : commercants_public n a pas les 60 colonnes attendues, rien n a ete change. Colonnes vivantes : %', coalesce(vivant, 'VUE ABSENTE');
  END IF;
  filtre := regexp_replace(lower(coalesce(substring(pg_get_viewdef('public.commercants_public'::regclass, true) from 'WHERE(.*)$'), '')),
                           '[[:space:]();]|commercants\.|::text', '', 'g');
  -- Rejouée, la vue porte déjà la relecture : c'est la même.
  IF filtre IS DISTINCT FROM 'statut_publication=''publie''' AND filtre NOT LIKE '%relecture%' THEN
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
    rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne, ordre_categories
   FROM commercants
  WHERE statut_publication = 'publie'::text
     OR (statut_publication = 'relecture'::text AND public.est_compte_relecture());

DO $$
DECLARE
  opts text[];
BEGIN
  SELECT options INTO opts FROM pg_temp.vue_avant_relecture LIMIT 1;
  IF opts IS NOT NULL AND array_length(opts, 1) > 0 THEN
    EXECUTE format('ALTER VIEW public.commercants_public SET (%s)', array_to_string(opts, ', '));
  END IF;
END
$$;

-- ⚠️ UNE VUE NAÎT MODIFIABLE, et sans `security_invoker` l'écriture contourne
-- la RLS (la faille du 27/08). Lecture seule, par les droits, pour les DEUX
-- rôles.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON public.commercants_public TO anon, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par point, valeur ET attendu
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'A. la liste des comptes existe'::text AS controle,
       CASE WHEN to_regclass('public.comptes_relecture') IS NOT NULL THEN 'oui' ELSE 'NON' END AS valeur,
       'oui'::text AS attendu
UNION ALL
SELECT 'B. sa RLS est active',
       CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.comptes_relecture'::regclass) THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'C. droits de anon et authenticated sur la liste',
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND table_name = 'comptes_relecture'
           AND grantee IN ('anon', 'authenticated')),
       '0'
UNION ALL
SELECT 'D. policies de la liste (nom:permissive)',
       coalesce((SELECT string_agg(policyname || ':' || permissive, ', ')
                   FROM pg_policies WHERE schemaname = 'public' AND tablename = 'comptes_relecture'), 'aucune'),
       'aucune'
UNION ALL
SELECT 'E. la question du relecteur tourne avec les droits du proprietaire',
       CASE WHEN (SELECT prosecdef FROM pg_proc WHERE oid = 'public.est_compte_relecture()'::regprocedure) THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'F. sans compte (ici, l editeur SQL), personne n est relecteur',
       public.est_compte_relecture()::text,
       'false'
UNION ALL
SELECT 'G. commerces_publies connait la relecture',
       CASE WHEN pg_get_functiondef('public.commerces_publies()'::regprocedure) LIKE '%relecture%est_compte_relecture%' THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'H. commerce_lisible connait la relecture et garde proprietaire et admin',
       CASE WHEN pg_get_functiondef('public.commerce_lisible(uuid)'::regprocedure) LIKE '%auth_user_id = auth.uid()%relecture%est_compte_relecture%is_yoppaa_admin%' THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'I. colonnes de la vue',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'),
       '60'
UNION ALL
SELECT 'J. le filtre de la vue connait la relecture',
       CASE WHEN pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%relecture%est_compte_relecture%' THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'K. droits d ecriture sur la vue pour anon et authenticated',
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND grantee IN ('anon', 'authenticated')
           AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')),
       '0'
UNION ALL
SELECT 'L. lecture de la vue pour anon et authenticated',
       (SELECT count(*)::text FROM information_schema.table_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND grantee IN ('anon', 'authenticated') AND privilege_type = 'SELECT'),
       '2'
UNION ALL
SELECT 'M. options de la vue reposees a l identique',
       CASE WHEN (SELECT reloptions FROM pg_class WHERE oid = 'public.commercants_public'::regclass)
                 IS NOT DISTINCT FROM (SELECT options FROM pg_temp.vue_avant_relecture LIMIT 1)
            THEN 'oui' ELSE 'NON' END,
       'oui'
UNION ALL
SELECT 'N. sans compte, la vue rend exactement les fiches publiees',
       (SELECT count(*)::text FROM public.commercants_public) || ' = '
         || (SELECT count(*)::text FROM public.commercants WHERE statut_publication = 'publie'),
       'deux nombres egaux'
UNION ALL
SELECT 'O. fiches deja en relecture (activation pas encore faite)',
       (SELECT count(*)::text FROM public.commercants WHERE statut_publication = 'relecture'),
       '0'
UNION ALL
SELECT 'P. contraintes CHECK sur statut_publication',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.commercants'::regclass AND contype = 'c'
           AND pg_get_constraintdef(oid) LIKE '%statut_publication%'),
       '0 (sinon, me le dire : la valeur relecture serait refusee)'
UNION ALL
SELECT 'Q. comptes dans la liste (activation pas encore faite)',
       (SELECT count(*)::text FROM public.comptes_relecture),
       '0';
