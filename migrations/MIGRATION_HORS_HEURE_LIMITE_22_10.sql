-- UN ARTICLE HORS DE L'HEURE LIMITE DE LA VEILLE, 22/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Aux Délices des 7 Abbayes a réglé son heure limite de la veille à 17 h 45
-- (onglet Créneaux, `commercants.commande_veille_avant`, 20/10) : après 17 h 45,
-- plus rien ne se commande à l'avance pour demain. Mais ses sandwichs, eux,
-- doivent rester commandables pour demain après 17 h 45.
--
-- ✅ DÉCISION D'ALEX (tableau, 22/10) : une EXCEPTION PAR ARTICLE, « Pas
-- concerné par l'heure limite de la veille », réglable sur la fiche article ET
-- en actions groupées.
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. Une
-- colonne à FAUX par défaut = chaque article suit l'heure limite du commerce,
-- exactement comme aujourd'hui. Aucune donnée réécrite.
--
-- ⚠️ ET ELLE PASSE AVANT LE CODE : le code lira cette colonne dans ses select
-- (la fiche lit `articles` en `*`, le serveur la nomme) ; sans elle, la lecture
-- des articles échouerait, et avec elle TOUTES les commandes.
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS hors_heure_limite boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.articles.hors_heure_limite IS
  'Heure limite de la veille (22/10) : vrai = CET article sur commande ne suit pas commercants.commande_veille_avant (il se commande pour demain jusqu''à minuit). Faux par défaut = il la suit.';

-- La fiche lit les articles directement (`select *`) : sans ces droits, la
-- lecture entière des articles serait refusée à anon.
GRANT SELECT (hors_heure_limite) ON public.articles TO anon, authenticated;
GRANT INSERT (hors_heure_limite),
      UPDATE (hors_heure_limite) ON public.articles TO authenticated;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'H1. colonne articles.hors_heure_limite' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'hors_heure_limite'), 'ABSENTE')::text AS valeur,
    'boolean' AS attendu
  UNION ALL
  SELECT 2, 'H2. elle refuse le vide (NOT NULL)',
    coalesce((SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'hors_heure_limite'), 'ABSENTE')::text,
    'NO'
  UNION ALL
  SELECT 3, 'H3. son défaut est faux (chaque article suit la limite)',
    coalesce((SELECT column_default FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'hors_heure_limite'), 'AUCUN')::text,
    'false'
  UNION ALL
  SELECT 4, 'H4. anon lit hors_heure_limite (la fiche)',
    has_column_privilege('anon', 'public.articles', 'hors_heure_limite', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'H5. le connecté lit hors_heure_limite',
    has_column_privilege('authenticated', 'public.articles', 'hors_heure_limite', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 6, 'H6. le commerçant connecté la crée (nouvel article, duplication)',
    has_column_privilege('authenticated', 'public.articles', 'hors_heure_limite', 'INSERT')::text, 'true'
  UNION ALL
  SELECT 7, 'H7. le commerçant connecté la change (fiche, lot)',
    has_column_privilege('authenticated', 'public.articles', 'hors_heure_limite', 'UPDATE')::text, 'true'
  UNION ALL
  SELECT 8, 'H8. le serveur la lit (service_role)',
    has_column_privilege('service_role', 'public.articles', 'hors_heure_limite', 'SELECT')::text, 'true'
  UNION ALL
  -- C'est la RLS qui décide de QUELLES lignes il écrit (les siennes), pas le GRANT.
  SELECT 9, 'H9. articles : la RLS est active (c''est elle qui protège)',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.articles'::regclass)::text, 'true'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : aucun article ne doit être hors limite après la
  -- migration. Si ce n'est pas 0, quelque chose a écrit cette colonne.
  SELECT 10, 'H10. articles déjà hors de l''heure limite',
    (SELECT count(*) FROM public.articles WHERE hors_heure_limite)::text,
    '0'
) t ORDER BY n;
