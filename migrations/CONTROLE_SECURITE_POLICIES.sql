-- ============================================================================
-- CONTRÔLE DE SÉCURITÉ N° 2 : LES POLICIES (12/09/2026)
--
-- ⚠️ NE MODIFIE RIEN. Aucun CREATE, ALTER ou DROP. Lecture de métadonnées
-- uniquement : jamais une ligne de commande, de client ou de réservation.
--
-- POURQUOI CELUI-CI APRÈS L'AUTRE. Le premier contrôle mesurait les GRANTS.
-- Sous Supabase, c'est un mauvais indicateur : `ALTER DEFAULT PRIVILEGES`
-- accorde d'office TOUS les droits à `anon` sur chaque table créée dans
-- `public`. Les 39 tables « écrivables par anon » sont donc l'usine, pas un
-- réglage. Ce qui garde vraiment, c'est la POLICY : sans elle, le droit SQL ne
-- sert à rien ; avec une policy `true`, il ouvre tout.
--
-- Ce contrôle répond donc à la seule question qui vaille : QUELLES CONDITIONS
-- s'appliquent réellement à un visiteur anonyme ?
--
-- Coller TOUT le bloc d'un coup dans l'éditeur SQL de Supabase.
-- ============================================================================

WITH perso(nom) AS (
  VALUES ('clients'), ('commandes'), ('rdv_reservations'), ('favoris'), ('avis'),
         ('abonnements'), ('client_preferences'), ('fidelite_cartes'),
         ('fidelite_mouvements'), ('bons_cadeaux'), ('pre_inscriptions'),
         ('rdv_attente'), ('suggestions_commercants'), ('admin_impersonations'),
         ('demandes_commande'), ('yoppers'), ('commande_articles')
),
pol AS (
  SELECT tablename::text AS tbl,
         policyname::text AS nom,
         cmd::text AS commande,
         roles::text[] AS roles,
         qual::text AS lecture,
         with_check::text AS ecriture
  FROM pg_policies
  WHERE schemaname = 'public'
),
-- Une policy visant le rôle `public` s'applique à TOUT LE MONDE, anon compris.
ouvertes AS (
  SELECT * FROM pol WHERE 'anon' = ANY(roles) OR 'public' = ANY(roles)
)

-- ─── F. ÉCRITURE : ce qu'un visiteur anonyme peut créer ou modifier ─────────
-- ⚠️ LE DÉFAUT DU 04/09 ÉTAIT ICI : une policy d'écriture qui ne vérifiait que
-- des champs d'argent ne vérifiait PERSONNE, et n'importe qui remplissait
-- l'agenda. Une condition `true` sur une écriture est un robinet ouvert.
SELECT 'F'::text AS ordre,
       (tbl || ' · ' || nom || ' [' || commande || ']')::text AS objet,
       ('roles=' || array_to_string(roles, ',')
        || ' | USING ' || COALESCE(left(lecture, 180), '-')
        || ' | CHECK ' || COALESCE(left(ecriture, 180), '-'))::text AS detail,
       'une condition qui identifie l auteur, jamais true'::text AS attendu,
       CASE
         WHEN COALESCE(ecriture, lecture, 'true') = 'true' THEN '>>> OUVERT A TOUS'
         ELSE 'A LIRE'
       END::text AS verdict
FROM ouvertes
WHERE commande IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')

-- ─── G. LECTURE : ce qu'un visiteur anonyme peut lire des données perso ─────
UNION ALL
SELECT 'G',
       (o.tbl || ' · ' || o.nom || ' [' || o.commande || ']'),
       ('roles=' || array_to_string(o.roles, ',')
        || ' | USING ' || COALESCE(left(o.lecture, 240), '-')),
       'une condition qui limite a ses propres lignes',
       CASE WHEN COALESCE(o.lecture, 'true') = 'true' THEN '>>> FUITE : TOUT EST LISIBLE'
            ELSE 'A LIRE' END
FROM ouvertes o
JOIN perso p ON p.nom = o.tbl
WHERE o.commande IN ('SELECT', 'ALL')

-- ─── H. Les vues publiques exposent-elles une colonne sensible ? ────────────
-- Une vue sans `security_invoker` ignore la RLS : seules ses COLONNES limitent
-- ce qui sort. ⚠️ Une vue a DÉJÀ dérivé du dépôt (07/09) : on lit la base, pas
-- le fichier de migration.
UNION ALL
SELECT 'H',
       (c.table_name || '.' || c.column_name)::text,
       'colonne exposee par une vue lisible par anon',
       'aucune donnee personnelle dans une vue publique',
       '>>> A REGARDER'
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('avis_public', 'commandes_stats', 'commercants_public', 'commune_stats')
  AND c.column_name ~* '(email|mail|telephone|gsm|portable|adresse|iban|bce|prenom|client_|acheteur|beneficiaire|ip_|user_agent|stripe|secret|token|password|notes)'

-- ─── I. Les fonctions a corriger, avec leur signature exacte ────────────────
UNION ALL
SELECT 'I',
       p.oid::regprocedure::text,
       ('proprietaire=' || pg_get_userbyid(p.proowner)::text
        || ' | search_path=' || COALESCE(array_to_string(p.proconfig, ','), 'ABSENT')),
       'search_path fixe (sinon la fonction est detournable)',
       '>>> A CORRIGER'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')

-- ─── J. Les cinq tables sans policy : quels droits trainent encore ? ────────
-- RLS active + aucune policy = tout est refuse AUJOURD HUI. Le droit SQL qui
-- reste ne sert a rien, mais il arme le piege : le jour ou quelqu un ajoute une
-- policy permissive pour depanner, il ouvre l ecriture publique d un coup.
UNION ALL
SELECT 'J',
       g.table_name::text,
       ('droits anon restants : ' || string_agg(DISTINCT g.privilege_type::text, ', ')),
       'a retirer, la fermeture ne doit pas dependre d une absence',
       'A NETTOYER'
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public'
  AND g.grantee IN ('anon', 'PUBLIC')
  AND g.table_name IN ('article_likes', 'rdv_attente', 'services', 'stock_jours', 'suggestions_commercants')
GROUP BY g.table_name

-- ─── K. Reperes ─────────────────────────────────────────────────────────────
UNION ALL
SELECT 'K', 'policies visant anon ou public', count(*)::text, 'pour memoire', 'INFO' FROM ouvertes
UNION ALL
SELECT 'K', 'dont en ecriture', count(*)::text, 'pour memoire', 'INFO'
FROM ouvertes WHERE commande IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')

ORDER BY 1, 5 DESC, 2;
