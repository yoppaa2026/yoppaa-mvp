-- SITE D'ESSAI : LE TEXTE COMPLET DES RÈGLES DU STOCKAGE (02/10/2026)
--
-- À COLLER DANS L'ÉDITEUR SQL DE LA PRODUCTION. LECTURE SEULE. Ne lit que le
-- catalogue (règles d'accès, dossiers, déclencheur sur les comptes), aucune
-- donnée de client ni de commerce.
--
-- Pourquoi une deuxième requête : la copie du premier résultat a COUPÉ les
-- textes longs. Et cinq de ces règles ont été créées à la main
-- (`kyb_insert_own`, `kyb_delete_own`, les trois lectures de `logos`) :
-- aucune migration ne les contient, seule la production les connaît.
--
-- ⚠️ Première version refusée par l'éditeur (« must be owner of table
-- buckets ») : elle fabriquait le texte d'un INSERT dans `storage.buckets`.
-- Celle-ci rend les colonnes BRUTES, sans rien composer ; les instructions
-- sont écrites ensuite, à partir de ce relevé.
-- Récupérer le résultat par « Download CSV » (un fichier), pas par une copie
-- de la grille, qui coupe.

SELECT 'bucket' AS type, id AS nom,
       'public=' || public::text
       || ' | limite=' || coalesce(file_size_limit::text, 'aucune')
       || ' | types=' || coalesce(array_to_string(allowed_mime_types, ','), 'tous') AS texte
  FROM storage.buckets
 WHERE id IN ('logos', 'kyb_documents')
UNION ALL
SELECT 'policy', policyname,
       permissive || ' | ' || cmd || ' | roles=' || array_to_string(roles, ',')
       || ' | USING=' || coalesce(qual, '-')
       || ' | CHECK=' || coalesce(with_check, '-')
  FROM pg_policies
 WHERE schemaname = 'storage' AND tablename = 'objects'
   AND policyname NOT LIKE 'signalements%'
UNION ALL
SELECT 'trigger', t.tgname, pg_get_triggerdef(t.oid)
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'auth' AND NOT t.tgisinternal
ORDER BY 1, 2;
