-- ═══════════════════════════════════════════════════════════════════════════
-- LA POLICY QUI A SURVÉCU SUR `demandes_commande`
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ POURQUOI JE NE L'AVAIS PAS VUE, ET C'EST LA LEÇON. Mes diagnostics
-- filtraient sur `'anon' = ANY(roles) OR 'public' = ANY(roles)` : ils
-- cherchaient ce qui pouvait fuir vers un visiteur. Une policy réservée à
-- `authenticated` n'apparaissait donc dans AUCUN d'entre eux. J'ai supprimé
-- les deux que je connaissais, en croyant les connaître toutes.
--
-- Un filtre qui répond bien à la question posée peut cacher tout le reste.
--
-- ✅ ET LA TABLE EST VIDE : zéro ligne, mesuré. Plus aucun code ne l'écrit ni
-- ne la lit, la seule mention applicative est sa suppression dans la route
-- d'effacement de compte.

SELECT ('policy restante : ' || p.policyname)::text AS controle,
       (p.cmd
         || ' | roles=' || array_to_string(p.roles, ',')
         || ' | permissive=' || p.permissive
         || ' | USING=' || COALESCE(p.qual, '(aucune)')
         || ' | CHECK=' || COALESCE(p.with_check, '(aucune)')
       )::text AS valeur,
       'a supprimer avec le reste, ou avec la table'::text AS attendu
FROM pg_policies p
WHERE p.schemaname = 'public' AND p.tablename = 'demandes_commande'

UNION ALL

-- ⚠️ ON REVÉRIFIE QUE LA TABLE EST BIEN VIDE AVANT DE PROPOSER DE LA DÉTRUIRE.
-- Un compte lu il y a deux minutes n'est pas une garantie, et une table se
-- détruit une fois.
SELECT 'lignes dans demandes_commande',
       (SELECT count(*) FROM public.demandes_commande)::text,
       '0 pour pouvoir la supprimer sans rien perdre'::text

UNION ALL

-- ⚠️ ET LE FRÈRE DU DÉFAUT : combien d'AUTRES tables portent des policies que
-- mes diagnostics n'ont jamais regardées, parce qu'elles ne visent ni `anon`
-- ni `public` ? C'est la question que j'aurais dû poser en premier.
SELECT 'policies jamais examinees (ni anon ni public)',
       (SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public'
          AND NOT ('anon' = ANY(roles) OR 'public' = ANY(roles)))::text,
       '(pour information : elles ne peuvent pas fuir vers un visiteur)'::text

ORDER BY 1;
