-- UNE RÉSERVATION NE SE SUPPRIME PLUS POUR DE BON, ET LES VISITEURS N'ÉCRIVENT PLUS
--
-- ✅ PASSÉE PAR ALEX LE 15/09 : les 21 lignes conformes. C01 à C09 à
-- l'attendu (policy retirée, authenticated = INSERT+SELECT+UPDATE, anon =
-- RIEN, service_role garde DELETE, aucun TRUNCATE sur aucune table publique),
-- les sept essais E01 à E08 à l'attendu. Diagnostics : D02 montre que
-- `yopper_insert_own_clients` vise AUSSI anon (frère traité à part), D03 que
-- personne sauf l'admin ne supprime une commande, D04 que seules les
-- réservations partent en cascade avec un commerçant.
--
-- Deux restes, repérés le 14/09 en relevant les droits de la réservation de
-- table, et traités ensemble parce qu'ils touchent la même table.
--
-- ── 1) LA SUPPRESSION PHYSIQUE ─────────────────────────────────────────────
--
-- 🔴 La policy « Commercant delete RDV non honores » (MIGRATION_RDV.sql:372)
-- laisse un commerçant connecté SUPPRIMER pour de bon toute réservation non
-- honorée de son commerce. Or le projet conserve sept ans, et une table
-- facturée pour absence (`no_show`) ou annulée tard, c'est-à-dire de l'argent
-- débité, entrait dans ce cas.
--
-- ⚠️ MESURÉ AVANT D'ÉCRIRE, et rien ne s'en sert :
--   • aucun écran ne supprime une réservation ; le tableau de bord passe par
--     les statuts ;
--   • les trois seuls `.delete()` sont des retours arrière SERVEUR, à la clé
--     de service, dans create-rdv-commande, avant tout paiement : ils gardent
--     leur droit (contrôle C05) ;
--   • l'administration supprime par une route serveur, jamais par le
--     navigateur ; la policy « Admin Yoppaa FULL » n'est donc pas concernée ;
--   • la suppression de compte d'un Yopper ANONYMISE ses réservations, elle ne
--     les supprime pas.
--
-- ⚠️ ON RETIRE LA POLICY ET LE DROIT. La policy seule laisserait un `DELETE`
-- accordé que la première policy trop large rouvrirait (« Admin Yoppaa FULL »
-- est en `ALL`). Le droit seul laisserait une règle morte qui ment sur ce qui
-- est permis. `TRUNCATE` part avec, par défense : il ignore la RLS.
--
-- ── 2) LE DROIT D'ÉCRITURE DES VISITEURS ───────────────────────────────────
--
-- `anon` garde `INSERT` depuis MIGRATION_RDV.sql:241. Le nettoyage du 01/09
-- l'avait conservé EXPRÈS pour la policy `rdv_reservations_insertion_publique`,
-- la réservation sans compte depuis le navigateur. Cette policy N'EXISTE PLUS
-- (relevé des policies du 14/09) : depuis le 30/08, un rendez-vous se crée par
-- `/api/rdv/reserver`, côté serveur. Le droit n'ouvre rien aujourd'hui ; il
-- deviendrait une porte le jour où une policy le citerait.
--
-- ⚠️ LE FRÈRE `clients` N'EST PAS TOUCHÉ ICI. Il garde `INSERT` pour « la
-- commande en invité ». Le seul envoi navigateur vers `clients` est
-- l'inscription (app/commander/auth/page.js), qui s'exécute SANS session et
-- que le code lui-même dit refusée par la RLS. Les lignes D01 et D02 mesurent
-- ce qu'il en est en base, sans lire une seule donnée : on tranchera ensuite.
--
-- ⚠️ LES ESSAIS NE TOUCHENT AUCUNE LIGNE. Chaque requête porte `WHERE false`
-- ou n'insère rien : PostgreSQL vérifie le DROIT avant de chercher les lignes,
-- donc l'essai mesure le droit et lui seul.
-- 🔴 ET `TRUNCATE` NE S'ESSAIE PAS, IL SE LIT (C09). Il n'a pas de `WHERE` :
-- si le retrait n'avait pas pris, l'essai viderait la table de production. Un refus de droit et un refus de
-- RLS portent le même code d'erreur : le message les distingue. Et le
-- changement de rôle vit dans son propre bloc, pour qu'un « rôle impossible à
-- prendre » ne se lise jamais comme un refus.

-- ═══════════════════════════════════════════════════════════════════════════
-- LA MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Commercant delete RDV non honores" ON public.rdv_reservations;
REVOKE DELETE, TRUNCATE ON public.rdv_reservations FROM authenticated;
REVOKE ALL ON public.rdv_reservations FROM anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- LES ESSAIS, SOUS LE VRAI RÔLE
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pg_temp.droits_resultats;
CREATE TEMP TABLE droits_resultats (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  r record;
  obtenu text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (1, '🔴 un commercant connecte supprime une reservation', 'authenticated',
          'DELETE FROM public.rdv_reservations WHERE false', 'refuse (droit)'),
      (3, 'il modifie toujours ses reservations (statuts)', 'authenticated',
          'UPDATE public.rdv_reservations SET statut = statut WHERE false', 'accepte'),
      (4, 'il lit toujours son agenda', 'authenticated',
          'SELECT 1 FROM public.rdv_reservations WHERE false', 'accepte'),
      (5, 'il cree toujours une reservation a la main', 'authenticated',
          'INSERT INTO public.rdv_reservations (id) SELECT gen_random_uuid() WHERE false', 'accepte'),
      (6, '🔴 un visiteur non connecte ecrit une reservation', 'anon',
          'INSERT INTO public.rdv_reservations (id) SELECT gen_random_uuid() WHERE false', 'refuse (droit)'),
      (7, 'un visiteur non connecte ne lit rien', 'anon',
          'SELECT 1 FROM public.rdv_reservations WHERE false', 'refuse (droit)'),
      (8, 'le serveur garde ses retours arriere', 'service_role',
          'DELETE FROM public.rdv_reservations WHERE false', 'accepte')
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
    INSERT INTO pg_temp.droits_resultats VALUES (r.ordre, r.cas, obtenu, r.attendu);
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'C01' AS ordre,
       'la policy de suppression existe encore' AS controle,
       (SELECT CASE WHEN count(*) > 0 THEN '🔴 oui' ELSE 'non' END
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'rdv_reservations'
           AND policyname = 'Commercant delete RDV non honores')::text AS valeur,
       'non'::text AS attendu
UNION ALL
SELECT 'C02', 'les policies qui restent sur rdv_reservations (LISTE, pas un compte)',
       (SELECT COALESCE(string_agg(policyname::text || ' [' || cmd::text || ']', ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'rdv_reservations')::text,
       'Admin Yoppaa FULL [ALL], Client voit ses RDV [SELECT], Client voit ses RDV par email [SELECT], Commercant cree dans son agenda [INSERT], Commercant update ses RDV [UPDATE], Commercant voit ses RDV [SELECT], zz_commerce_ouvert [...] (releve du 14/09, a lire si different)'::text
UNION ALL
SELECT 'C03', 'plus aucune policy de SUPPRESSION propre (hors ALL de l admin)',
       (SELECT COALESCE(string_agg(policyname::text, ', '), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'rdv_reservations' AND cmd = 'DELETE')::text,
       'AUCUNE'::text
UNION ALL
SELECT 'C04', 'ce que authenticated peut faire sur la table',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'authenticated')::text,
       'INSERT+SELECT+UPDATE'::text
UNION ALL
SELECT 'C05', 'ce que anon peut faire sur la table',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'rdv_reservations' AND grantee = 'anon')::text,
       'RIEN'::text
UNION ALL
SELECT 'C06', 'le serveur (service_role) garde la suppression',
       (CASE WHEN has_table_privilege('service_role', 'public.rdv_reservations', 'DELETE') THEN 'oui' ELSE '🔴 NON' END)::text,
       'oui'::text
UNION ALL
SELECT 'C07', 'la RLS est active sur la table',
       (SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE '🔴 NON' END
          FROM pg_class WHERE oid = 'public.rdv_reservations'::regclass)::text,
       'oui'::text
UNION ALL
SELECT 'C08', '🔴 tables publiques ou anon ou authenticated peut TRUNCATE (ignore la RLS)',
       (SELECT COALESCE(string_agg(DISTINCT grantee::text || ' sur ' || table_name::text, ', '), 'AUCUNE')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND privilege_type = 'TRUNCATE'
           AND grantee IN ('anon', 'authenticated'))::text,
       'AUCUNE, sinon c est un chantier a ouvrir'::text
UNION ALL
SELECT 'C09', 'un commercant connecte peut-il vider la table (TRUNCATE, lu et non essaye)',
       (CASE WHEN has_table_privilege('authenticated', 'public.rdv_reservations', 'TRUNCATE') THEN '🔴 oui' ELSE 'non' END)::text,
       'non'::text
UNION ALL
SELECT 'E' || lpad(ordre::text, 2, '0'), 'essai : ' || cas, obtenu, attendu
  FROM pg_temp.droits_resultats
UNION ALL
SELECT 'D01', 'pour decider ensuite : ce que anon peut faire sur clients',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'clients' AND grantee = 'anon')::text,
       'a lire (INSERT attendu aujourd hui)'::text
UNION ALL
SELECT 'D02', 'pour decider ensuite : les policies de clients qui visent anon',
       (SELECT COALESCE(string_agg(policyname::text || ' [' || cmd::text || ']', ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'clients'
           AND ('anon' = ANY(roles) OR 'public' = ANY(roles)))::text,
       'a lire : AUCUNE veut dire que le droit n ouvre rien'::text
UNION ALL
SELECT 'D03', 'frere : les policies qui permettent de SUPPRIMER une commande',
       (SELECT COALESCE(string_agg(policyname::text || ' [' || cmd::text || ' ' || array_to_string(roles, ',') || ']', ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commandes' AND cmd IN ('DELETE', 'ALL'))::text,
       'a lire'::text
UNION ALL
SELECT 'D04', 'frere : ce qui disparait EN CASCADE avec un commercant supprime',
       (SELECT COALESCE(string_agg(conrelid::regclass::text || '.' || conname::text, ', ' ORDER BY conrelid::regclass::text), 'RIEN')
          FROM pg_constraint
         WHERE contype = 'f' AND confdeltype = 'c'
           AND confrelid = 'public.commercants'::regclass
           AND conrelid IN ('public.rdv_reservations'::regclass, 'public.commandes'::regclass))::text,
       'a lire'::text
ORDER BY 1;
