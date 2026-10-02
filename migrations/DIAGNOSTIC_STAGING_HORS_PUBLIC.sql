-- SITE D'ESSAI : CE QUE LA PRODUCTION A EN DEHORS DU SCHÉMA PUBLIC (02/10/2026)
--
-- À COLLER DANS L'ÉDITEUR SQL DE LA PRODUCTION. LECTURE SEULE : rien n'est
-- modifié. Ne lit que le catalogue de la base (extensions, temps réel,
-- dossiers de stockage, règles d'accès au stockage, déclencheurs), AUCUNE
-- ligne de client ni de commerce.
--
-- Pourquoi : la copie de la structure (`pg_dump --schema=public`) ne prend que
-- le schéma public. Le temps réel de la vitrine, les dossiers de photos et
-- leurs règles, le déclencheur sur `auth.users` vivent ailleurs. Les rebâtir
-- depuis les anciennes migrations copierait peut-être une version périmée :
-- on relève ce que la production contient VRAIMENT.

SELECT 'extension' AS type, e.extname AS nom, n.nspname AS detail
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
UNION ALL
SELECT 'realtime', schemaname || '.' || tablename, pubname
  FROM pg_publication_tables WHERE pubname = 'supabase_realtime'
UNION ALL
SELECT 'bucket', id,
       'public=' || public::text
       || ' limite=' || coalesce(file_size_limit::text, 'aucune')
       || ' types=' || coalesce(array_to_string(allowed_mime_types, ','), 'tous')
  FROM storage.buckets
UNION ALL
SELECT 'policy_storage', tablename || '.' || policyname,
       permissive || ' ' || cmd || ' roles=' || array_to_string(roles, ',')
       || ' USING(' || coalesce(qual, '') || ') CHECK(' || coalesce(with_check, '') || ')'
  FROM pg_policies WHERE schemaname = 'storage'
UNION ALL
SELECT 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname, pg_get_triggerdef(t.oid)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE NOT t.tgisinternal AND n.nspname IN ('auth', 'storage')
ORDER BY 1, 2;
