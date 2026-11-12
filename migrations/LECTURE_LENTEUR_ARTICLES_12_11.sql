-- LECTURE_LENTEUR_ARTICLES_12_11.sql
-- LECTURE SEULE : ne modifie rien. À passer sur PROD.
-- Alex (12/11) : enregistrer un article depuis l'admin (Caprice) reste de longues
-- secondes sur « Enregistrement… ». L'écran n'attend qu'UNE écriture :
-- UPDATE articles ... WHERE id = ... RETURNING id. On mesure donc si la base est
-- lente sur cette écriture, et pourquoi (verrou, déclencheur, disque saturé).
-- Une ligne par contrôle : valeur ET attendu.
WITH maj_articles AS (
  SELECT sum(calls) AS appels,
         round(sum(total_exec_time) / nullif(sum(calls), 0))::bigint AS moy_ms,
         round(max(max_exec_time))::bigint AS max_ms
  FROM pg_stat_statements
  WHERE query ILIKE 'update%"articles"%' OR query ILIKE 'update%public.articles %'
),
maj_commercants AS (
  SELECT sum(calls) AS appels,
         round(sum(total_exec_time) / nullif(sum(calls), 0))::bigint AS moy_ms,
         round(max(max_exec_time))::bigint AS max_ms
  FROM pg_stat_statements
  WHERE query ILIKE 'update%"commercants"%'
),
cache AS (
  SELECT round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2) AS pct
  FROM pg_statio_user_tables
)
SELECT 'L1 UPDATE articles : appels / moyenne ms / max ms' AS controle,
       coalesce((SELECT appels || ' / ' || moy_ms || ' / ' || max_ms FROM maj_articles), 'aucun') AS valeur,
       'moyenne < 50 ms' AS attendu
UNION ALL
SELECT 'L2 UPDATE commercants : appels / moyenne ms / max ms',
       coalesce((SELECT appels || ' / ' || moy_ms || ' / ' || max_ms FROM maj_commercants), 'aucun'),
       'moyenne < 50 ms'
UNION ALL
SELECT 'L3 déclencheurs sur articles',
       coalesce((SELECT string_agg(tgname, ', ' ORDER BY tgname) FROM pg_trigger
                 WHERE tgrelid = 'public.articles'::regclass AND NOT tgisinternal), 'aucun'),
       'aucun (aucun fichier de migration n''en crée)'
UNION ALL
SELECT 'L4 policies sur articles',
       (SELECT count(*) || ' : ' || string_agg(policyname || ' (' || cmd || ', ' || permissive || ')', ', ' ORDER BY policyname)
        FROM pg_policies WHERE schemaname = 'public' AND tablename = 'articles'),
       'pour info'
UNION ALL
SELECT 'L5 requêtes qui attendent un verrou en ce moment',
       (SELECT count(*)::text FROM pg_stat_activity WHERE wait_event_type = 'Lock'),
       '0'
UNION ALL
SELECT 'L6 transactions ouvertes et inactives depuis plus d''1 min',
       (SELECT count(*)::text FROM pg_stat_activity
        WHERE state = 'idle in transaction' AND now() - state_change > interval '1 minute'),
       '0'
UNION ALL
SELECT 'L7 plus longue requête active en ce moment (s)',
       coalesce((SELECT round(extract(epoch FROM max(now() - query_start)))::text FROM pg_stat_activity
                 WHERE state = 'active' AND pid <> pg_backend_pid()), '0'),
       '< 5'
UNION ALL
SELECT 'L8 articles : lignes vivantes / mortes / dernier autovacuum',
       (SELECT n_live_tup || ' / ' || n_dead_tup || ' / ' || coalesce(last_autovacuum::text, 'jamais')
        FROM pg_stat_user_tables WHERE relname = 'articles' AND schemaname = 'public'),
       'mortes < vivantes'
UNION ALL
SELECT 'L9 lectures servies par le cache (%)',
       (SELECT pct::text FROM cache),
       '> 99'
UNION ALL
SELECT 'L10 statistiques remises à zéro le',
       coalesce((SELECT stats_reset::text FROM pg_stat_statements_info), 'inconnu'),
       'pour info';
