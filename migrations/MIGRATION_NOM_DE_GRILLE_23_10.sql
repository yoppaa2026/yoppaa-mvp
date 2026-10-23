-- LE NOM D'UNE GRILLE DE VARIANTES, 23/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Demande d'Alex pour Caprice : quand la boutique a plusieurs grilles de
-- tailles, elle doit pouvoir leur donner un nom (« Taille gamme Primadonna »,
-- « Taille gamme Marie Jo ») pour s'y retrouver.
--
-- ✅ DÉCISION D'ALEX (23/10) : « JUSTE UNE ÉTIQUETTE ». Le nom ne change ni le
-- regroupement des grilles ni leurs gestes, et le client ne le voit jamais.
--
-- Il n'y a pas de table des grilles : une grille est ce que des articles
-- portent (lib/variantes-grille.js). L'étiquette vit donc sur les articles de
-- la grille, comme ses tailles.
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. Une
-- colonne vide par défaut ; aucune donnée réécrite.
--
-- ⚠️ ET ELLE PASSE AVANT LE CODE : le code écrira cette colonne en posant ou en
-- retirant une grille ; sans elle, ces gestes échoueraient.
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS grille_nom text;

ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_grille_nom_longueur;
ALTER TABLE public.articles
  ADD CONSTRAINT articles_grille_nom_longueur CHECK (grille_nom IS NULL OR char_length(grille_nom) <= 60);

COMMENT ON COLUMN public.articles.grille_nom IS
  'Nom de la grille de variantes (23/10), vu du commerçant seul : « Taille gamme Primadonna ». Une étiquette, ne change ni le regroupement ni la vente. Vide par défaut.';

-- La fiche lit les articles directement (`select *`) : sans ces droits, la
-- lecture entière des articles serait refusée à anon.
GRANT SELECT (grille_nom) ON public.articles TO anon, authenticated;
GRANT INSERT (grille_nom),
      UPDATE (grille_nom) ON public.articles TO authenticated;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'G1. colonne articles.grille_nom' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'grille_nom'), 'ABSENTE')::text AS valeur,
    'text' AS attendu
  UNION ALL
  SELECT 2, 'G2. elle accepte le vide (étiquette facultative)',
    coalesce((SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'grille_nom'), 'ABSENTE')::text,
    'YES'
  UNION ALL
  SELECT 3, 'G3. 60 caractères au plus (contrainte présente)',
    (SELECT count(*) FROM pg_constraint WHERE conname = 'articles_grille_nom_longueur'
       AND conrelid = 'public.articles'::regclass)::text,
    '1'
  UNION ALL
  SELECT 4, 'G4. anon lit grille_nom (la fiche lit les articles en entier)',
    has_column_privilege('anon', 'public.articles', 'grille_nom', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'G5. le connecté lit grille_nom',
    has_column_privilege('authenticated', 'public.articles', 'grille_nom', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 6, 'G6. le commerçant connecté l''écrit à la création',
    has_column_privilege('authenticated', 'public.articles', 'grille_nom', 'INSERT')::text, 'true'
  UNION ALL
  SELECT 7, 'G7. le commerçant connecté la change (poser, renommer, retirer)',
    has_column_privilege('authenticated', 'public.articles', 'grille_nom', 'UPDATE')::text, 'true'
  UNION ALL
  SELECT 8, 'G8. le serveur la lit (service_role)',
    has_column_privilege('service_role', 'public.articles', 'grille_nom', 'SELECT')::text, 'true'
  UNION ALL
  -- C'est la RLS qui décide de QUELLES lignes il écrit (les siennes), pas le GRANT.
  SELECT 9, 'G9. articles : la RLS est active (c''est elle qui protège)',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.articles'::regclass)::text, 'true'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : aucun article ne doit porter de nom après la
  -- migration. Si ce n'est pas 0, quelque chose a écrit cette colonne.
  SELECT 10, 'G10. articles qui portent déjà un nom de grille',
    (SELECT count(*) FROM public.articles WHERE grille_nom IS NOT NULL)::text,
    '0'
) t ORDER BY n;
