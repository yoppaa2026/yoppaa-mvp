-- ════════════════════════════════════════════════════════════════════════════
-- LECTURE SEULE (21/10), avant la migration « groupe d'options dépendant »
-- (« Choix de crudités » seulement si « Avec crudités +0,50 € », choix A
-- d'Alex au tableau).
-- Ce qu'on ne trouve pas dans le dépôt : le NOM et le comportement de
-- suppression des clés des tables d'options, le texte des policies du
-- propriétaire, et deux comptes sur le catalogue.
-- Catalogue seulement : aucune ligne client, aucune donnée personnelle.
-- Ne modifie rien. À lancer sur l'ESSAI puis sur la PROD, export CSV des deux.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (
  -- 1. Les clés et contraintes des 3 tables (nom + définition, ON DELETE compris).
  SELECT
    '1 contrainte'::text AS quoi,
    rel.relname::text AS table_,
    con.conname::text AS nom,
    pg_get_constraintdef(con.oid)::text AS valeur,
    '-'::text AS attendu
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'
    AND rel.relname IN ('article_options_groupes', 'article_options_valeurs', 'article_options_prix_taille')
  UNION ALL
  -- 2. Le texte de TOUTES les policies des 3 tables.
  SELECT
    '2 policy'::text,
    p.tablename::text,
    p.policyname::text,
    (p.permissive || ' ' || p.cmd || ' TO ' || array_to_string(p.roles, ',')
      || ' USING ' || coalesce(p.qual, '-')
      || ' CHECK ' || coalesce(p.with_check, '-'))::text,
    '-'::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename IN ('article_options_groupes', 'article_options_valeurs', 'article_options_prix_taille')
  UNION ALL
  -- 3. Les déclencheurs déjà posés sur ces tables.
  SELECT
    '3 declencheur'::text,
    c.relname::text,
    t.tgname::text,
    pg_get_triggerdef(t.oid)::text,
    '-'::text
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND NOT t.tgisinternal
    AND c.relname IN ('article_options_groupes', 'article_options_valeurs', 'article_options_prix_taille')
  UNION ALL
  -- 4. Deux groupes du MÊME NOM dans un même article (le lien se fera par nom).
  SELECT
    '4 compte'::text,
    'article_options_groupes'::text,
    'articles avec 2 groupes du meme nom'::text,
    (SELECT count(*) FROM (
       SELECT article_id FROM public.article_options_groupes
       GROUP BY article_id, lower(trim(nom)) HAVING count(*) > 1) d)::text,
    '0 souhaite'::text
  UNION ALL
  -- 5. Deux options du MÊME NOM dans un même groupe.
  SELECT
    '4 compte'::text,
    'article_options_valeurs'::text,
    'groupes avec 2 options du meme nom'::text,
    (SELECT count(*) FROM (
       SELECT groupe_id FROM public.article_options_valeurs
       GROUP BY groupe_id, lower(trim(nom)) HAVING count(*) > 1) d)::text,
    '0 souhaite'::text
  UNION ALL
  -- 6. Le plus de groupes sur un seul article.
  SELECT
    '4 compte'::text,
    'article_options_groupes'::text,
    'max de groupes sur un article'::text,
    coalesce((SELECT max(n) FROM (
       SELECT count(*) AS n FROM public.article_options_groupes GROUP BY article_id) m), 0)::text,
    '-'::text
) x
ORDER BY quoi, table_, nom;
