-- DIAGNOSTIC : `anon` PEUT-IL LIRE LA TABLE `commercants` ? (17/09)
--
-- ⚠️ LECTURE SEULE. Ne modifie rien. Ne rend AUCUNE donnee personnelle : que
-- des metadonnees, des noms de colonnes et des comptages.
--
-- CE QUI A ETE ETABLI JUSTE AVANT, et qui rend ce diagnostic necessaire :
--   ✅ `anon` ne peut RIEN ECRIRE : l unique policy d ecriture atteignable est
--      `admin_all_commercants`, bornee par `is_admin()` en USING et en CHECK.
--   🔴 `commercants_public` N EST PAS en `security_invoker`.
--
-- 🔴 POURQUOI CE SECOND POINT CHANGE TOUT. Une vue sans `security_invoker`
-- s execute avec les droits de SON PROPRIETAIRE : elle contourne la RLS de la
-- table et n a AUCUN besoin que `anon` detienne le SELECT dessus. Le
-- `GRANT SELECT` a `anon` sur `commercants` ne sert donc pas la vue. Il ouvre
-- une porte directe vers une table qui contient `kyb_id_recto_url`,
-- `kyb_id_verso_url`, `bce` et le nom du representant legal.
--
-- ⚠️ UN GRANT NE DECIDE TOUJOURS RIEN TOUT SEUL : la RLS tranche. Reste a
-- savoir si une policy SELECT rend cette porte franchissable.

-- ⚠️ SEULES LES PERMISSIVES ACCORDENT. Une RESTRICTIVE ne donne aucun droit,
-- elle en retire : la compter ici ferait sonner l alarme a l envers.
SELECT 'A. policies de LECTURE PERMISSIVES atteignables par anon'::text AS controle,
       (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants'
           AND cmd IN ('SELECT', 'ALL')
           AND (roles::text[] && ARRAY['anon', 'public'])) AS valeur,
       'a confronter a C et D : seules celles sans borne sont un probleme'::text AS attendu
UNION ALL
SELECT 'B. et lesquelles, avec leur nature'::text,
       coalesce((SELECT string_agg(policyname || ' [' || cmd || ', '
                                   || CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END
                                   || ', roles=' || roles::text || ']', ' · ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('SELECT', 'ALL')
                    AND (roles::text[] && ARRAY['anon', 'public'])), '(aucune)'),
       'le nom, la commande, PERMISSIVE ou RESTRICTIVE, et les roles'::text
UNION ALL
-- 🔴 LE CONTROLE QUI TRANCHE. Une policy de lecture qui ne borne ni sur
-- `auth.uid()`, ni sur `auth.email()`, ni sur une fonction d administration,
-- ne verifie PERSONNE : sans jeton, elle laisse passer.
SELECT 'C. policies de lecture SANS aucune borne d identite'::text,
       (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants'
           AND cmd IN ('SELECT', 'ALL')
           AND (roles::text[] && ARRAY['anon', 'public'])
           AND coalesce(qual, 'true') NOT LIKE '%auth.uid()%'
           AND coalesce(qual, 'true') NOT LIKE '%auth.email()%'
           AND coalesce(qual, 'true') NOT LIKE '%auth.jwt()%'
           AND coalesce(qual, 'true') NOT LIKE '%is_admin%'
           AND coalesce(qual, 'true') NOT LIKE '%is_yoppaa_admin%'),
       '0 : toute autre valeur est une lecture ouverte, a lire en D'::text
UNION ALL
SELECT 'D. leur condition, mot pour mot'::text,
       coalesce((SELECT string_agg(policyname || ' [' || permissive || '] :: USING=' || coalesce(qual, '(aucune)'), ' | ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('SELECT', 'ALL')
                    AND (roles::text[] && ARRAY['anon', 'public'])), '(aucune)'),
       'chacune doit borner sur une identite, sinon elle laisse passer'::text
UNION ALL
-- ⚠️ CE QUE LA TABLE CONTIENT DE SENSIBLE, pour mesurer l enjeu exact.
SELECT 'E. colonnes sensibles presentes dans la TABLE'::text,
       coalesce((SELECT string_agg(column_name, ' · ' ORDER BY column_name)
                   FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND column_name IN ('kyb_id_recto_url', 'kyb_id_verso_url', 'bce',
                                        'representant_legal_nom', 'representant_legal_prenom',
                                        'stripe_account_id', 'stripe_account_id_precedent',
                                        'stripe_customer_id', 'stripe_subscription_id')), '(aucune)'),
       'ce qui fuirait si une policy de lecture laissait passer'::text
UNION ALL
-- ✅ ET CE QUE LA VUE EXPOSE, qui doit rester loin de cette liste.
SELECT 'F. ces memes colonnes dans commercants_public'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public'
           AND column_name IN ('kyb_id_recto_url', 'kyb_id_verso_url', 'bce',
                               'representant_legal_nom', 'representant_legal_prenom',
                               'stripe_account_id', 'stripe_account_id_precedent',
                               'stripe_customer_id', 'stripe_subscription_id')),
       '0 : la vue ne doit exposer aucune de ces colonnes'::text
UNION ALL
-- 🔴 LA VUE FILTRE-T-ELLE ? Sans `security_invoker`, elle contourne la RLS :
-- son propre WHERE est alors la SEULE chose qui cache les fiches non publiees.
SELECT 'G. la vue filtre sur le statut de publication'::text,
       (SELECT CASE WHEN pg_get_viewdef('public.commercants_public'::regclass) LIKE '%statut_publication%'
                    THEN 'oui' ELSE 'NON' END),
       'oui : sinon les brouillons et les fiches suspendues sont publics'::text
UNION ALL
SELECT 'H. et sur quoi exactement'::text,
       coalesce((SELECT substring(pg_get_viewdef('public.commercants_public'::regclass)
                                  from 'WHERE.*$') ), '(aucun WHERE)'),
       'la condition complete, a lire en entier'::text
UNION ALL
-- ⚠️ COMBIEN DE FICHES LA VUE LAISSE VOIR, face au total. Un simple comptage :
-- aucune donnee personnelle ne sort d ici.
SELECT 'I. fiches visibles par la vue'::text,
       (SELECT count(*)::text FROM public.commercants_public),
       'strictement moins que J, sinon la vue ne cache rien'::text
UNION ALL
SELECT 'J. fiches dans la table'::text,
       (SELECT count(*)::text FROM public.commercants),
       'le total, publie ou non'::text;
