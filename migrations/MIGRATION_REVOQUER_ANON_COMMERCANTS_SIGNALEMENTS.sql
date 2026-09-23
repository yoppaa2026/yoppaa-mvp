-- ═══════════════════════════════════════════════════════════════════════════
-- RETIRER À `anon` CE QU'IL N'UTILISE PAS : `commercants` ET `signalements`
-- Écrite le 23/09/2026 — 🔴 À PASSER APRÈS LE RETOUR DE GOOGLE PLAY, PAS AVANT
-- ═══════════════════════════════════════════════════════════════════════════
--
-- POURQUOI. `anon`, le rôle d'un visiteur NON CONNECTÉ, détient aujourd'hui
-- DELETE, INSERT, SELECT et UPDATE au niveau table sur `commercants`, et INSERT
-- sur `signalements`. Rien ne s'en sert : les audits du 01/09, du 12/09 et du
-- 22/09 l'ont établi, et la RLS les neutralise des deux côtés.
--
-- ⚠️ UN GRANT DE TABLE COUVRE TOUTE COLONNE AJOUTÉE, AUJOURD'HUI ET DEMAIN.
-- C'est exactement par là que `tva_numero` est devenue lisible par `anon` sans
-- que personne ne l'ait demandé, en septembre. Tant que ce droit existe, chaque
-- colonne future arrive ouverte, et la sécurité repose UNIQUEMENT sur la RLS.
-- C'est tout l'objet de cette migration : ne plus dépendre d'une seule barrière.
--
-- ⚠️ CE QUI A ÉTÉ VÉRIFIÉ AVANT D'ÉCRIRE UNE LIGNE, chemin par chemin :
--   • les six écrans publics lisent la VUE `commercants_public`, jamais la table
--   • l'affichette et le kit lisent avec `SUPABASE_SERVICE_ROLE_KEY`, qui ignore
--     droits et RLS : leur retirer `anon` ne change rien
--   • l'inscription écrit en `authenticated` (la RLS exige `auth.uid()`, c'est
--     écrit dans `creerCommercantEtOnboarding`)
--   • `signalements` s'écrit uniquement par `/api/signaux`, en service_role
--
-- 🔴 ET LE POINT QUI DÉCIDE DE TOUT : `commercants_public` n'est PAS en
-- `security_invoker`. Une vue sans `security_invoker` s'exécute avec les droits
-- de SON PROPRIÉTAIRE, pas ceux du lecteur : les fiches publiques ne dépendent
-- donc pas de ce qu'`anon` peut faire sur la table. Si la vue avait été en
-- `security_invoker`, ce REVOKE aurait éteint TOUTES les fiches publiques en une
-- seconde. Deux diagnostics de ce dossier se contredisaient là-dessus ; c'est un
-- contrôle passé en base qui a tranché (contrôle H du 17/09).
--
-- ⚠️ ON NE TOUCHE NI À `authenticated`, NI À `service_role`, NI AUX POLICIES.
-- Aucune règle de lecture ne change : on retire un droit dormant, c'est tout.
--
-- ⚠️ ET LA MIGRATION SE REFUSE ELLE-MÊME si le terrain n'est pas celui qu'on
-- croit. Le garde-fou ci-dessous cherche une vue qui dépendrait de ces deux
-- tables, serait lisible par `anon` ET serait en `security_invoker` : une telle
-- vue tomberait avec le REVOKE. S'il en trouve une, RIEN n'est révoqué et le
-- message la nomme. Une migration qui suppose son terrain est une migration qui
-- casse un dimanche.
--
-- Idempotente : ré-exécutable sans effet de bord.
--
-- ⚠️ TOUT SE COLLE EN UNE FOIS, du premier BEGIN au point-virgule final. Le
-- contrôle C15 lit une table temporaire remplie plus haut : coller le script en
-- deux morceaux la ferait disparaître, et C15 dirait « relation _preuve_anon
-- does not exist ». Ce n'est alors pas une alerte de sécurité, c'est un
-- copier-coller coupé en deux ; les quatorze autres contrôles restent valables.
--
-- ⚠️ CE QUE CETTE MIGRATION NE PEUT PAS EMPÊCHER : un `ALTER DEFAULT
-- PRIVILEGES` de Supabase redonne les droits à `anon` sur toute table CRÉÉE
-- ensuite. Le contrôle C12 le relève. C'est la raison de la règle maison : un
-- `GRANT` explicite dans toute migration qui crée un objet.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 0. LE GARDE-FOU : une vue en `security_invoker` tomberait avec le REVOKE ─
DO $$
DECLARE menaces text;
BEGIN
  SELECT string_agg(DISTINCT v.relname, ', ' ORDER BY v.relname)
    INTO menaces
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v   ON v.oid = r.ev_class
    JOIN pg_class t   ON t.oid = d.refobjid
   WHERE t.relnamespace = 'public'::regnamespace
     AND t.relname IN ('commercants', 'signalements')
     AND v.relkind = 'v'
     AND v.oid <> t.oid
     AND (v.reloptions::text LIKE '%security_invoker=on%'
       OR v.reloptions::text LIKE '%security_invoker=true%')
     AND has_table_privilege('anon', v.oid, 'SELECT');

  IF menaces IS NOT NULL THEN
    RAISE EXCEPTION
      'RIEN N A ETE REVOQUE. Ces vues sont en security_invoker, lisibles par anon, et lisent commercants ou signalements : %. Elles tomberaient avec le REVOKE. Traiter ces vues d abord.',
      menaces;
  END IF;
END $$;

-- ─── 1. LES DROITS DE TABLE ─────────────────────────────────────────────────
REVOKE ALL PRIVILEGES ON TABLE public.commercants  FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.signalements FROM anon;

-- ─── 2. LES DROITS DE COLONNE, S'IL EN RESTE ────────────────────────────────
-- ⚠️ `REVOKE ALL ON TABLE` ne retire PAS un droit posé colonne par colonne.
-- L'audit du 22/09 n'en a trouvé aucun, mais « aucun aujourd'hui » n'est pas
-- « aucun le jour où on passe la migration ». On boucle sur ce qui reste, et ce
-- qui reste après l'étape 1 est forcément du niveau colonne.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name, privilege_type
      FROM information_schema.column_privileges
     WHERE table_schema = 'public'
       AND table_name IN ('commercants', 'signalements')
       AND grantee = 'anon'
  LOOP
    EXECUTE format('REVOKE %s (%I) ON public.%I FROM anon',
                   r.privilege_type, r.column_name, r.table_name);
  END LOOP;
END $$;

-- ─── 3. LA PREUVE PAR LE COMPORTEMENT, PAS PAR LE CATALOGUE ─────────────────
-- 🔴 UN CATALOGUE DIT CE QUI EST ÉCRIT, IL NE DIT PAS CE QUI SE PASSE. On se
-- met donc DANS LA PEAU d'`anon` et on essaie pour de vrai : la vue publique
-- doit continuer à répondre, la table doit refuser. Un `count()` ne fait sortir
-- aucune donnée, pas une ligne, pas un nom.
CREATE TEMP TABLE IF NOT EXISTS _preuve_anon (quoi text, resultat text);
DELETE FROM _preuve_anon;

DO $$
DECLARE n bigint; vue text; tbl text; sig text;
BEGIN
  BEGIN
    SET LOCAL ROLE anon;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _preuve_anon VALUES ('essai en role anon', 'IMPOSSIBLE : ' || SQLERRM);
    RETURN;
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.commercants_public;
    vue := 'repond, ' || n || ' fiches publiees';
  EXCEPTION WHEN OTHERS THEN
    vue := 'ECHEC : ' || SQLERRM;
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.commercants;
    tbl := 'LIT ENCORE (' || n || ' lignes vues)';
  EXCEPTION WHEN insufficient_privilege THEN
    tbl := 'refuse';
  WHEN OTHERS THEN
    tbl := 'refuse (' || SQLERRM || ')';
  END;

  BEGIN
    SELECT count(*) INTO n FROM public.signalements;
    sig := 'LIT ENCORE (' || n || ' lignes vues)';
  EXCEPTION WHEN insufficient_privilege THEN
    sig := 'refuse';
  WHEN OTHERS THEN
    sig := 'refuse (' || SQLERRM || ')';
  END;

  RESET ROLE;
  INSERT INTO _preuve_anon VALUES
    ('la vue publique', vue),
    ('la table commercants', tbl),
    ('la table signalements', sig);

  -- 🔴 ET SI LA VUE PUBLIQUE NE RÉPOND PLUS, ON ANNULE TOUT. Le COMMIT est
  -- trois lignes plus bas : sans ce test, une migration qui vient d'éteindre
  -- les fiches publiques le confirmerait quand même, et on l'apprendrait par un
  -- commerçant. L'exception annule les REVOKE et la base repart comme avant.
  IF vue LIKE 'ECHEC%' THEN
    RAISE EXCEPTION
      'RIEN N A ETE REVOQUE. Apres le REVOKE, anon ne peut plus lire commercants_public : %. Les fiches publiques en dependent. Verifier le proprietaire de la vue et ses droits avant de recommencer.',
      vue;
  END IF;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRÔLE — une ligne par vérification, la valeur ET l'attendu, tout en text.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT 'C01 anon sur commercants, niveau TABLE'::text AS controle,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND table_name='commercants'
                    AND grantee='anon'), 'aucun')::text AS valeur,
       'aucun'::text AS attendu
UNION ALL
SELECT 'C02 anon sur commercants, niveau COLONNE'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='commercants' AND grantee='anon'),
       '0'::text
UNION ALL
SELECT 'C03 anon sur signalements, niveau TABLE'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND table_name='signalements'
                    AND grantee='anon'), 'aucun')::text,
       'aucun'::text
UNION ALL
SELECT 'C04 anon sur signalements, niveau COLONNE'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema='public' AND table_name='signalements' AND grantee='anon'),
       '0'::text
UNION ALL
-- 🔴 CE QUI NE DOIT PAS AVOIR BOUGÉ. Une migration qui retire un droit doit
-- prouver ce qu'elle a LAISSÉ, pas seulement ce qu'elle a pris.
SELECT 'C05 authenticated garde ses droits sur commercants'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND table_name='commercants'
                    AND grantee='authenticated'), 'AUCUN')::text,
       'SELECT et UPDATE au minimum'::text
UNION ALL
SELECT 'C06 service_role garde ses droits sur commercants'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND table_name='commercants'
                    AND grantee='service_role'), 'AUCUN')::text,
       'DELETE, INSERT, SELECT, UPDATE au minimum'::text
UNION ALL
SELECT 'C07 service_role peut toujours inserer un signalement'::text,
       COALESCE((SELECT 'oui' FROM information_schema.role_table_grants
                  WHERE table_schema='public' AND table_name='signalements'
                    AND grantee='service_role' AND privilege_type='INSERT' LIMIT 1), 'NON')::text,
       'oui'::text
UNION ALL
SELECT 'C08 anon peut toujours lire la vue publique'::text,
       CASE WHEN has_table_privilege('anon','public.commercants_public','SELECT')
            THEN 'oui' ELSE 'NON' END::text,
       'oui'::text
UNION ALL
SELECT 'C09 commercants_public en security_invoker'::text,
       COALESCE((SELECT CASE WHEN c.reloptions::text LIKE '%security_invoker=on%'
                             OR c.reloptions::text LIKE '%security_invoker=true%'
                        THEN 'OUI' ELSE 'non' END
                   FROM pg_class c WHERE c.oid='public.commercants_public'::regclass), 'VUE ABSENTE')::text,
       'non (elle lit avec les droits de son proprietaire)'::text
UNION ALL
SELECT 'C10 vues en security_invoker lisibles par anon qui lisent ces tables'::text,
       COALESCE((SELECT string_agg(DISTINCT v.relname, ', ' ORDER BY v.relname)
                   FROM pg_depend d
                   JOIN pg_rewrite r ON r.oid = d.objid
                   JOIN pg_class v ON v.oid = r.ev_class
                   JOIN pg_class t ON t.oid = d.refobjid
                  WHERE t.relnamespace='public'::regnamespace
                    AND t.relname IN ('commercants','signalements')
                    AND v.relkind='v' AND v.oid <> t.oid
                    AND (v.reloptions::text LIKE '%security_invoker=on%'
                      OR v.reloptions::text LIKE '%security_invoker=true%')
                    AND has_table_privilege('anon', v.oid, 'SELECT')), 'aucune')::text,
       'aucune'::text
UNION ALL
SELECT 'C11 RLS active sur commercants'::text,
       (SELECT CASE WHEN relrowsecurity THEN 'active' ELSE 'INACTIVE' END
          FROM pg_class WHERE oid='public.commercants'::regclass)::text,
       'active (elle reste la barriere principale)'::text
UNION ALL
-- ⚠️ Le droit revient tout seul sur les tables CRÉÉES ENSUITE si un default
-- privilege l'accorde. On le relève pour savoir si la règle maison du GRANT
-- explicite suffit, ou s'il faudra aussi nettoyer les defaults un jour.
SELECT 'C12 default privileges qui redonneraient a anon'::text,
       COALESCE((SELECT count(*)::text FROM pg_default_acl a
                  WHERE a.defaclnamespace='public'::regnamespace
                    AND a.defaclacl::text LIKE '%anon=%'), '0')::text,
       'pour information : si > 0, toute table future naitra ouverte'::text
UNION ALL
SELECT ('C13 policy commercants « ' || policyname || ' » · ' || cmd)::text,
       (CASE WHEN permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END
        || ' · pour ' || array_to_string(roles, ','))::text,
       'inchangee par cette migration'::text
  FROM pg_policies WHERE schemaname='public' AND tablename='commercants'
UNION ALL
SELECT ('C14 policy signalements « ' || policyname || ' » · ' || cmd)::text,
       (CASE WHEN permissive='PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END
        || ' · pour ' || array_to_string(roles, ','))::text,
       'inchangee par cette migration'::text
  FROM pg_policies WHERE schemaname='public' AND tablename='signalements'
UNION ALL
-- 🔴 LA PREUVE PAR LE COMPORTEMENT, relevée plus haut DANS LA PEAU D'ANON.
SELECT ('C15 essai en role anon · ' || quoi)::text,
       resultat::text,
       (CASE WHEN quoi = 'la vue publique' THEN 'doit repondre'
             ELSE 'doit refuser' END)::text
  FROM _preuve_anon
ORDER BY 1;
