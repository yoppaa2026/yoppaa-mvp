-- LECTURE SEULE (28/10) : qui peut lire l'adresse du SIÈGE SOCIAL d'un commerce ?
-- Aucune donnée personnelle : des droits, des comptes, des noms de règles.
-- À coller tel quel dans l'éditeur SQL, sur TEST puis sur PROD. Ne modifie rien.

SELECT '1. anon lit commercants.adresse' AS controle,
       has_column_privilege('anon', 'public.commercants', 'adresse', 'SELECT')::text AS valeur,
       'true attendu aujourd''hui (la vue la montre)' AS attendu
UNION ALL
SELECT '2. anon lit commercants.latitude/longitude',
       (has_column_privilege('anon', 'public.commercants', 'latitude', 'SELECT')
        AND has_column_privilege('anon', 'public.commercants', 'longitude', 'SELECT'))::text,
       'true attendu aujourd''hui'
UNION ALL
SELECT '3. authenticated a le droit de lecture sur TOUTE la table',
       has_table_privilege('authenticated', 'public.commercants', 'SELECT')::text,
       'à lire : true = droit global, false = colonne par colonne'
UNION ALL
SELECT '4. authenticated lit commercants.adresse',
       has_column_privilege('authenticated', 'public.commercants', 'adresse', 'SELECT')::text,
       'à lire'
UNION ALL
SELECT '5. la vue commercants_public est en security_invoker',
       COALESCE((SELECT array_to_string(reloptions, ',') FROM pg_class
                 WHERE oid = 'public.commercants_public'::regclass), 'aucune option'),
       'à lire'
UNION ALL
SELECT '6. règle de lecture (RLS) sur commercants : ' || policyname,
       'rôles ' || array_to_string(roles, ',') || ' · ' || permissive || ' · si ' || COALESCE(qual, '(toujours)'),
       'à lire : qui voit QUELLES lignes'
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = 'commercants' AND cmd IN ('SELECT', 'ALL')
UNION ALL
SELECT '7. commerces publiés',
       (SELECT count(*) FROM public.commercants WHERE statut_publication = 'publie')::text,
       'à lire'
UNION ALL
SELECT '8. publiés dont le siège est AUSSI un lieu déclaré (même adresse)',
       (SELECT count(*) FROM public.commercants c
         WHERE c.statut_publication = 'publie'
           AND EXISTS (SELECT 1 FROM public.commercant_lieux l
                        WHERE l.commercant_id = c.id AND l.actif AND l.type = 'permanent'
                          AND lower(trim(l.adresse)) = lower(trim(c.adresse))))::text,
       'à lire'
UNION ALL
SELECT '9. publiés dont le siège N''EST PAS un lieu déclaré (adresse qui fuit)',
       (SELECT count(*) FROM public.commercants c
         WHERE c.statut_publication = 'publie' AND COALESCE(trim(c.adresse), '') <> ''
           AND NOT EXISTS (SELECT 1 FROM public.commercant_lieux l
                            WHERE l.commercant_id = c.id AND l.actif AND l.type = 'permanent'
                              AND lower(trim(l.adresse)) = lower(trim(c.adresse))))::text,
       'à lire : chaque unité = un siège visible qui n''est pas le magasin'
UNION ALL
SELECT '10. publiés sans aucun lieu permanent actif',
       (SELECT count(*) FROM public.commercants c
         WHERE c.statut_publication = 'publie'
           AND NOT EXISTS (SELECT 1 FROM public.commercant_lieux l
                            WHERE l.commercant_id = c.id AND l.actif AND l.type = 'permanent'))::text,
       'à lire (itinérants : hebdo ou ponctuel seulement)';
