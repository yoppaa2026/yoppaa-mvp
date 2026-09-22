-- ═══════════════════════════════════════════════════════════════════════════
-- CE QUE `anon` PEUT VRAIMENT FAIRE SUR `commercants`
-- 22/09/2026 — LECTURE SEULE, AUCUNE ÉCRITURE, AUCUNE DONNÉE AFFICHÉE
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 POURQUOI CE DIAGNOSTIC. La migration du numéro de TVA a posé un GRANT de
-- colonne pour `authenticated`, et son contrôle a rendu « anon : DROIT
-- ACCORDÉ ». Un GRANT de colonne n'ACCORDE rien à `anon` : il ne peut donc
-- venir que d'un droit posé AU NIVEAU TABLE, qui couvre automatiquement toute
-- colonne ajoutée, aujourd'hui et demain.
--
-- ⚠️ CE N'EST PAS ENCORE UNE FUITE, ET C'EST TOUT L'OBJET DE CE FICHIER.
-- Un GRANT dit « tu as le droit de demander » ; la RLS dit « voilà les lignes
-- que tu obtiens ». Les deux ensemble décident, et l'un sans l'autre ne prouve
-- rien. Ce qu'on veut savoir tient en une phrase : un visiteur NON CONNECTÉ
-- peut-il obtenir ne serait-ce qu'une ligne de cette table ?
--
-- ⚠️ ET ON REGARDE `permissive`, TOUJOURS. Une policy permissive OUVRE, une
-- restrictive RESTREINT. Lire une liste de policies sans cette colonne, c'est
-- lire des noms et croire qu'on a compris : le projet s'est déjà fait prendre.
--
-- AUCUNE DONNÉE PERSONNELLE N'EST LUE : uniquement des catalogues système
-- (droits, policies, définitions). Pas un seul SELECT sur les lignes.

SELECT '1. la RLS est-elle activée sur commercants'::text AS controle,
       (SELECT CASE WHEN relrowsecurity THEN 'activée' ELSE '🔴 DÉSACTIVÉE' END
          FROM pg_class WHERE oid = 'public.commercants'::regclass)::text AS valeur,
       'activée'::text AS attendu

UNION ALL
SELECT '2. est-elle FORCÉE (même pour le propriétaire)'::text,
       (SELECT CASE WHEN relforcerowsecurity THEN 'forcée' ELSE 'non forcée' END
          FROM pg_class WHERE oid = 'public.commercants'::regclass)::text,
       'non forcée (normal : le service_role doit passer)'::text

UNION ALL
-- 🔴 LE CŒUR DU SUJET : les droits de TABLE, qui couvrent toute colonne à
-- venir. C'est par là que `tva_numero` est devenue lisible par `anon` sans que
-- personne ne l'ait demandé.
SELECT '3. 🔴 ce que anon a AU NIVEAU TABLE'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND grantee = 'anon'), 'aucun')::text,
       'aucun, idéalement'::text

UNION ALL
SELECT '4. ce que authenticated a AU NIVEAU TABLE'::text,
       COALESCE((SELECT string_agg(DISTINCT privilege_type::text, ', ' ORDER BY privilege_type::text)
                   FROM information_schema.role_table_grants
                  WHERE table_schema = 'public' AND table_name = 'commercants'
                    AND grantee = 'authenticated'), 'aucun')::text,
       'SELECT, UPDATE au minimum'::text

UNION ALL
SELECT '5. combien de colonnes anon peut lire individuellement'::text,
       (SELECT count(*)::text FROM information_schema.column_privileges
         WHERE table_schema = 'public' AND table_name = 'commercants'
           AND grantee = 'anon' AND privilege_type = 'SELECT')::text,
       '0 si le droit vient de la table, sinon le nombre listé'::text

UNION ALL
-- ⚠️ MAINTENANT LA SECONDE MOITIÉ : ce que la RLS laisse réellement sortir.
-- ⚠️ ON COMPTE EN DISANT LE TYPE. Un nombre de policies ne dit pas si elles
-- ouvrent ou si elles restreignent : sept restrictives et sept permissives
-- donnent le même « 7 ». C'est la règle du dépôt, et le banc la fait respecter.
SELECT '6. nombre de policies sur commercants'::text,
       (SELECT count(*)::text || ' dont ' || count(*) FILTER (WHERE permissive = 'PERMISSIVE')::text || ' permissive(s)'
          FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'commercants')::text,
       'au moins une'::text

UNION ALL
SELECT '7. 🔴 policies qui s''appliquent à anon'::text,
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || ', ' || permissive || ']', ' | ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))), 'aucune')::text,
       'aucune, ou uniquement des lectures bornées'::text

UNION ALL
SELECT '8. policies de LECTURE ouvertes à anon, et leur condition'::text,
       COALESCE((SELECT string_agg(policyname || ' [' || permissive || '] → ' || COALESCE(qual, '(sans condition : TOUT PASSE)'), ' | ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('SELECT', 'ALL')
                    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))), 'aucune')::text,
       'aucune'::text

UNION ALL
SELECT '9. 🔴 policies d''ÉCRITURE ouvertes à anon'::text,
       COALESCE((SELECT string_agg(policyname || ' [' || cmd || ', ' || permissive || ']', ' | ' ORDER BY policyname)
                   FROM pg_policies
                  WHERE schemaname = 'public' AND tablename = 'commercants'
                    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
                    AND ('anon' = ANY(roles) OR 'public' = ANY(roles))), 'aucune')::text,
       'aucune'::text

UNION ALL
-- ⚠️ ET LE VERDICT QUI COMPTE, celui qu'aucune des lignes précédentes ne donne
-- toute seule : droit de demander ET lignes obtenues.
SELECT '10. 🔴 VERDICT : anon peut-il obtenir une ligne'::text,
       (SELECT CASE
          WHEN NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                            WHERE table_schema = 'public' AND table_name = 'commercants'
                              AND grantee = 'anon' AND privilege_type = 'SELECT')
               AND NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
                                WHERE table_schema = 'public' AND table_name = 'commercants'
                                  AND grantee = 'anon' AND privilege_type = 'SELECT')
            THEN 'NON : aucun droit de lecture'
          WHEN NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.commercants'::regclass)
            THEN '🔴 OUI, ET TOUTES : droit de lecture et RLS désactivée'
          WHEN EXISTS (SELECT 1 FROM pg_policies
                        WHERE schemaname = 'public' AND tablename = 'commercants'
                          AND cmd IN ('SELECT', 'ALL') AND permissive = 'PERMISSIVE'
                          AND ('anon' = ANY(roles) OR 'public' = ANY(roles)))
            THEN '🔴 OUI : il a le droit ET une policy de lecture le vise'
          ELSE 'non : il a le droit, mais aucune policy ne lui rend de ligne'
        END)::text,
       'NON, ou « aucune policy ne lui rend de ligne »'::text

UNION ALL
-- ⚠️ LA VUE PUBLIQUE EST LE CHEMIN PRÉVU : on vérifie qu'elle n'a pas été
-- élargie en même temps, et surtout qu'elle est en `security_invoker`, sans
-- quoi elle lirait avec les droits de son PROPRIÉTAIRE et contournerait la RLS.
SELECT '11. colonnes exposées par commercants_public'::text,
       (SELECT count(*)::text FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'commercants_public')::text,
       '56 au dernier relevé'::text

UNION ALL
SELECT '12. 🔴 la vue publique est-elle en security_invoker'::text,
       COALESCE((SELECT CASE WHEN c.reloptions::text LIKE '%security_invoker=on%'
                             THEN 'oui' ELSE '🔴 NON' END
                   FROM pg_class c WHERE c.oid = 'public.commercants_public'::regclass), 'vue absente')::text,
       'oui'::text;
