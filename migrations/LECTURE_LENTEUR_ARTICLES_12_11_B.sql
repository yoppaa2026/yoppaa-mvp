-- LECTURE_LENTEUR_ARTICLES_12_11_B.sql
-- LECTURE SEULE : ne modifie rien. À passer sur PROD.
-- Suite de LECTURE_LENTEUR_ARTICLES_12_11 : L1/L2 visaient « UPDATE ... » en
-- tête de requête, or PostgREST écrit « WITH pgrst_source AS (UPDATE ...) ».
-- On revise, et on lit les conditions des policies que chaque écriture évalue.
WITH ecritures AS (
  SELECT CASE WHEN query ILIKE '%UPDATE "public"."articles"%' THEN 'articles'
              WHEN query ILIKE '%UPDATE "public"."commercants"%' THEN 'commercants' END AS tbl,
         calls, total_exec_time, max_exec_time
  FROM pg_stat_statements
  WHERE query ILIKE '%UPDATE "public"."articles"%' OR query ILIKE '%UPDATE "public"."commercants"%'
)
SELECT 'M1 UPDATE ' || tbl || ' (appels / moyenne ms / max ms)' AS controle,
       sum(calls) || ' / ' || round(sum(total_exec_time) / nullif(sum(calls), 0)) || ' / ' || round(max(max_exec_time)) AS valeur,
       'moyenne < 50 ms' AS attendu
FROM ecritures GROUP BY tbl
UNION ALL
SELECT 'M2 policy ' || policyname || ' (' || permissive || ')',
       left(regexp_replace(coalesce(qual, '') || ' | CHECK ' || coalesce(with_check, ''), '\s+', ' ', 'g'), 300),
       'pour info'
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'articles' AND cmd = 'ALL';
