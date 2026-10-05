-- ════════════════════════════════════════════════════════════════════════════
-- Le référentiel officiel des adresses wallonnes (BeSt Address), dans la base
-- Chantier zone de livraison, 05/10
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. Pour décider si un commerce livre à une adresse, il faut savoir où
-- elle est. Nominatim interdit cet usage (et on l'appelait depuis le navigateur
-- à chaque frappe). Le SPF BOSA publie toutes les adresses wallonnes avec leurs
-- coordonnées, CC BY 4.0, chaque semaine. On les range ici, et plus aucun
-- service extérieur n'est appelé pour situer un client.
--
-- DEUX TABLES, remplies par `scripts/import-best-adresses.mjs` (lancé par Alex) :
--   • `best_rues`     : une ligne par (rue, code postal), ~58 000. Sert à la
--                       recherche : le client tape son code postal, puis sa rue.
--   • `best_adresses` : une ligne par MAISON (rue, code postal, numéro),
--                       ~1,6 million. Sert à situer la porte. Les boîtes d'un
--                       même immeuble partagent un numéro : une seule ligne.
--                       `origine_position` dit si la position vient du fichier ou a
--                       été estimée par les numéros voisins.
--
-- ⚠️ PERSONNE NE LIT CES TABLES DEPUIS UN NAVIGATEUR. Elles ne contiennent
-- aucune donnée personnelle (ce sont des adresses publiques, sans habitants),
-- mais un accès direct permettrait d'aspirer la liste entière à nos frais. RLS
-- active SANS AUCUNE policy, droits retirés à `anon` et `authenticated` : seul
-- le serveur (clé de service) lit, par des routes limitées en débit.
--
-- ⚠️ LA MISE À JOUR NE SUPPRIME QU'APRÈS UN IMPORT COMPLET. Chaque ligne porte
-- `import_le`, l'instant de l'import qui l'a écrite ; le script n'efface les
-- lignes plus anciennes qu'une fois TOUT écrit sans erreur. Un import coupé au
-- milieu laisse l'ancien référentiel en place.
--
-- Taille attendue : ~200 Mo index compris (forfait PRO, confirmé par Alex).
-- Date : 2026-10-05
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.best_rues (
  rue_id        bigint      NOT NULL,
  code_postal   text        NOT NULL,
  nom           text        NOT NULL,
  nom_recherche text        NOT NULL,
  localite      text,
  commune       text,
  -- Centre de la rue : la moyenne de ses maisons. Pour information, jamais
  -- pour décider d'une livraison (la décision se prend à la maison).
  lat           double precision,
  lng           double precision,
  nb_maisons    integer     NOT NULL DEFAULT 0,
  import_le     timestamptz NOT NULL,
  PRIMARY KEY (rue_id, code_postal)
);

CREATE INDEX IF NOT EXISTS idx_best_rues_code_postal ON public.best_rues (code_postal);

CREATE TABLE IF NOT EXISTS public.best_adresses (
  rue_id      bigint           NOT NULL,
  code_postal text             NOT NULL,
  numero      text             NOT NULL,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  -- 'officielle' : la position du fichier. 'voisins' : le fichier n'en donne
  -- pas (104 304 maisons), estimée par les numéros voisins de la même rue
  -- (décision d'Alex, 05/10 ; règle : `estimerPositions`, lib/best-adresse.js).
  origine_position text        NOT NULL
    CONSTRAINT best_adresses_origine_position_check CHECK (origine_position IN ('officielle', 'voisins')),
  import_le   timestamptz      NOT NULL,
  PRIMARY KEY (rue_id, code_postal, numero)
);

COMMENT ON TABLE public.best_rues IS
  'Rues wallonnes (BeSt Address, SPF BOSA, CC BY 4.0). Rempli par scripts/import-best-adresses.mjs. Lu par le serveur seulement.';
COMMENT ON TABLE public.best_adresses IS
  'Une ligne par maison wallonne (rue, code postal, numéro) avec ses coordonnées. BeSt Address, CC BY 4.0. Lu par le serveur seulement.';

ALTER TABLE public.best_rues     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.best_adresses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.best_rues     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.best_adresses FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.best_rues     TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.best_adresses TO service_role;

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'tables creees' AS controle,
         (SELECT string_agg(relname, ', ' ORDER BY relname) FROM pg_class
           WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
             AND relname IN ('best_rues', 'best_adresses'))::text AS valeur,
         'best_adresses, best_rues' AS attendu
  UNION ALL SELECT 2, 'RLS active sur les deux',
         (SELECT string_agg(relname || ':' || relrowsecurity::text, ', ' ORDER BY relname) FROM pg_class
           WHERE relnamespace = 'public'::regnamespace AND relname IN ('best_rues', 'best_adresses'))::text,
         'best_adresses:true, best_rues:true'
  UNION ALL SELECT 3, '🔴 aucune policy (donc aucun acces navigateur)',
         (SELECT COALESCE(string_agg(tablename || '.' || policyname || ':' || cmd || ':' || permissive, ', '), 'AUCUNE')
            FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('best_rues', 'best_adresses'))::text,
         'AUCUNE'
  UNION ALL SELECT 4, '🔴 anon et authenticated ne lisent pas',
         (CASE WHEN has_table_privilege('anon', 'public.best_rues', 'SELECT')
                 OR has_table_privilege('anon', 'public.best_adresses', 'SELECT')
                 OR has_table_privilege('authenticated', 'public.best_rues', 'SELECT')
                 OR has_table_privilege('authenticated', 'public.best_adresses', 'SELECT')
               THEN 'OUVERT' ELSE 'ferme' END)::text,
         'ferme'
  UNION ALL SELECT 5, 'le serveur ecrit',
         (CASE WHEN has_table_privilege('service_role', 'public.best_adresses', 'INSERT')
                AND has_table_privilege('service_role', 'public.best_rues', 'INSERT')
               THEN 'oui' ELSE 'NON' END)::text,
         'oui'
  UNION ALL SELECT 6, 'cles primaires',
         (SELECT string_agg(conname, ', ' ORDER BY conname) FROM pg_constraint
           WHERE contype = 'p' AND conrelid IN ('public.best_rues'::regclass, 'public.best_adresses'::regclass))::text,
         'best_adresses_pkey, best_rues_pkey'
  UNION ALL SELECT 7, 'colonne origine_position et sa contrainte',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.best_adresses'::regclass AND conname = 'best_adresses_origine_position_check')::text,
         'CHECK ((origine_position = ANY (ARRAY[''officielle''::text, ''voisins''::text])))'
  UNION ALL SELECT 8, 'lignes deja presentes (pour information, 0 avant le premier import)',
         ((SELECT count(*) FROM public.best_rues)::text || ' rues, '
           || (SELECT count(*) FROM public.best_adresses)::text || ' maisons'),
         '0 rues, 0 maisons avant import'
) t ORDER BY n;
