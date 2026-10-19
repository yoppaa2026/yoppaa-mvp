-- LA PLAGE DE RETRAIT PAR ARTICLE, 19/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Demande de la boulangerie Aux Délices des 7 Abbayes : ses sandwichs ne se
-- retirent que jusqu'à 15h, son pain jusqu'à la fin des créneaux (17h30).
-- Les créneaux restent communs au commerce ; un article peut dire « retrait
-- de … à … », les deux bornes facultatives.
--
-- ✅ DÉCISIONS D'ALEX (tableau, 19/10) : réglage sur l'ARTICLE, applicable à
-- toute une catégorie d'un coup ; « de … à … », les deux facultatifs ; panier
-- mixte = créneaux communs, aucun créneau commun = refus à l'ajout.
--
-- ⚠️ L'APP EST EN SERVICE : CETTE MIGRATION NE CHANGE RIEN POUR PERSONNE. Deux
-- colonnes VIDES (NULL = aucune limite), aucune donnée réécrite. Tant qu'un
-- commerçant ne règle pas une plage, chaque fiche se comporte comme avant.
--
-- ⚠️ ET ELLE PASSE AVANT LE CODE : le code lira ces colonnes dans ses select ;
-- sans elles, la lecture des articles échouerait.
--
-- Une seule transaction ; contrôles en bas, une ligne par contrôle, valeur ET
-- attendu.

BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS retrait_des    time,
  ADD COLUMN IF NOT EXISTS retrait_jusqua time;

COMMENT ON COLUMN public.articles.retrait_des IS
  'Plage de retrait (19/10) : premier moment où CET article se retire ou se livre. Vide = dès le premier créneau.';
COMMENT ON COLUMN public.articles.retrait_jusqua IS
  'Plage de retrait (19/10) : un créneau doit FINIR au plus tard à cette heure pour proposer CET article. Vide = jusqu''au dernier créneau.';

-- ⚠️ UNE PLAGE À L'ENVERS NE SE PROPOSE À PERSONNE, ET EN SILENCE. « de 15h à
-- 11h » ne laisserait aucun créneau : l'article serait invisible au tunnel sans
-- qu'aucun écran ne dise pourquoi. On refuse la saisie à la base, l'écran le
-- dit avant.
ALTER TABLE public.articles DROP CONSTRAINT IF EXISTS articles_plage_retrait_ordre;
ALTER TABLE public.articles ADD CONSTRAINT articles_plage_retrait_ordre
  CHECK (retrait_des IS NULL OR retrait_jusqua IS NULL OR retrait_des < retrait_jusqua);

-- La fiche lit les articles directement : sans ces droits, les colonnes
-- manqueraient côté client et le tunnel conclurait « aucune limite ».
GRANT SELECT (retrait_des, retrait_jusqua) ON public.articles TO anon, authenticated;
GRANT INSERT (retrait_des, retrait_jusqua),
      UPDATE (retrait_des, retrait_jusqua) ON public.articles TO authenticated;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'P1. colonne articles.retrait_des' AS controle,
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'retrait_des'), 'ABSENTE')::text AS valeur,
    'time without time zone' AS attendu
  UNION ALL
  SELECT 2, 'P2. colonne articles.retrait_jusqua',
    coalesce((SELECT data_type FROM information_schema.columns WHERE table_schema = 'public'
              AND table_name = 'articles' AND column_name = 'retrait_jusqua'), 'ABSENTE')::text,
    'time without time zone'
  UNION ALL
  SELECT 3, 'P3. contrainte « de » avant « à » posée',
    (SELECT count(*) FROM pg_constraint WHERE conname = 'articles_plage_retrait_ordre')::text,
    '1'
  UNION ALL
  SELECT 4, 'P4. anon lit retrait_des (la fiche)',
    has_column_privilege('anon', 'public.articles', 'retrait_des', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'P5. anon lit retrait_jusqua (la fiche)',
    has_column_privilege('anon', 'public.articles', 'retrait_jusqua', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 6, 'P6. le commerçant connecté écrit retrait_des',
    has_column_privilege('authenticated', 'public.articles', 'retrait_des', 'UPDATE')::text, 'true'
  UNION ALL
  SELECT 7, 'P7. le commerçant connecté écrit retrait_jusqua',
    has_column_privilege('authenticated', 'public.articles', 'retrait_jusqua', 'UPDATE')::text, 'true'
  UNION ALL
  -- C'est la RLS qui décide de QUELLES lignes il écrit (les siennes), pas le GRANT.
  SELECT 8, 'P8. articles : la RLS est active (c''est elle qui protège)',
    (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.articles'::regclass)::text, 'true'
  UNION ALL
  -- 🔴 L'APP EST EN SERVICE : aucun article ne doit porter de plage après la
  -- migration. Si ce n'est pas 0, quelque chose a écrit ces colonnes.
  SELECT 9, 'P9. articles portant déjà une plage',
    (SELECT count(*) FROM public.articles WHERE retrait_des IS NOT NULL OR retrait_jusqua IS NOT NULL)::text,
    '0'
) t ORDER BY n;
