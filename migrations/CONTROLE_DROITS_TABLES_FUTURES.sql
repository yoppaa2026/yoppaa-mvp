-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE : CE QUE RECEVRA VRAIMENT UNE TABLE CRÉÉE DEMAIN
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ SUITE DE `MIGRATION_REVOKE_TRUNCATE_GLOBAL.sql`, PASSÉE LE 24/08.
--
-- Le contrôle (c) de cette migration a rendu deux lignes, et l'une d'elles
-- laisse une question ouverte :
--
--   postgres        → authenticated=arwdm    ✅ D, x et t retirés
--                     anon : ABSENT de la liste, alors que j'attendais `arwdm`
--   supabase_admin  → anon=arwdDxtm          ❌ D, x et t toujours là
--
-- ⚠️ ON NE DÉDUIT PAS UN DROIT, ON LE MESURE. `pg_default_acl` est difficile à
-- lire de tête : une entrée absente peut vouloir dire « rien » comme « le
-- défaut implicite ». La seule réponse fiable est de créer une table pour de
-- vrai et de regarder ce qu'elle porte à la naissance.
--
-- Les trois parties sont INDÉPENDANTES. Lance-les l'une après l'autre et
-- renvoie-moi chaque résultat, même une erreur : une erreur est une réponse.

-- ── 1) LA MESURE ──────────────────────────────────────────────────────────
--
-- Table jetable, vide, créée et supprimée dans la foulée. Aucun effet sur
-- l'application : rien ne la lit, rien ne la référence.

-- ⚠️ CRÉER PUIS LIRE DANS LE MÊME BLOC NE MARCHE PAS DANS L'ÉDITEUR SUPABASE.
--
-- Essayé deux fois le 24/08, échoué deux fois avec `42P01 : relation
-- "public.zz_test_droits" does not exist`. La première version accusait le
-- cast `::regclass`, résolu trop tôt ; la seconde l'a retiré et a échoué
-- pareil. Le bloc est donc rejoué et ANNULÉ dans son ensemble : la table
-- n'existe jamais au moment où on cherche à la lire.
--
-- ⚠️ ON DÉCOUPE PLUTÔT QUE D'EXPLIQUER. Trois exécutions séparées, un « Run »
-- à chaque fois. C'est moins élégant et c'est la seule forme qui répond.
--
-- ⚠️ ET ON NE SAUTE PAS LA TROISIÈME, même si la deuxième surprend : cette
-- table de test n'a rien à faire dans le schéma.

-- ── 1a) Un « Run » ────────────────────────────────────────────────────────
CREATE TABLE public.zz_test_droits (id integer);

-- ── 1b) Un autre « Run » ──────────────────────────────────────────────────
--
-- On lit `relacl` en VALEUR BRUTE, pas en `unnest` : sur une liste vide,
-- `unnest` ne rend AUCUNE LIGNE, et « aucune ligne » ne se distingue pas
-- d'une requête ratée. Un `NULL`, lui, se voit et veut dire quelque chose.
SELECT c.relacl::text AS droits_a_la_naissance
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'zz_test_droits';

-- ── 1c) Un dernier « Run » ────────────────────────────────────────────────
DROP TABLE public.zz_test_droits;

-- ✅ RÉPONSE MESURÉE LE 24/08 :
--    {postgres=arwdDxtm/postgres, authenticated=arwdm/postgres,
--     service_role=arwdDxtm/postgres}
--
--    Une table créée dans l'éditeur naît donc avec le CRUD pour
--    `authenticated`, RIEN pour `anon`, et plus aucun `D`, `x` ni `t`.
--
-- ⚠️ CE QUE ÇA IMPOSE : la règle du `GRANT` explicite dans chaque migration
--    n'est plus une bonne habitude, c'est la CONDITION pour que la table
--    fonctionne. Une table livrée sans son GRANT sera muette pour `anon`.
--
-- ⚠️ ET LA LETTRE QU'ON GARDE, EN LA NOMMANT : le `m` de `authenticated` est
--    MAINTAIN (VACUUM, ANALYZE, REINDEX). Il ne lit ni n'écrit aucune donnée
--    et PostgREST ne l'expose pas. Laissé en connaissance de cause.

-- COMMENT LIRE LA RÉPONSE :
--
--   • `NULL` (colonne vide) → la table naît SANS AUCUN droit posé : seul son
--     propriétaire y touche. C'est le meilleur cas, et il confirme que `anon`
--     ne reçoit plus rien. Notre règle du GRANT explicite dans chaque
--     migration devient alors obligatoire, plus seulement propre.
--
--   • Une liste → je veux les lettres exactes. `D`, `x` ou `t` devant `anon`
--     ou `authenticated` signifierait que le reste `supabase_admin` s'applique
--     aussi aux tables créées depuis l'éditeur, et là ce n'est plus étroit.


-- ── 2a) LE RESTE EXISTE-T-IL SEULEMENT ICI ? ──────────────────────────────
--
-- La ligne `supabase_admin` ne s'applique qu'aux tables créées PAR lui. Si
-- aucune table du schéma ne lui appartient, le reste est théorique ; s'il en
-- possède, on saura lesquelles et par quel chemin elles sont nées.
SELECT tableowner, count(*) AS tables
FROM pg_tables
WHERE schemaname = 'public'
GROUP BY tableowner
ORDER BY tables DESC;
-- ✅ RÉPONSE DU 24/08 : `postgres, 59`, et RIEN D'AUTRE. `supabase_admin` ne
--    possède aucune table du schéma : sa ligne de privilèges par défaut ne
--    s'applique à rien de ce qui existe aujourd'hui.


-- ── 2b) LA CORRECTION DU RESTE, SI ELLE EST PERMISE ───────────────────────
--
-- ⚠️ CELLE-CI PEUT ÉCHOUER, ET C'EST PRÉVU. Modifier les privilèges par défaut
-- posés au nom de `supabase_admin` exige d'être membre de ce rôle, ce que
-- `postgres` n'est probablement pas sur une instance Supabase.
--
-- Si tu reçois « permission denied » ou « must be able to SET ROLE », ce n'est
-- pas une panne : c'est la réponse. On saura que ce reste ne peut pas être
-- fermé depuis l'éditeur SQL, et on le notera comme tel plutôt que de faire
-- semblant qu'il n'existe pas.

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;


-- ❌ RÉPONSE DU 24/08 : `42501 : permission denied to change default
--    privileges`. `postgres` n'est pas membre de `supabase_admin`.
--
-- ⚠️ ET IL N'Y A PAS DE DÉTOUR HONNÊTE. Rattraper ces tables par un
--    déclencheur d'événement demanderait le rôle superutilisateur, que ce
--    projet n'a pas non plus. On ne bricole pas une fausse fermeture.


-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUI RESTE OUVERT, ET COMMENT ON LE SURVEILLE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ÉTAT AU 24/08, dit sans arrondi :
--
--   ✅ Les 59 tables existantes : TRUNCATE, REFERENCES et TRIGGER retirés.
--   ✅ Toute table créée dans l'éditeur SQL : naît sans ces trois droits.
--   ❌ Une table créée un jour PAR `supabase_admin` les recevrait. Ce cas
--      n'existe pas aujourd'hui (il possède ZÉRO table du schéma) et ne peut
--      naître que de la machinerie interne de Supabase, typiquement une
--      EXTENSION activée depuis le tableau de bord qui pose une table dans
--      `public`.
--
-- ⚠️ ON NE PEUT PAS L'EMPÊCHER, ON PEUT LE VOIR. Ce contrôle doit être relancé
--    après toute activation d'extension, et à chaque session de migration.
--    Il tient en une ligne et doit rendre 0.

SELECT count(*) AS droits_a_reprendre
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER');
-- attendu : 0. Si ce nombre remonte un jour, relancer le REVOKE global de
-- `MIGRATION_REVOKE_TRUNCATE_GLOBAL.sql` : il est rejouable sans effet de bord.


-- ── La relecture des privilèges par défaut, pour mémoire ──────────────────
SELECT defaclrole::regrole AS pose_par, defaclacl AS droits_par_defaut
FROM pg_default_acl
WHERE defaclnamespace = 'public'::regnamespace AND defaclobjtype = 'r';
