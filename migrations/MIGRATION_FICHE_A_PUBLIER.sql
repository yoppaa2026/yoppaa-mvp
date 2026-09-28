-- VALIDER N'EST PLUS PUBLIER (28/09/2026)
--
-- « Les commerçants ne complètent pas leurs fiches, je ne peux pas laisser les
-- fiches non complétées être publiées. » (Alex)
--
-- Valider un dossier ouvrait le tableau de bord ET publiait la fiche d'un seul
-- geste, alors que le catalogue, les photos et l'encaissement ne se remplissent
-- QUE depuis le tableau de bord. Désormais :
--   1. Alex valide : l'espace s'ouvre, la fiche reste invisible ;
--   2. le commerçant complète sa fiche (règle : lib/fiche-complete.js) ;
--   3. il demande la mise en ligne ;
--   4. Alex clique sur « Publier ».
-- Et Alex peut relancer par email, depuis l'admin, ceux qui n'avancent pas.
--
-- CE QUE FAIT CETTE MIGRATION : trois colonnes sur `commercants`, rien d'autre.
--   • `publication_demandee_at` : le commerçant a demandé sa mise en ligne ;
--   • `relance_fiche_envoyee_at` : la dernière relance envoyée par Alex ;
--   • `relances_fiche_nb` : combien de relances en tout.
-- Toutes trois sont écrites par des routes serveur (clé de service), après
-- vérification de l'appelant.
--
-- ⚠️ CE QUI N'EST PAS FAIT, ET POURQUOI. Ces colonnes ne sont PAS ajoutées au
-- déclencheur `commercants_colonnes_reservees`. Un commerçant qui les écrirait
-- depuis son navigateur ne gagnerait rien : la publication reste interdite
-- par ce même déclencheur (`statut_publication`), et la route « Publier »
-- RECALCULE la fiche avant de publier. Réécrire un déclencheur de sécurité
-- pendant l'examen Play, pour un risque nul, serait le vrai risque.
--
-- Idempotent. Une seule transaction.

BEGIN;

ALTER TABLE public.commercants
  ADD COLUMN IF NOT EXISTS publication_demandee_at timestamptz,
  ADD COLUMN IF NOT EXISTS relance_fiche_envoyee_at timestamptz,
  ADD COLUMN IF NOT EXISTS relances_fiche_nb integer NOT NULL DEFAULT 0;

ALTER TABLE public.commercants DROP CONSTRAINT IF EXISTS commercants_relances_fiche_nb_check;
ALTER TABLE public.commercants
  ADD CONSTRAINT commercants_relances_fiche_nb_check CHECK (relances_fiche_nb >= 0);

COMMENT ON COLUMN public.commercants.publication_demandee_at IS
  'Le commercant a demande la mise en ligne de sa fiche, complete selon lib/fiche-complete.js. Remis a NULL a la publication.';
COMMENT ON COLUMN public.commercants.relance_fiche_envoyee_at IS
  'Derniere relance envoyee par Yoppaa pour une fiche validee mais incomplete.';
COMMENT ON COLUMN public.commercants.relances_fiche_nb IS
  'Nombre de relances envoyees pour une fiche validee mais incomplete.';

-- Les colonnes héritent des droits de la table ; on le rend EXPLICITE : le
-- jour où des droits par colonne apparaîtraient, l'oubli serait muet. Le
-- commerçant les LIT (son tableau de bord charge sa propre ligne) ; il n'a
-- rien à y écrire, mais on ne retire pas ici un droit de table qu'on ne
-- connaît pas.
GRANT SELECT (publication_demandee_at, relance_fiche_envoyee_at, relances_fiche_nb)
  ON public.commercants TO authenticated;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, la valeur ET l'attendu ─────────
SELECT 'A1' AS n, 'colonne publication_demandee_at' AS controle,
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'publication_demandee_at'), 'ABSENTE') AS valeur,
       'timestamp with time zone' AS attendu
UNION ALL
SELECT 'A2', 'colonne relance_fiche_envoyee_at',
       coalesce((SELECT data_type FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'relance_fiche_envoyee_at'), 'ABSENTE'),
       'timestamp with time zone'
UNION ALL
SELECT 'A3', 'colonne relances_fiche_nb : type, obligatoire, defaut',
       coalesce((SELECT data_type || ' / ' || is_nullable || ' / ' || coalesce(column_default, 'aucun')
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name = 'relances_fiche_nb'), 'ABSENTE'),
       'integer / NO / 0'
UNION ALL
SELECT 'A4', 'relances_fiche_nb : jamais negatif',
       (SELECT count(*)::text FROM pg_constraint
         WHERE conrelid = 'public.commercants'::regclass
           AND conname = 'commercants_relances_fiche_nb_check'),
       '1'
UNION ALL
SELECT 'A5', 'authenticated lit les trois colonnes',
       (has_column_privilege('authenticated', 'public.commercants', 'publication_demandee_at', 'SELECT')
        AND has_column_privilege('authenticated', 'public.commercants', 'relance_fiche_envoyee_at', 'SELECT')
        AND has_column_privilege('authenticated', 'public.commercants', 'relances_fiche_nb', 'SELECT'))::text,
       'true'
UNION ALL
SELECT 'A6', 'la vue publique n expose aucune des trois',
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name IN ('publication_demandee_at', 'relance_fiche_envoyee_at', 'relances_fiche_nb')),
       '0'
UNION ALL
SELECT 'A7', 'le verrou de publication est toujours en place',
       (SELECT count(*)::text FROM pg_trigger
         WHERE tgrelid = 'public.commercants'::regclass
           AND tgname = 'trg_commercants_colonnes_reservees' AND NOT tgisinternal),
       '1'
UNION ALL
-- Le journal de l'admin va recevoir une nouvelle action, « publie ». S'il
-- porte une contrainte sur ses valeurs, elle doit l'admettre.
SELECT 'B1', 'admin_validations : contrainte sur action',
       coalesce((SELECT string_agg(pg_get_constraintdef(oid), ' | ')
                   FROM pg_constraint
                  WHERE conrelid = 'public.admin_validations'::regclass AND contype = 'c'), 'aucune'),
       'aucune, ou une liste qui contient publie'
UNION ALL
-- Des NOMBRES seulement, aucune donnée personnelle : combien de fiches
-- validées se trouvent dans chaque état de publication. C'est ce qui dit où
-- sont les fiches qu'Alex a retirées lui-même.
SELECT 'C' || row_number() OVER (ORDER BY statut, statut_publication),
       'fiches validees : statut ' || coalesce(statut, 'NULL') || ', publication ' || coalesce(statut_publication, 'NULL'),
       count(*)::text,
       'pour information'
  FROM public.commercants
 WHERE statut IN ('valide', 'actif')
 GROUP BY statut, statut_publication
ORDER BY 1;
