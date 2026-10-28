-- LE SIÈGE SOCIAL QUITTE LA VUE PUBLIQUE (28/10, décision d'Alex au tableau).
--
-- 🔴 POURQUOI. `commercants_public` donnait à n'importe qui (la clé publique du
-- site suffit) l'adresse du SIÈGE SOCIAL de chaque commerce publié, et sa
-- position GPS. Le siège ne se publie jamais (Alex, 15/08) : pour un
-- indépendant inscrit chez lui, c'est son domicile. Lecture du 28/10 : en
-- PROD, 2 des 4 commerces publiés avaient un siège qui n'est pas leur magasin.
-- La table elle-même est fermée par ses règles de lecture (sa propre ligne, ou
-- admin) : la vue, qui lit avec les droits de son propriétaire, était la
-- SEULE porte.
--
-- ⚠️ À LANCER APRÈS LA MISE EN PROD DU CODE (commit « le siège ne sort plus »).
-- Exception VOULUE à la règle « le SQL avant le code » : l'ancien code du Good
-- Morning DEMANDAIT `adresse` à la vue, et une colonne demandée qui n'existe
-- plus fait échouer toute la requête. Le nouveau code ne la demande plus.
-- Ordre : TEST, puis PROD.
--
-- ⚠️ `CREATE OR REPLACE VIEW` NE RETIRE PAS DE COLONNE : il faut DROP + CREATE,
-- dans UNE transaction. Sans CASCADE : si un objet dépend de la vue, le DROP
-- échoue et RIEN ne change.
--
-- Rien d'autre ne bouge : mêmes colonnes moins `adresse, latitude, longitude`,
-- même filtre (publiés + relecture des stores), mêmes droits (lecture seule).

BEGIN;

-- La vue n'a aucune option aujourd'hui (lecture du 28/10, ligne 5) : elle lit
-- avec les droits de son propriétaire, et c'est voulu, la table étant fermée
-- aux visiteurs. Si ce n'est plus le cas, on s'arrête : il faudrait les
-- reporter sur la nouvelle vue.
DO $$
BEGIN
  IF (SELECT reloptions FROM pg_class WHERE oid = 'public.commercants_public'::regclass) IS NOT NULL THEN
    RAISE EXCEPTION 'La vue a des options (%), à reporter avant de la recréer.',
      (SELECT reloptions FROM pg_class WHERE oid = 'public.commercants_public'::regclass);
  END IF;
END
$$;

-- ⚠️ LA VUE VIVANTE DOIT ÊTRE CELLE QU'ON CROIT (62 colonnes, 21/10). Une
-- colonne ajoutée depuis, absente de la liste ci-dessous, disparaîtrait EN
-- SILENCE : on s'arrête plutôt.
DO $$
DECLARE
  n int;
  vivant text;
BEGIN
  SELECT count(*), string_agg(column_name::text, ', ' ORDER BY ordinal_position) INTO n, vivant
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public';
  IF n <> 62 THEN
    RAISE EXCEPTION 'VUE_DERIVEE : commercants_public n a pas les 62 colonnes attendues (%), rien n a ete change. Colonnes vivantes : %', n, coalesce(vivant, 'VUE ABSENTE');
  END IF;
END
$$;

DROP VIEW public.commercants_public;

CREATE VIEW public.commercants_public AS
 SELECT id, nom, type, telephone, created_at,
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
    commande_veille_avant, boutique_horizon_jours
   FROM commercants
  WHERE statut_publication = 'publie'::text
     OR (statut_publication = 'relecture'::text AND public.est_compte_relecture());

-- ⚠️ UNE VUE NAÎT MODIFIABLE (droits par défaut de Supabase) : lecture seule.
REVOKE ALL ON public.commercants_public FROM anon, authenticated;
GRANT SELECT ON public.commercants_public TO anon, authenticated;

-- La ceinture (Alex, 28/10) : les visiteurs perdent aussi le droit de lire ces
-- trois colonnes dans la table. Les règles de lecture les en empêchent déjà ;
-- ceci tient même si quelqu'un ouvre un jour la table aux visiteurs.
-- `authenticated` garde le sien : le commerçant lit SA ligne (son siège) dans
-- son tableau de bord, et les règles ne lui montrent que la sienne.
REVOKE SELECT (adresse, latitude, longitude) ON public.commercants FROM anon;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'S1. la vue ne donne plus le siège' AS controle,
    coalesce((SELECT string_agg(column_name::text, ', ') FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'commercants_public'
                AND column_name IN ('adresse', 'latitude', 'longitude')), 'aucune')::text AS valeur,
    'aucune' AS attendu
  UNION ALL
  SELECT 2, 'S2. la vue a 59 colonnes (62 moins 3)',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'commercants_public'),
    '59'
  UNION ALL
  SELECT 3, 'S3. le filtre garde la relecture des stores',
    (pg_get_viewdef('public.commercants_public'::regclass, true) LIKE '%est_compte_relecture%')::text, 'true'
  UNION ALL
  SELECT 4, 'S4. la vue est toujours sans option (droits du propriétaire)',
    coalesce((SELECT array_to_string(reloptions, ',') FROM pg_class WHERE oid = 'public.commercants_public'::regclass), 'aucune option'),
    'aucune option'
  UNION ALL
  SELECT 5, 'S5. anon lit la vue',
    has_table_privilege('anon', 'public.commercants_public', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 6, 'S6. anon ne peut PAS écrire dans la vue',
    (has_table_privilege('anon', 'public.commercants_public', 'INSERT')
     OR has_table_privilege('anon', 'public.commercants_public', 'UPDATE')
     OR has_table_privilege('anon', 'public.commercants_public', 'DELETE'))::text, 'false'
  UNION ALL
  SELECT 7, 'S7. authenticated ne peut PAS écrire dans la vue',
    (has_table_privilege('authenticated', 'public.commercants_public', 'INSERT')
     OR has_table_privilege('authenticated', 'public.commercants_public', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.commercants_public', 'DELETE'))::text, 'false'
  UNION ALL
  SELECT 8, 'S8. anon ne lit plus le siège dans la table',
    (has_column_privilege('anon', 'public.commercants', 'adresse', 'SELECT')
     OR has_column_privilege('anon', 'public.commercants', 'latitude', 'SELECT')
     OR has_column_privilege('anon', 'public.commercants', 'longitude', 'SELECT'))::text, 'false'
  UNION ALL
  SELECT 9, 'S9. le commerçant connecté lit toujours SON siège',
    has_column_privilege('authenticated', 'public.commercants', 'adresse', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 10, 'S10. les commerces publiés sont toujours visibles par la vue',
    ((SELECT count(*) FROM public.commercants_public) = (SELECT count(*) FROM public.commercants WHERE statut_publication = 'publie'))::text,
    'true'
) t ORDER BY n;
