-- L ORDRE DES CATEGORIES DU CATALOGUE, CHOISI PAR LE COMMERCANT (17/09)
--
-- POURQUOI. Il n existe pas de table des categories : c est un champ texte sur
-- chaque article, et l ordre affiche est celui d apparition des articles. Un
-- restaurateur ne peut donc pas mettre ses plats avant ses boissons.
--
-- LE CHOIX, valide par Alex : une LISTE ORDONNEE DE NOMS sur le commercant.
-- Pas de table, pas de jointure, pas de reprise de donnees. Les categories
-- nommees passent en premier dans cet ordre ; les autres suivent, comme
-- aujourd hui. Un commercant qui n y touche jamais ne voit aucun changement.
--
-- ⚠️ CE QU ON NE FAIT PAS, ET IL FAUT LE DIRE. `commercants_public` n a PAS
-- `security_invoker` : elle s execute avec les droits de son proprietaire et
-- contourne la RLS de `commercants`, son `WHERE statut_publication = 'publie'`
-- etant sa seule protection. On NE L AJOUTE PAS ici : `anon` n a aucun droit de
-- lecture directe sur `commercants`, la vue rendrait donc VIDE et toute
-- l application tomberait. C est un sujet a traiter a part, jamais en passant.
--
-- ⚠️ `CREATE OR REPLACE VIEW` N EST PAS `DROP` PUIS `CREATE` : les droits deja
-- poses survivent, et on ne peut AJOUTER des colonnes qu a la fin. C est
-- exactement ce qu on fait, les 59 existantes ne bougent pas d une ligne.
--
-- ⚠️ ET ON NE TOUCHE PAS AU `WHERE`. Il est la seule protection de cette vue.

BEGIN;

-- ─── 1. LA COLONNE ─────────────────────────────────────────────────────────
-- `text[]` et non `jsonb` : c est une liste de noms, Postgres sait l ordonner
-- et PostgREST la rend telle quelle au client, sans analyse.
--
-- ⚠️ ELLE RESTE NULLE PAR DEFAUT, et ce n est pas un oubli. NULL veut dire
-- « je n ai rien range », et c est different d une liste VIDE qui voudrait dire
-- « je veux zero categorie devant ». La regle d affichage lit les deux pareil
-- aujourd hui, mais le jour ou elles divergeront, la base saura les distinguer.
ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS ordre_categories text[];

COMMENT ON COLUMN public.commercants.ordre_categories IS
  'Noms de categories d articles, dans l ordre voulu par le commercant. Les categories absentes de cette liste suivent, dans leur ordre d apparition. NULL = rien range.';

-- ─── 2. LES DROITS, REPLIQUES DEPUIS UNE COLONNE DEJA EN PLACE ─────────────
-- ⚠️ ON NE DEVINE PAS LES DROITS, ON LES RECOPIE. Si des droits COLONNE ont ete
-- poses sur cette table, une colonne neuve n en herite pas et devient
-- invisible pour `anon` sans que rien ne le signale. On replique donc ceux de
-- `nom`, colonne publique s il en est.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT grantee, privilege_type
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'commercants'
       AND column_name = 'nom' AND grantee IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('GRANT %s (ordre_categories) ON public.commercants TO %I',
                   r.privilege_type, r.grantee);
  END LOOP;
END $$;

-- ─── 3. LA VUE PUBLIQUE, AVEC LA COLONNE EN PLUS ───────────────────────────
-- Les 59 colonnes dans leur ordre exact, puis la nouvelle en 60e.
CREATE OR REPLACE VIEW public.commercants_public AS
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
    essai_plan,
    rdv_horizon_jours,
    commande_actif,
    rdv_cadence_couverts,
    rdv_empreinte_actif,
    rdv_empreinte_seuil_couverts,
    rdv_empreinte_par_personne,
    ordre_categories
   FROM commercants
  WHERE statut_publication = 'publie'::text;

-- ⚠️ LES DROITS SURVIVENT A UN `CREATE OR REPLACE`, mais on les repose quand
-- meme : une vue publique muette pour `anon` vide l application entiere, et
-- cette ligne coute moins cher que ce silence-la.
GRANT SELECT ON public.commercants_public TO anon, authenticated;

-- 🔴 ET ON REFERME L ECRITURE, EXPLICITEMENT. Une vue naît MODIFIABLE, et sans
-- `security_invoker` — ce qui est le cas de celle-ci — une ecriture ignorerait
-- la RLS de `commercants` : n importe qui pourrait changer la fiche de
-- n importe quel commercant. C est le defaut trouve en juillet sur quatre vues
-- publiques d un coup.
--
-- ⚠️ ICI RIEN N ETAIT OUVERT (le controle H le dit), et ce REVOKE ne change
-- donc rien AUJOURD HUI. Il est la pour DEMAIN : le jour ou quelqu un rejouera
-- ce fichier sur une base ou les droits different, ou remplacera ce
-- `CREATE OR REPLACE` par un `DROP` puis `CREATE`, la vue renaitrait
-- modifiable et personne ne le verrait.
--
-- ⚠️ LES DEUX ROLES, PAS SEULEMENT `anon` : fermer a l un en laissant l autre
-- ouvert est exactement ce qui restait sur cette vue-ci apres sa recreation.
REVOKE INSERT, UPDATE, DELETE ON public.commercants_public FROM anon, authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTROLE
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'A. la colonne existe sur commercants'::text AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'ordre_categories'), 'ABSENTE') AS valeur,
       'ARRAY'::text AS attendu
UNION ALL
SELECT 'B. elle accepte NULL (rien range)'::text,
       coalesce((SELECT is_nullable FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'ordre_categories'), 'ABSENTE'),
       'YES'::text
UNION ALL
SELECT 'C. la vue expose la colonne'::text,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                          WHERE table_schema = 'public' AND table_name = 'commercants_public'
                            AND column_name = 'ordre_categories')
            THEN 'oui' ELSE 'NON' END,
       'oui'::text
UNION ALL
-- 🔴 LE CONTROLE QUI COMPTE VRAIMENT : on n a perdu aucune colonne en recreant.
SELECT 'D. colonnes de la vue, avant 59'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'),
       '60 : les 59 d origine, plus la nouvelle'::text
UNION ALL
SELECT 'E. la vue filtre toujours sur les fiches publiees'::text,
       CASE WHEN pg_get_viewdef('public.commercants_public'::regclass, true)
                 LIKE '%statut_publication = ''publie''%'
            THEN 'oui' ELSE 'NON' END,
       'oui : ce WHERE est la seule protection de cette vue'::text
UNION ALL
SELECT 'F. anon et authenticated lisent toujours la vue'::text,
       coalesce((SELECT string_agg(DISTINCT grantee, ' · ' ORDER BY grantee)
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'
                    AND privilege_type = 'SELECT'
                    AND grantee IN ('anon', 'authenticated')), '(AUCUN)'),
       'anon · authenticated'::text
UNION ALL
SELECT 'G. la colonne est lisible par anon sur la table'::text,
       coalesce((SELECT string_agg(DISTINCT grantee, ' · ' ORDER BY grantee)
                   FROM information_schema.column_privileges
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'ordre_categories' AND privilege_type = 'SELECT'
                    AND grantee IN ('anon', 'authenticated')), '(droits de table, pas de droits colonne)'),
       'les memes que la colonne « nom »'::text
UNION ALL
SELECT 'H. personne n a gagne le droit d ECRIRE la vue'::text,
       coalesce((SELECT string_agg(DISTINCT grantee || ':' || privilege_type, ' · ')
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND table_name = 'commercants_public'
                    AND privilege_type <> 'SELECT'
                    AND grantee IN ('anon', 'authenticated')), '(aucun)'),
       '(aucun) : une vue sans security_invoker qui serait ecrivable ignorerait la RLS'::text;
