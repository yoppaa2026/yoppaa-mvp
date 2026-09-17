-- DIAGNOSTIC : `anon` PEUT-IL ECRIRE DANS `commercants` ? (17/09)
--
-- ⚠️ LECTURE SEULE. Ce script ne modifie rien, et ne lit AUCUNE donnee
-- personnelle : uniquement des metadonnees de droits et de policies.
--
-- POURQUOI MAINTENANT. En repliquant les droits de `stripe_account_id` sur les
-- deux nouvelles colonnes, le controle G a montre ceci :
--
--     anon:INSERT · anon:SELECT · anon:UPDATE
--
-- `anon` est le role du visiteur NON CONNECTE. Il porte donc des droits
-- d ecriture sur la table des commercants, et je viens de les etendre a
-- `stripe_account_mode` et `stripe_account_id_precedent`.
--
-- ⚠️ CE N EST PAS FORCEMENT UNE PORTE OUVERTE. Un GRANT ne decide rien tout
-- seul : la RLS tranche ligne par ligne, et l audit du 01/09
-- (`MIGRATION_NETTOYAGE_DROITS_ANON.sql`) a etabli qu aucune policy atteignable
-- par `anon` ne fuit EN LECTURE.
--
-- 🔴 MAIS CET AUDIT PARLAIT DE LECTURE. Ce depot a deja connu une policy
-- d ECRITURE qui ne verifiait que des champs d argent, donc PERSONNE : n importe
-- qui pouvait remplir l agenda d un commerce. Raisonner par analogie avec un
-- audit de lecture serait exactement la meme erreur.
--
-- ⚠️ ET `GRANT SELECT` A `anon` EST SANS DOUTE LEGITIME : la vue
-- `commercants_public` est en `security_invoker`, donc elle lit la table avec
-- les droits de l appelant. C est INSERT et UPDATE qui n ont aucune raison
-- d exister. On mesure avant de toucher a quoi que ce soit.

SELECT 'A. RLS activee sur commercants'::text AS controle,
       (SELECT relrowsecurity::text FROM pg_class
         WHERE oid = 'public.commercants'::regclass) AS valeur,
       'true : sans elle, les GRANT decident seuls et anon ecrit'::text AS attendu
UNION ALL
-- ⚠️ SANS `FORCE`, LE PROPRIETAIRE DE LA TABLE CONTOURNE LA RLS. Ce n est pas
-- un defaut en soi, mais il faut savoir sur quoi on s appuie.
SELECT 'B. RLS forcee (le proprietaire lui-meme y est soumis)'::text,
       (SELECT relforcerowsecurity::text FROM pg_class
         WHERE oid = 'public.commercants'::regclass),
       'information : false est courant et sans gravite ici'::text
UNION ALL
-- 🔴 LE CONTROLE QUI TRANCHE. Une policy d ECRITURE que `anon` peut atteindre.
-- `roles` contient le role, ou `{public}` qui vaut pour TOUT LE MONDE, anon
-- compris : oublier `public` ferait rater le cas le plus dangereux.
-- ⚠️ ON NE COMPTE QUE LES PERMISSIVES, ET C EST UNE REGLE DE FOND, pas une
-- formalite : une policy RESTRICTIVE n ACCORDE rien, elle RETIRE. La compter
-- comme une porte ouverte ferait sonner une alarme a l envers.
SELECT 'C. policies d ECRITURE PERMISSIVES atteignables par anon'::text,
       (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
           AND (roles::text[] && ARRAY['anon', 'public'])),
       '0 si anon ne peut rien ecrire. Toute autre valeur : lire D et E'::text
UNION ALL
SELECT 'D. et lesquelles, avec leur nature'::text,
       coalesce((SELECT string_agg(policyname || ' [' || cmd || ', '
                                   || CASE WHEN permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END
                                   || ', roles=' || roles::text || ']', ' · ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                    AND (roles::text[] && ARRAY['anon', 'public'])), '(aucune)'),
       'le nom, la commande, PERMISSIVE ou RESTRICTIVE, et les roles'::text
UNION ALL
-- 🔴 CE QU ELLES VERIFIENT REELLEMENT. Une policy qui ne borne pas sur
-- `auth.uid()` ou `is_yoppaa_admin()` ne verifie PERSONNE : c est le defaut
-- exact du 04/09 sur l agenda.
SELECT 'E. leur condition, mot pour mot'::text,
       coalesce((SELECT string_agg(policyname || ' [' || permissive || '] :: USING=' || coalesce(qual, '(aucune)')
                                   || ' :: CHECK=' || coalesce(with_check, '(aucune)'), ' | ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                    AND (roles::text[] && ARRAY['anon', 'public'])), '(aucune)'),
       'chacune doit borner sur auth.uid() ou is_yoppaa_admin()'::text
UNION ALL
-- ⚠️ `CHECK=true` EST LE MOTIF QUI A DEJA OUVERT UNE TABLE EN GRAND.
SELECT 'F. policies d ecriture SANS aucune condition'::text,
       (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants'
           AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
           AND (roles::text[] && ARRAY['anon', 'public'])
           AND coalesce(qual, 'true') = 'true'
           AND coalesce(with_check, 'true') = 'true'),
       '0 : une condition « true » n arrete personne'::text
UNION ALL
-- Le total, pour situer : toutes les policies de la table, ecriture comprise.
SELECT 'G. policies sur commercants : permissives, et total'::text,
       (SELECT count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text || ' permissives sur '
               || count(*)::text FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants'),
       'information, pour situer les precedentes'::text
UNION ALL
-- ⚠️ ET LA VUE PUBLIQUE, QUI JUSTIFIE PEUT-ETRE LE `GRANT SELECT`.
SELECT 'H. commercants_public est en security_invoker'::text,
       coalesce((SELECT CASE WHEN c.reloptions::text LIKE '%security_invoker=on%'
                             OR c.reloptions::text LIKE '%security_invoker=true%'
                        THEN 'oui' ELSE 'NON' END
                   FROM pg_class c WHERE c.oid = 'public.commercants_public'::regclass), '(vue absente)'),
       'oui : c est ce qui rend le GRANT SELECT a anon legitime'::text;
