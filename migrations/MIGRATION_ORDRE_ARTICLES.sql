-- ════════════════════════════════════════════════════════════════════════════
-- L'ORDRE DES ARTICLES DANS UNE CATÉGORIE
-- Demande d'Alex, 10/10 (en encodant une pizzeria) : « il faut aussi pouvoir
-- modifier l'ordre des articles dans une catégorie ». ✅ Tableau : des flèches
-- monter / descendre sur chaque article.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Les articles étaient triés par NOM partout. `ordre` (entier) range les
-- articles DANS leur catégorie ; NULL = pas encore rangé, et ces articles
-- suivent les rangés, par nom (`comparerArticles`, lib/ordre-articles.js).
-- Les catégories gardent leur propre ordre (`commercants.ordre_categories`).
--
-- ⚠️ LES DROITS SONT RECOPIÉS DE `nom`, pas devinés (même geste que
-- MIGRATION_ORDRE_CATEGORIES) : si des droits COLONNE existent sur `articles`,
-- une colonne neuve n'en hérite pas, et la fiche publique, qui lit `*`,
-- tomberait en erreur pour les visiteurs.
--
-- À passer sur l'ESSAI puis la PROD, AVANT le code. Idempotent. Date : 2026-10-10
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS ordre integer;

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_ordre_check;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_ordre_check CHECK (ordre IS NULL OR ordre >= 0);

COMMENT ON COLUMN public.articles.ordre IS
  'Rang de l article dans sa categorie (1 = en premier). NULL = pas range : suit les ranges, par nom.';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT grantee, privilege_type
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'articles'
       AND column_name = 'nom' AND grantee IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('GRANT %s (ordre) ON public.articles TO %I', r.privilege_type, r.grantee);
  END LOOP;
END $$;

COMMIT;

-- ─── CONTRÔLE : une ligne par vérification, valeur ET attendu ──────────────
SELECT * FROM (
  SELECT 1 AS n, 'colonne ordre (type:nullable)'::text AS controle,
         (SELECT data_type || ':' || is_nullable FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'articles' AND column_name = 'ordre')::text AS valeur,
         'integer:YES'::text AS attendu
  UNION ALL SELECT 2, 'anon lit ordre (comme nom)',
         (has_column_privilege('anon', 'public.articles', 'ordre', 'SELECT') = has_column_privilege('anon', 'public.articles', 'nom', 'SELECT'))::text, 'true'
  UNION ALL SELECT 3, 'anon lit nom (la fiche publique)',
         has_column_privilege('anon', 'public.articles', 'nom', 'SELECT')::text, 'true'
  UNION ALL SELECT 4, 'authenticated ecrit ordre (comme nom)',
         (has_column_privilege('authenticated', 'public.articles', 'ordre', 'UPDATE') = has_column_privilege('authenticated', 'public.articles', 'nom', 'UPDATE'))::text, 'true'
  UNION ALL SELECT 5, 'contrainte ordre',
         (SELECT pg_get_constraintdef(oid) FROM pg_constraint
           WHERE conrelid = 'public.articles'::regclass AND conname = 'articles_ordre_check')::text,
         'CHECK (((ordre IS NULL) OR (ordre >= 0)))'
  UNION ALL SELECT 6, 'articles deja ranges (avant tout geste)',
         (SELECT count(*) FROM public.articles WHERE ordre IS NOT NULL)::text, '0'
) t ORDER BY n;
