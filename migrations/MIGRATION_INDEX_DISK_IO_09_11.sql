-- MIGRATION_INDEX_DISK_IO_09_11.sql
-- Alerte Supabase « Disk IO Budget » (08/11). La lecture LECTURE_DISK_IO_08_11
-- montre `commande_articles` lue EN ENTIER 18 millions de fois (8,7 milliards de
-- lignes) : aucun index sur `commande_id`, donc chaque commande affichée avec
-- ses articles parcourt toute la table. Même chose, en plus petit, pour les
-- options et les articles.
--
-- Ne change AUCUN comportement : un index ne fait qu'accélérer la recherche.
-- N'en crée un que si AUCUN index existant ne commence déjà par cette colonne
-- (pas de doublon). Tables petites : quelques millisecondes.
-- TEST puis PROD. Un seul coller.

DO $$
DECLARE
  cible record;
BEGIN
  FOR cible IN
    SELECT * FROM (VALUES
      ('commande_articles',       'commande_id'),
      ('commande_articles',       'article_id'),
      ('article_options_valeurs', 'groupe_id'),
      ('article_options_groupes', 'article_id'),
      ('articles',                'commercant_id'),
      ('creneaux',                'commercant_id'),
      ('article_stock_jour',      'article_id')
    ) AS t(tbl, col)
  LOOP
    -- La colonne existe-t-elle ?
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = cible.tbl AND column_name = cible.col
    )
    -- Et aucun index ne commence déjà par elle ?
    AND NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
      WHERE i.indrelid = format('public.%I', cible.tbl)::regclass
        AND a.attname = cible.col
    ) THEN
      EXECUTE format('CREATE INDEX %I ON public.%I (%I)',
                     'idx_' || cible.tbl || '_' || cible.col, cible.tbl, cible.col);
    END IF;
  END LOOP;
END $$;

-- Les statistiques à jour, pour que la base choisisse l'index tout de suite.
ANALYZE public.commande_articles;
ANALYZE public.article_options_valeurs;
ANALYZE public.article_options_groupes;
ANALYZE public.articles;
ANALYZE public.creneaux;
ANALYZE public.article_stock_jour;

-- ─── Contrôle : une ligne par index, valeur ET attendu ──────────────────────
SELECT n, controle, valeur, attendu, CASE WHEN valeur = attendu THEN 'OK' ELSE '🔴' END AS verdict
FROM (
  SELECT v.n, v.tbl || '(' || v.col || ')' AS controle,
         -- 1 = au moins un index commence par la colonne (un ancien suffit).
         (SELECT CASE WHEN count(*) > 0 THEN 1 ELSE 0 END FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
           WHERE i.indrelid = format('public.%I', v.tbl)::regclass AND a.attname = v.col) AS valeur,
         1 AS attendu
  FROM (VALUES
    ('I1', 'commande_articles',       'commande_id'),
    ('I2', 'commande_articles',       'article_id'),
    ('I3', 'article_options_valeurs', 'groupe_id'),
    ('I4', 'article_options_groupes', 'article_id'),
    ('I5', 'articles',                'commercant_id'),
    ('I6', 'creneaux',                'commercant_id'),
    ('I7', 'article_stock_jour',      'article_id')
  ) AS v(n, tbl, col)
) x
ORDER BY n;
