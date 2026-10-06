-- ════════════════════════════════════════════════════════════════════════════
-- BeSt : situer le Yopper sans Nominatim (localités + maison la plus proche)
-- Chantier « Nominatim côté Yopper », 06/10
-- ════════════════════════════════════════════════════════════════════════════
--
-- POURQUOI (Alex, 05-06/10 : « supprimer Nominatim »). Trois appels partaient
-- encore DU TÉLÉPHONE du Yopper vers OpenStreetMap : sa position GPS précise
-- (rue affichée à l'accueil, commune proposée) et la localité qu'il tape. Ils
-- passent sur notre référentiel :
--
--   • `idx_best_adresses_lat_lng` : trouver la maison la plus proche d'une
--     position sans relire 1,6 million de lignes (route /api/adresse/proche).
--   • `best_localites` : une ligne par (code postal, localité), 1 885 en Wallonie, avec
--     sa position moyenne pondérée par le nombre de maisons. La liste est
--     chargée une fois et filtrée SUR LE TÉLÉPHONE : ce que le Yopper tape ne
--     sort pas de son appareil.
--
-- Remplie ici à partir de `best_rues`, puis recalculée par
-- `scripts/import-best-adresses.mjs` à chaque mise à jour du référentiel.
--
-- ⚠️ MÊME FERMETURE QUE LES DEUX AUTRES TABLES BeSt : RLS active SANS policy,
-- droits retirés à anon et authenticated, seul le serveur lit.
--
-- Idempotent. À passer sur l'ESSAI puis la PROD.
-- Date : 2026-10-06
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_best_adresses_lat_lng ON public.best_adresses (lat, lng);

CREATE TABLE IF NOT EXISTS public.best_localites (
  code_postal text             NOT NULL,
  localite    text             NOT NULL,
  commune     text,
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  nb_maisons  integer          NOT NULL DEFAULT 0,
  import_le   timestamptz      NOT NULL,
  PRIMARY KEY (code_postal, localite)
);

COMMENT ON TABLE public.best_localites IS
  'Localités wallonnes (code postal + nom), position moyenne de leurs maisons. Calculé depuis best_rues (BeSt Address, CC BY 4.0). Lu par le serveur seulement.';

ALTER TABLE public.best_localites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.best_localites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.best_localites TO service_role;

-- Le premier remplissage. Une localité sans nom (quelques rues germanophones)
-- prend le nom de sa commune. Seules les rues SITUÉES comptent.
INSERT INTO public.best_localites (code_postal, localite, commune, lat, lng, nb_maisons, import_le)
SELECT code_postal,
       COALESCE(NULLIF(localite, ''), commune) AS localite,
       min(commune),
       sum(lat * nb_maisons) / sum(nb_maisons),
       sum(lng * nb_maisons) / sum(nb_maisons),
       sum(nb_maisons)::integer,
       max(import_le)
  FROM public.best_rues
 WHERE lat IS NOT NULL AND lng IS NOT NULL AND nb_maisons > 0
   AND COALESCE(NULLIF(localite, ''), commune) IS NOT NULL
 GROUP BY code_postal, COALESCE(NULLIF(localite, ''), commune)
ON CONFLICT (code_postal, localite) DO UPDATE
   SET commune = EXCLUDED.commune, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       nb_maisons = EXCLUDED.nb_maisons, import_le = EXCLUDED.import_le;

-- ─── Contrôle : une ligne par vérification, valeur ET attendu ───────────────
SELECT * FROM (
  SELECT 1 AS n, 'index de position sur les maisons' AS controle,
         (SELECT string_agg(indexname, ', ') FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'idx_best_adresses_lat_lng')::text AS valeur,
         'idx_best_adresses_lat_lng' AS attendu
  UNION ALL SELECT 2, 'table des localites creee',
         (SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname = 'best_localites')::text,
         'best_localites'
  UNION ALL SELECT 3, 'RLS active',
         (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.best_localites'::regclass)::text,
         'true'
  UNION ALL SELECT 4, '🔴 aucune policy (donc aucun acces navigateur)',
         (SELECT COALESCE(string_agg(policyname || ':' || cmd || ':' || permissive, ', '), 'AUCUNE')
            FROM pg_policies WHERE schemaname = 'public' AND tablename = 'best_localites')::text,
         'AUCUNE'
  UNION ALL SELECT 5, '🔴 anon et authenticated ne lisent pas',
         (CASE WHEN has_table_privilege('anon', 'public.best_localites', 'SELECT')
                 OR has_table_privilege('authenticated', 'public.best_localites', 'SELECT')
               THEN 'OUVERT' ELSE 'ferme' END)::text,
         'ferme'
  UNION ALL SELECT 6, 'le serveur ecrit',
         (CASE WHEN has_table_privilege('service_role', 'public.best_localites', 'INSERT') THEN 'oui' ELSE 'NON' END)::text,
         'oui'
  UNION ALL SELECT 7, 'localites rangees',
         (SELECT count(*) FROM public.best_localites)::text,
         '1885 (mesure a l essai le 06/10, meme fichier BeSt que la prod)'
  UNION ALL SELECT 8, 'Mettet et Biesme presentes (note de revue Apple : « Mettet or 5640 »)',
         (SELECT string_agg(localite || ' ' || code_postal, ', ' ORDER BY localite) FROM public.best_localites
           WHERE code_postal = '5640')::text,
         'contient Biesme 5640 et Mettet 5640'
  UNION ALL SELECT 9, 'aucune position hors Wallonie (lat 49.4 a 50.9, lng 2.8 a 6.5)',
         (SELECT count(*) FROM public.best_localites
           WHERE lat NOT BETWEEN 49.4 AND 50.9 OR lng NOT BETWEEN 2.8 AND 6.5)::text,
         '0'
) t ORDER BY n;
