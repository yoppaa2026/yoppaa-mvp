-- UNE FICHE CLIENT NE SE CRÉE PLUS QUE POUR SOI, À SON PROPRE EMAIL
--
-- ✅ PASSÉE PAR ALEX LE 15/09 : les 17 lignes conformes. anon = RIEN, la
-- règle vise `authenticated` et compare `auth.email()`. E04, E05, E06 refusés
-- par la RLS ; E02 et E03 acceptés par la RLS puis arrêtés par
-- `clients_auth_user_id_fkey` (identité d'essai fictive, c'est la preuve
-- attendue) ; E07 le serveur crée toujours. D01 = 0 : aucune fiche posée
-- d'avance. D02 : `clients_email_key`, l'email est UNIQUE. Pour mémoire,
-- authenticated garde DELETE, ouvert par les seules règles d'admin.
--
-- Frère de MIGRATION_RDV_SUPPRESSION_ET_ANON.sql (passée le 15/09), dont la
-- ligne D02 a montré que `clients.yopper_insert_own_clients` vise AUSSI `anon`.
--
-- ── LA RÈGLE D'AUJOURD'HUI (MIGRATION_SECURITE_21_08.sql:147) ──────────────
--
--   FOR INSERT TO anon, authenticated
--   WITH CHECK (auth_user_id IS NULL OR auth_user_id = auth.uid())
--
-- Écrite le 21/08 pour « la commande sans compte ». Or depuis, la commande en
-- invité crée sa fiche par `/api/yopper/client` et `/api/rdv/reserver`, à la
-- CLÉ DE SERVICE, qui ignore la RLS. La seule écriture NAVIGATEUR vers
-- `clients` est l'inscription (app/commander/auth/page.js), qui pose toujours
-- `auth_user_id` et l'email du compte : relevé complet des `.from('clients')`
-- le 15/09.
--
-- 🔴 CE QUE LA RÈGLE PERMET, ET QUE RIEN N'UTILISE :
--
--   1. UN VISITEUR SANS COMPTE crée depuis la console une fiche au nom, à
--      l'email et au téléphone de son choix. Le jour où la personne visée
--      ouvre son compte, `lib/yopper-auth.js` RATTACHE cette fiche vide de
--      lien à son compte : elle hérite du nom et du téléphone de l'autre.
--
--   2. UN YOPPER CONNECTÉ crée une fiche À L'EMAIL D'UN AUTRE, rattachée à SON
--      compte. `yopper-auth` refuse bien de la rattacher à la victime, mais
--      rend quand même son identifiant : les réservations de la victime
--      peuvent s'y accrocher, et « Client voit ses RDV » les montre alors à
--      l'auteur de la fiche.
--
-- ⚠️ LA RÈGLE DEVIENT : réservée à `authenticated`, pour SA fiche
-- (`auth_user_id = auth.uid()`), à SON email vérifié (`auth.email()`). La
-- casse est neutralisée des deux côtés : l'inscription écrit déjà en
-- minuscules, un email saisi autrement ne doit pas devenir un refus.
--
-- ⚠️ ET LE CODE A SON FRÈRE, TRAITÉ APRÈS CETTE MIGRATION : `yopper-auth` ne
-- doit plus rendre une fiche retrouvée par email quand elle appartient à un
-- AUTRE compte. La base ferme la création ; le code doit fermer la lecture
-- des fiches déjà posées (ligne D01).
--
-- ── LES ESSAIS ─────────────────────────────────────────────────────────────
--
-- ⚠️ ILS INSÈRENT UNE VRAIE LIGNE, PUIS L'ANNULENT. Chaque insertion est
-- suivie d'une erreur volontaire (YP001) dans le même bloc : PostgreSQL annule
-- le bloc, la ligne n'existe jamais. L'identité est simulée par
-- `request.jwt.claims`, comme dans CONTROLE_CATALOGUE_COMMERCANT.sql, avec des
-- identifiants et des adresses aléatoires en `@yoppaa.invalid`.
--
-- 🔴 SI UN DÉCLENCHEUR EXISTE SUR `clients`, AUCUN ESSAI NE PART. Un
-- déclencheur peut appeler l'extérieur (un envoi, un appel réseau), et ça,
-- aucune annulation ne le rattrape. La ligne E00 le dit alors.
--
-- ⚠️ PostgreSQL vérifie la RLS AVANT les contraintes : une erreur de
-- contrainte (clé étrangère, colonne obligatoire) prouve que la règle a laissé
-- passer, et l'essai l'écrit tel quel au lieu de le confondre avec un refus.

-- ═══════════════════════════════════════════════════════════════════════════
-- LA MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT ON public.clients FROM anon;

DROP POLICY IF EXISTS "yopper_insert_own_clients" ON public.clients;
CREATE POLICY "yopper_insert_own_clients" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_id = auth.uid()
    AND lower(email) = lower(auth.email())
  );

-- GRANT explicite : l'inscription d'un Yopper connecté en dépend.
GRANT INSERT ON public.clients TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- LES ESSAIS, SOUS LE VRAI RÔLE ET UNE IDENTITÉ SIMULÉE
-- ═══════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS pg_temp.clients_resultats;
CREATE TEMP TABLE clients_resultats (ordre int, cas text, obtenu text, attendu text);

DO $$
DECLARE
  r            record;
  obtenu       text;
  declencheurs text;
  uid_a  uuid := gen_random_uuid();
  uid_b  uuid := gen_random_uuid();
  mail_a text := 'essai-a-' || substr(md5(random()::text), 1, 12) || '@yoppaa.invalid';
  mail_b text := 'essai-b-' || substr(md5(random()::text), 1, 12) || '@yoppaa.invalid';
  jeton_a text;
BEGIN
  SELECT string_agg(tgname::text, ', ') INTO declencheurs
    FROM pg_trigger
   WHERE tgrelid = 'public.clients'::regclass AND NOT tgisinternal;

  IF declencheurs IS NOT NULL THEN
    INSERT INTO pg_temp.clients_resultats VALUES
      (0, '🔴 essais NON lances : declencheur(s) sur clients', declencheurs,
       'aucun declencheur, sinon on n insere rien');
    RETURN;
  END IF;

  jeton_a := json_build_object('sub', uid_a::text, 'email', mail_a, 'role', 'authenticated')::text;

  FOR r IN
    SELECT * FROM (VALUES
      (1, '🔴 un visiteur non connecte cree une fiche sans compte', 'anon', '',
          format('INSERT INTO public.clients (email, prenom, nom, telephone) VALUES (%L, %L, %L, %L)',
                 mail_b, 'Essai', 'Essai', '0400000000'),
          'refuse (droit)'),
      (2, 'un Yopper connecte cree SA fiche, a SON email', 'authenticated', jeton_a,
          format('INSERT INTO public.clients (email, prenom, nom, telephone, auth_user_id) VALUES (%L, %L, %L, %L, %L)',
                 mail_a, 'Essai', 'Essai', '0400000000', uid_a),
          'accepte (ou « accepte par la RLS, puis contrainte »)'),
      (3, 'la meme, email saisi en MAJUSCULES', 'authenticated', jeton_a,
          format('INSERT INTO public.clients (email, prenom, nom, telephone, auth_user_id) VALUES (%L, %L, %L, %L, %L)',
                 upper(mail_a), 'Essai', 'Essai', '0400000000', uid_a),
          'accepte (ou « accepte par la RLS, puis contrainte »)'),
      (4, '🔴 un Yopper connecte cree une fiche A L EMAIL D UN AUTRE', 'authenticated', jeton_a,
          format('INSERT INTO public.clients (email, prenom, nom, telephone, auth_user_id) VALUES (%L, %L, %L, %L, %L)',
                 mail_b, 'Essai', 'Essai', '0400000000', uid_a),
          'refuse (RLS)'),
      (5, '🔴 un Yopper connecte cree une fiche SANS compte rattache', 'authenticated', jeton_a,
          format('INSERT INTO public.clients (email, prenom, nom, telephone) VALUES (%L, %L, %L, %L)',
                 mail_a, 'Essai', 'Essai', '0400000000'),
          'refuse (RLS)'),
      (6, '🔴 un Yopper connecte rattache une fiche au compte d un autre', 'authenticated', jeton_a,
          format('INSERT INTO public.clients (email, prenom, nom, telephone, auth_user_id) VALUES (%L, %L, %L, %L, %L)',
                 mail_a, 'Essai', 'Essai', '0400000000', uid_b),
          'refuse (RLS)'),
      (7, 'le serveur cree toujours la fiche d un invite', 'service_role', '',
          format('INSERT INTO public.clients (email, prenom, nom, telephone) VALUES (%L, %L, %L, %L)',
                 mail_b, 'Essai', 'Essai', '0400000000'),
          'accepte (ou « accepte par la RLS, puis contrainte »)')
    ) AS t(ordre, cas, role, jeton, sql, attendu)
  LOOP
    obtenu := NULL;
    PERFORM set_config('request.jwt.claims', r.jeton, true);

    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', r.role);
    EXCEPTION WHEN others THEN
      obtenu := 'essai impossible, role non pris : ' || SQLERRM;
    END;

    IF obtenu IS NULL THEN
      BEGIN
        EXECUTE r.sql;
        -- ⚠️ L'ANNULATION : la ligne vient d'être insérée, cette erreur
        -- défait le bloc entier. Elle n'existe jamais au-delà de ce point.
        RAISE EXCEPTION USING ERRCODE = 'YP001', MESSAGE = 'essai annule';
      EXCEPTION
        WHEN SQLSTATE 'YP001' THEN
          obtenu := 'accepte';
        WHEN insufficient_privilege THEN
          obtenu := CASE
            WHEN SQLERRM LIKE 'permission denied%' THEN 'refuse (droit)'
            WHEN SQLERRM LIKE '%row-level security%' THEN 'refuse (RLS)'
            ELSE 'refuse : ' || SQLERRM END;
        WHEN integrity_constraint_violation THEN
          obtenu := 'accepte par la RLS, puis contrainte : ' || SQLERRM;
        WHEN others THEN
          obtenu := 'autre erreur : ' || SQLERRM;
      END;
    END IF;

    RESET ROLE;
    PERFORM set_config('request.jwt.claims', '', true);
    INSERT INTO pg_temp.clients_resultats VALUES (r.ordre, r.cas, obtenu, r.attendu);
  END LOOP;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : une ligne par vérification, la valeur ET l'attendu, tout en text
-- ═══════════════════════════════════════════════════════════════════════════

SELECT 'C01' AS ordre,
       'ce que anon peut faire sur clients' AS controle,
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'clients' AND grantee = 'anon')::text AS valeur,
       'RIEN'::text AS attendu
UNION ALL
SELECT 'C02', 'ce que authenticated peut faire sur clients',
       (SELECT COALESCE(string_agg(DISTINCT privilege_type::text, '+' ORDER BY privilege_type::text), 'RIEN')
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name = 'clients' AND grantee = 'authenticated')::text,
       'a lire : INSERT doit y figurer'::text
UNION ALL
SELECT 'C03', 'a qui s adresse la regle d insertion',
       (SELECT COALESCE(array_to_string(roles, ','), 'REGLE ABSENTE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'yopper_insert_own_clients')::text,
       'authenticated'::text
UNION ALL
SELECT 'C04', 'la regle compare bien l email du compte',
       (SELECT CASE WHEN with_check LIKE '%auth.email()%' AND with_check LIKE '%auth.uid()%'
                     AND with_check NOT LIKE '%IS NULL%' THEN 'oui' ELSE '🔴 NON : ' || COALESCE(with_check, 'vide') END
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'clients' AND policyname = 'yopper_insert_own_clients')::text,
       'oui'::text
UNION ALL
SELECT 'C05', 'les regles d INSERTION de clients encore ouvertes a anon ou a tous',
       (SELECT COALESCE(string_agg(policyname::text, ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'clients' AND cmd IN ('INSERT', 'ALL')
           AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
           AND policyname <> 'admin_all_clients')::text,
       'AUCUNE (admin_all_clients mis a part, bornee a l admin)'::text
UNION ALL
SELECT 'C06', 'toutes les regles de clients (LISTE)',
       (SELECT COALESCE(string_agg(policyname::text || ' [' || cmd::text || ' ' || array_to_string(roles, ',') || ']', ', ' ORDER BY policyname::text), 'AUCUNE')
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'clients')::text,
       'a lire'::text
UNION ALL
SELECT 'C07', 'la RLS est active sur clients',
       (SELECT CASE WHEN relrowsecurity THEN 'oui' ELSE '🔴 NON' END
          FROM pg_class WHERE oid = 'public.clients'::regclass)::text,
       'oui'::text
UNION ALL
SELECT 'E' || lpad(ordre::text, 2, '0'), 'essai : ' || cas, obtenu, attendu
  FROM pg_temp.clients_resultats
UNION ALL
SELECT 'D01', '🔴 fiches rattachees a un compte dont l email DIFFERE (le nombre seul, aucune adresse)',
       (SELECT count(*) FROM public.clients c
          JOIN auth.users u ON u.id = c.auth_user_id
         WHERE lower(c.email) <> lower(u.email))::text,
       '0, sinon des fiches deja posees a examiner'::text
UNION ALL
SELECT 'D02', 'l email est-il unique dans clients (contraintes et index uniques)',
       (SELECT COALESCE(string_agg(i.relname::text, ', '), 'AUCUN')
          FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid
         WHERE x.indrelid = 'public.clients'::regclass AND x.indisunique)::text,
       'a lire'::text
UNION ALL
SELECT 'D03', 'cles etrangeres de clients',
       (SELECT COALESCE(string_agg(conname::text || ' -> ' || confrelid::regclass::text, ', '), 'AUCUNE')
          FROM pg_constraint
         WHERE conrelid = 'public.clients'::regclass AND contype = 'f')::text,
       'a lire'::text
ORDER BY 1;
