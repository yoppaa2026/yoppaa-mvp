-- CORRECTIF, TEST SEULEMENT (28/10) : la ceinture du siège n'a pas pris.
--
-- MIGRATION_VUE_SANS_SIEGE_28_10.sql est passée sur TEST, mais son contrôle S8
-- est revenu à `true` : anon tient un droit de lecture sur TOUTE la table
-- `commercants` (droits par défaut de Supabase), et un REVOKE colonne par
-- colonne ne l'entame pas. On retire le droit global, puis on rend chaque
-- colonne SAUF les trois du siège. Rien d'autre ne change pour anon.
--
-- ⚠️ PROD n'a PAS besoin de ce fichier : la migration principale a été
-- corrigée dans le même sens, elle passera en une fois.

BEGIN;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name::text), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'commercants'
     AND column_name NOT IN ('adresse', 'latitude', 'longitude');
  REVOKE SELECT ON public.commercants FROM anon;
  EXECUTE format('GRANT SELECT (%s) ON public.commercants TO anon', cols);
END
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT * FROM (
  SELECT 1 AS n, 'C1. anon ne lit plus le siège dans la table' AS controle,
    (has_column_privilege('anon', 'public.commercants', 'adresse', 'SELECT')
     OR has_column_privilege('anon', 'public.commercants', 'latitude', 'SELECT')
     OR has_column_privilege('anon', 'public.commercants', 'longitude', 'SELECT'))::text AS valeur,
    'false' AS attendu
  UNION ALL
  SELECT 2, 'C2. anon n''a plus le droit global sur la table',
    has_table_privilege('anon', 'public.commercants', 'SELECT')::text, 'false'
  UNION ALL
  SELECT 3, 'C3. anon lit toujours les autres colonnes (statut_publication)',
    has_column_privilege('anon', 'public.commercants', 'statut_publication', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 4, 'C4. anon lit toujours la vue',
    has_table_privilege('anon', 'public.commercants_public', 'SELECT')::text, 'true'
  UNION ALL
  SELECT 5, 'C5. le commerçant connecté lit toujours SON siège',
    has_column_privilege('authenticated', 'public.commercants', 'adresse', 'SELECT')::text, 'true'
) t ORDER BY n;
