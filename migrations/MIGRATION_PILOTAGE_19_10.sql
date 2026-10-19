-- MIGRATION PILOTAGE, 19/10. À LANCER SUR TEST, PUIS SUR PROD AVANT LE CODE.
--
-- Le tableau de pilotage d'Alex (page « Pilotage » de l'admin + email de
-- 7h00) a besoin de deux choses qui n'existent pas en base :
--
--   1. UN JOURNAL TECHNIQUE. Le passage des tâches automatiques et les erreurs
--      d'écran ne sont écrits aujourd'hui que dans les journaux de Vercel :
--      impossible de dire depuis l'admin qu'une relance n'est pas partie.
--      ⚠️ Clé de service SEULEMENT : RLS allumée, aucune policy, aucun droit
--      pour anon ni authenticated. Rien de personnel n'y est écrit (le chemin
--      d'une erreur est enregistré SANS ses paramètres).
--
--   2. LES COMPTES YOPPER PAR JOUR. La date de création d'un compte vit dans
--      `auth.users`, que l'API ne lit pas. Une fonction la COMPTE, jour par
--      jour, sans jamais rendre un email ni un identifiant.
--      ⚠️ Exécutable par la clé de service SEULEMENT.
--
-- Tout tient en une transaction ; les contrôles sont en bas, une ligne par
-- contrôle, valeur ET attendu.

BEGIN;

-- ─── 1. LE JOURNAL TECHNIQUE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_technique (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  genre    text NOT NULL CHECK (genre IN ('cron', 'erreur_ecran')),
  nom      text NOT NULL CHECK (char_length(nom) <= 200),
  detail   text CHECK (detail IS NULL OR char_length(detail) <= 500),
  cree_le  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journal_technique_genre_date_idx
  ON public.journal_technique (genre, cree_le DESC);

ALTER TABLE public.journal_technique ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.journal_technique FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.journal_technique TO service_role;

COMMENT ON TABLE public.journal_technique IS
  'Pilotage (19/10) : passages des crons et erreurs d''écran. Clé de service seulement. Purgé à 90 jours par /api/cron/pilotage-matin.';

-- ─── 2. LES COMPTES YOPPER, PAR JOUR (BRUXELLES) ────────────────────────────
-- Un compte Yopper = une ligne `clients` rattachée à un compte de connexion.
-- On compte par JOUR CIVIL BELGE : un compte créé à 00h30 le 20 compte le 20,
-- pas le 19 comme le dirait l'heure de Greenwich.
CREATE OR REPLACE FUNCTION public.pilotage_comptes_yopper_par_jour()
RETURNS TABLE (jour date, comptes bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT (u.created_at AT TIME ZONE 'Europe/Brussels')::date AS jour,
         count(DISTINCT cl.auth_user_id) AS comptes
  FROM public.clients cl
  JOIN auth.users u ON u.id = cl.auth_user_id
  WHERE cl.auth_user_id IS NOT NULL
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.pilotage_comptes_yopper_par_jour() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pilotage_comptes_yopper_par_jour() TO service_role;

COMMIT;

-- ─── CONTRÔLES ──────────────────────────────────────────────────────────────
SELECT * FROM (
  SELECT 1 AS n, 'C1. la table journal_technique existe' AS controle,
    (to_regclass('public.journal_technique') IS NOT NULL)::text AS valeur,
    'true' AS attendu
  UNION ALL
  SELECT 2, 'C2. RLS allumée sur journal_technique',
    coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = to_regclass('public.journal_technique')), 'absente'),
    'true'
  UNION ALL
  SELECT 3, 'C3. aucune policy sur journal_technique (nom et type)',
    coalesce((SELECT string_agg(policyname || ' ' || permissive, ', ') FROM pg_policies
               WHERE schemaname = 'public' AND tablename = 'journal_technique'), 'aucune'),
    'aucune'
  UNION ALL
  SELECT 4, 'C4. anon ne lit pas le journal',
    has_table_privilege('anon', 'public.journal_technique', 'SELECT')::text,
    'false'
  UNION ALL
  SELECT 5, 'C5. authenticated n''écrit pas dans le journal',
    has_table_privilege('authenticated', 'public.journal_technique', 'INSERT')::text,
    'false'
  UNION ALL
  SELECT 6, 'C6. la clé de service écrit dans le journal',
    has_table_privilege('service_role', 'public.journal_technique', 'INSERT')::text,
    'true'
  UNION ALL
  SELECT 7, 'C7. la clé de service purge le journal',
    has_table_privilege('service_role', 'public.journal_technique', 'DELETE')::text,
    'true'
  UNION ALL
  SELECT 8, 'C8. la fonction des comptes par jour existe',
    (to_regprocedure('public.pilotage_comptes_yopper_par_jour()') IS NOT NULL)::text,
    'true'
  UNION ALL
  SELECT 9, 'C9. anon ne peut pas l''exécuter',
    has_function_privilege('anon', 'public.pilotage_comptes_yopper_par_jour()', 'EXECUTE')::text,
    'false'
  UNION ALL
  SELECT 10, 'C10. authenticated ne peut pas l''exécuter',
    has_function_privilege('authenticated', 'public.pilotage_comptes_yopper_par_jour()', 'EXECUTE')::text,
    'false'
  UNION ALL
  SELECT 11, 'C11. la clé de service peut l''exécuter',
    has_function_privilege('service_role', 'public.pilotage_comptes_yopper_par_jour()', 'EXECUTE')::text,
    'true'
  UNION ALL
  SELECT 12, 'C12. elle est SECURITY DEFINER',
    (SELECT prosecdef::text FROM pg_proc WHERE oid = to_regprocedure('public.pilotage_comptes_yopper_par_jour()')),
    'true'
  UNION ALL
  SELECT 13, 'C13. total des comptes rendu par la fonction',
    (SELECT coalesce(sum(comptes), 0)::text FROM public.pilotage_comptes_yopper_par_jour()),
    'le même nombre que « Comptes Yopper » de la lecture du parc (24 en prod le 19/10)'
  UNION ALL
  -- Les colonnes que le pilotage lit et dont le dépôt n'a pas la définition :
  -- si l'une manque, le bloc concerné affichera « indisponible » au lieu de
  -- casser la page. Pour information.
  SELECT 14, 'C14. colonnes lues par le pilotage (pour information)',
    (SELECT string_agg(table_name || '.' || column_name, ' · ' ORDER BY table_name)
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'created_at'
        AND table_name IN ('favoris', 'upgrade_requests', 'suggestions_commercants', 'avis', 'fidelite_cartes')),
    'avis.created_at · favoris.created_at · fidelite_cartes.created_at · suggestions_commercants.created_at · upgrade_requests.created_at'
) t ORDER BY n;
