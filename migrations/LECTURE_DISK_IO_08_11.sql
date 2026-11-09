-- LECTURE_DISK_IO_08_11.sql
-- LECTURE SEULE : ne modifie rien. À passer sur PROD (c'est elle qui a reçu l'alerte).
-- Un seul résultat, trois sections :
--   A = les 12 requêtes qui lisent le plus le DISQUE (pas le cache), depuis la dernière remise à zéro ;
--   B = les index attendus sur les tables relues en boucle (attendu : présent) ;
--   C = les 10 tables les plus lues EN ENTIER (scans complets).
WITH top AS (
  SELECT row_number() OVER (ORDER BY shared_blks_read DESC) AS rang,
         calls,
         round(total_exec_time)::bigint AS ms_total,
         shared_blks_read,
         shared_blks_hit,
         left(regexp_replace(query, '\s+', ' ', 'g'), 200) AS q
  FROM pg_stat_statements
  WHERE query NOT ILIKE '%pg_stat_statements%'
  ORDER BY shared_blks_read DESC
  LIMIT 12
),
attendus(tbl, col) AS (VALUES
  ('commandes', 'commercant_id'),
  ('commandes', 'statut'),
  ('commande_articles', 'commande_id'),
  ('rdv_reservations', 'commercant_id'),
  ('bons_cadeaux', 'commercant_id'),
  ('etiquettes_impression', 'commercant_id'),
  ('stations_impression', 'commercant_id'),
  ('commande_stock_reservation', 'expires_at')
)
SELECT 'A requête lourde' AS section,
       lpad(rang::text, 2, '0') AS element,
       'disque ' || shared_blks_read || ' · cache ' || shared_blks_hit
         || ' · appels ' || calls || ' · ' || ms_total || ' ms' AS valeur,
       q AS detail
FROM top
UNION ALL
SELECT 'B index',
       a.tbl || '(' || a.col || ')',
       CASE WHEN EXISTS (
         SELECT 1 FROM pg_indexes i
         WHERE i.schemaname = 'public' AND i.tablename = a.tbl
           AND i.indexdef ~* ('\(\s*' || a.col || '\M')
       ) THEN 'présent' ELSE 'ABSENT' END,
       'attendu : présent'
FROM attendus a
UNION ALL
SELECT 'C table',
       t.relname,
       pg_size_pretty(pg_total_relation_size(t.relid)),
       'lignes ' || t.n_live_tup || ' · mortes ' || t.n_dead_tup
         || ' · scans complets ' || t.seq_scan
         || ' · lignes lues en scan complet ' || t.seq_tup_read
FROM (SELECT * FROM pg_stat_user_tables WHERE schemaname = 'public'
      ORDER BY seq_tup_read DESC LIMIT 10) t
ORDER BY 1, 2;
