-- LECTURE_URGENCE_ACTIVITE_12_11.sql
-- LECTURE SEULE. PROD. Ce qui occupe la base EN CE MOMENT (12/11, prod qui ne répond plus).
-- Partie 1 : les connexions par état et par attente.
-- Partie 2 : les 15 requêtes en cours les plus anciennes.
SELECT 'connexions' AS quoi,
       coalesce(state, '?') || ' | ' || coalesce(wait_event_type, '-') || ' | ' || coalesce(usename, '?') AS detail,
       count(*)::text AS valeur
FROM pg_stat_activity
WHERE pid <> pg_backend_pid()
GROUP BY state, wait_event_type, usename
UNION ALL
SELECT 'max_connections', current_setting('max_connections'), ''
UNION ALL
(SELECT 'requete ' || round(extract(epoch FROM now() - query_start))::text || ' s',
        coalesce(usename, '?') || ' | ' || coalesce(wait_event_type || ':' || wait_event, '-') || ' | '
          || left(regexp_replace(query, '\s+', ' ', 'g'), 220),
        state
 FROM pg_stat_activity
 WHERE state <> 'idle' AND pid <> pg_backend_pid()
 ORDER BY query_start ASC NULLS LAST
 LIMIT 15);
