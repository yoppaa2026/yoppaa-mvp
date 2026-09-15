-- LE JOURNAL DES « VOIR DASHBOARD » : PLUS RIEN POUR LES VISITEURS, ET IL NE SE RÉÉCRIT PLUS
--
-- ✅ PASSÉE PAR ALEX LE 15/09 : les 16 lignes conformes. anon = RIEN, PUBLIC =
-- RIEN, authenticated = INSERT+SELECT et UPDATE de la seule `ended_at`,
-- service_role garde DELETE, aucun TRUNCATE ; les sept essais à l'attendu.
-- C08 : `zz_commerce_ouvert` toujours 43 RESTRICTIVE, 0 PERMISSIVE. L'alerte du
-- soir était infondée, et c'est le TYPE relu qui le prouve, pas la mémoire.
--
-- Relevé passé par Alex le 15/09 au soir (CONTROLE_JOURNAL_IMPERSONATIONS.sql) :
--
--   • C06 : `anon` porte DELETE, INSERT, SELECT et UPDATE sur le journal. Aucune
--     policy ne le vise, la RLS le refuse aujourd'hui ; c'est une porte qui
--     s'ouvrirait le jour où une policy le citerait. Même geste que pour
--     `rdv_reservations` le 15/09 (MIGRATION_RDV_SUPPRESSION_ET_ANON.sql).
--
--   • C05 : « Admin only impersonations » est en ALL. Avec le jeton de l'admin,
--     une ligne pouvait être EFFACÉE, ou RÉÉCRITE : date de début, commerce,
--     adresse. Un journal d'accès qu'on peut réécrire ne prouve rien.
--
-- ⚠️ CE QUE LE CODE FAIT DU JOURNAL, RELEVÉ AVANT D'ÉCRIRE :
--   • impersonate-start : SELECT (lignes ouvertes), UPDATE de `ended_at` (lignes
--     expirées), INSERT … RETURNING ;
--   • impersonate-verifier : SELECT, UPDATE de `ended_at` ;
--   • impersonate-end : SELECT, UPDATE de `ended_at` ;
--   • la suppression d'un commerce vierge (/api/admin/commercants) efface ses
--     lignes À LA CLÉ DE SERVICE : `service_role` garde DELETE (C04, E07).
-- Depuis l'application, personne n'efface rien, et seule la fin se modifie.
--
-- ⚠️ ON REPART DE ZÉRO POUR `authenticated`, puis on accorde nommément : les
-- droits par défaut ne se devinent pas (REFERENCES, TRIGGER…), et une liste
-- écrite se contrôle ligne à ligne.
--
-- ⚠️ `zz_commerce_ouvert` a été vérifiée RESTRICTIVE sur toutes ses tables le
-- 24/08 et le 12/09. Le relevé du 15/09 ne ramenait PAS la colonne
-- `permissive`, et ne prouvait donc rien sur ce point : C07 et C08 la ramènent.
--
-- ⚠️ LES ESSAIS NE TOUCHENT AUCUNE LIGNE (`WHERE false`) : PostgreSQL vérifie le
-- DROIT avant de chercher les lignes. 🔴 TRUNCATE SE LIT (C05), il ne s'essaie
-- jamais : il n'a pas de `WHERE`. Le changement de rôle vit dans son propre
-- bloc, pour qu'un « rôle impossible à prendre » ne se lise jamais comme un
-- refus.

-- ═══════════════════════════════════════════════════════════════════════════
-- LA MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON public.admin_impersonations FROM anon;
REVOKE ALL ON public.admin_impersonations FROM authenticated;
GRANT SELECT, INSERT ON public.admin_impersonations TO authenticated;
GRANT UPDATE (ended_at) ON public.admin_impersonations TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LES ESSAIS, SOUS LE VRAI RÔLE
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pg_temp.droits_journal;
CREATE TEMP TABLE droits_journal (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  r record;
  obtenu text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, '🔴 un visiteur non connecte lit le journal', 'anon',
          'SELECT 1 FROM public.admin_impersonations WHERE false', 'refuse (droit)'),
      (2, '🔴 un visiteur non connecte ecrit dans le journal', 'anon',
          'INSERT INTO public.admin_impersonations (admin_email) SELECT ''x'' WHERE false', 'refuse (droit)'),
      (3, '🔴 un compte connecte efface une ligne du journal', 'authenticated',
          'DELETE FROM public.admin_impersonations WHERE false', 'refuse (droit)'),
      (4, '🔴 un compte connecte reecrit le debut d une ligne', 'authenticated',
          'UPDATE public.admin_impersonations SET started_at = started_at WHERE false', 'refuse (droit)'),
      (5, 'l admin ferme toujours une ligne (ended_at)', 'authenticated',
          'UPDATE public.admin_impersonations SET ended_at = ended_at WHERE false', 'accepte'),
      (6, 'l admin lit toujours le journal', 'authenticated',
          'SELECT 1 FROM public.admin_impersonations WHERE false', 'accepte'),
      (7, 'le serveur efface encore les lignes d un commerce vierge', 'service_role',
          'DELETE FROM public.admin_impersonations WHERE false', 'accepte')
    ) AS t(ordre, cas, role, sql, attendu)
  LOOP
    obtenu := NULL;

    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', r.role);
    EXCEPTION WHEN others THEN
      obtenu := 'essai impossible, role non pris : ' || SQLERRM;
    END;

    IF obtenu IS NULL THEN
      BEGIN
        EXECUTE r.sql;
        obtenu := 'accepte';
      EXCEPTION
        WHEN insufficient_privilege THEN
          obtenu := CASE WHEN SQLERRM LIKE 'permission denied%' THEN 'refuse (droit)'
                         ELSE 'refuse (RLS) : ' || SQLERRM END;
        WHEN others THEN
          obtenu := 'autre erreur : ' || SQLERRM;
      END;
    END IF;

    RESET ROLE;
    INSERT INTO pg_temp.droits_journal VALUES (r.ordre, r.cas, obtenu, r.attendu);
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'C01' AS ordre,
       'ce que anon peut faire sur le journal' AS controle,
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations' AND grantee = 'anon')::text AS valeur,
       'RIEN'::text AS attendu
UNION ALL
SELECT 'C02', 'ce que authenticated peut faire sur la table entiere',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations' AND grantee = 'authenticated')::text,
       'INSERT+SELECT'::text
UNION ALL
SELECT 'C03', 'les colonnes que authenticated peut modifier',
       (SELECT COALESCE(string_agg(DISTINCT column_name::text, ', ' ORDER BY column_name::text), 'AUCUNE')
          FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations'
           AND grantee = 'authenticated' AND privilege_type = 'UPDATE')::text,
       'ended_at'::text
UNION ALL
SELECT 'C04', 'le serveur (service_role) garde la suppression',
       (CASE WHEN has_table_privilege('service_role', 'public.admin_impersonations', 'DELETE') THEN 'oui' ELSE '🔴 NON' END)::text,
       'oui'::text
UNION ALL
SELECT 'C05', 'un compte connecte peut-il vider le journal (TRUNCATE, lu et non essaye)',
       (CASE WHEN has_table_privilege('authenticated', 'public.admin_impersonations', 'TRUNCATE') THEN '🔴 oui' ELSE 'non' END)::text,
       'non'::text
UNION ALL
SELECT 'C06', 'les droits accordes a PUBLIC sur le journal',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'admin_impersonations' AND grantee = 'PUBLIC')::text,
       'RIEN'::text
UNION ALL
SELECT 'C07', '🔴 les policies du journal AVEC LEUR TYPE',
       (SELECT COALESCE(string_agg(policyname::text || ' = ' || permissive::text || ' ' || cmd::text, ' | ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_impersonations')::text,
       'Admin only impersonations = PERMISSIVE ALL | zz_commerce_ouvert = RESTRICTIVE ALL'::text
UNION ALL
SELECT 'C08', '🔴 toute la famille zz_commerce_ouvert, par type',
       (SELECT 'permissives = ' || count(*) FILTER (WHERE permissive = 'PERMISSIVE')
               || ', restrictives = ' || count(*) FILTER (WHERE permissive = 'RESTRICTIVE')
          FROM pg_policies WHERE schemaname = 'public' AND policyname = 'zz_commerce_ouvert')::text,
       'permissives = 0 (restrictives : 43 le 12/09, a lire)'::text
UNION ALL
SELECT 'C09', 'la RLS est active sur le journal',
       (SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE '🔴 NON' END
          FROM pg_class WHERE oid = 'public.admin_impersonations'::regclass)::text,
       'oui'::text
UNION ALL
SELECT 'E' || lpad(ordre::text, 2, '0'), 'essai : ' || cas, obtenu, attendu
  FROM pg_temp.droits_journal
ORDER BY 1;
